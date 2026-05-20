from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Tuple
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
import torch.nn.functional as F

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

# ===== open_clip (FashionCLIP) + transformers (카테고리용 OpenAI CLIP) =====
try:
    import open_clip
    HAS_OPEN_CLIP = True
except ImportError:
    HAS_OPEN_CLIP = False
    open_clip = None

try:
    from transformers import CLIPModel, CLIPProcessor
    HAS_TRANSFORMERS = True
except ImportError:
    HAS_TRANSFORMERS = False
    CLIPModel = None
    CLIPProcessor = None

try:
    import mediapipe as mp
    HAS_MEDIAPIPE = True
except ImportError:
    HAS_MEDIAPIPE = False
    mp = None

FASHION_CLIP_MODEL_ID = "hf-hub:Marqo/marqo-fashionCLIP"
CATEGORY_CLIP_MODEL_ID = "openai/clip-vit-base-patch32"

app = FastAPI(title="HUWARI API")


@app.on_event("startup")
def _warmup_heavy_models():
    """첫 웹캠 요청 전에 YOLO·Pose·조화 모델을 미리 로드해 대기 시간을 줄입니다."""
    import threading

    def _load():
        try:
            get_yolo_model()
            get_pose_model()
            get_harmony_model()
            print("웹캠용 모델 워밍업 완료 (YOLO, Pose, Harmony)")
        except Exception as exc:
            print(f"모델 워밍업 일부 실패 (첫 요청 시 재시도): {exc}")

    threading.Thread(target=_load, daemon=True).start()


# ===== 경로 설정 =====
HARMONY_CKPT = Path(__file__).resolve().parent / "models" / "fashion_harmony_retrained.pt"

# ===== 전역 변수 =====
_harmony_model  = None
_yolo_model     = None
_pose_model     = None
_pose_backend   = None  # "solutions" | "tasks"
_clip_model       = None
_clip_preprocess  = None
_clip_tokenizer   = None
_use_clip         = False
_clip_load_failed = False
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


def _ensure_pose_landmarker_model() -> Path:
    """MediaPipe Tasks API용 pose_landmarker_lite.task"""
    model_path = Path(__file__).resolve().parent / "models" / "pose_landmarker_lite.task"
    if model_path.exists():
        return model_path
    model_path.parent.mkdir(parents=True, exist_ok=True)
    url = (
        "https://storage.googleapis.com/mediapipe-models/"
        "pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
    )
    import urllib.request
    print(f"MediaPipe pose 모델 다운로드: {model_path}")
    urllib.request.urlretrieve(url, model_path)
    return model_path


def get_pose_model():
    """MediaPipe Pose 지연 로딩 (solutions 우선, 없으면 Tasks API)"""
    global _pose_model, _pose_backend
    if not HAS_MEDIAPIPE:
        return None
    if _pose_model is not None:
        return _pose_model

    if hasattr(mp, "solutions"):
        _pose_model = mp.solutions.pose.Pose(
            static_image_mode=True,
            min_detection_confidence=0.5,
        )
        _pose_backend = "solutions"
        print("MediaPipe Pose (solutions) 로드 완료")
        return _pose_model

    try:
        from mediapipe.tasks.python import BaseOptions
        from mediapipe.tasks.python import vision

        options = vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(_ensure_pose_landmarker_model())),
            running_mode=vision.RunningMode.IMAGE,
            min_pose_detection_confidence=0.5,
        )
        _pose_model = vision.PoseLandmarker.create_from_options(options)
        _pose_backend = "tasks"
        print("MediaPipe PoseLandmarker (tasks) 로드 완료")
    except Exception as exc:
        print(f"MediaPipe Pose 로드 실패: {exc}")
        _pose_model = None
        _pose_backend = None
    return _pose_model


def _clamp_crop_box(x1: float, y1: float, x2: float, y2: float, w: int, h: int) -> Optional[Tuple[int, int, int, int]]:
    x1i, y1i, x2i, y2i = int(x1), int(y1), int(x2), int(y2)
    x1i = max(0, min(x1i, w - 1))
    y1i = max(0, min(y1i, h - 1))
    x2i = max(x1i + 1, min(x2i, w))
    y2i = max(y1i + 1, min(y2i, h))
    if x2i - x1i < 8 or y2i - y1i < 8:
        return None
    return x1i, y1i, x2i, y2i


def _landmark_visible(landmark, threshold: float = 0.5) -> bool:
    visibility = getattr(landmark, "visibility", None)
    if visibility is None:
        return True
    return float(visibility) >= threshold


def _bbox_from_landmarks(
    landmarks,
    indices: List[int],
    img_w: int,
    img_h: int,
    pad_ratio: float = 0.08,
    min_visible: int = 2,
) -> Optional[Tuple[int, int, int, int]]:
    pts = [
        (landmarks[i].x * img_w, landmarks[i].y * img_h)
        for i in indices
        if _landmark_visible(landmarks[i])
    ]
    if len(pts) < min_visible:
        return None
    xs, ys = zip(*pts)
    pad_w, pad_h = img_w * pad_ratio, img_h * pad_ratio
    return _clamp_crop_box(min(xs) - pad_w, min(ys) - pad_h, max(xs) + pad_w, max(ys) + pad_h, img_w, img_h)


def _bbox_dict(x1: int, y1: int, x2: int, y2: int) -> Dict[str, int]:
    return {"x1": x1, "y1": y1, "x2": x2, "y2": y2}


def _encode_crop_item(
    category: str,
    crop_img: Image.Image,
    crop_method: str,
    bbox: Tuple[int, int, int, int],
) -> Dict:
    buf = io.BytesIO()
    crop_img.save(buf, format="PNG")
    buf.seek(0)
    b64 = base64.b64encode(buf.getvalue()).decode()
    return {
        "category": category,
        "imageBase64": f"data:image/png;base64,{b64}",
        "crop_method": crop_method,
        "bbox": _bbox_dict(*bbox),
    }


def _mediapipe_pose_crops(
    image: Image.Image,
) -> Optional[List[Tuple[str, Image.Image, Tuple[int, int, int, int]]]]:
    """MediaPipe 관절 기반 의류 크롭(상·하의·신발). 있는 영역만 반환, 상의 단독 허용."""
    pose = get_pose_model()
    if pose is None:
        return None

    img_w, img_h = image.size
    try:
        if _pose_backend == "solutions":
            results = pose.process(np.array(image))
            if not results.pose_landmarks:
                return None
            lms = results.pose_landmarks.landmark
        else:
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(image))
            results = pose.detect(mp_image)
            if not results.pose_landmarks:
                return None
            lms = results.pose_landmarks[0]
    except Exception as exc:
        print(f"MediaPipe 추론 실패, YOLO 폴백: {exc}")
        return None

    region_boxes: Dict[str, Optional[Tuple[int, int, int, int]]] = {
        "상의": _bbox_from_landmarks(lms, [11, 12, 23, 24], img_w, img_h, pad_ratio=0.08),
        "하의": _bbox_from_landmarks(lms, [23, 24, 25, 26], img_w, img_h, pad_ratio=0.08, min_visible=2),
        "신발": _bbox_from_landmarks(lms, [27, 28], img_w, img_h, pad_ratio=0.12, min_visible=1),
    }
    if region_boxes["상의"] is None:
        region_boxes["상의"] = _bbox_from_landmarks(
            lms, [11, 12], img_w, img_h, pad_ratio=0.14, min_visible=2,
        )

    crops: List[Tuple[str, Image.Image, Tuple[int, int, int, int]]] = []
    for category, box in region_boxes.items():
        if box is None:
            continue
        crops.append((category, image.crop(box), box))

    if not any(cat in ("상의", "하의") for cat, _, _ in crops):
        return None
    return crops


def _person_bbox_from_landmarks(
    landmarks, img_w: int, img_h: int,
) -> Optional[Tuple[int, int, int, int]]:
    """관절 전체로 사람 영역 bbox (오버레이용)."""
    pts = [
        (landmarks[i].x * img_w, landmarks[i].y * img_h)
        for i in range(len(landmarks))
        if _landmark_visible(landmarks[i], threshold=0.3)
    ]
    if len(pts) < 4:
        return None
    xs, ys = zip(*pts)
    pad_w, pad_h = img_w * 0.04, img_h * 0.04
    return _clamp_crop_box(min(xs) - pad_w, min(ys) - pad_h, max(xs) + pad_w, max(ys) + pad_h, img_w, img_h)



def _is_plausible_region_box(
    x1: int, y1: int, x2: int, y2: int, frame_w: int, frame_h: int,
    min_width_ratio: float = 0.08,
) -> bool:
    """상·하의 등 영역 bbox가 세로 띠처럼 좁지 않은지 검증."""
    bw, bh = x2 - x1, y2 - y1
    if bw <= 0 or bh <= 0:
        return False
    if bw / frame_w < min_width_ratio:
        return False
    if bh / frame_h < 0.06:
        return False
    aspect = bh / bw
    if aspect > 6.5:
        return False
    return True


def _expand_person_box_width(
    x1: float, y1: float, x2: float, y2: float,
    frame_w: int, min_width_ratio: float = 0.18,
) -> Tuple[float, float, float, float]:
    """YOLO 사람 박스가 너무 좁으면 중심 기준으로 너비를 보정."""
    bw = x2 - x1
    min_bw = frame_w * min_width_ratio
    if bw >= min_bw:
        return x1, y1, x2, y2
    cx = (x1 + x2) / 2
    half = min_bw / 2
    nx1 = max(0.0, cx - half)
    nx2 = min(float(frame_w), cx + half)
    if nx2 - nx1 < min_bw:
        if nx1 == 0:
            nx2 = min(float(frame_w), min_bw)
        else:
            nx1 = max(0.0, float(frame_w) - min_bw)
    return nx1, y1, nx2, y2


def _is_plausible_person_box(
    x1: float, y1: float, x2: float, y2: float,
    frame_w: int, frame_h: int, conf: float,
    min_conf: float = 0.45,
) -> bool:
    """세로 막대·배경 오검출을 걸러내기 위한 사람 bbox 검증."""
    if conf < min_conf:
        return False
    bw, bh = x2 - x1, y2 - y1
    if bw <= 0 or bh <= 0:
        return False
    area_ratio = (bw * bh) / (frame_w * frame_h)
    if area_ratio < 0.02 or area_ratio > 0.95:
        return False
    aspect = bh / bw
    if aspect < 0.9 or aspect > 6.0:
        return False
    if bw / frame_w < 0.07:
        return False
    return True


def _yolo_person_box(
    image_np: np.ndarray, frame_w: int, frame_h: int, conf_threshold: float = 0.45,
) -> Optional[Tuple[float, float, float, float, float]]:
    """신뢰도·형태 검증을 통과한 첫 번째 사람 bbox."""
    yolo = get_yolo_model()
    results = yolo(image_np, classes=[0])
    candidates: List[Tuple[float, float, float, float, float]] = []
    for result in results:
        for box in result.boxes:
            conf = float(box.conf[0].cpu().numpy())
            if conf < conf_threshold:
                continue
            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
            x1, y1, x2, y2 = float(x1), float(y1), float(x2), float(y2)
            if _is_plausible_person_box(x1, y1, x2, y2, frame_w, frame_h, conf, conf_threshold):
                candidates.append((x1, y1, x2, y2, conf))
    if not candidates:
        return None
    candidates.sort(key=lambda c: (c[2] - c[0]) * (c[3] - c[1]), reverse=True)
    return candidates[0]


def _is_torso_only_box(y1: float, y2: float, frame_h: int) -> bool:
    """상반신·상의만 보이는 구도(하체·발이 프레임 밖)."""
    ph = y2 - y1
    if ph <= 0:
        return False
    return y2 < frame_h * 0.72 or ph / frame_h < 0.42


def _yolo_ratio_crop_specs(
    x1: float, y1: float, x2: float, y2: float, frame_h: int,
) -> List[Tuple[str, Tuple[int, int, int, int]]]:
    ph = y2 - y1
    ix1, ix2 = int(x1), int(x2)
    if _is_torso_only_box(y1, y2, frame_h):
        return [("상의", (ix1, int(y1 + ph * 0.02), ix2, int(y2)))]
    return [
        ("상의", (ix1, int(y1 + ph * 0.08), ix2, int(y1 + ph * 0.48))),
        ("하의", (ix1, int(y1 + ph * 0.42), ix2, int(y1 + ph * 0.78))),
        ("신발", (ix1, int(y1 + ph * 0.68), ix2, int(y2))),
    ]


def _yolo_ratio_crops(
    image: Image.Image, x1: float, y1: float, x2: float, y2: float,
) -> List[Tuple[str, Image.Image, Tuple[int, int, int, int]]]:
    frame_h = image.size[1]
    min_crop_h = max(24, int(frame_h * 0.05))
    crops: List[Tuple[str, Image.Image, Tuple[int, int, int, int]]] = []
    for category, box in _yolo_ratio_crop_specs(x1, y1, x2, y2, frame_h):
        x1b, y1b, x2b, y2b = box
        if y2b - y1b < min_crop_h:
            continue
        crops.append((category, image.crop(box), box))
    return crops


def get_clip_model():
    """FashionCLIP(Marqo) — open_clip hf-hub 로딩 (색상 점수·피드백 문구)"""
    global _clip_model, _clip_preprocess, _clip_tokenizer, _use_clip, _clip_load_failed
    if _clip_model is not None:
        return _clip_model, _clip_preprocess, _clip_tokenizer
    if _clip_load_failed or not HAS_OPEN_CLIP:
        return None, None, None
    try:
        _clip_model, _, _clip_preprocess = open_clip.create_model_and_transforms(
            FASHION_CLIP_MODEL_ID
        )
        _clip_tokenizer = open_clip.get_tokenizer(FASHION_CLIP_MODEL_ID)
        _clip_model.eval()
        _use_clip = True
        print("FashionCLIP 로드 완료")
    except Exception as e:
        _clip_load_failed = True
        _use_clip = False
        print(f"FashionCLIP 로드 실패: {e}")
    return _clip_model, _clip_preprocess, _clip_tokenizer


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


def _fashion_clip_text_probs(
    model,
    preprocess,
    tokenizer,
    outfit_img: Image.Image,
    texts: List[str],
    device: torch.device,
) -> torch.Tensor:
    """코디 이미지 1장과 텍스트 목록의 유사도(softmax). shape: (len(texts),)"""
    image_tensor = preprocess(outfit_img.convert("RGB")).unsqueeze(0).to(device)
    text_tokens = tokenizer(texts).to(device)
    with torch.no_grad():
        image_features = model.encode_image(image_tensor)
        text_features = model.encode_text(text_tokens)
        image_features = image_features / image_features.norm(dim=-1, keepdim=True)
        text_features = text_features / text_features.norm(dim=-1, keepdim=True)
        logits = (100.0 * image_features @ text_features.T)[0]
    return torch.softmax(logits, dim=0)


def _build_outfit_collage(images: List[Image.Image], tile: int = 224) -> Image.Image:
    collage = Image.new("RGB", (tile * len(images), tile), (255, 255, 255))
    for i, img in enumerate(images):
        collage.paste(img.convert("RGB").resize((tile, tile)), (i * tile, 0))
    return collage


def pil_to_tensor(image: Image.Image) -> torch.Tensor:
    return IMG_TRANSFORM(image.convert("RGB"))


def get_clip_color_score(images: List[Image.Image]) -> float:
    """FashionCLIP으로 색상 조화도 점수 계산 (0~1)"""
    clip_m, preprocess, tokenizer = get_clip_model()
    if not _use_clip or clip_m is None or preprocess is None or tokenizer is None:
        return 0.5

    device = get_device()

    try:
        outfit_img = _build_outfit_collage(images)
        prompts = [
            "outfit with harmonious matching color tones",
            "outfit with clashing mismatched colors",
        ]
        clip_m = clip_m.to(device)
        probs = _fashion_clip_text_probs(
            clip_m, preprocess, tokenizer, outfit_img, prompts, device
        )
        return float(probs[0])

    except Exception as e:
        print(f"색상 조화 점수 실패: {e}")
        return 0.5


def _dominant_color_from_placed_item(item: "PlacedItemRequest") -> Optional[Dict]:
    if not item.colors:
        return None
    top = max(item.colors, key=lambda c: c.percentage)
    return {"rgb": top.rgb, "hex": top.hex, "percentage": float(top.percentage)}


def _build_set_transformer_sequence(model, imgs_tensor: torch.Tensor, mask: torch.Tensor):
    """FashionHarmonyModel과 동일 경로로 Set Transformer 입력 시퀀스 구성 (CLS 포함)."""
    B, N, C, H, W = imgs_tensor.shape
    flat = imgs_tensor.view(B * N, C, H, W)
    emb = model.backbone(flat)
    preds = model.attr_heads(emb)
    attr_vec = torch.cat(
        [
            F.softmax(preds["category"], dim=1),
            F.softmax(preds["material"], dim=1),
            F.softmax(preds["pattern"], dim=1),
            F.softmax(preds["style"], dim=1),
        ],
        dim=1,
    )
    attr_emb = model.attr_proj(attr_vec)
    combined = torch.cat([emb, attr_emb], dim=1).view(B, N, -1)

    st = model.set_transformer
    cls = st.cls_token.expand(B, -1, -1)
    x = torch.cat([cls, combined], dim=1)

    key_padding_mask = None
    if mask is not None:
        cls_mask = torch.ones(B, 1, device=mask.device)
        full_mask = torch.cat([cls_mask, mask], dim=1)
        key_padding_mask = full_mask == 0

    return x, key_padding_mask, st


def get_attention_weights(model, imgs_tensor: torch.Tensor, mask: torch.Tensor, device) -> Optional[torch.Tensor]:
    """Set Transformer 1레이어 self-attention (아이템 간 관계)."""
    try:
        model.eval()
        with torch.no_grad():
            x, key_padding_mask, st = _build_set_transformer_sequence(model, imgs_tensor, mask)
            layer0 = st.transformer.layers[0]
            _, attn_weights = layer0.self_attn(
                x,
                x,
                x,
                key_padding_mask=key_padding_mask,
                need_weights=True,
                average_attn_weights=True,
            )
            attn = attn_weights[0].detach().cpu()
            attn = attn[1:, 1:]
            n_valid = int(mask[0].sum().item()) if mask is not None else attn.shape[0]
            n_valid = max(0, min(n_valid, attn.shape[0]))
            if n_valid < 2:
                return None
            return attn[:n_valid, :n_valid]
    except Exception as e:
        print(f"attention weights 추출 실패: {e}")
        return None


_SCORE_SUMMARY_LINES = frozenset({
    "전체적으로 완성도 높은 코디입니다",
    "전반적으로 균형잡힌 코디입니다",
    "일부 아이템 교체로 조화도를 높일 수 있습니다",
    "색상 또는 스타일 통일감을 높이면 더 좋아집니다",
})

_LOW_SCORE_THRESHOLD = 60.0
_VERY_LOW_SCORE_THRESHOLD = 40.0
_FEEDBACK_MAX_LINES = 6

_NEGATIVE_REASON_HINTS = (
    "조화롭지 않",
    "충돌",
    "어려움",
    "맞지 않",
    "어색",
    "과도한",
    "산만",
    "정리가 필요",
    "일관되지 않",
    "분산",
)


def _pick_attr_from_request_or_model(
    request_attr: Optional[Dict],
    model_attr: Dict,
    key: str,
) -> Optional[str]:
    """UI에서 수정한 재질·패턴·스타일 우선, 없으면 이미지 분류 결과."""
    if request_attr:
        v = request_attr.get(key)
        if v:
            return str(v)
    block = model_attr.get(key)
    if isinstance(block, dict) and block.get("class"):
        return str(block["class"])
    return None


def _score_summary_line(harmony_score: float) -> str:
    if harmony_score >= 80:
        return "전체적으로 완성도 높은 코디입니다"
    if harmony_score >= 60:
        return "전반적으로 균형잡힌 코디입니다"
    if harmony_score >= 40:
        return "일부 아이템 교체로 조화도를 높일 수 있습니다"
    return "색상 또는 스타일 통일감을 높이면 더 좋아집니다"


def _is_negative_reason(text: str) -> bool:
    return any(h in text for h in _NEGATIVE_REASON_HINTS)


def _replace_score_summary(reasons: List[str], harmony_score: float) -> List[str]:
    """룰북 병합 후 최종 총점에 맞게 종합 문장만 갱신."""
    filtered = [r for r in reasons if r not in _SCORE_SUMMARY_LINES]
    filtered.append(_score_summary_line(harmony_score))
    return filtered[: _FEEDBACK_MAX_LINES + 1]


def _prepend_unique_lines(target: List[str], lines: List[str], max_add: int = 2) -> None:
    added = 0
    for line in lines:
        if not line or line in target or line in _SCORE_SUMMARY_LINES:
            continue
        target.insert(min(added, len(target)), line)
        added += 1
        if added >= max_add:
            break


_STYLE_OPPOSITE_PAIRS = [
    frozenset({"로맨틱", "스트리트"}),
    frozenset({"포멀", "캐주얼"}),
    frozenset({"미니멀", "Y2K"}),
]

_TEXTURE_LINES: Dict[str, str] = {
    "데님": "데님 소재 중심의 캐주얼한 코디입니다",
    "니트": "니트 소재 중심의 포근하고 따뜻한 분위기입니다",
    "실크": "실크 소재 중심의 고급스러운 분위기입니다",
    "가죽": "가죽 소재 중심의 엣지 있는 코디입니다",
    "울": "울 소재 중심의 클래식한 분위기입니다",
    "면": "면 소재 중심의 가볍고 편안한 코디입니다",
    "패딩": "패딩 소재 중심의 실용적인 아우터 코디입니다",
    "기타": "다양한 소재가 조합된 코디입니다",
}

_PATTERN_CONFLICT_PAIRS = [
    frozenset({"스트라이프", "체크"}),
    frozenset({"스트라이프", "호피·뱀피"}),
    frozenset({"체크", "호피·뱀피"}),
    frozenset({"스트라이프", "플로럴"}),
    frozenset({"체크", "그래픽"}),
]

_ATTENTION_PAIR_LINES: Dict[frozenset, str] = {
    frozenset({"상의", "하의"}): "상의와 하의의 조화가 코디의 핵심 요소입니다",
    frozenset({"상의", "아우터"}): "아우터와 상의의 레이어링이 포인트입니다",
}


def _attention_weights_from_list(raw) -> Optional[torch.Tensor]:
    if raw is None:
        return None
    try:
        t = torch.tensor(raw, dtype=torch.float32)
        if t.dim() == 2 and t.shape[0] >= 2:
            return t
    except Exception:
        pass
    return None


def _collect_item_attributes(
    item_attrs: List[Dict],
    request_attrs_main: List[Dict],
) -> tuple[List[str], List[str], List[str]]:
    styles: List[str] = []
    textures: List[str] = []
    patterns: List[str] = []
    for i, attr in enumerate(item_attrs):
        req = request_attrs_main[i] if i < len(request_attrs_main) else None
        style = _pick_attr_from_request_or_model(req, attr, "style")
        texture = _pick_attr_from_request_or_model(req, attr, "texture")
        pattern = _pick_attr_from_request_or_model(req, attr, "pattern")
        if style:
            styles.append(style)
        if texture:
            textures.append(texture)
        if pattern:
            patterns.append(pattern)
    return styles, textures, patterns


def _explain_attention(
    attention_weights: Optional[torch.Tensor],
    category_list: List[str],
    item_attrs: List[Dict],
) -> Optional[str]:
    if attention_weights is None or len(item_attrs) < 2:
        return None

    n = min(len(item_attrs), attention_weights.shape[0], len(category_list))
    if n < 2:
        return None

    attn = attention_weights[:n, :n]
    max_val = 0.0
    max_pair = (0, 1)
    for i in range(n):
        for j in range(n):
            if i != j and float(attn[i][j]) > max_val:
                max_val = float(attn[i][j])
                max_pair = (i, j)

    i, j = max_pair
    cat_i = category_list[i] if i < len(category_list) else f"아이템{i + 1}"
    cat_j = category_list[j] if j < len(category_list) else f"아이템{j + 1}"
    pair_key = frozenset({cat_i, cat_j})

    if pair_key in _ATTENTION_PAIR_LINES:
        return _ATTENTION_PAIR_LINES[pair_key]

    layer_categories = {"상의", "아우터", "모자"}
    if pair_key <= layer_categories and len(pair_key) == 2:
        return f"{cat_i}와 {cat_j}의 레이어링이 포인트입니다"

    return f"{cat_i}와 {cat_j}의 조화가 코디의 핵심 요소입니다"


def _explain_colors(colors: List[Dict], harmony_score: float) -> List[str]:
    if not colors:
        return []

    lines: List[str] = []
    avg_brightness = sum(
        (c["rgb"][0] * 0.299 + c["rgb"][1] * 0.587 + c["rgb"][2] * 0.114) for c in colors
    ) / len(colors)
    dominant_colors = [c for c in colors if c.get("percentage", 0) > 15]

    if harmony_score < _LOW_SCORE_THRESHOLD:
        if len(dominant_colors) >= 4:
            lines.append("색이 많아 전체 톤이 산만해 보일 수 있습니다")
        elif len(dominant_colors) >= 3:
            lines.append("색상 수가 많아 통일감을 줄일 여지가 있습니다")
        else:
            brightnesses = [
                c["rgb"][0] * 0.299 + c["rgb"][1] * 0.587 + c["rgb"][2] * 0.114
                for c in colors
            ]
            if len(brightnesses) >= 2 and max(brightnesses) - min(brightnesses) > 80:
                lines.append("아이템마다 밝기 차이가 커 색 조화가 어렵게 느껴질 수 있습니다")
            else:
                lines.append("상·하의 색감을 한 톤으로 맞추면 더 안정적으로 보입니다")
        if harmony_score < _VERY_LOW_SCORE_THRESHOLD and len(lines) < 2:
            lines.append("포인트 색을 하나로 줄이면 조화도가 올라갑니다")
        return lines[:2]

    if avg_brightness < 100:
        lines.append("저채도 다크 톤으로 차분한 분위기입니다")
    elif avg_brightness > 180:
        lines.append("밝은 톤으로 경쾌한 분위기입니다")
    else:
        lines.append("중간 밝기로 균형 잡힌 색감입니다")

    if len(dominant_colors) <= 2:
        lines.append("색 수가 적어 통일감 있는 코디입니다")
    elif len(dominant_colors) >= 4:
        lines.append("다양한 색으로 포인트가 풍부합니다")

    return lines[:2]


def _explain_texture(textures: List[str], harmony_score: float) -> Optional[str]:
    uniq = list(dict.fromkeys(textures))
    if not uniq:
        return None
    if len(uniq) >= 2 and harmony_score < _LOW_SCORE_THRESHOLD:
        return "서로 다른 재질이 많아 질감 대비를 줄이면 더 자연스럽습니다"
    if len(uniq) == 1:
        return _TEXTURE_LINES.get(uniq[0], _TEXTURE_LINES["기타"])
    return _TEXTURE_LINES["기타"]


def _explain_pattern(patterns: List[str], harmony_score: float) -> Optional[str]:
    uniq = list(dict.fromkeys(patterns))
    if not uniq:
        return None

    pat_set = set(uniq)
    critical = harmony_score < _LOW_SCORE_THRESHOLD

    for pair in _PATTERN_CONFLICT_PAIRS:
        if pair.issubset(pat_set):
            if critical:
                items = [p for p in uniq if p in pair]
                a, b = items[0], items[1] if len(items) > 1 else sorted(pair)[1]
                return f"{a}과 {b} 패턴이 겹쳐 시선이 분산됩니다"
            return "다양한 패턴이 혼재하여 과감한 스타일링입니다"

    non_solid = [p for p in uniq if p != "무지"]

    if len(uniq) == 1:
        if uniq[0] == "무지":
            return "무지 패턴으로 깔끔하게 통일된 코디입니다"
        return f"{uniq[0]} 패턴이 돋보이는 코디입니다"

    if len(non_solid) == 0:
        return "무지 패턴으로 깔끔하게 통일된 코디입니다"

    if "무지" in pat_set and len(non_solid) == 1:
        return f"무지에 {non_solid[0]} 포인트가 더해진 코디입니다"

    if len(uniq) >= 2:
        if critical:
            return f"{uniq[0]}과 {uniq[1]} 패턴 조합이 어수선해 보일 수 있습니다"
        return f"{uniq[0]}과 {uniq[1]} 패턴이 조합되어 풍성한 코디입니다"

    return None


def _explain_style(styles: List[str], harmony_score: float) -> Optional[str]:
    if not styles:
        return None

    critical = harmony_score < _LOW_SCORE_THRESHOLD
    style_set = set(styles)
    for pair in _STYLE_OPPOSITE_PAIRS:
        if pair.issubset(style_set):
            ordered = [s for s in styles if s in pair]
            if len(ordered) >= 2:
                a, b = ordered[0], ordered[1]
            else:
                a, b = sorted(pair)
            if critical:
                return f"{a}와 {b} 스타일이 부딪혀 전체 톤이 일관되지 않습니다"
            return f"{a}와 {b}가 혼재하여 개성 있는 코디입니다"

    uniq = list(dict.fromkeys(styles))
    if len(uniq) == 1:
        return f"{uniq[0]} 스타일이 통일된 깔끔한 코디입니다"

    counts: Dict[str, int] = {}
    for s in styles:
        counts[s] = counts.get(s, 0) + 1
    top_style = max(counts, key=counts.get)
    if counts[top_style] >= len(styles) - 1:
        return f"{top_style} 스타일이 통일된 깔끔한 코디입니다"

    if critical:
        return "스타일 방향이 여러 갈래로 나뉘어 정리가 필요해 보입니다"

    return f"{uniq[0]} 스타일이 통일된 깔끔한 코디입니다"


def generate_explanation(
    attention_weights: Optional[torch.Tensor],
    item_attrs: List[Dict],
    colors: List[Dict],
    category_list: List[str],
    harmony_score: float,
    request_attrs_main: Optional[List[Dict]] = None,
) -> List[str]:
    """Attention → 색상 → 재질 → 패턴 → 스타일 순 규칙 기반 피드백 (저점수 시 개선·부정 톤)."""
    request_attrs_main = request_attrs_main or []
    explanations: List[str] = []
    critical = harmony_score < _LOW_SCORE_THRESHOLD

    styles: List[str] = []
    textures: List[str] = []
    patterns: List[str] = []
    if item_attrs:
        styles, textures, patterns = _collect_item_attributes(item_attrs, request_attrs_main)

    if harmony_score < _VERY_LOW_SCORE_THRESHOLD:
        explanations.append("전체적으로 코디 밸런스를 다시 맞춰 볼 필요가 있습니다")

    if not critical:
        attn_line = _explain_attention(attention_weights, category_list, item_attrs)
        if attn_line:
            explanations.append(attn_line)

    explanations.extend(_explain_colors(colors, harmony_score))

    texture_line = _explain_texture(textures, harmony_score)
    if texture_line:
        explanations.append(texture_line)

    pattern_line = _explain_pattern(patterns, harmony_score)
    if pattern_line:
        explanations.append(pattern_line)

    style_line = _explain_style(styles, harmony_score)
    if style_line:
        explanations.append(style_line)

    explanations = [e for e in explanations if e not in _SCORE_SUMMARY_LINES]
    explanations.append(_score_summary_line(harmony_score))

    return explanations[: _FEEDBACK_MAX_LINES + 1]


def analyze_outfit(
    images: List[Image.Image],
    accessory_images: Optional[List[Image.Image]] = None,
    category_list: Optional[List[str]] = None,
    colors: Optional[List[Dict]] = None,
    request_attrs_main: Optional[List[Dict]] = None,
) -> Dict:
    """
    이미지 리스트 → 조화 점수 계산
    images: 상의/하의/아우터 등 메인 의류
    accessory_images: 신발/모자/악세서리 이미지 (색상만 반영)
    """
    if accessory_images is None:
        accessory_images = []
    if category_list is None:
        category_list = []
    if colors is None:
        colors = []
    if request_attrs_main is None:
        request_attrs_main = []

    model = get_harmony_model()
    device = get_device()

    main_images = images[:4]

    tensors = [pil_to_tensor(img) for img in main_images]
    while len(tensors) < 4:
        tensors.append(torch.zeros(3, 224, 224))

    imgs_tensor = torch.stack(tensors).unsqueeze(0).to(device)
    mask = torch.zeros(1, 4).to(device)
    mask[0, : len(main_images)] = 1.0

    with torch.no_grad():
        harmony_raw = model(imgs_tensor, mask).item()

    attention_weights = get_attention_weights(model, imgs_tensor, mask, device)

    all_images = main_images + list(accessory_images)
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

    item_attrs = []
    for img in main_images:
        item_attrs.append(classify_attributes(img))

    reasons = generate_explanation(
        attention_weights=attention_weights,
        item_attrs=item_attrs,
        colors=colors,
        category_list=category_list,
        harmony_score=score_0to100,
        request_attrs_main=request_attrs_main,
    )

    attn_list = None
    if attention_weights is not None:
        attn_list = attention_weights.tolist()

    return {
        "harmony_score": score_0to100,
        "harmony_sigmoid_raw": harmony_raw,
        "color_score": round(color_score * 100, 1) if _use_clip else round(harmony_raw * 100, 1),
        "reasons": reasons,
        "item_attrs": item_attrs,
        "attention_weights": attn_list,
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
    clip_m, preprocess, tokenizer = get_clip_model()
    if not _use_clip or clip_m is None or preprocess is None or tokenizer is None:
        return []

    device = get_device()

    try:
        outfit_img = _build_outfit_collage(images)

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

        clip_m = clip_m.to(device)
        with torch.no_grad():
            image_tensor = preprocess(outfit_img.convert("RGB")).unsqueeze(0).to(device)
            text_tokens = tokenizer(texts).to(device)
            image_features = clip_m.encode_image(image_tensor)
            text_features = clip_m.encode_text(text_tokens)
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)
            logits = (100.0 * image_features @ text_features.T)[0]
            probs = torch.sigmoid(logits)

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


def _extract_colors_from_pil(image: Image.Image, max_colors: int = 5) -> List[Dict]:
    """PIL 이미지에서 대표 색상 추출 (웹캠 실시간·extract-colors 공용)."""
    if image.mode == 'RGBA':
        image_array = np.array(image)
        mask = image_array[:, :, 3] > 0
        rgb_pixels = image_array[:, :, :3][mask]
    else:
        image = image.convert('RGB')
        rgb_pixels = np.array(image).reshape(-1, 3)

    if len(rgb_pixels) < 16:
        return []

    if len(rgb_pixels) > 10000:
        indices = np.random.choice(len(rgb_pixels), 10000, replace=False)
        rgb_pixels = rgb_pixels[indices]

    n_clusters = min(max_colors, len(rgb_pixels))
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    kmeans.fit(rgb_pixels)
    colors = kmeans.cluster_centers_.astype(int)
    labels = kmeans.labels_
    cluster_counts = np.bincount(labels)
    sorted_indices = np.argsort(cluster_counts)[::-1]
    color_list = []
    for i in sorted_indices:
        color = colors[i]
        r, g, b = int(color[0]), int(color[1]), int(color[2])
        color_list.append({
            "rgb": [r, g, b],
            "hex": f"#{r:02x}{g:02x}{b:02x}",
            "count": int(cluster_counts[i]),
            "percentage": float(cluster_counts[i] / len(labels) * 100),
        })
    return color_list


def _attr_class(attrs: Dict, key: str) -> Optional[str]:
    block = attrs.get(key)
    if isinstance(block, dict):
        return block.get("class")
    return None


def _build_webcam_live_items(
    crop_items: List[Dict],
    cropped_imgs: List[Image.Image],
    item_attrs: List[Dict],
) -> List[Dict]:
    """실시간 UI용 — 크롭별 색상·속성(상·하의)."""
    live: List[Dict] = []
    main_idx = 0
    for item, img in zip(crop_items, cropped_imgs):
        cat = item.get("category")
        if cat not in ("상의", "하의", "신발"):
            continue
        entry: Dict = {
            "category": cat,
            "colors": _extract_colors_from_pil(img),
        }
        if cat in ("상의", "하의") and main_idx < len(item_attrs):
            attrs = item_attrs[main_idx]
            main_idx += 1
            entry["texture"] = _attr_class(attrs, "texture")
            entry["pattern"] = _attr_class(attrs, "pattern")
            entry["style"] = _attr_class(attrs, "style")
        live.append(entry)
    return live


# ===== 색상 추출 =====
@app.post("/api/extract-colors")
async def extract_colors(file: UploadFile = File(...)):
    try:
        image_data = await file.read()
        image = Image.open(io.BytesIO(image_data))
        color_list = _extract_colors_from_pil(image)
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
    score_total: float
    score_color: float
    reasons:     List[str]
    debug:       Dict

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


# harmony.py 폴백·디버그용 — 사용자 피드백 말풍선에는 넣지 않음
_RULEBOOK_INTERNAL_REASON_PREFIXES = (
    "Before 아이템이 없어",
    "아이템이 1개뿐이어서",
    "색상 정보가 부족해",
    "재질 정보가 부족해",
    "패턴 정보가 부족해",
    "스타일 정보가 부족해",
)


def _is_user_facing_reason(text: str) -> bool:
    if not text or "중립으로 계산" in text:
        return False
    return not any(text.startswith(p) for p in _RULEBOOK_INTERNAL_REASON_PREFIXES)


def _merge_model_rule_reasons(
    model_reasons: List[str],
    rule_reasons: List[str],
    harmony_score: float,
    max_n: int = _FEEDBACK_MAX_LINES,
) -> List[str]:
    """저점수면 룰북 부정 문장을 앞에, 높은 점수면 모델 설명을 우선."""
    model_list = [
        r for r in (model_reasons or [])
        if r and r not in _SCORE_SUMMARY_LINES
    ]
    rule_user = [r for r in (rule_reasons or []) if _is_user_facing_reason(r)]
    rule_neg = [r for r in rule_user if _is_negative_reason(r)]
    rule_other = [r for r in rule_user if not _is_negative_reason(r)]

    out: List[str] = []

    if harmony_score < _LOW_SCORE_THRESHOLD:
        for r in rule_neg:
            if r not in out:
                out.append(r)
            if len(out) >= 2:
                break

    for r in model_list:
        if r not in out:
            out.append(r)
        if len(out) >= max_n:
            return out

    pool = rule_neg + rule_other if harmony_score < _LOW_SCORE_THRESHOLD else rule_other + rule_neg
    for r in pool:
        if r not in out:
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
                score_total=50.0,
                score_color=50.0,
                reasons=["Before 아이템이 없어 중립으로 계산"],
                debug={},
            )

        main_imgs            = []
        accessory_imgs       = []
        before_rule_items    = []
        after_rule_items     = []
        main_categories      = []  # 메인 이미지 순서 — attention 설명용
        outfit_category_list = []  # beforeItems 로드 순서
        outfit_colors        = []  # 아이템별 대표색
        request_attrs_main   = []  # main 이미지 순서와 동일 — 요청에 담긴 재질·패턴·스타일(수정 반영)
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
            outfit_category_list.append(category)
            dominant = _dominant_color_from_placed_item(item)
            if dominant:
                outfit_colors.append(dominant)
            if category in ACCESSORY_CATEGORIES:
                accessory_imgs.append(img)
            else:
                main_imgs.append(img)
                main_categories.append(category)
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
                score_total=50.0,
                score_color=50.0,
                reasons=["이미지를 로드할 수 없어 중립으로 계산"],
                debug={},
            )

        if not main_imgs:
            main_imgs = accessory_imgs
            accessory_imgs = []

        start_time = time.time()

        result = analyze_outfit(
            main_imgs,
            accessory_imgs,
            category_list=main_categories,
            colors=outfit_colors,
            request_attrs_main=request_attrs_main,
        )
        model_total = float(result["harmony_score"])
        item_attrs = result.get("item_attrs") or []

        rule_result = None
        if before_rule_items:
            rule_result = calculate_harmony_score(before_rule_items, after_rule_items)

        if rule_result is not None:
            score_total = round(0.5 * model_total + 0.5 * float(rule_result["score_total"]), 1)
            score_color = float(rule_result["score_color"])
        else:
            score_total = model_total
            score_color = float(result["color_score"])

        # 최종 총점·수정된 속성으로 피드백 재생성 (analyze_outfit 시점 점수와 불일치 방지)
        reasons = generate_explanation(
            attention_weights=_attention_weights_from_list(result.get("attention_weights")),
            item_attrs=item_attrs,
            colors=outfit_colors,
            category_list=main_categories,
            harmony_score=score_total,
            request_attrs_main=request_attrs_main,
        )
        if rule_result is not None:
            reasons = _merge_model_rule_reasons(
                reasons,
                rule_result.get("reasons") or [],
                score_total,
            )

        if score_total < _LOW_SCORE_THRESHOLD:
            clip_images = main_imgs + list(accessory_imgs)
            if clip_images:
                clip_neg = [
                    line for line in generate_clip_feedback(clip_images)
                    if "✓" not in line
                ]
                _prepend_unique_lines(reasons, clip_neg, max_add=2)

        reasons = _replace_score_summary(reasons, score_total)

        elapsed = time.time() - start_time

        return HarmonyResponse(
            score_total=score_total,
            score_color=score_color,
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
                "attention_weights":   result.get("attention_weights"),
                "outfit_category_list": outfit_category_list,
            }
        )

    except Exception as e:
        import traceback
        print(f"조화 점수 오류: {traceback.format_exc()}")
        raise e


# ===== 웹캠 조화 분석 API =====
@app.post("/api/webcam-harmony")
async def webcam_harmony(file: UploadFile = File(...)):
    """
    웹캠 캡처 → 의류 영역 크롭(MediaPipe 관절 우선, 실패 시 YOLO 비율)
    → 상의·하의·신발 중 인식된 항목만 조화 분석 (상의 단독 허용)
    """
    try:
        image_data = await file.read()
        image = Image.open(io.BytesIO(image_data)).convert("RGB")
        image_np = np.array(image)
        frame_w, frame_h = image.size

        cropped_imgs: List[Image.Image] = []
        crop_items: List[Dict] = []
        detections: List[Dict] = []
        overall_crop_method = "full_frame"
        overlay_boxes: List[Dict] = []

        mp_crops = _mediapipe_pose_crops(image)
        if mp_crops:
            overall_crop_method = "mediapipe"
            for category, crop_img, box in mp_crops:
                cropped_imgs.append(crop_img)
                crop_items.append(_encode_crop_item(category, crop_img, "mediapipe", box))
                overlay_boxes.append({"category": category, "bbox": _bbox_dict(*box), "role": "crop"})
            detections.append({"person": None, "pose": "mediapipe"})
        else:
            person = _yolo_person_box(image_np, frame_w, frame_h)
            if person:
                x1, y1, x2, y2, conf = person
                x1, y1, x2, y2 = _expand_person_box_width(x1, y1, x2, y2, frame_w)
                overall_crop_method = "ratio"
                ratio_crops = _yolo_ratio_crops(image, x1, y1, x2, y2)
                if not ratio_crops:
                    person_box = _clamp_crop_box(x1, y1, x2, y2, frame_w, frame_h)
                    if person_box:
                        ratio_crops = [("상의", image.crop(person_box), person_box)]
                for category, crop_img, box in ratio_crops:
                    cropped_imgs.append(crop_img)
                    crop_items.append(_encode_crop_item(category, crop_img, "ratio", box))
                    overlay_boxes.append({"category": category, "bbox": _bbox_dict(*box), "role": "crop"})
                detections.append({
                    "person": {
                        "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                        "confidence": conf,
                    },
                    "pose": None,
                })

        if not cropped_imgs:
            return {
                "success": True,
                "harmony_score": None,
                "color_score": None,
                "reasons": [
                    "옷이 화면에 보이도록 촬영해 주세요. (상의만 있어도 분석 가능)",
                ],
                "detections": detections,
                "crop_items": [],
                "overlay_boxes": [],
                "frame_width": frame_w,
                "frame_height": frame_h,
                "crop_method": "none",
            }

        main_imgs = [
            img for img, item in zip(cropped_imgs, crop_items)
            if item["category"] in ["상의", "하의"]
        ]
        accessory_imgs = [
            img for img, item in zip(cropped_imgs, crop_items)
            if item["category"] in ["신발"]
        ]
        if not main_imgs and crop_items and crop_items[0]["category"] == "전체":
            main_imgs = [cropped_imgs[0]]

        result = analyze_outfit(
            images=main_imgs,
            accessory_images=accessory_imgs,
            category_list=[item["category"] for item in crop_items],
        )
        live_items = _build_webcam_live_items(
            crop_items,
            cropped_imgs,
            result.get("item_attrs") or [],
        )

        return {
            "success": True,
            "harmony_score": result["harmony_score"],
            "harmony_sigmoid_raw": result.get("harmony_sigmoid_raw"),
            "color_score": result.get("color_score"),
            "reasons": result["reasons"],
            "live_items": live_items,
            "detections": detections,
            "crop_items": crop_items,
            "overlay_boxes": overlay_boxes,
            "frame_width": frame_w,
            "frame_height": frame_h,
            "crop_method": overall_crop_method,
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