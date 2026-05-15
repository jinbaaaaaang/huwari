"""
모델·UI 한글 라벨(fashion_harmony.MATERIAL_CLASSES 등)을
harmony.py 규칙 매트릭스(영문 키)로 변환한다.
"""
from typing import Any, Dict, List, Optional

# ===== 재질: 한글 클래스명 → harmony.TEXTURE_MATRIX 키 =====
TEXTURE_KO_TO_EN: Dict[str, str] = {
    "데님": "Denim",
    "니트": "Knit/Jersey",
    "실크": "Silk",
    "가죽": "Leather",
    "울": "Wool/Cashmere",
    "면": "Woven (Plain)",
    "패딩": "Padded/Fleece/Fur",
    "기타": "Synthetic/Other",
}

# ===== 패턴: 한글 → harmony.PATTERN_MATRIX 키 =====
PATTERN_KO_TO_EN: Dict[str, str] = {
    "무지": "Solid",
    "스트라이프": "Stripe",
    "체크": "Check",
    "도트": "Dot",
    "플로럴": "Floral",
    "그래픽": "Graphic/Lettering",
    "호피·뱀피": "Leopard/Snake",
    "카무플라쥬": "Camouflage",
    "기타": "Other",
}


def map_texture_for_rulebook(ko_or_en: Optional[str]) -> Optional[str]:
    if not ko_or_en:
        return None
    if ko_or_en in TEXTURE_KO_TO_EN.values():
        return ko_or_en
    return TEXTURE_KO_TO_EN.get(ko_or_en)


def map_pattern_for_rulebook(ko_or_en: Optional[str]) -> Optional[str]:
    if not ko_or_en:
        return None
    if ko_or_en in PATTERN_KO_TO_EN.values():
        return ko_or_en
    return PATTERN_KO_TO_EN.get(ko_or_en)


def placed_item_to_rulebook_dict(item: Any) -> Dict:
    """PlacedItemRequest 호환 객체 → harmony.calculate_harmony_score 아이템 dict."""
    colors: List[Dict] = []
    raw_colors = getattr(item, "colors", None) or []
    for c in raw_colors:
        if hasattr(c, "model_dump"):
            d = c.model_dump()
        elif isinstance(c, dict):
            d = c
        else:
            continue
        colors.append(
            {
                "rgb": d.get("rgb") or [0, 0, 0],
                "hex": d.get("hex") or "#000000",
                "percentage": float(d.get("percentage") or 0),
            }
        )

    tex = getattr(item, "texture", None)
    pat = getattr(item, "pattern", None)
    sty = getattr(item, "style", None)

    return {
        "texture": map_texture_for_rulebook(tex),
        "pattern": map_pattern_for_rulebook(pat),
        "style": sty,
        "colors": colors,
    }
