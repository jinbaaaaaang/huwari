"""
models/fashion_harmony.py
새 통합 패션 조화도 모델
- FashionBackbone: EfficientNet-B3 기반 백본
- AttributeHeads: 재질/패턴/스타일/카테고리 분류 헤드
- SetTransformer: 세트 전체 조화 판단
"""
import torch
import torch.nn as nn
import torch.nn.functional as F
import timm


# ===== 클래스 목록 =====
# 재학습 체크포인트(fashion_harmony_retrained.pt)와 차원 일치: 재질 8 · 패턴 9 · 스타일 10 · 카테고리 5 → attr 32
CATEGORY_CLASSES = ["상의", "하의", "신발", "모자", "악세서리"]

MATERIAL_CLASSES = [
    "데님", "니트", "실크", "가죽", "울", "면", "패딩", "기타"
]

PATTERN_CLASSES = [
    "무지", "스트라이프", "체크", "도트", "플로럴",
    "그래픽", "호피·뱀피", "카무플라쥬", "기타",
]

STYLE_CLASSES = [
    "캐주얼", "고프코어", "미니멀", "긱시크", "로맨틱",
    "빈티지", "포멀", "Y2K", "스트리트", "스포티"
]


class FashionBackbone(nn.Module):
    """EfficientNet-B3 기반 백본"""

    def __init__(self, embed_dim=512):
        super().__init__()
        base = timm.create_model("efficientnet_b3", pretrained=False)
        self.features   = nn.Sequential(*list(base.children())[:-1])
        in_features     = base.classifier.in_features  # 1536

        self.projection = nn.Sequential(
            nn.Linear(in_features, 1024),
            nn.BatchNorm1d(1024),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(1024, embed_dim),
        )
        self.embed_dim = embed_dim

    def forward(self, x):
        feat = self.features(x).flatten(1)
        emb  = self.projection(feat)
        return emb  # L2 정규화 없음


class AttributeHeads(nn.Module):
    """재질 / 패턴 / 스타일 / 카테고리 분류 헤드"""

    def __init__(self, embed_dim=512):
        super().__init__()

        def _head(out_dim):
            return nn.Sequential(
                nn.Linear(embed_dim, 256),
                nn.BatchNorm1d(256),
                nn.ReLU(),
                nn.Dropout(0.3),
                nn.Linear(256, out_dim)
            )

        self.category_head = _head(len(CATEGORY_CLASSES))  # 5
        self.material_head = _head(len(MATERIAL_CLASSES))  # 8
        self.pattern_head  = _head(len(PATTERN_CLASSES))   # 9
        self.style_head    = _head(len(STYLE_CLASSES))   # 10

    def forward(self, emb):
        return {
            "category": self.category_head(emb),
            "material": self.material_head(emb),
            "pattern":  self.pattern_head(emb),
            "style":    self.style_head(emb),
        }


class SetTransformer(nn.Module):
    """세트 전체를 한 번에 보고 조화 점수 계산"""

    def __init__(self, input_dim=1024, nhead=8, num_layers=2):
        super().__init__()
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=input_dim,
            nhead=nhead,
            dim_feedforward=1024,
            dropout=0.1,
            batch_first=True
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        self.cls_token   = nn.Parameter(torch.randn(1, 1, input_dim))

        self.score_head = nn.Sequential(
            nn.Linear(input_dim, 256),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(256, 64),
            nn.ReLU(),
            nn.Linear(64, 1),
            nn.Sigmoid()
        )

    def forward(self, x, mask=None):
        B   = x.size(0)
        cls = self.cls_token.expand(B, -1, -1)
        x   = torch.cat([cls, x], dim=1)

        if mask is not None:
            cls_mask         = torch.ones(B, 1, device=mask.device)
            full_mask        = torch.cat([cls_mask, mask], dim=1)
            key_padding_mask = (full_mask == 0)
        else:
            key_padding_mask = None

        out   = self.transformer(x, src_key_padding_mask=key_padding_mask)
        score = self.score_head(out[:, 0, :]).squeeze(1)
        return score


class FashionHarmonyModel(nn.Module):
    """전체 통합 모델: 백본 + 속성 헤드 + Set Transformer"""

    def __init__(self, embed_dim=512):
        super().__init__()
        self.backbone        = FashionBackbone(embed_dim)
        self.attr_heads      = AttributeHeads(embed_dim)

        # 속성 벡터 차원: 5+8+9+10 = 32 (재학습 체크포인트와 동일)
        attr_dim             = (len(CATEGORY_CLASSES) + len(MATERIAL_CLASSES) +
                                len(PATTERN_CLASSES)  + len(STYLE_CLASSES))
        self.attr_proj       = nn.Linear(attr_dim, embed_dim)
        self.set_transformer = SetTransformer(input_dim=embed_dim * 2)

    def get_embedding(self, x):
        return self.backbone(x)

    def get_attributes(self, x):
        """단일 이미지 속성 분류"""
        emb   = self.backbone(x)
        preds = self.attr_heads(emb)
        return {
            "category": CATEGORY_CLASSES[preds["category"].argmax(1).item()],
            "material": MATERIAL_CLASSES[preds["material"].argmax(1).item()],
            "pattern":  PATTERN_CLASSES [preds["pattern"] .argmax(1).item()],
            "style":    STYLE_CLASSES   [preds["style"]   .argmax(1).item()],
            "probs": {
                "category": F.softmax(preds["category"][0], dim=0).tolist(),
                "material": F.softmax(preds["material"][0], dim=0).tolist(),
                "pattern":  F.softmax(preds["pattern"][0],  dim=0).tolist(),
                "style":    F.softmax(preds["style"][0],    dim=0).tolist(),
            }
        }

    def harmony_score(self, outfit_imgs, mask=None):
        """세트 조화 점수 계산"""
        B, N, C, H, W = outfit_imgs.shape
        flat = outfit_imgs.view(B * N, C, H, W)

        emb      = self.backbone(flat)
        preds    = self.attr_heads(emb)
        attr_vec = torch.cat([
            F.softmax(preds["category"], dim=1),
            F.softmax(preds["material"], dim=1),
            F.softmax(preds["pattern"],  dim=1),
            F.softmax(preds["style"],    dim=1),
        ], dim=1)
        attr_emb = self.attr_proj(attr_vec)
        combined = torch.cat([emb, attr_emb], dim=1).view(B, N, -1)
        score    = self.set_transformer(combined, mask)
        return score

    def forward(self, outfit_imgs, mask=None):
        return self.harmony_score(outfit_imgs, mask)


def load_harmony_model(ckpt_path: str, device: torch.device) -> FashionHarmonyModel:
    """체크포인트에서 모델 로드"""
    model = FashionHarmonyModel(embed_dim=512)
    checkpoint = torch.load(ckpt_path, map_location=device)
    state_dict = (checkpoint["model_state_dict"]
                  if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint
                  else checkpoint)
    model.load_state_dict(state_dict)
    model.eval()
    model.to(device)
    return model