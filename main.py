from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict
from rembg import remove
from PIL import Image, ImageDraw
from ultralytics import YOLO
import io
import base64
import numpy as np
import torch
import torchvision.transforms as transforms
from sklearn.cluster import KMeans
from pathlib import Path
import re
import time

from harmony import calculate_harmony_score
from harmony_label_bridge import placed_item_to_rulebook_dict

# ===== 통합 조화도 모델 (속성 + 조화 점수) =====
from models.fashion_harmony import (
    load_harmony_model,
    CATEGORY_CLASSES,
    MATERIAL_CLASSES,
    PATTERN_CLASSES,
    STYLE_CLASSES,
)

# ===== transformers (FashionCLIP + 카테고리용 OpenAI CLIP) =====
try:
    from transformers import AutoModel, AutoProcessor, CLIPModel, CLIPProcessor
    HAS_TRANSFORMERS = True
except ImportError:
    HAS_TRANSFORMERS = False
    AutoModel = None
    AutoProcessor = None
    CLIPModel = None
    CLIPProcessor = None

FASHION_CLIP_MODEL_ID = "Marqo/marqo-fashionCLIP"
CATEGORY_CLIP_MODEL_ID = "openai/clip-vit-base-patch32"

app = FastAPI(title="HUWARI API")

# ===== 경로 설정 =====
HARMONY_CKPT = Path(__file__).resolve().parent / "models" / "fashion_harmony_retrained.pt"

# ===== 전역 변수 =====
_harmony_model  = None
_yolo_model     = None
_clip_model     = None
_clip_processor = None
_use_clip       = False
_category_clip_model     = None
_category_clip_processor = None
_use_category_clip       = False
_device         = None

# ===== 이미지 전처리 =====
IMG_TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406],
                          [0.229, 0.224, 0.225])
])

def get_device():
    global _device
    if _device is None:
        _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"디바이스: {_device}")
    return _device


def get_harmony_model():
    """새 조화도 모델 지연 로딩"""
    global _harmony_model
    if _harmony_model is None:
        if not HARMONY_CKPT.exists():
            raise FileNotFoundError(f"모델 파일 없음: {HARMONY_CKPT}")
        print("조화도 모델 로드 중...")
        _harmony_model = load_harmony_model(str(HARMONY_CKPT), get_device())
        print("조화도 모델 로드 완료")
    return _harmony_model


def get_yolo_model():
    """YOLOv8 지연 로딩"""
    global _yolo_model
    if _yolo_model is None:
        _yolo_model = YOLO('yolov8n.pt')
        print("YOLOv8 로드 완료")
    return _yolo_model


def get_clip_model():
    """FashionCLIP(Marqo) 지연 로딩 — 색상 점수·피드백 문구에 사용"""
    global _clip_model, _clip_processor, _use_clip
    if _clip_model is None and HAS_TRANSFORMERS:
        try:
            _clip_processor = AutoProcessor.from_pretrained(
                FASHION_CLIP_MODEL_ID, trust_remote_code=True
            )
            _clip_model = AutoModel.from_pretrained(
                FASHION_CLIP_MODEL_ID,
                trust_remote_code=True,
                low_cpu_mem_usage=False,
            )
            _clip_model.eval()
            _use_clip = True
            print("FashionCLIP 로드 완료")
        except Exception as e:
            print(f"FashionCLIP 로드 실패: {e}")
            _use_clip = False
    return _clip_model, _clip_processor


def get_category_clip_model():
    """카테고리 분류용 OpenAI CLIP(ViT-B/32) 지연 로딩"""
    global _category_clip_model, _category_clip_processor, _use_category_clip
    if _category_clip_model is None and HAS_TRANSFORMERS and CLIPModel is not None:
        try:
            _category_clip_processor = CLIPProcessor.from_pretrained(CATEGORY_CLIP_MODEL_ID)
            _category_clip_model     = CLIPModel.from_pretrained(CATEGORY_CLIP_MODEL_ID)
            _category_clip_model.eval()
            _use_category_clip = True
            print("카테고리용 CLIP 로드 완료")
        except Exception as e:
            print(f"카테고리용 CLIP 로드 실패: {e}")
            _use_category_clip = False
    return _category_clip_model, _category_clip_processor


def _clip_forward(model, inputs: Dict):
    """MarqoFashionCLIP.forward 는 input_ids·pixel_values 만 받음( attention_mask 등 제외 )."""
    kwargs = {k: inputs[k] for k in ("input_ids", "pixel_values") if k in inputs}
    return model(**kwargs, return_dict=True)


def pil_to_tensor(image: Image.Image) -> torch.Tensor:
    return IMG_TRANSFORM(image.convert("RGB"))


def get_clip_color_score(images: List[Image.Image]) -> float:
    """FashionCLIP으로 색상 조화도 점수 계산 (0~1)"""
    clip_m, clip_p = get_clip_model()
    if not _use_clip or clip_m is None:
        return 0.5

    device = get_device()

    try:
        size = 224
        outfit_img = Image.new("RGB", (size * len(images), size), (255, 255, 255))
        for i, img in enumerate(images):
            outfit_img.paste(img.resize((size, size)), (i * size, 0))

        prompts = [
            "outfit with harmonious matching color tones",
            "outfit with clashing mismatched colors",
        ]

        clip_m = clip_m.to(device)
        inputs = clip_p(
            text=prompts, images=outfit_img,
            return_tensors="pt", padding=True
        )
        inputs = {k: v.to(device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = _clip_forward(clip_m, inputs)
            probs   = torch.softmax(outputs.logits_per_image[0], dim=0)

        return float(probs[0])

    except Exception as e:
        print(f"색상 조화 점수 실패: {e}")
        return 0.5


def analyze_outfit(
    images: List[Image.Image],
    accessory_images: Optional[List[Image.Image]] = None,
) -> Dict:
    """
    이미지 리스트 → 조화 점수 계산
    images: 상의/하의/아우터 등 메인 의류
    accessory_images: 신발/모자/악세서리 이미지 (색상만 반영)
    """
    if accessory_images is None:
        accessory_images = []

    model  = get_harmony_model()
    device = get_device()

    main_images = images[:4]

    tensors = [pil_to_tensor(img) for img in main_images]
    while len(tensors) < 4:
        tensors.append(torch.zeros(3, 224, 224))

    imgs_tensor = torch.stack(tensors).unsqueeze(0).to(device)
    mask        = torch.zeros(1, 4).to(device)
    mask[0, :len(main_images)] = 1.0

    with torch.no_grad():
        harmony_raw = model(imgs_tensor, mask).item()

    all_images  = main_images + list(accessory_images)
    color_score = get_clip_color_score(all_images) if all_images else 0.5

    # FashionCLIP 미로드·실패 시 color_score 는 0.5(중립)인데, 그대로 25% 섞으면 총점이 항상 눌림(예: 87대)
    if not _use_clip:
        final_raw = harmony_raw
    else:
        final_raw = harmony_raw * 0.75 + color_score * 0.25
    score_0to100 = round(final_raw * 100, 1)

    # 메인 1장 + 악세서리 없음: 세트 비교 대상이 없으므로 총점은 만점(비교·하이브리드 미적용)
    if len(main_images) == 1 and len(accessory_images) == 0:
        score_0to100 = 100.0

    clip_feedback = generate_clip_feedback(all_images)

    reasons = []
    if score_0to100 >= 80:
        reasons.append("전반적으로 조화로운 코디입니다")
    elif score_0to100 >= 60:
        reasons.append("적절한 조화를 이루고 있습니다")
    elif score_0to100 >= 40:
        reasons.append("일부 조화가 부족합니다")
    else:
        reasons.append("조화가 부족한 조합입니다")

    reasons.extend(clip_feedback)

    return {
        "harmony_score":       score_0to100,
        "harmony_sigmoid_raw": harmony_raw,
        "color_score":         round(color_score * 100, 1) if _use_clip else round(harmony_raw * 100, 1),
        "reasons":             reasons,
    }


def classify_attributes(image: Image.Image) -> Dict:
    """
    단일 이미지 → 재질/패턴/스타일/카테고리 분류 (FashionHarmonyModel.get_attributes)
    """
    empty = {"texture": None, "pattern": None, "style": None, "category": None}
    if not HARMONY_CKPT.exists():
        return empty

    model = get_harmony_model()
    device = get_device()
    tensor = pil_to_tensor(image.convert("RGB")).unsqueeze(0).to(device)
    model.eval()

    with torch.no_grad():
        out = model.get_attributes(tensor)

    mat_kor = out["material"]
    pat_kor = out["pattern"]
    style_name = out["style"]
    cat_name = out["category"]
    probs = out["probs"]

    mat_probs = {MATERIAL_CLASSES[i]: float(probs["material"][i]) for i in range(len(MATERIAL_CLASSES))}
    pat_probs = {PATTERN_CLASSES[i]: float(probs["pattern"][i]) for i in range(len(PATTERN_CLASSES))}

    style_probs = {STYLE_CLASSES[i]: float(probs["style"][i]) for i in range(len(STYLE_CLASSES))}
    cat_probs = {CATEGORY_CLASSES[i]: float(probs["category"][i]) for i in range(len(CATEGORY_CLASSES))}

    return {
        "texture": {
            "class": mat_kor,
            "confidence": float(mat_probs.get(mat_kor, 0.0)),
            "all_probs": mat_probs,
        },
        "pattern": {
            "class": pat_kor,
            "confidence": float(pat_probs.get(pat_kor, 0.0)),
            "all_probs": pat_probs,
        },
        "style": {
            "class": style_name,
            "confidence": float(style_probs.get(style_name, 0.0)),
            "all_probs": style_probs,
        },
        "category": {
            "class": cat_name,
            "confidence": float(cat_probs.get(cat_name, 0.0)),
            "all_probs": cat_probs,
        },
    }


def generate_clip_feedback(images: List[Image.Image]) -> List[str]:
    """
    FashionCLIP으로 코디 피드백 생성
    여러 아이템 이미지를 나란히 붙여서 하나의 코디 이미지로 만든 후
    피드백 텍스트와 유사도 계산
    """
    clip_m, clip_p = get_clip_model()
    if not _use_clip or clip_m is None:
        return []

    device = get_device()

    try:
        # 아이템 이미지들을 나란히 붙여서 하나의 코디 이미지로 만들기
        size    = 224
        w_total = size * len(images)
        outfit_img = Image.new("RGB", (w_total, size), (255, 255, 255))
        for i, img in enumerate(images):
            resized = img.resize((size, size))
            outfit_img.paste(resized, (i * size, 0))

        # 피드백 프롬프트 (긍정/부정 쌍으로 구성)
        feedback_prompts = [
            ("outfit with harmonious color tones",       "색상이 조화롭습니다 ✓"),
            ("outfit with clashing colors",              "색상 톤이 맞지 않습니다"),
            ("outfit with pattern conflict busy look",   "패턴이 충돌합니다"),
            ("outfit with clean minimal patterns",       "패턴이 깔끔하게 정리됐습니다 ✓"),
            ("outfit with consistent unified style",     "스타일이 통일됐습니다 ✓"),
            ("outfit with mixed clashing styles",        "스타일이 혼재합니다"),
            ("outfit with good texture contrast balance","재질 조합이 좋습니다 ✓"),
            ("outfit with awkward texture combination",  "재질 조합이 어색합니다"),
        ]

        texts   = [p[0] for p in feedback_prompts]
        labels  = [p[1] for p in feedback_prompts]

        clip_m  = clip_m.to(device)
        inputs  = clip_p(
            text=texts, images=outfit_img,
            return_tensors="pt", padding=True
        )
        inputs  = {k: v.to(device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = _clip_forward(clip_m, inputs)
            probs   = torch.sigmoid(outputs.logits_per_image)[0]

        # 임계값 0.5 이상인 것만 피드백으로 선택
        # 긍정/부정 쌍에서 높은 쪽만 선택
        feedbacks = []
        pairs = [(0,1), (2,3), (4,5), (6,7)]  # (긍정, 부정) 인덱스 쌍

        for pos_idx, neg_idx in pairs:
            pos_score = float(probs[pos_idx])
            neg_score = float(probs[neg_idx])
            if max(pos_score, neg_score) > 0.45:
                if pos_score >= neg_score:
                    feedbacks.append(labels[pos_idx])
                else:
                    feedbacks.append(labels[neg_idx])

        return feedbacks[:4]  # 최대 4개

    except Exception as e:
        print(f"FashionCLIP 피드백 생성 실패: {e}")
        return []


def classify_category(image: Image.Image) -> Dict:
    """
    단일 이미지 → 카테고리 분류 (OpenAI CLIP ViT-B/32)
    """
    clip_m, clip_p = get_category_clip_model()
    device = get_device()

    clothing_texts = [
        "a top, shirt, t-shirt, blouse, hoodie, upper garment",
        "bottoms, pants, jeans, skirt, shorts, lower garment",
        "a hat, cap, helmet, headwear",
        "shoes, sneakers, boots, footwear",
        "a bag, handbag, backpack, accessory"
    ]
    category_names = ['상의', '하의', '모자', '신발', '악세서리']

    if _use_category_clip and clip_m is not None:
        try:
            clip_m = clip_m.to(device)
            inputs = clip_p(text=clothing_texts, images=image,
                            return_tensors="pt", padding=True)
            inputs = {k: v.to(device) for k, v in inputs.items()}
            with torch.no_grad():
                outputs = clip_m(**inputs)
                probs   = torch.nn.functional.softmax(
                    outputs.logits_per_image, dim=1
                )[0]
            scores       = {category_names[i]: float(probs[i]) for i in range(5)}
            clothing_type = max(scores, key=scores.get)
            return {
                "clothing_type":    clothing_type,
                "clothing_scores":  scores,
                "model_confidence": float(probs.max()),
                "model_type":       "CLIP"
            }
        except Exception as e:
            print(f"CLIP 카테고리 분류 실패: {e}")

    # CLIP 실패 시 기본값
    return {
        "clothing_type":    "상의",
        "clothing_scores":  {},
        "model_confidence": 0.0,
        "model_type":       "fallback"
    }


# ===== CORS =====
# allow_credentials=True 와 allow_origins=["*"] 는 브라우저에서 같이 쓰면 무효 처리될 수 있어 명시 origin 사용
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/assets", StaticFiles(directory="public/assets"), name="assets")


@app.get("/")
async def read_root():
    try:
        return FileResponse("dist/index.html")
    except:
        return {"message": "Vite dev server should be running on port 3000"}


@app.get("/api/hello")
async def hello():
    return {"message": "Hello from HUWARI API!"}


# ===== 배경 제거 =====
@app.post("/api/remove-background")
async def remove_background(file: UploadFile = File(...)):
    try:
        image_data    = await file.read()
        output        = remove(image_data)
        image         = Image.open(io.BytesIO(output))
        output_buffer = io.BytesIO()
        image.save(output_buffer, format='PNG')
        output_buffer.seek(0)
        output_base64 = base64.b64encode(output_buffer.getvalue()).decode('utf-8')
        return {"success": True, "image": f"data:image/png;base64,{output_base64}", "format": "png"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ===== 색상 추출 =====
@app.post("/api/extract-colors")
async def extract_colors(file: UploadFile = File(...)):
    try:
        image_data = await file.read()
        image      = Image.open(io.BytesIO(image_data))

        if image.mode == 'RGBA':
            image_array   = np.array(image)
            mask          = image_array[:, :, 3] > 0
            rgb_pixels    = image_array[:, :, :3][mask]
        else:
            image      = image.convert('RGB')
            image_array = np.array(image)
            rgb_pixels  = image_array.reshape(-1, 3)

        if len(rgb_pixels) > 10000:
            indices    = np.random.choice(len(rgb_pixels), 10000, replace=False)
            rgb_pixels = rgb_pixels[indices]

        kmeans         = KMeans(n_clusters=5, random_state=42, n_init=10)
        kmeans.fit(rgb_pixels)
        colors         = kmeans.cluster_centers_.astype(int)
        labels         = kmeans.labels_
        cluster_counts = np.bincount(labels)
        sorted_indices = np.argsort(cluster_counts)[::-1]
        sorted_colors  = colors[sorted_indices]
        sorted_counts  = cluster_counts[sorted_indices]

        color_list = []
        for i, color in enumerate(sorted_colors):
            r, g, b = int(color[0]), int(color[1]), int(color[2])
            color_list.append({
                "rgb":        [r, g, b],
                "hex":        f"#{r:02x}{g:02x}{b:02x}",
                "count":      int(sorted_counts[i]),
                "percentage": float(sorted_counts[i] / len(labels) * 100)
            })
        return {"success": True, "colors": color_list}
    except Exception as e:
        return {"success": False, "error": str(e), "colors": []}


# ===== Pydantic 모델 =====
class ColorInfo(BaseModel):
    rgb:        List[int]
    hex:        str
    percentage: float

class PlacedItemRequest(BaseModel):
    id:       Optional[str]   = None
    imageUrl: Optional[str]   = None
    x:        Optional[float] = None
    y:        Optional[float] = None
    width:    Optional[float] = None
    height:   Optional[float] = None
    colors:   Optional[List[ColorInfo]] = None
    texture:  Optional[str]   = None
    pattern:  Optional[str]   = None
    style:    Optional[str]   = None
    category: Optional[str]   = None

class HarmonyRequest(BaseModel):
    beforeItems: List[PlacedItemRequest]
    afterItems:  List[PlacedItemRequest]

class HarmonyResponse(BaseModel):
    score_total:   float
    score_color:   float
    score_texture: float
    score_pattern: float
    score_style:   float
    reasons:       List[str]
    debug:         Dict

class HistorySaveRequest(BaseModel):
    beforeItems:  List[PlacedItemRequest]
    harmonyScore: HarmonyResponse
    layoutImage:  Optional[str] = None
    createdAt:    Optional[str] = None

class HistorySaveResponse(BaseModel):
    success:   bool
    historyId: Optional[str] = None
    message:   Optional[str] = None
    error:     Optional[str] = None


def _merge_model_rule_reasons(
    model_reasons: List[str],
    rule_reasons: List[str],
    max_n: int = 6,
) -> List[str]:
    out: List[str] = []
    for r in model_reasons or []:
        if r and r not in out:
            out.append(r)
        if len(out) >= max_n:
            return out
    for r in rule_reasons or []:
        if r and r not in out:
            out.append(r)
        if len(out) >= max_n:
            break
    return out


def load_image_from_url(image_url: str) -> Optional[Image.Image]:
    if not image_url:
        return None
    try:
        if image_url.startswith("data:image"):
            match = re.match(r"data:image/[^;]+;base64,(.+)", image_url)
            if match:
                return Image.open(io.BytesIO(base64.b64decode(match.group(1)))).convert("RGB")
        elif image_url.startswith(("/", "./")):
            return Image.open(image_url).convert("RGB")
        elif image_url.startswith(("http://", "https://")):
            import requests
            r = requests.get(image_url, timeout=5)
            r.raise_for_status()
            return Image.open(io.BytesIO(r.content)).convert("RGB")
        return None
    except Exception as e:
        print(f"이미지 로드 실패: {e}")
        return None


# ===== 속성 분류 API =====
@app.post("/api/classify-fashion-attributes")
async def classify_fashion_attributes(file: UploadFile = File(...)):
    """재질/패턴/스타일/카테고리 분류 — FashionHarmonyModel (통합 모델)"""
    try:
        image_data = await file.read()
        image      = Image.open(io.BytesIO(image_data)).convert("RGB")
        attrs      = classify_attributes(image)
        return {"success": True, **attrs}
    except Exception as e:
        return {"success": False, "error": str(e),
                "texture": None, "pattern": None, "style": None, "category": None}


# ===== 카테고리 분류 API =====
@app.post("/api/classify-clothing-type")
async def classify_clothing_type(file: UploadFile = File(...)):
    """카테고리 분류 — OpenAI CLIP 사용"""
    try:
        image_data = await file.read()
        image      = Image.open(io.BytesIO(image_data)).convert("RGB")

        # 카테고리용 CLIP
        get_category_clip_model()
        result = classify_category(image)
        return {"success": True, **result}
    except Exception as e:
        return {"success": False, "error": str(e), "clothing_type": "상의"}


# ===== 조화 점수 API =====
@app.post("/api/predict-harmony", response_model=HarmonyResponse)
async def predict_harmony(request: HarmonyRequest):
    """
    조화 점수·속성 — 동일 FashionHarmonyModel (재학습 체크포인트)
    흐름: 카테고리·재질·패턴·스타일 분류 헤드 + Set Transformer 조화 점수
    """
    try:
        if not request.beforeItems:
            return HarmonyResponse(
                score_total=50.0, score_color=50.0,
                score_texture=60.0, score_pattern=70.0, score_style=70.0,
                reasons=["Before 아이템이 없어 중립으로 계산"], debug={}
            )

        main_imgs          = []
        accessory_imgs     = []
        before_rule_items  = []
        after_rule_items   = []
        request_attrs_main = []  # main 이미지 순서와 동일 — 요청에 담긴 재질·패턴·스타일(수정 반영)
        ACCESSORY_CATEGORIES = ["신발", "모자", "악세서리"]

        def resolve_category(item: PlacedItemRequest, img: Image.Image) -> str:
            if item.category:
                return item.category
            get_category_clip_model()
            r = classify_category(img)
            return r.get("clothing_type", "상의")

        for item in request.beforeItems:
            if not item.imageUrl:
                continue
            img = load_image_from_url(item.imageUrl)
            if img is None:
                continue
            category = resolve_category(item, img)
            if category in ACCESSORY_CATEGORIES:
                accessory_imgs.append(img)
            else:
                main_imgs.append(img)
                before_rule_items.append(placed_item_to_rulebook_dict(item))
                request_attrs_main.append(
                    {
                        "texture": item.texture,
                        "pattern": item.pattern,
                        "style":   item.style,
                        "category": category,
                    }
                )

        for item in request.afterItems:
            if not item.imageUrl:
                continue
            img = load_image_from_url(item.imageUrl)
            if img is None:
                continue
            category = resolve_category(item, img)
            if category in ACCESSORY_CATEGORIES:
                accessory_imgs.append(img)
            else:
                main_imgs.append(img)
                after_rule_items.append(placed_item_to_rulebook_dict(item))
                request_attrs_main.append(
                    {
                        "texture": item.texture,
                        "pattern": item.pattern,
                        "style":   item.style,
                        "category": category,
                    }
                )

        if not main_imgs and not accessory_imgs:
            return HarmonyResponse(
                score_total=50.0, score_color=50.0,
                score_texture=60.0, score_pattern=70.0, score_style=70.0,
                reasons=["이미지를 로드할 수 없어 중립으로 계산"], debug={}
            )

        if not main_imgs:
            main_imgs = accessory_imgs
            accessory_imgs = []

        start_time = time.time()

        result       = analyze_outfit(main_imgs, accessory_imgs)
        model_total  = float(result["harmony_score"])

        item_attrs = []
        for img in main_imgs:
            attrs = classify_attributes(img)
            item_attrs.append(attrs)

        rule_result = None
        if before_rule_items:
            rule_result = calculate_harmony_score(before_rule_items, after_rule_items)

        if rule_result is not None:
            score_total = round(0.5 * model_total + 0.5 * float(rule_result["score_total"]), 1)
            score_color = float(rule_result["score_color"])
            score_texture = float(rule_result["score_texture"])
            score_pattern = float(rule_result["score_pattern"])
            score_style = float(rule_result["score_style"])
            reasons = _merge_model_rule_reasons(result.get("reasons") or [], rule_result.get("reasons") or [])
        else:
            score_total = model_total
            score_color = float(result["color_score"])
            score_texture = round(model_total * 0.95, 1)
            score_pattern = round(model_total * 0.95, 1)
            score_style = round(model_total * 0.95, 1)
            reasons = result.get("reasons") or []

        elapsed = time.time() - start_time

        return HarmonyResponse(
            score_total=score_total,
            score_color=score_color,
            score_texture=score_texture,
            score_pattern=score_pattern,
            score_style=score_style,
            reasons=reasons,
            debug={
                "elapsed":             elapsed,
                "item_attrs":          item_attrs,
                "request_attrs_main":  request_attrs_main,
                "main_img_count":      len(main_imgs),
                "accessory_img_count": len(accessory_imgs),
                "harmony_raw":         result.get("harmony_sigmoid_raw"),
                "color_score":         result.get("color_score"),
                "model_score_total":   model_total,
                "rulebook_score":      rule_result,
            }
        )

    except Exception as e:
        import traceback
        print(f"조화 점수 오류: {traceback.format_exc()}")
        raise e


# ===== 웹캠 조화 분석 API (새로 추가) =====
@app.post("/api/webcam-harmony")
async def webcam_harmony(file: UploadFile = File(...)):
    """
    웹캠 캡처 → YOLOv8 사람 탐지 → 크롭 → 조화 분석
    """
    try:
        image_data = await file.read()
        image      = Image.open(io.BytesIO(image_data)).convert("RGB")
        image_np   = np.array(image)

        yolo    = get_yolo_model()
        results = yolo(image_np, classes=[0])

        cropped_imgs = []
        detections   = []

        for result in results:
            for box in result.boxes:
                conf = float(box.conf[0].cpu().numpy())
                if conf < 0.5:
                    continue

                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                ph = y2 - y1

                top_crop = image.crop((
                    int(x1), int(y1 + ph * 0.20),
                    int(x2), int(y1 + ph * 0.55)
                ))
                bot_crop = image.crop((
                    int(x1), int(y1 + ph * 0.50),
                    int(x2), int(y1 + ph * 0.90)
                ))

                cropped_imgs.extend([top_crop, bot_crop])
                detections.append({
                    "person": {
                        "x1": float(x1), "y1": float(y1),
                        "x2": float(x2), "y2": float(y2),
                        "confidence": conf
                    },
                    "crops": ["상의", "하의"]
                })
                break  # 첫 번째 사람만

        if not cropped_imgs:
            cropped_imgs = [image]
            detections   = [{"person": None, "crops": ["전체"]}]

        result = analyze_outfit(cropped_imgs)

        item_attrs = []
        for img in cropped_imgs:
            attrs = classify_attributes(img)
            item_attrs.append(attrs)

        # 크롭 이미지 base64
        crop_b64_list = []
        for img in cropped_imgs:
            buf = io.BytesIO()
            img.save(buf, format='PNG')
            buf.seek(0)
            crop_b64_list.append(
                f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"
            )

        return {
            "success": True,
            "harmony_score": result["harmony_score"],
            "harmony_sigmoid_raw": result.get("harmony_sigmoid_raw"),
            "items": item_attrs,
            "reasons": result["reasons"],
            "detections": detections,
            "crop_images": crop_b64_list,
        }

    except Exception as e:
        import traceback
        print(f"웹캠 분석 오류: {traceback.format_exc()}")
        return {"success": False, "error": str(e)}


# ===== 의류 탐지 API =====
@app.post("/api/detect-clothing")
async def detect_clothing(file: UploadFile = File(...)):
    """YOLOv8으로 사람 탐지 및 상의/하의 영역 추정"""
    try:
        image_data = await file.read()
        image      = Image.open(io.BytesIO(image_data)).convert("RGB")
        image_np   = np.array(image)

        yolo    = get_yolo_model()
        results = yolo(image_np, classes=[0])

        detected_items = []
        draw = ImageDraw.Draw(image)

        for result in results:
            for box in result.boxes:
                conf = float(box.conf[0].cpu().numpy())
                if conf < 0.5:
                    continue

                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                ph = y2 - y1

                top_item = {
                    "type": "상의",
                    "x1": float(x1), "y1": float(y1 + ph * 0.2),
                    "x2": float(x2), "y2": float(y1 + ph * 0.5),
                    "confidence": conf * 0.9
                }
                bot_item = {
                    "type": "하의",
                    "x1": float(x1), "y1": float(y1 + ph * 0.5),
                    "x2": float(x2), "y2": float(y1 + ph * 0.9),
                    "confidence": conf * 0.9
                }
                detected_items.append({
                    "person":   {"x1": float(x1), "y1": float(y1),
                                 "x2": float(x2), "y2": float(y2),
                                 "confidence": conf},
                    "clothing": [top_item, bot_item]
                })

                draw.rectangle([(x1, y1), (x2, y2)], outline="blue", width=3)
                draw.rectangle([(top_item["x1"], top_item["y1"]),
                                (top_item["x2"], top_item["y2"])], outline="red", width=2)
                draw.rectangle([(bot_item["x1"], bot_item["y1"]),
                                (bot_item["x2"], bot_item["y2"])], outline="green", width=2)

        buf = io.BytesIO()
        image.save(buf, format='PNG')
        buf.seek(0)
        output_base64 = base64.b64encode(buf.getvalue()).decode('utf-8')

        return {
            "success":    True,
            "image":      f"data:image/png;base64,{output_base64}",
            "detections": detected_items,
            "count":      len(detected_items)
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


# ===== 히스토리 =====
history_storage: List[Dict] = []

@app.post("/api/save-history", response_model=HistorySaveResponse)
async def save_history(request: HistorySaveRequest):
    try:
        import uuid
        from datetime import datetime
        history_id = str(uuid.uuid4())
        history_storage.append({
            "id":           history_id,
            "beforeItems":  [item.dict() for item in request.beforeItems],
            "harmonyScore": request.harmonyScore.dict(),
            "layoutImage":  request.layoutImage,
            "createdAt":    request.createdAt or datetime.now().isoformat()
        })
        if len(history_storage) > 100:
            history_storage.pop(0)
        return HistorySaveResponse(success=True, historyId=history_id, message="저장됐습니다")
    except Exception as e:
        return HistorySaveResponse(success=False, error=str(e))

@app.get("/api/get-history")
async def get_history():
    try:
        sorted_history = sorted(history_storage,
                                key=lambda x: x.get("createdAt", ""), reverse=True)
        return {"success": True, "history": sorted_history, "count": len(sorted_history)}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.delete("/api/delete-history/{history_id}")
async def delete_history(history_id: str):
    try:
        global history_storage
        before = len(history_storage)
        history_storage = [h for h in history_storage if h.get("id") != history_id]
        if len(history_storage) < before:
            return {"success": True, "message": "삭제됐습니다"}
        return {"success": False, "error": "찾을 수 없습니다"}
    except Exception as e:
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)