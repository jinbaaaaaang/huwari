# models/harmony_ranker.py
import os
import torch
import torch.nn as nn
import numpy as np
from PIL import Image

# timm은 임베딩 추출기(EfficientNet-B0)용
import timm

# ----------------------------
# 1) MH-Attn Ranker
# ----------------------------
class MHAttentionRanker(nn.Module):
    def __init__(self, emb_dim=1280, proj_dim=512, num_heads=8, hidden=1024, dropout=0.2):
        super().__init__()
        assert proj_dim % num_heads == 0

        self.proj_b = nn.Sequential(
            nn.Linear(emb_dim, proj_dim),
            nn.LayerNorm(proj_dim),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
        )
        self.proj_a = nn.Sequential(
            nn.Linear(emb_dim, proj_dim),
            nn.LayerNorm(proj_dim),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
        )

        self.cross_attn = nn.MultiheadAttention(
            embed_dim=proj_dim,
            num_heads=num_heads,
            dropout=dropout,
            batch_first=True
        )

        in_dim = proj_dim * 4
        self.mlp = nn.Sequential(
            nn.Linear(in_dim, hidden),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(hidden, hidden // 2),  # 체크포인트: (512, 1024) -> (in=1024, out=512)
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(hidden // 2, 1)  # 체크포인트: (1, 512) -> (in=512, out=1)
        )

    def _ctx(self, bX, bmask, a):
        """
        bX:   (B, K, 1280)
        bmask:(B, K) 1=valid, 0=pad
        a:    (B, 1280)
        """
        bP = self.proj_b(bX)                 # (B,K,P)
        aP = self.proj_a(a).unsqueeze(1)     # (B,1,P)
        key_padding_mask = (bmask == 0)      # True=pad

        out, _ = self.cross_attn(
            query=aP, key=bP, value=bP,
            key_padding_mask=key_padding_mask,
            need_weights=False
        )
        ctx = out.squeeze(1)   # (B,P)
        aP  = aP.squeeze(1)    # (B,P)
        return aP, ctx

    def score(self, bX, bmask, a):
        aP, ctx = self._ctx(bX, bmask, a)
        x = torch.cat([aP, ctx, (aP-ctx).abs(), aP*ctx], dim=1)
        return self.mlp(x).squeeze(1)

# ----------------------------
# 2) EfficientNet-B0 embedder
# ----------------------------
class EfficientNetB0Embedder:
    """
    이미지 -> 1280차원 임베딩 추출기
    """
    def __init__(self, device: torch.device):
        self.device = device
        self.model = timm.create_model("efficientnet_b0", pretrained=True, num_classes=0, global_pool="avg")
        self.model.eval().to(self.device)

        # timm 권장 전처리(Resize/Normalize 포함)
        cfg = timm.data.resolve_data_config(self.model.pretrained_cfg, model=self.model)
        self.transform = timm.data.create_transform(**cfg, is_training=False)

    @torch.no_grad()
    def encode_pil(self, img: Image.Image) -> torch.Tensor:
        if img.mode != "RGB":
            img = img.convert("RGB")
        x = self.transform(img).unsqueeze(0).to(self.device)   # (1,3,H,W)
        emb = self.model(x)                                    # (1,1280)
        return emb.squeeze(0)                                  # (1280,)

# ----------------------------
# 3) 로더(캐시) + 점수 계산
# ----------------------------
_embedder = None
_ranker = None

def load_harmony_ranker(ckpt_path: str, device: torch.device) -> MHAttentionRanker:
    ckpt = torch.load(ckpt_path, map_location="cpu")
    model = MHAttentionRanker(emb_dim=1280, proj_dim=512, num_heads=8, hidden=1024, dropout=0.2)
    try:
        model.load_state_dict(ckpt["model_state_dict"], strict=True)
    except Exception as e:
        # strict 모드 실패 시 partial 로딩 시도
        try:
            model.load_state_dict(ckpt["model_state_dict"], strict=False)
            print(f"경고: 모델을 부분적으로만 로드했습니다: {e}")
        except Exception as e2:
            raise RuntimeError(f"모델 로딩 실패: {e2}")
    model.eval().to(device)
    return model

def get_embedder(device: torch.device):
    global _embedder
    if _embedder is None:
        _embedder = EfficientNetB0Embedder(device=device)
    return _embedder

def get_ranker(device: torch.device, ckpt_path: str):
    global _ranker
    if _ranker is None:
        print("모델 로딩 중... (첫 로딩은 시간이 걸릴 수 있습니다)")
        _ranker = load_harmony_ranker(ckpt_path, device=device)
        print("모델 로딩 완료")
    return _ranker

def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + np.exp(-x))

@torch.no_grad()
def harmony_score(
    before_imgs: list[Image.Image],
    after_imgs: list[Image.Image],
    ckpt_path: str,
    device: torch.device,
    agg: str = "worstk",   # "mean" | "mean_std" | "worstk"
    worst_k: int = 3,
    lambda_std: float = 0.3,
):
    """
    before_imgs: 2~3장 권장(최대 10 가능)
    after_imgs:  1~10장
    반환: set_score(0~100), 아이템별 점수 리스트
    """
    try:
        embedder = get_embedder(device)
        ranker = get_ranker(device, ckpt_path)
    except Exception as e:
        raise RuntimeError(f"모델 초기화 실패: {e}")

    # 1) 임베딩 추출
    print(f"임베딩 추출 시작: before={len(before_imgs)}, after={len(after_imgs)}")
    b_embs = [embedder.encode_pil(im) for im in before_imgs]
    print(f"Before 임베딩 완료: {len(b_embs)}개")
    a_embs = [embedder.encode_pil(im) for im in after_imgs]
    print(f"After 임베딩 완료: {len(a_embs)}개")

    if len(b_embs) == 0 or len(a_embs) == 0:
        print(f"경고: 임베딩이 비어있음 (b={len(b_embs)}, a={len(a_embs)})")
        return {"score_0to100": 0, "item_scores": []}

    # 2) before set 텐서(K<=10) + mask
    K = len(b_embs)
    D = 1280
    bX = torch.stack(b_embs, dim=0).unsqueeze(0)          # (1,K,D)
    bmask = torch.ones((1, K), device=device)             # (1,K) all valid
    bX = bX.to(device)

    # 3) after 각각 점수 계산
    print(f"점수 계산 시작: after 이미지 {len(a_embs)}개")
    raw_scores = []
    for idx, a in enumerate(a_embs):
        a = a.unsqueeze(0).to(device)                     # (1,D)
        s = ranker.score(bX, bmask, a).item()             # scalar
        raw_scores.append(float(s))
        if (idx + 1) % 5 == 0 or idx == len(a_embs) - 1:
            print(f"  점수 계산 진행: {idx + 1}/{len(a_embs)}")

    raw_scores_np = np.array(raw_scores, dtype=np.float32)

    # 4) 집계(세트 점수)
    if agg == "mean":
        S = float(raw_scores_np.mean())
    elif agg == "mean_std":
        S = float(raw_scores_np.mean() - lambda_std * raw_scores_np.std())
    else:  # "worstk"
        k = min(worst_k, len(raw_scores_np))
        S = float(np.sort(raw_scores_np)[:k].mean())

    # 5) 0~100 스케일
    score_0to100 = int(round(100 * _sigmoid(S)))

    item_scores = [
        {"idx": i, "raw": float(v), "score_0to100": int(round(100 * _sigmoid(float(v))))}
        for i, v in enumerate(raw_scores)
    ]

    return {
        "score_0to100": score_0to100,
        "raw_set_score": S,
        "agg": agg,
        "item_scores": item_scores,
    }