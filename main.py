from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from typing import Optional, List, Dict
from rembg import remove
from PIL import Image, ImageDraw, ImageFont
from ultralytics import YOLO
import io
import base64
import numpy as np
import torch
import torchvision.transforms as transforms
from torchvision.models import resnet50, ResNet50_Weights
from scipy import ndimage
from sklearn.cluster import KMeans
from harmony import calculate_harmony_score
from models.harmony_ranker import harmony_score
from pathlib import Path
import re

# MTL 모델 import (선택적)
try:
    from models.fashion_mtl import FashionMTLModel
    HAS_MTL_MODEL = True
except ImportError:
    HAS_MTL_MODEL = False
    FashionMTLModel = None

# timm은 선택적 import (없어도 ResNet50 사용)
try:
    import timm
    HAS_TIMM = True
except ImportError:
    HAS_TIMM = False
    timm = None

# transformers는 선택적 import
try:
    from transformers import AutoImageProcessor, AutoModelForImageClassification, CLIPProcessor, CLIPModel
    HAS_TRANSFORMERS = True
except ImportError:
    HAS_TRANSFORMERS = False
    AutoImageProcessor = None
    AutoModelForImageClassification = None
    CLIPProcessor = None
    CLIPModel = None

app = FastAPI(title="HUWARI API")

# ===== Harmony Ranker CKPT 경로 (MH-Attn set ranker) =====
HARMONY_CKPT = Path(__file__).resolve().parent / "models" / "ranker_set_mhattn_enb0.pt"

# YOLOv8 모델 초기화 (전역 변수로 한 번만 로드)
yolo_model = None
clothing_classifier = None
clothing_transform = None
clip_model = None  # CLIP 모델
clip_processor = None  # CLIP 프로세서
use_clip = False  # CLIP 사용 여부
mtl_model = None  # Multi-Task Learning 모델 (질감, 패턴, 스타일)
mtl_transform = None  # MTL 모델용 이미지 전처리

def get_yolo_model():
    """YOLOv8 모델을 로드합니다 (지연 로딩)"""
    global yolo_model
    if yolo_model is None:
        # COCO 사전 학습 모델 사용 (person 클래스 포함)
        yolo_model = YOLO('yolov8n.pt')  # nano 버전 (가장 빠름)
    return yolo_model

def get_clip_model():
    """CLIP 모델을 로드합니다 (지연 로딩)
    FashionCLIP을 우선 시도하고, 실패 시 일반 CLIP을 사용합니다.
    """
    global clip_model, clip_processor, use_clip
    if clip_model is None and HAS_TRANSFORMERS:
        try:
            # FashionCLIP 시도 (로컬 경로 또는 Hugging Face)
            # 주의: FashionCLIP은 Hugging Face에 직접 제공되지 않을 수 있으므로
            # 일반 CLIP을 먼저 시도하고, 필요시 로컬 FashionCLIP 모델 경로 지정
            clip_model_names = [
                'openai/clip-vit-base-patch32',  # 일반 CLIP (의류 분류에도 사용 가능)
                'openai/clip-vit-base-patch16',
            ]
            
            for model_name in clip_model_names:
                try:
                    clip_processor = CLIPProcessor.from_pretrained(model_name)
                    clip_model = CLIPModel.from_pretrained(model_name)
                    clip_model.eval()
                    use_clip = True
                    print(f"CLIP 모델 로드 성공: {model_name}")
                    return clip_model, clip_processor
                except Exception as e:
                    print(f"CLIP 모델 {model_name} 로드 실패: {e}")
                    continue
        except Exception as e:
            print(f"CLIP 모델 로드 실패: {e}")
            use_clip = False
    
    return clip_model, clip_processor

def get_clothing_classifier():
    """의류 분류 모델을 로드합니다 (지연 로딩)
    CLIP을 우선적으로 시도하고, 실패 시 일반 ImageNet 모델을 사용합니다.
    """
    global clothing_classifier, clothing_transform, use_clip
    
    # CLIP 모델 먼저 시도
    clip_model, clip_processor = get_clip_model()
    if use_clip and clip_model is not None:
        return None, None  # CLIP 사용 시 기존 classifier는 None 반환
    
    if clothing_classifier is None:
        # 1순위: Hugging Face의 의류 특화 분류 모델 시도
        if HAS_TRANSFORMERS:
            try:
                # 의류 분류에 특화된 모델 시도 (여러 모델명 시도)
                # 주의: 실제로 Hugging Face에 의류 특화 모델이 있을 수 있으므로
                # 일반 Vision 모델보다 의류 관련 모델을 우선 시도
                clothing_model_names = [
                    # 의류 특화 모델 (실제 존재 여부 확인 필요)
                    # 'fashion-clip/fashion-clip',  # CLIP 기반이므로 분류에는 부적합할 수 있음
                    # 'google-research/fashionpedia',  # 속성 분류 모델
                    # 일반 Vision 모델 (의류 분류에도 사용 가능)
                    'google/vit-base-patch16-224',  # Vision Transformer
                    'microsoft/resnet-50',  # ResNet-50
                ]
                
                for model_name in clothing_model_names:
                    try:
                        processor = AutoImageProcessor.from_pretrained(model_name)
                        model = AutoModelForImageClassification.from_pretrained(model_name)
                        model.eval()
                        
                        # transform 함수 생성
                        def create_transform(processor):
                            def transform_func(img):
                                inputs = processor(img, return_tensors="pt")
                                return inputs['pixel_values'].squeeze(0)
                            return transform_func
                        
                        clothing_classifier = model
                        clothing_transform = create_transform(processor)
                        print(f"의류 분류 모델 로드 성공: {model_name}")
                        return clothing_classifier, clothing_transform
                    except Exception as e:
                        print(f"모델 {model_name} 로드 실패: {e}")
                        continue
            except Exception as e:
                print(f"Transformers 모델 로드 실패: {e}")
        
        # 2순위: timm EfficientNet-B3 사용
        if HAS_TIMM:
            try:
                # EfficientNet-B3 모델 사용 (이미지 분류에 최적화)
                clothing_classifier = timm.create_model('efficientnet_b3', pretrained=True)
                clothing_classifier.eval()
                
                # timm의 데이터 설정 가져오기
                data_config = timm.data.resolve_data_config(clothing_classifier.pretrained_cfg)
                clothing_transform = timm.data.create_transform(**data_config)
                print("EfficientNet-B3 모델 로드 성공")
            except Exception as e:
                # timm 모델 로드 실패 시 ResNet50 사용
                print(f"timm 모델 로드 실패, ResNet50 사용: {e}")
                clothing_classifier = resnet50(weights=ResNet50_Weights.IMAGENET1K_V2)
                clothing_classifier.eval()
                clothing_transform = transforms.Compose([
                    transforms.Resize((224, 224)),
                    transforms.ToTensor(),
                    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
                ])
        else:
            # 3순위: ResNet50 사용 (기본)
            clothing_classifier = resnet50(weights=ResNet50_Weights.IMAGENET1K_V2)
            clothing_classifier.eval()
            clothing_transform = transforms.Compose([
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
            ])
            print("ResNet50 모델 사용 (기본)")
    return clothing_classifier, clothing_transform

def get_mtl_model():
    """MTL 모델을 로드합니다 (지연 로딩)"""
    global mtl_model, mtl_transform
    if mtl_model is None and HAS_MTL_MODEL:
        try:
            # 모델 구조 생성 (학습용: 97/70 클래스)
            mtl_model = FashionMTLModel(
                num_texture_classes=97,  # 학습용 재질 클래스 수
                num_pattern_classes=70,  # 학습용 패턴 클래스 수
                num_style_classes=8,
                dropout_rate=0.3
            )
            
            # 학습된 가중치 로드 시도 (.pth 또는 .pt 파일 지원)
            possible_paths = [
                "models/fashion_mtl_model.pth",
                "models/fashion_mtl_model.pt",
                "fashion_mtl_model.pth",
                "fashion_mtl_model.pt"
            ]
            
            model_loaded = False
            for model_path in possible_paths:
                try:
                    # 전체 체크포인트 형식 (state_dict + 하이퍼파라미터 포함)
                    checkpoint = torch.load(model_path, map_location='cpu')
                    state_dict = checkpoint['model_state_dict'] if isinstance(checkpoint, dict) and 'model_state_dict' in checkpoint else checkpoint
                    
                    # 클래스 수가 다른 경우를 대비하여 부분 로드
                    # material_head와 pattern_head의 마지막 레이어는 제외
                    model_state_dict = mtl_model.state_dict()
                    filtered_state_dict = {}
                    
                    # strict=True로 전체 로드 (클래스 수가 일치하므로)
                    missing_keys, unexpected_keys = mtl_model.load_state_dict(state_dict, strict=True)
                    if missing_keys:
                        print(f"경고: 로드되지 않은 키 ({len(missing_keys)}개): {missing_keys[:5]}...")
                    if unexpected_keys:
                        print(f"경고: 예상치 못한 키 ({len(unexpected_keys)}개): {unexpected_keys[:5]}...")
                    
                    print(f"MTL 모델 가중치 로드 성공: {model_path} (strict=True)")
                    model_loaded = True
                    break
                except FileNotFoundError:
                    continue  # 다음 경로 시도
                except Exception as load_error:
                    print(f"경고: {model_path} 로드 실패: {load_error}")
                    continue  # 다음 경로 시도
            
            if not model_loaded:
                print("경고: 모델 파일을 찾을 수 없습니다. 다음 경로를 확인해주세요:")
                for path in possible_paths:
                    print(f"  - {path}")
                print("초기화된 가중치를 사용합니다.")
            
            mtl_model.eval()
            
            # 이미지 전처리 (EfficientNet-B3용)
            mtl_transform = transforms.Compose([
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
            ])
            print("MTL 모델 초기화 완료")
        except Exception as e:
            print(f"MTL 모델 로드 실패: {e}")
            mtl_model = None
            mtl_transform = None
    return mtl_model, mtl_transform

# CORS 설정 (프론트엔드와 통신을 위해)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 프로덕션에서는 특정 도메인만 허용하세요
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 정적 파일 제공 (Vite 빌드 결과물)
app.mount("/assets", StaticFiles(directory="public/assets"), name="assets")

# Vite 개발 서버 프록시 또는 빌드된 파일 제공
# 프로덕션에서는 dist 폴더를 서빙하거나, Vite 개발 서버를 별도로 실행
@app.get("/")
async def read_root():
    # Vite 개발 서버가 실행 중이면 프록시로 처리
    # 프로덕션에서는 dist/index.html을 서빙
    try:
        return FileResponse("dist/index.html")
    except:
        # 개발 모드에서는 Vite가 처리
        return {"message": "Vite dev server should be running on port 3000"}

# API 엔드포인트 예제
@app.get("/api/hello")
async def hello():
    return {"message": "Hello from FastAPI!"}

# POST 요청을 위한 모델
class DataRequest(BaseModel):
    name: Optional[str] = None
    data: Optional[dict] = None

@app.post("/api/data")
async def receive_data(request: DataRequest):
    return {
        "message": "Data received",
        "received": request.dict()
    }

# 배경 제거 API
@app.post("/api/remove-background")
async def remove_background(file: UploadFile = File(...)):
    """
    이미지의 배경을 제거합니다.
    rembg 라이브러리를 사용하여 배경을 제거하고 PNG 형식으로 반환합니다.
    """
    try:
        # 업로드된 이미지 읽기
        image_data = await file.read()
        
        # rembg를 사용하여 배경 제거
        output = remove(image_data)
        
        # PIL Image로 변환하여 크롭 (선택사항)
        image = Image.open(io.BytesIO(output))
        
        # 투명 배경 PNG로 변환
        output_buffer = io.BytesIO()
        image.save(output_buffer, format='PNG')
        output_buffer.seek(0)
        
        # Base64로 인코딩하여 반환
        output_base64 = base64.b64encode(output_buffer.getvalue()).decode('utf-8')
        
        return {
            "success": True,
            "image": f"data:image/png;base64,{output_base64}",
            "format": "png"
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

# 색상 추출 API (K-Means)
@app.post("/api/extract-colors")
async def extract_colors(file: UploadFile = File(...)):
    """
    배경이 제거된 이미지에서 K-Means를 사용하여 주요 색상 5개를 추출합니다.
    """
    try:
        # 업로드된 이미지 읽기
        image_data = await file.read()
        image = Image.open(io.BytesIO(image_data))
        
        # RGBA 이미지인 경우 알파 채널 확인
        if image.mode == 'RGBA':
            # 알파 채널이 있는 경우, 투명한 픽셀 제외
            image_array = np.array(image)
            alpha_channel = image_array[:, :, 3]
            
            # 투명하지 않은 픽셀만 추출
            mask = alpha_channel > 0
            rgb_pixels = image_array[:, :, :3][mask]
        elif image.mode == 'RGB':
            # RGB 이미지인 경우 모든 픽셀 사용
            image_array = np.array(image)
            rgb_pixels = image_array.reshape(-1, 3)
        else:
            # 다른 형식은 RGB로 변환
            image = image.convert('RGB')
            image_array = np.array(image)
            rgb_pixels = image_array.reshape(-1, 3)
        
        # 픽셀이 너무 적으면 샘플링
        if len(rgb_pixels) > 10000:
            # 랜덤 샘플링으로 성능 향상
            indices = np.random.choice(len(rgb_pixels), 10000, replace=False)
            rgb_pixels = rgb_pixels[indices]
        
        # K-Means로 5개 색상 클러스터링
        kmeans = KMeans(n_clusters=5, random_state=42, n_init=10)
        kmeans.fit(rgb_pixels)
        
        # 클러스터 중심 색상 추출
        colors = kmeans.cluster_centers_.astype(int)
        
        # 각 클러스터의 픽셀 수 계산 (빈도순 정렬)
        labels = kmeans.labels_
        cluster_counts = np.bincount(labels)
        
        # 빈도순으로 정렬
        sorted_indices = np.argsort(cluster_counts)[::-1]
        sorted_colors = colors[sorted_indices]
        sorted_counts = cluster_counts[sorted_indices]
        
        # 색상 리스트 생성 (RGB 값)
        color_list = []
        for i, color in enumerate(sorted_colors):
            r, g, b = int(color[0]), int(color[1]), int(color[2])
            # HEX 색상 코드 생성
            hex_color = f"#{r:02x}{g:02x}{b:02x}"
            color_list.append({
                "rgb": [r, g, b],
                "hex": hex_color,
                "count": int(sorted_counts[i]),
                "percentage": float(sorted_counts[i] / len(labels) * 100)
            })
        
        return {
            "success": True,
            "colors": color_list
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "colors": []
        }

@app.post("/api/harmony-score")
async def api_harmony_score(
    before_files: List[UploadFile] = File(...),
    after_files:  List[UploadFile] = File(...),
):
    """
    이미지 기반 조화점수(MH-Attn ranker) 계산 API
    - before_files: 1~10장 (권장 2~3장)
    - after_files : 1~10장
    """
    try:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        # 파일 개수 제한
        before_files = before_files[:10]
        after_files  = after_files[:10]

        # PIL 로드
        before_imgs = []
        for f in before_files:
            data = await f.read()
            before_imgs.append(Image.open(io.BytesIO(data)).convert("RGB"))

        after_imgs = []
        for f in after_files:
            data = await f.read()
            after_imgs.append(Image.open(io.BytesIO(data)).convert("RGB"))

        # ckpt 존재 확인
        if not HARMONY_CKPT.exists():
            return {
                "success": False,
                "error": f"CKPT not found: {str(HARMONY_CKPT)}",
            }

        # 조화점수 계산 (최대 10개 세트 대응)
        result = harmony_score(
            before_imgs=before_imgs,
            after_imgs=after_imgs,
            ckpt_path=str(HARMONY_CKPT),
            device=device,
            agg="worstk",
            worst_k=min(3, len(after_imgs)),  # after가 1~2장이면 자동 조정
            lambda_std=0.3
        )

        return {"success": True, **result}

    except Exception as e:
        return {"success": False, "error": str(e)}

# ============================================
# 매핑 함수: 학습용(97/70) -> 표시용(9/10)
# ============================================

# label_maps.py에서 id2name 딕셔너리 import
try:
    from label_maps import MAT_ID2NAME, PAT_ID2NAME
    print(f"✅ label_maps.py 로드 성공: 재질 {len(MAT_ID2NAME)}개, 패턴 {len(PAT_ID2NAME)}개")
except ImportError:
    # label_maps.py가 없으면 임시 딕셔너리 사용
    MAT_ID2NAME = {i: f"material_{i}" for i in range(97)}  # 0~96
    PAT_ID2NAME = {i: f"pattern_{i}" for i in range(70)}   # 0~69
    print("경고: label_maps.py를 찾을 수 없습니다. 임시 딕셔너리를 사용합니다.")

# 표시용 재질 클래스 (9개) - 재질(Material) 97 → 9
DISPLAY_MATERIAL_CLASSES = [
    'Woven (Plain)',           # 우븐(일반 직물)
    'Velvet/Corduroy',         # 벨벳/코듀로이
    'Knit/Jersey',             # 니트/저지
    'Denim',                   # 데님
    'Silk',                    # 실크
    'Leather',                 # 가죽
    'Wool/Cashmere',           # 울/캐시미어
    'Padded/Fleece/Fur',       # 패딩/플리스/퍼
    'Synthetic/Other'          # 합성/기타
]

# 표시용 패턴 클래스 (10개) - 패턴(Pattern) 70 → 10
DISPLAY_PATTERN_CLASSES = [
    'Solid',                   # 무지
    'Stripe',                  # 스트라이프
    'Check',                   # 체크(깅엄/하운즈투스 포함)
    'Dot',                     # 도트
    'Floral',                  # 플로럴
    'Paisley',                 # 페이즐리
    'Graphic/Lettering',       # 그래픽/레터링
    'Leopard/Snake',           # 호피/뱀피
    'Camouflage',              # 카무플라쥬
    'Other'                    # 기타(그라데이션/타이다이/지그재그/아가일/하트/믹스 등)
]

def map_material_9_en(material_name: str) -> str:
    """
    학습용 재질 이름(97개)을 표시용 재질(9개)로 매핑
    
    매핑 규칙:
    - Woven (Plain): 우븐(일반 직물)
    - Velvet/Corduroy: 벨벳/코듀로이
    - Knit/Jersey: 니트/저지
    - Denim: 데님
    - Silk: 실크
    - Leather: 가죽
    - Wool/Cashmere: 울/캐시미어
    - Padded/Fleece/Fur: 패딩/플리스/퍼
    - Synthetic/Other: 합성/기타
    
    Args:
        material_name: 학습용 재질 이름 (한글 또는 영문)
    
    Returns:
        표시용 재질 이름 (9개 중 하나)
    """
    material_name_lower = material_name.lower()
    
    # 한글 키워드 매핑
    # 1. Woven (Plain) - 우븐(일반 직물)
    if any(x in material_name for x in ['우븐', '린넨', '자카드', '트위드']) and '니트' not in material_name and '데님' not in material_name:
        return DISPLAY_MATERIAL_CLASSES[0]
    
    # 2. Velvet/Corduroy - 벨벳/코듀로이
    if any(x in material_name for x in ['벨벳', '코듀로이']):
        return DISPLAY_MATERIAL_CLASSES[1]
    
    # 3. Knit/Jersey - 니트/저지
    if any(x in material_name for x in ['니트', '저지', '헤어 니트']):
        return DISPLAY_MATERIAL_CLASSES[2]
    
    # 4. Denim - 데님
    if '데님' in material_name:
        return DISPLAY_MATERIAL_CLASSES[3]
    
    # 5. Silk - 실크
    if '실크' in material_name:
        return DISPLAY_MATERIAL_CLASSES[4]
    
    # 6. Leather - 가죽
    if '가죽' in material_name or '스웨이드' in material_name:
        return DISPLAY_MATERIAL_CLASSES[5]
    
    # 7. Wool/Cashmere - 울/캐시미어
    if '울/캐시미어' in material_name or '울' in material_name:
        return DISPLAY_MATERIAL_CLASSES[6]
    
    # 8. Padded/Fleece/Fur - 패딩/플리스/퍼
    if any(x in material_name for x in ['패딩', '플리스', '퍼']):
        return DISPLAY_MATERIAL_CLASSES[7]
    
    # 영문 키워드 매핑 (백업)
    # 1. Woven (Plain) - 일반 직물
    if any(x in material_name_lower for x in [
        'woven', 'plain', 'cotton', 'linen', 'canvas', 'twill', 
        'fabric', 'cloth', 'textile', 'muslin', 'chiffon', 'organza',
        'taffeta', 'poplin', 'broadcloth', 'oxford', 'seersucker', 'jacquard', 'tweed'
    ]):
        return DISPLAY_MATERIAL_CLASSES[0]
    
    # 2. Velvet/Corduroy
    if any(x in material_name_lower for x in [
        'velvet', 'corduroy', 'velour', 'velveteen', 'chenille'
    ]):
        return DISPLAY_MATERIAL_CLASSES[1]
    
    # 3. Knit/Jersey
    if any(x in material_name_lower for x in [
        'knit', 'jersey', 'sweater', 'cardigan', 'rib', 'cable',
        'tricot', 'interlock', 'pique', 'mesh'
    ]):
        return DISPLAY_MATERIAL_CLASSES[2]
    
    # 4. Denim
    if any(x in material_name_lower for x in [
        'denim', 'jean', 'chambray'
    ]):
        return DISPLAY_MATERIAL_CLASSES[3]
    
    # 5. Silk
    if any(x in material_name_lower for x in [
        'silk', 'satin', 'charmeuse', 'dupioni', 'noil'
    ]):
        return DISPLAY_MATERIAL_CLASSES[4]
    
    # 6. Leather
    if any(x in material_name_lower for x in [
        'leather', 'suede', 'nubuck', 'patent', 'buckskin'
    ]):
        return DISPLAY_MATERIAL_CLASSES[5]
    
    # 7. Wool/Cashmere
    if any(x in material_name_lower for x in [
        'wool', 'cashmere', 'merino', 'alpaca', 'mohair', 'angora',
        'lambswool', 'sheep', 'camel', 'vicuna'
    ]):
        return DISPLAY_MATERIAL_CLASSES[6]
    
    # 8. Padded/Fleece/Fur
    if any(x in material_name_lower for x in [
        'padded', 'fleece', 'fur', 'down', 'quilted', 'puffer',
        'sherpa', 'faux fur', 'fake fur', 'teddy', 'mink', 'fox'
    ]):
        return DISPLAY_MATERIAL_CLASSES[7]
    
    # 9. Synthetic/Other - 합성/기타 (기본값)
    # 네오프렌, 비닐/PVC, 스판덱스, 시퀸/글리터, 메시 등
    return DISPLAY_MATERIAL_CLASSES[8]

def map_pattern_10_en(pattern_name: str) -> str:
    """
    학습용 패턴 이름(70개)을 표시용 패턴(10개)로 매핑
    
    매핑 규칙:
    - Solid: 무지
    - Stripe: 스트라이프
    - Check: 체크(깅엄/하운즈투스 포함)
    - Dot: 도트
    - Floral: 플로럴
    - Paisley: 페이즐리
    - Graphic/Lettering: 그래픽/레터링
    - Leopard/Snake: 호피/뱀피
    - Camouflage: 카무플라쥬
    - Other: 기타(그라데이션/타이다이/지그재그/아가일/하트/믹스 등)
    
    Args:
        pattern_name: 학습용 패턴 이름 (한글 또는 영문)
    
    Returns:
        표시용 패턴 이름 (10개 중 하나)
    """
    pattern_name_lower = pattern_name.lower()
    
    # 한글 키워드 매핑
    # 1. Solid - 무지
    if '무지' in pattern_name and '그래픽' not in pattern_name and '레터링' not in pattern_name and '스트라이프' not in pattern_name and '체크' not in pattern_name and '플로럴' not in pattern_name:
        return DISPLAY_PATTERN_CLASSES[0]
    
    # 2. Stripe - 스트라이프
    if '스트라이프' in pattern_name:
        return DISPLAY_PATTERN_CLASSES[1]
    
    # 3. Check - 체크(깅엄/하운즈투스 포함)
    if any(x in pattern_name for x in ['체크', '깅엄', '하운즈', '하운즈투스']):
        return DISPLAY_PATTERN_CLASSES[2]
    
    # 4. Dot - 도트
    if '도트' in pattern_name:
        return DISPLAY_PATTERN_CLASSES[3]
    
    # 5. Floral - 플로럴
    if '플로럴' in pattern_name:
        return DISPLAY_PATTERN_CLASSES[4]
    
    # 6. Paisley - 페이즐리
    if '페이즐리' in pattern_name:
        return DISPLAY_PATTERN_CLASSES[5]
    
    # 7. Graphic/Lettering - 그래픽/레터링
    if '그래픽' in pattern_name or '레터링' in pattern_name:
        return DISPLAY_PATTERN_CLASSES[6]
    
    # 8. Leopard/Snake - 호피/뱀피
    if '호피' in pattern_name or '뱀피' in pattern_name:
        return DISPLAY_PATTERN_CLASSES[7]
    
    # 9. Camouflage - 카무플라쥬
    if '카무플라쥬' in pattern_name or '카무플라주' in pattern_name:
        return DISPLAY_PATTERN_CLASSES[8]
    
    # 10. Other - 기타(그라데이션/타이다이/지그재그/아가일/하트/믹스 등)
    if any(x in pattern_name for x in [
        '그라데이션', '타이다이', '지그재그', '아가일', '하트', '믹스'
    ]):
        return DISPLAY_PATTERN_CLASSES[9]
    
    # 영문 키워드 매핑 (백업)
    # 1. Solid
    if any(x in pattern_name_lower for x in [
        'solid', 'plain', 'none', 'no pattern', 'unpatterned', 'blank'
    ]):
        return DISPLAY_PATTERN_CLASSES[0]
    
    # 2. Stripe
    if any(x in pattern_name_lower for x in [
        'stripe', 'striped', 'line', 'pinstripe', 'pin stripe',
        'vertical stripe', 'horizontal stripe', 'diagonal stripe'
    ]):
        return DISPLAY_PATTERN_CLASSES[1]
    
    # 3. Check (깅엄/하운즈투스 포함)
    if any(x in pattern_name_lower for x in [
        'check', 'checked', 'plaid', 'tartan', 'gingham',
        'houndstooth', 'hound\'s tooth', 'herringbone',
        'herring bone', 'windowpane', 'window pane', 'tattersall', 'madras'
    ]):
        return DISPLAY_PATTERN_CLASSES[2]
    
    # 4. Dot
    if any(x in pattern_name_lower for x in [
        'dot', 'dotted', 'polka', 'polka dot', 'spot', 'speckle',
        'speckled', 'pearl', 'bubble'
    ]):
        return DISPLAY_PATTERN_CLASSES[3]
    
    # 5. Floral
    if any(x in pattern_name_lower for x in [
        'floral', 'flower', 'bloom', 'rose', 'blossom', 'petal',
        'garden', 'botanical', 'bouquet'
    ]):
        return DISPLAY_PATTERN_CLASSES[4]
    
    # 6. Paisley
    if any(x in pattern_name_lower for x in [
        'paisley', 'boteh', 'buta'
    ]):
        return DISPLAY_PATTERN_CLASSES[5]
    
    # 7. Graphic/Lettering
    if any(x in pattern_name_lower for x in [
        'graphic', 'lettering', 'text', 'print', 'logo', 'design',
        'typography', 'word', 'letter', 'number', 'symbol', 'icon',
        'illustration', 'drawing', 'artwork'
    ]):
        return DISPLAY_PATTERN_CLASSES[6]
    
    # 8. Leopard/Snake
    if any(x in pattern_name_lower for x in [
        'leopard', 'snake', 'zebra', 'animal print', 'animal pattern',
        'tiger', 'cheetah', 'jaguar', 'python', 'crocodile', 'lizard',
        'reptile', 'wild', 'jungle'
    ]):
        return DISPLAY_PATTERN_CLASSES[7]
    
    # 9. Camouflage
    if any(x in pattern_name_lower for x in [
        'camouflage', 'camo', 'military', 'army', 'tactical'
    ]):
        return DISPLAY_PATTERN_CLASSES[8]
    
    # 10. Other (기본값)
    return DISPLAY_PATTERN_CLASSES[9]


# 질감, 패턴, 스타일 분류 API (MTL 모델)
@app.post("/api/classify-fashion-attributes")
async def classify_fashion_attributes(file: UploadFile = File(...)):
    """
    이미지를 분석하여 질감, 패턴, 스타일을 동시에 분류합니다.
    Multi-Task Learning 모델을 사용합니다.
    """
    try:
        # MTL 모델 확인
        if not HAS_MTL_MODEL:
            return {
                "success": False,
                "error": "MTL 모델이 설치되지 않았습니다.",
                "texture": None,
                "pattern": None,
                "style": None
            }
        
        # 업로드된 이미지 읽기
        image_data = await file.read()
        image = Image.open(io.BytesIO(image_data))
        
        # RGB로 변환
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # MTL 모델 로드 (타임아웃 설정)
        # 모델이 없거나 로드 실패 시 빠르게 실패 처리
        try:
            model, transform = get_mtl_model()
            if model is None or transform is None:
                return {
                    "success": False,
                    "error": "MTL 모델을 로드할 수 없습니다. 모델이 학습되지 않았거나 설치되지 않았을 수 있습니다.",
                    "texture": None,
                    "pattern": None,
                    "style": None
                }
        except Exception as model_error:
            return {
                "success": False,
                "error": f"MTL 모델 로드 중 오류: {str(model_error)}",
                "texture": None,
                "pattern": None,
                "style": None
            }
        
        # 이미지 전처리
        input_tensor = transform(image).unsqueeze(0)  # (1, 3, 224, 224)
        
        # GPU 사용 가능하면 GPU로 이동
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        model = model.to(device)
        input_tensor = input_tensor.to(device)
        
        # Forward Pass
        # 코랩 모델과 호환: 반환 순서는 (style, material, pattern)
        with torch.no_grad():
            style_logits, material_logits, pattern_logits = model(input_tensor)
        
        # argmax로 id 추출 (학습용 클래스 id: 0~96, 0~69)
        mat_id = material_logits.argmax(1).item()   # 0~96
        pat_id = pattern_logits.argmax(1).item()    # 0~69
        style_id = style_logits.argmax(1).item()    # 0~7
        
        # id -> 원본 문자열로 변환
        mat_name = MAT_ID2NAME.get(mat_id, f"material_{mat_id}")
        pat_name = PAT_ID2NAME.get(pat_id, f"pattern_{pat_id}")
        
        # 원본 문자열 -> 표시용 9/10 버킷으로 매핑
        mat_show = map_material_9_en(mat_name)   # 9개
        pat_show = map_pattern_10_en(pat_name)  # 10개
        
        # 스타일 클래스 (변경 없음)
        style_classes = ['캐주얼', '고프코어', '미니멀', '긱시크', '로맨틱', '빈티지', '포멀', 'Y2K']
        style_name = style_classes[style_id]
        
        # 확률 계산 (표시용)
        style_probs = torch.nn.functional.softmax(style_logits[0], dim=0)
        material_probs = torch.nn.functional.softmax(material_logits[0], dim=0)
        pattern_probs = torch.nn.functional.softmax(pattern_logits[0], dim=0)
        
        # 표시용 확률 계산 (9/10 버킷별로 집계)
        mat_show_probs = {}
        for display_mat in DISPLAY_MATERIAL_CLASSES:
            # 해당 표시용 버킷에 속하는 모든 학습용 클래스들의 확률 합산
            total_prob = 0.0
            for mat_id_inner, mat_name_inner in MAT_ID2NAME.items():
                if map_material_9_en(mat_name_inner) == display_mat:
                    total_prob += float(material_probs[mat_id_inner].item())
            mat_show_probs[display_mat] = total_prob
        
        pat_show_probs = {}
        for display_pat in DISPLAY_PATTERN_CLASSES:
            # 해당 표시용 버킷에 속하는 모든 학습용 클래스들의 확률 합산
            total_prob = 0.0
            for pat_id_inner, pat_name_inner in PAT_ID2NAME.items():
                if map_pattern_10_en(pat_name_inner) == display_pat:
                    total_prob += float(pattern_probs[pat_id_inner].item())
            pat_show_probs[display_pat] = total_prob
        
        return {
            "success": True,
            "texture": {
                "class": mat_show,  # 표시용 9개 중 하나
                "confidence": float(mat_show_probs.get(mat_show, 0.0)),
                "all_probs": mat_show_probs,
                "original_id": int(mat_id),
                "original_name": mat_name
            },
            "pattern": {
                "class": pat_show,  # 표시용 10개 중 하나
                "confidence": float(pat_show_probs.get(pat_show, 0.0)),
                "all_probs": pat_show_probs,
                "original_id": int(pat_id),
                "original_name": pat_name
            },
            "style": {
                "class": style_name,
                "confidence": float(style_probs[style_id].item()),
                "all_probs": {style_classes[i]: float(style_probs[i].item()) for i in range(len(style_classes))}
            }
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "texture": None,
            "pattern": None,
            "style": None
        }

# 의류 타입 분류 API
@app.post("/api/classify-clothing-type")
async def classify_clothing_type(file: UploadFile = File(...)):
    """
    이미지를 분석하여 의류 타입을 자동으로 분류합니다.
    YOLOv8로 사람 감지 및 이미지 특성 분석을 통해 상의/하의/모자/신발/악세서리를 판단합니다.
    """
    try:
        # 업로드된 이미지 읽기
        image_data = await file.read()
        image = Image.open(io.BytesIO(image_data))
        
        # RGBA 이미지를 RGB로 변환
        if image.mode == 'RGBA' or image.mode == 'LA' or (image.mode == 'P' and 'transparency' in image.info):
            rgb_image = Image.new('RGB', image.size, (255, 255, 255))
            if image.mode == 'P':
                image = image.convert('RGBA')
            rgb_image.paste(image, mask=image.split()[-1] if image.mode == 'RGBA' else None)
            image = rgb_image
        elif image.mode != 'RGB':
            image = image.convert('RGB')
        
        # 이미지 크기 및 비율 분석
        width, height = image.size
        aspect_ratio = width / height if height > 0 else 1.0
        area = width * height
        
        # YOLOv8 모델로 사람 감지
        yolo_model = get_yolo_model()
        image_np = np.array(image)
        results = yolo_model(image_np, classes=[0])  # person 클래스만
        
        has_person = False
        person_ratio = 0.0
        
        for result in results:
            boxes = result.boxes
            for box in boxes:
                confidence = float(box.conf[0].cpu().numpy())
                if confidence >= 0.5:
                    has_person = True
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    person_width = x2 - x1
                    person_height = y2 - y1
                    person_ratio = person_height / person_width if person_width > 0 else 1.0
                    break
            if has_person:
                break
        
        # CLIP 모델 사용 여부 확인
        clip_model, clip_processor = get_clip_model()
        
        # CLIP을 사용하는 경우 (전역 변수 확인)
        global use_clip
        print(f"CLIP 사용 여부 확인: use_clip={use_clip}, clip_model={clip_model is not None}, clip_processor={clip_processor is not None}")
        
        if use_clip and clip_model is not None and clip_processor is not None:
            try:
                device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
                clip_model = clip_model.to(device)
                
                # 의류 카테고리 텍스트 프롬프트 (더 명확하고 구체적으로)
                clothing_texts = [
                    "a top, shirt, t-shirt, blouse, hoodie, upper garment, clothing worn on upper body",
                    "bottoms, pants, jeans, skirt, shorts, lower garment, clothing worn on lower body",
                    "a hat, cap, helmet, headwear",
                    "shoes, sneakers, boots, footwear",
                    "a bag, handbag, backpack, accessory"  # 악세서리를 마지막에 배치
                ]
                
                # 이미지와 텍스트 유사도 계산
                inputs = clip_processor(text=clothing_texts, images=image, return_tensors="pt", padding=True)
                inputs = {k: v.to(device) for k, v in inputs.items()}
                
                with torch.no_grad():
                    outputs = clip_model(**inputs)
                    # 이미지-텍스트 유사도 (logits_per_image)
                    logits_per_image = outputs.logits_per_image
                    probs = torch.nn.functional.softmax(logits_per_image, dim=1)
                
                # 각 카테고리별 점수
                clothing_scores = {
                    '상의': float(probs[0][0]),
                    '하의': float(probs[0][1]),
                    '모자': float(probs[0][2]),
                    '신발': float(probs[0][3]),
                    '악세서리': float(probs[0][4])
                }
                
                # 최종 분류: 가장 높은 점수의 타입 선택
                clothing_type = max(clothing_scores, key=clothing_scores.get)
                
                print(f"CLIP 분류 결과: {clothing_type} (점수: {clothing_scores})")
                
                return {
                    "success": True,
                    "clothing_type": clothing_type,
                    "has_person": has_person,
                    "aspect_ratio": aspect_ratio,
                    "area": area,
                    "clothing_scores": clothing_scores,
                    "model_confidence": float(clothing_scores[clothing_type]),
                    "model_type": "CLIP"
                }
            except Exception as clip_error:
                import traceback
                print(f"CLIP 처리 중 오류 발생, ImageNet 모델로 폴백: {clip_error}")
                print(f"CLIP 오류 상세: {traceback.format_exc()}")
                # CLIP 실패 시 ImageNet 기반 분류로 넘어감
                use_clip = False  # CLIP 사용 비활성화
        
        # 기존 ImageNet 기반 모델 사용
        print("ImageNet 기반 분류 모델 사용")
        classifier, transform = get_clothing_classifier()
        
        # 모델이 제대로 로드되었는지 확인
        if classifier is None or transform is None:
            print("경고: ImageNet 모델 로드 실패, 기본값 사용")
            # 기본값을 상의로 설정
            return {
                "success": False,
                "error": "의류 분류 모델을 로드할 수 없습니다.",
                "clothing_type": "상의",  # 악세서리 대신 상의
                "has_person": has_person,
                "aspect_ratio": aspect_ratio,
                "area": area,
                "model_type": "fallback"
            }
        
        # 이미지 전처리 (모델 타입에 따라 다르게 처리)
        if HAS_TRANSFORMERS and hasattr(transform, '__call__'):
            # Transformers 모델인 경우
            try:
                from transformers import AutoImageProcessor
                # 이미지를 직접 처리
                device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
                classifier = classifier.to(device)
                
                # Transformers 방식으로 처리
                processor = AutoImageProcessor.from_pretrained('google/vit-base-patch16-224')
                inputs = processor(image, return_tensors="pt").to(device)
                
                with torch.no_grad():
                    outputs = classifier(**inputs)
                    logits = outputs.logits
                    probabilities = torch.nn.functional.softmax(logits[0], dim=0)
                    top_probs, top_indices = torch.topk(probabilities, 5)
            except Exception as e:
                print(f"Transformers 모델 처리 실패, 일반 모델 사용: {e}")
                # 일반 모델로 fallback
                input_tensor = transform(image).unsqueeze(0)
                device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
                classifier = classifier.to(device)
                input_tensor = input_tensor.to(device)
                
                with torch.no_grad():
                    features = classifier(input_tensor)
                    probabilities = torch.nn.functional.softmax(features[0], dim=0)
                    top_probs, top_indices = torch.topk(probabilities, 5)
        else:
            # 일반 모델 (timm, ResNet50 등)
            input_tensor = transform(image)
            if not isinstance(input_tensor, torch.Tensor) or len(input_tensor.shape) == 3:
                input_tensor = input_tensor.unsqueeze(0)
            
            # GPU 사용 가능하면 GPU로 이동
            device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
            classifier = classifier.to(device)
            input_tensor = input_tensor.to(device)
            
            # 특징 추출 및 ImageNet 클래스 예측
            with torch.no_grad():
                features = classifier(input_tensor)
                # 출력 형태에 따라 처리
                if len(features.shape) > 1:
                    probabilities = torch.nn.functional.softmax(features[0], dim=0)
                else:
                    probabilities = torch.nn.functional.softmax(features, dim=0)
                top_probs, top_indices = torch.topk(probabilities, 5)  # 상위 5개 클래스
        
        # DeepFashion 스타일 의류 분류: 다중 속성 기반 분석
        # ImageNet 클래스 + 의류 특화 특징 추출
        
        # ImageNet 클래스 중 의류 관련 클래스 정확한 매핑
        # 상의 관련 ImageNet 클래스 인덱스 (확장)
        # ImageNet-1K 클래스 인덱스 참고: https://gist.github.com/yrevar/942d3a0ac09ec9e5eb3a
        top_clothing_indices = {
            338,  # jersey, T-shirt, tee shirt
            639,  # maillot, tank suit
            636,  # maillot
            # 추가 상의 관련 클래스 (실제 ImageNet 클래스)
            # 주의: ImageNet에는 의류 특화 클래스가 제한적이므로, 
            # 형태 분석과 에지 비율을 통한 보조 판단이 중요함
        }
        
        # 하의 관련 ImageNet 클래스 인덱스
        bottom_clothing_indices = {
            403,  # jean
            654,  # miniskirt, mini
            655,  # miniskirt
        }
        
        # 모자 관련 ImageNet 클래스 인덱스
        hat_indices = {
            515,  # cowboy hat, ten-gallon hat
            820,  # sombrero
        }
        
        # 신발 관련 ImageNet 클래스 인덱스
        shoe_indices = {
            770,  # running shoe
            609,  # Loafer
            804,  # sandal
            504,  # clog, geta, patten, sabot
            608,  # hiking boot
            771,  # running shoe
        }
        
        # 악세서리/가방 관련 ImageNet 클래스 인덱스
        accessory_indices = {
            701,  # purse
            414,  # backpack
            415,  # backpack
            416,  # backpack
            417,  # backpack
            418,  # backpack
            419,  # backpack
            420,  # backpack
            695,  # handbag
            696,  # handbag
            697,  # handbag
            698,  # handbag
            699,  # handbag
            700,  # handbag
        }
        
        top_indices_list = top_indices.cpu().numpy().tolist()
        top_probs_list = top_probs.cpu().numpy().tolist()
        
        # DeepFashion 스타일: 다중 속성 기반 점수 계산
        clothing_scores = {
            '상의': 0.0,
            '하의': 0.0,
            '모자': 0.0,
            '신발': 0.0,
            '악세서리': 0.0
        }
        
        # 1. ImageNet 모델 예측 점수 (주요 기준)
        for idx, prob in zip(top_indices_list, top_probs_list):
            idx_val = int(idx)
            prob_val = float(prob)
            
            # 정확한 클래스 인덱스 매칭
            if idx_val in top_clothing_indices:
                clothing_scores['상의'] += prob_val * 1.0  # 높은 신뢰도
            elif idx_val in bottom_clothing_indices:
                clothing_scores['하의'] += prob_val * 1.0
            elif idx_val in hat_indices:
                clothing_scores['모자'] += prob_val * 1.0
            elif idx_val in shoe_indices:
                clothing_scores['신발'] += prob_val * 1.0
            elif idx_val in accessory_indices:
                clothing_scores['악세서리'] += prob_val * 0.6  # 가중치 감소 (0.9 -> 0.6)
        
        # 2. DeepFashion 스타일: 의류 특화 특징 추출
        # 이미지의 의류 특화 특징 분석
        img_array = np.array(image)
        
        # 의류 영역 분석 (중앙 영역 집중)
        center_region = img_array[img_array.shape[0]//4:3*img_array.shape[0]//4,
                                  img_array.shape[1]//4:3*img_array.shape[1]//4]
        
        # 색상 다양성 분석 (의류는 보통 여러 색상)
        if len(center_region.shape) == 3:
            color_variance = np.var(center_region.reshape(-1, 3), axis=0).mean()
        else:
            color_variance = 0
        
        # 형태 분석 (의류 타입별 특징)
        gray = np.array(image.convert('L'))
        edges = ndimage.sobel(gray)
        edge_density = np.mean(edges > 50)
        
        # 수직/수평 에지 비율 (상의는 수직 에지가 많고, 하의는 수평 에지가 많을 수 있음)
        vertical_edges = np.sum(np.abs(ndimage.sobel(gray, axis=0)) > 50)
        horizontal_edges = np.sum(np.abs(ndimage.sobel(gray, axis=1)) > 50)
        edge_ratio = vertical_edges / (horizontal_edges + 1e-6)
        
        # 3. 색상 분포 분석 (DeepFashion 스타일)
        if len(img_array.shape) == 3:
            # RGB 채널별 평균
            r_mean = np.mean(img_array[:, :, 0])
            g_mean = np.mean(img_array[:, :, 1])
            b_mean = np.mean(img_array[:, :, 2])
            
            # 채도 분석
            saturation = np.std(img_array, axis=2).mean()
        else:
            r_mean = g_mean = b_mean = saturation = 0
        
        # 4. DeepFashion 스타일: 의류 특화 분류 로직
        # 모델 예측 점수와 의류 특화 특징을 결합
        
        max_model_score = max(clothing_scores.values())
        
        # 형태 분석을 항상 적용 (모델 점수와 관계없이)
        # 상의/하의 판단을 더 강화
        
        # 사람이 있는 경우: 위치 기반 판단 강화
        if has_person:
            # 사람 비율에 따른 판단
            if person_ratio > 2.0:  # 세로로 긴 경우 (하의 가능성)
                clothing_scores['하의'] += 0.3
            elif person_ratio > 1.5:  # 중간 비율 (상의 가능성)
                clothing_scores['상의'] += 0.3
            elif person_ratio > 1.0:  # 가로로 긴 경우 (상의 가능성)
                clothing_scores['상의'] += 0.2
        
        # 에지 비율 기반 판단 (항상 적용)
        if edge_ratio > 1.3:  # 수직 에지가 많음 (상의 가능성)
            clothing_scores['상의'] += 0.25
        elif edge_ratio < 0.7:  # 수평 에지가 많음 (하의 가능성)
            clothing_scores['하의'] += 0.25
        elif edge_ratio > 1.0:  # 수직 에지가 약간 많음
            clothing_scores['상의'] += 0.15
        elif edge_ratio < 1.0:  # 수평 에지가 약간 많음
            clothing_scores['하의'] += 0.15
        
        # 종횡비 기반 판단 (항상 적용)
        if 0.6 < aspect_ratio < 1.4:  # 상의에 적합한 비율
            clothing_scores['상의'] += 0.2
        elif 0.8 < aspect_ratio < 2.0:  # 하의에 적합한 비율
            clothing_scores['하의'] += 0.2
        
        # DeepFashion 스타일: 다중 속성 기반 점수 추가
        # 모델 예측 점수에 따라 보조 특징의 가중치 조정
        if max_model_score < 0.2:  # 모델 예측이 매우 불확실할 때만 추가 시각적 특징 사용
            # 이미 위에서 형태 분석을 적용했으므로 여기서는 추가 점수만 부여
            if has_person:
                # 사람이 있는 경우: 추가 보정
                if person_ratio > 2.2:
                    clothing_scores['하의'] += 0.1
                elif person_ratio > 1.8:
                        clothing_scores['상의'] += 0.1
            else:
                # 사람이 없는 경우: 형태 분석으로 상의/하의 판단 (이미 위에서 적용했으므로 추가 점수만)
                # 상의 특화 특징: 수직 에지가 많고, 특정 비율 범위
                if edge_ratio > 1.2 and 0.7 < aspect_ratio < 1.5:
                    # 수직 에지가 많고 적절한 비율이면 상의 가능성
                    clothing_scores['상의'] += 0.2  # 가중치 감소 (이미 위에서 적용했으므로)
                elif edge_ratio < 0.8 and 0.8 < aspect_ratio < 1.8:
                    # 수평 에지가 많고 적절한 비율이면 하의 가능성
                    clothing_scores['하의'] += 0.2  # 가중치 감소
                
                # 모자, 신발, 악세서리 판단
                if aspect_ratio > 1.4 and edge_density > 0.15:
                    clothing_scores['신발'] += 0.3
                elif aspect_ratio < 0.85 or (0.9 < aspect_ratio < 1.1 and saturation > 80):
                    clothing_scores['모자'] += 0.3
                elif 0.9 < aspect_ratio < 1.1 and area < 30000:  # 더 작은 크기, 더 정사각형에 가까운 경우만
                    clothing_scores['악세서리'] += 0.15  # 가중치 감소
                elif aspect_ratio > 1.3:
                    clothing_scores['신발'] += 0.25
                elif aspect_ratio < 0.7:
                    clothing_scores['모자'] += 0.25
                elif area < 20000:  # 더 작은 크기만 악세서리 (30000 -> 20000)
                    clothing_scores['악세서리'] += 0.1  # 가중치 감소
                
                # 색상 다양성으로 추가 판단
                if color_variance > 1000:
                    if edge_ratio > 1.2:
                        clothing_scores['상의'] += 0.15
                    elif edge_ratio < 0.8:
                        clothing_scores['하의'] += 0.15
        elif max_model_score < 0.3:  # 모델 예측이 약간 불확실할 때 최소한의 보조만 사용
            if has_person:
                # 매우 제한적인 보조 (가중치 최소화)
                if person_ratio > 2.2 and clothing_scores['하의'] > 0:
                    clothing_scores['하의'] += 0.05
                elif person_ratio > 1.8 and clothing_scores['상의'] > 0:
                    clothing_scores['상의'] += 0.05
            else:
                # 사람이 없는 경우: 형태 분석으로 상의/하의도 판단 가능
                # 상의 특화 특징: 수직 에지가 많고, 특정 비율 범위
                if edge_ratio > 1.2 and 0.7 < aspect_ratio < 1.5:
                    # 수직 에지가 많고 적절한 비율이면 상의 가능성
                    clothing_scores['상의'] += 0.3
                elif edge_ratio < 0.8 and 0.8 < aspect_ratio < 1.8:
                    # 수평 에지가 많고 적절한 비율이면 하의 가능성
                    clothing_scores['하의'] += 0.3
                
                # 모자, 신발, 악세서리 판단
                if aspect_ratio > 1.4 and edge_density > 0.15:
                    clothing_scores['신발'] += 0.25
                elif aspect_ratio < 0.85 or (0.9 < aspect_ratio < 1.1 and saturation > 80):
                    clothing_scores['모자'] += 0.25
                elif 0.9 < aspect_ratio < 1.1 and area < 30000:  # 더 작은 크기, 더 정사각형에 가까운 경우만
                    clothing_scores['악세서리'] += 0.12  # 가중치 감소
                elif aspect_ratio > 1.3:
                    clothing_scores['신발'] += 0.2
                elif aspect_ratio < 0.7:
                    clothing_scores['모자'] += 0.2
                elif area < 20000:  # 매우 작은 크기만 악세서리 (30000 -> 20000)
                    clothing_scores['악세서리'] += 0.08  # 가중치 감소
                
                # 색상 다양성으로 추가 판단
                if color_variance > 1000:  # 색상이 다양함 (의류 가능성 높음)
                    if edge_ratio > 1.2:
                        clothing_scores['상의'] += 0.1
                    elif edge_ratio < 0.8:
                        clothing_scores['하의'] += 0.1
                    elif aspect_ratio > 1.3:
                        clothing_scores['신발'] += 0.1
                    elif aspect_ratio < 0.8:
                        clothing_scores['모자'] += 0.1
        
        # 최종 분류: 가장 높은 점수의 타입 선택
        clothing_type = max(clothing_scores, key=clothing_scores.get)
        
        print(f"ImageNet 분류 점수: {clothing_scores}")
        print(f"ImageNet 최종 분류: {clothing_type} (점수: {clothing_scores[clothing_type]})")
        
        # 점수가 너무 낮으면 상대적으로 높은 점수를 가진 타입 선택
        # 상의/하의 우선순위를 높임
        if clothing_scores[clothing_type] < 0.15:
            # 상의나 하의가 조금이라도 점수가 있으면 우선 선택
            if clothing_scores['상의'] > clothing_scores['하의'] and clothing_scores['상의'] > 0.05:
                clothing_type = "상의"
                print(f"폴백: 상의 우선 선택 (상의: {clothing_scores['상의']}, 하의: {clothing_scores['하의']})")
            elif clothing_scores['하의'] > clothing_scores['상의'] and clothing_scores['하의'] > 0.05:
                clothing_type = "하의"
                print(f"폴백: 하의 우선 선택 (상의: {clothing_scores['상의']}, 하의: {clothing_scores['하의']})")
            elif clothing_scores['상의'] > 0.01:  # 기준 완화
                clothing_type = "상의"
                print(f"폴백: 상의 선택 (점수: {clothing_scores['상의']})")
            elif clothing_scores['하의'] > 0.01:  # 기준 완화
                clothing_type = "하의"
                print(f"폴백: 하의 선택 (점수: {clothing_scores['하의']})")
            elif clothing_scores['모자'] > 0.1:
                clothing_type = "모자"
            elif clothing_scores['신발'] > 0.1:
                clothing_type = "신발"
            elif clothing_scores['악세서리'] > 0.3:  # 악세서리 점수를 더 높게 설정
                clothing_type = "악세서리"
                print(f"폴백: 악세서리 선택 (점수: {clothing_scores['악세서리']})")
            else:
                # 모든 점수가 낮으면 상의를 기본값으로 (악세서리 대신)
                clothing_type = "상의"
                print(f"폴백: 모든 점수가 낮아 상의를 기본값으로 선택")
        
        return {
            "success": True,
            "clothing_type": clothing_type,
            "has_person": has_person,
            "aspect_ratio": aspect_ratio,
            "area": area,
            "clothing_scores": clothing_scores,
            "model_confidence": float(clothing_scores[clothing_type]),
            "model_type": "ImageNet"
        }
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"의류 분류 오류: {e}")
        print(f"오류 상세: {error_trace}")
        
        # 기본값을 "상의"로 변경 (더 일반적인 카테고리)
        # 또는 형태 분석으로 간단히 판단 시도
        try:
            # 간단한 형태 분석으로 기본 분류 시도
            width, height = image.size if hasattr(image, 'size') else (0, 0)
            aspect_ratio = width / height if height > 0 else 1.0
            
            if aspect_ratio > 1.2:
                default_type = "하의"
            elif aspect_ratio < 0.8:
                default_type = "모자"
            else:
                default_type = "상의"
        except:
            default_type = "상의"
        
        return {
            "success": False,
            "error": str(e),
            "clothing_type": default_type,
            "error_trace": error_trace
        }

# 옷 위치 감지 API
# 조화 점수 계산을 위한 Pydantic 모델
class ColorInfo(BaseModel):
    rgb: List[int]
    hex: str
    percentage: float

class PlacedItemRequest(BaseModel):
    id: Optional[str] = None
    imageUrl: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    colors: Optional[List[ColorInfo]] = None
    texture: Optional[str] = None
    pattern: Optional[str] = None
    style: Optional[str] = None

class HarmonyRequest(BaseModel):
    beforeItems: List[PlacedItemRequest]
    afterItems: List[PlacedItemRequest]

class HarmonyResponse(BaseModel):
    score_total: float
    score_color: float
    score_texture: float
    score_pattern: float
    score_style: float
    reasons: List[str]
    debug: Dict

class HistorySaveRequest(BaseModel):
    beforeItems: List[PlacedItemRequest]
    harmonyScore: HarmonyResponse
    layoutImage: Optional[str] = None
    createdAt: Optional[str] = None

class HistorySaveResponse(BaseModel):
    success: bool
    historyId: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None

# 히스토리 저장소 (메모리 기반, 나중에 DB로 확장 가능)
history_storage: List[Dict] = []

def load_image_from_url(image_url: str) -> Optional[Image.Image]:
    """
    imageUrl에서 PIL Image를 로드합니다.
    - base64 data URL 형식: "data:image/png;base64,..."
    - 파일 경로: "/path/to/image.png"
    """
    if not image_url:
        return None
    
    try:
        # base64 data URL 처리
        if image_url.startswith("data:image"):
            # "data:image/png;base64,iVBORw0KG..." 형식 파싱
            match = re.match(r"data:image/[^;]+;base64,(.+)", image_url)
            if match:
                base64_data = match.group(1)
                image_data = base64.b64decode(base64_data)
                return Image.open(io.BytesIO(image_data)).convert("RGB")
        
        # 파일 경로 처리
        elif image_url.startswith("/") or image_url.startswith("./"):
            return Image.open(image_url).convert("RGB")
        
        # HTTP URL 처리 (선택적)
        elif image_url.startswith("http://") or image_url.startswith("https://"):
            try:
                import requests
                response = requests.get(image_url, timeout=5)
                response.raise_for_status()
                return Image.open(io.BytesIO(response.content)).convert("RGB")
            except ImportError:
                print("requests 라이브러리가 없어 HTTP URL을 처리할 수 없습니다")
                return None
            except Exception as e:
                print(f"HTTP URL 이미지 로드 실패: {e}")
                return None
        
        return None
    except Exception as e:
        print(f"이미지 로드 실패 ({image_url[:50]}...): {e}")
        return None

@app.post("/api/predict-harmony", response_model=HarmonyResponse)
async def predict_harmony(request: HarmonyRequest):
    """
    Before/After 아이템들의 조화 점수를 계산합니다 (harmony_ranker.py 사용).
    
    Returns:
        - score_total: 전체 조화 점수 (0~100)
        - score_color: 색상 점수 (0~100) - harmony_ranker 결과를 사용
        - score_texture: 재질 점수 (0~100) - harmony_ranker 결과를 사용
        - score_pattern: 패턴 점수 (0~100) - harmony_ranker 결과를 사용
        - score_style: 스타일 점수 (0~100) - harmony_ranker 결과를 사용
        - reasons: 조화 점수에 대한 설명 (2~4개)
        - debug: 디버깅 정보
    """
    try:
        # Before 아이템이 없으면 중립 점수 반환
        if not request.beforeItems:
            return HarmonyResponse(
                score_total=50.0,
                score_color=50.0,
                score_texture=60.0,
                score_pattern=70.0,
                score_style=70.0,
                reasons=["Before 아이템이 없어 중립으로 계산"],
                debug={}
            )
        
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # imageUrl에서 이미지 로드
        before_imgs = []
        for item in request.beforeItems:
            if item.imageUrl:
                img = load_image_from_url(item.imageUrl)
                if img:
                    before_imgs.append(img)
        
        after_imgs = []
        for item in request.afterItems:
            if item.imageUrl:
                img = load_image_from_url(item.imageUrl)
                if img:
                    after_imgs.append(img)
        
        # 이미지가 없으면 중립 점수 반환
        if not before_imgs:
            return HarmonyResponse(
                score_total=50.0,
                score_color=50.0,
                score_texture=60.0,
                score_pattern=70.0,
                score_style=70.0,
                reasons=["Before 이미지를 로드할 수 없어 중립으로 계산"],
                debug={}
            )
        
        # 파일 개수 제한
        before_imgs = before_imgs[:10]
        after_imgs = after_imgs[:10]
        
        # After 이미지가 없으면 Before 내부 아이템들끼리 비교
        if not after_imgs:
            if len(before_imgs) >= 2:
                # 첫 번째 아이템을 before, 나머지를 after로 설정하여 내부 비교
                after_imgs = before_imgs[1:]
                before_imgs = [before_imgs[0]]
            elif len(before_imgs) == 1:
                # Before 아이템이 1개뿐이면 규칙 기반으로 폴백
                before_items = [item.dict() for item in request.beforeItems]
                after_items = [item.dict() for item in request.afterItems]
                result = calculate_harmony_score(before_items, after_items)
                return HarmonyResponse(**result)
            else:
                # Before 이미지도 없으면 중립 점수 반환
                return HarmonyResponse(
                    score_total=50.0,
                    score_color=50.0,
                    score_texture=60.0,
                    score_pattern=70.0,
                    score_style=70.0,
                    reasons=["이미지를 로드할 수 없어 중립으로 계산"],
                    debug={}
                )
        
        # ckpt 존재 확인
        if not HARMONY_CKPT.exists():
            raise FileNotFoundError(f"모델 파일을 찾을 수 없습니다: {HARMONY_CKPT}")
        
        # 조화점수 계산 (최대 10개 세트 대응)
        import time
        start_time = time.time()
        
        print(f"조화 점수 계산 시작: before={len(before_imgs)}, after={len(after_imgs)}")
        
        # 모델 추론 실행
        ranker_result = harmony_score(
            before_imgs=before_imgs,
            after_imgs=after_imgs,
            ckpt_path=str(HARMONY_CKPT),
            device=device,
            agg="worstk",
            worst_k=min(3, len(after_imgs)) if after_imgs else 1,
            lambda_std=0.3
        )
        
        elapsed = time.time() - start_time
        print(f"모델 추론 완료: {elapsed:.2f}초, score={ranker_result.get('score_0to100', 0)}")
        
        # harmony_ranker 결과를 HarmonyResponse 형식으로 변환
        score_total = float(ranker_result.get("score_0to100", 50))
        
        # harmony_ranker는 전체 점수만 제공하므로, 세부 점수는 전체 점수를 기반으로 추정
        score_color = score_total * 0.9
        score_texture = score_total * 0.95
        score_pattern = score_total * 0.95
        score_style = score_total * 0.95
        
        # reasons 생성
        reasons = []
        if score_total >= 80:
            reasons.append("전반적으로 조화로운 조합입니다")
        elif score_total >= 60:
            reasons.append("적절한 조화를 이루고 있습니다")
        elif score_total >= 40:
            reasons.append("일부 조화가 부족합니다")
        else:
            reasons.append("조화가 부족한 조합입니다")
        
        if ranker_result.get("item_scores"):
            item_scores = ranker_result["item_scores"]
            min_score = min(item_scores, key=lambda x: x.get("score_0to100", 50))
            if min_score.get("score_0to100", 50) < 50:
                reasons.append(f"일부 아이템의 조화 점수가 낮습니다 ({min_score.get('score_0to100', 0)}점)")
        
        # 최소 2개 reasons 보장
        if len(reasons) < 2:
            reasons.append(f"전체 조화 점수: {score_total}점")
        
        return HarmonyResponse(
            score_total=round(score_total, 1),
            score_color=round(max(0, min(100, score_color)), 1),
            score_texture=round(max(0, min(100, score_texture)), 1),
            score_pattern=round(max(0, min(100, score_pattern)), 1),
            score_style=round(max(0, min(100, score_style)), 1),
            reasons=reasons[:4],
            debug={
                "ranker_result": ranker_result,
                "before_count": len(before_imgs),
                "after_count": len(after_imgs)
            }
        )
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"조화 점수 계산 오류: {e}")
        print(f"오류 상세: {error_trace}")
        
        # 에러 발생 시 에러 정보와 함께 반환
        raise e

@app.post("/api/detect-clothing")
async def detect_clothing(file: UploadFile = File(...)):
    """
    YOLOv8을 사용하여 이미지에서 옷의 위치를 감지합니다.
    사람을 감지하고, 사람 영역 내에서 상의/하의 영역을 추정합니다.
    """
    try:
        # 업로드된 이미지 읽기
        image_data = await file.read()
        image = Image.open(io.BytesIO(image_data))
        
        # RGBA 이미지를 RGB로 변환 (YOLOv8은 3채널만 지원)
        if image.mode == 'RGBA' or image.mode == 'LA' or (image.mode == 'P' and 'transparency' in image.info):
            # 투명 배경을 흰색으로 변환
            rgb_image = Image.new('RGB', image.size, (255, 255, 255))
            if image.mode == 'P':
                image = image.convert('RGBA')
            rgb_image.paste(image, mask=image.split()[-1] if image.mode == 'RGBA' else None)
            image = rgb_image
        elif image.mode != 'RGB':
            image = image.convert('RGB')
        
        # YOLOv8 모델 로드
        model = get_yolo_model()
        
        # 이미지를 numpy 배열로 변환
        image_np = np.array(image)
        
        # YOLOv8로 객체 감지 (person 클래스만)
        results = model(image_np, classes=[0])  # 0 = person 클래스
        
        detected_items = []
        
        # 감지된 사람들에 대해 처리
        for result in results:
            boxes = result.boxes
            for box in boxes:
                # 바운딩 박스 좌표 (xyxy 형식)
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                confidence = float(box.conf[0].cpu().numpy())
                
                # 신뢰도가 0.5 이상인 경우만 처리
                if confidence >= 0.5:
                    person_box = {
                        "x1": float(x1),
                        "y1": float(y1),
                        "x2": float(x2),
                        "y2": float(y2),
                        "confidence": confidence
                    }
                    
                    # 사람 영역 내에서 의류 영역 추정
                    person_width = x2 - x1
                    person_height = y2 - y1
                    
                    # 상의 영역 (상반신 상단 20% ~ 50%)
                    top_y1 = y1 + person_height * 0.2
                    top_y2 = y1 + person_height * 0.5
                    top_item = {
                        "type": "상의",
                        "x1": float(x1),
                        "y1": float(top_y1),
                        "x2": float(x2),
                        "y2": float(top_y2),
                        "confidence": confidence * 0.9  # 사람 감지 신뢰도 기반
                    }
                    
                    # 하의 영역 (상반신 하단 50% ~ 90%)
                    bottom_y1 = y1 + person_height * 0.5
                    bottom_y2 = y1 + person_height * 0.9
                    bottom_item = {
                        "type": "하의",
                        "x1": float(x1),
                        "y1": float(bottom_y1),
                        "x2": float(x2),
                        "y2": float(bottom_y2),
                        "confidence": confidence * 0.9
                    }
                    
                    detected_items.append({
                        "person": person_box,
                        "clothing": [top_item, bottom_item]
                    })
        
        # 원본 이미지에 바운딩 박스 그리기 (시각화용)
        draw = ImageDraw.Draw(image)
        
        for item in detected_items:
            # 사람 바운딩 박스 (파란색)
            person = item["person"]
            draw.rectangle(
                [(person["x1"], person["y1"]), (person["x2"], person["y2"])],
                outline="blue",
                width=3
            )
            
            # 상의 영역 (빨간색)
            top = item["clothing"][0]
            draw.rectangle(
                [(top["x1"], top["y1"]), (top["x2"], top["y2"])],
                outline="red",
                width=2
            )
            
            # 하의 영역 (초록색)
            bottom = item["clothing"][1]
            draw.rectangle(
                [(bottom["x1"], bottom["y1"]), (bottom["x2"], bottom["y2"])],
                outline="green",
                width=2
            )
        
        # 시각화된 이미지를 Base64로 인코딩
        output_buffer = io.BytesIO()
        image.save(output_buffer, format='PNG')
        output_buffer.seek(0)
        output_base64 = base64.b64encode(output_buffer.getvalue()).decode('utf-8')
        
        return {
            "success": True,
            "image": f"data:image/png;base64,{output_base64}",
            "detections": detected_items,
            "count": len(detected_items)
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

@app.post("/api/save-history", response_model=HistorySaveResponse)
async def save_history(request: HistorySaveRequest):
    """
    코디 분석 결과를 히스토리에 저장합니다.
    """
    try:
        import uuid
        from datetime import datetime
        
        history_id = str(uuid.uuid4())
        created_at = request.createdAt or datetime.now().isoformat()
        
        history_entry = {
            "id": history_id,
            "beforeItems": [item.dict() for item in request.beforeItems],
            "harmonyScore": request.harmonyScore.dict(),
            "layoutImage": request.layoutImage,
            "createdAt": created_at
        }
        
        history_storage.append(history_entry)
        
        # 최대 100개까지만 저장 (메모리 관리)
        if len(history_storage) > 100:
            history_storage.pop(0)
        
        return HistorySaveResponse(
            success=True,
            historyId=history_id,
            message="히스토리에 저장되었습니다"
        )
    except Exception as e:
        return HistorySaveResponse(
            success=False,
            error=str(e)
        )

@app.get("/api/get-history")
async def get_history():
    """
    저장된 히스토리 목록을 반환합니다.
    """
    try:
        # 최신순으로 정렬
        sorted_history = sorted(history_storage, key=lambda x: x.get("createdAt", ""), reverse=True)
        return {
            "success": True,
            "history": sorted_history,
            "count": len(sorted_history)
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

@app.delete("/api/delete-history/{history_id}")
async def delete_history(history_id: str):
    """
    히스토리 항목을 삭제합니다.
    """
    try:
        global history_storage
        initial_count = len(history_storage)
        history_storage = [h for h in history_storage if h.get("id") != history_id]
        
        if len(history_storage) < initial_count:
            return {
                "success": True,
                "message": "히스토리가 삭제되었습니다"
            }
        else:
            return {
                "success": False,
                "error": "히스토리를 찾을 수 없습니다"
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

