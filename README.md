<p align="center">
  <img src="public/assets/normal_gini.svg" alt="Gini" width="80" height="80" />
</p>

<h1 align="center">HUWARI</h1>
<p align="center"><strong>패션 코디 분석 모델 FashionHarmony 설계 및 웹 서비스 구현</strong></p>

CNN 백본 전이학습(EfficientNet-B3)·객체 탐지(YOLOv8)·색 분석·Vision Foundation Model(CLIP)을 결합하고, 그 위에 속성 헤드(재질·패턴·스타일)와 **Set Transformer**를 결합한 **FashionHarmony** 모델을 직접 설계·학습해 React + FastAPI 기반 웹 서비스로 옮긴 프로젝트다. 조화 예측과 속성 예측을 하나의 모델에서 공동 학습하도록 설계했고, 최종적으로 베이스라인(MH-Attn) 대비 **AUC 0.7524 → 0.8801** (+0.13)을 달성했다.

<img src="docs/screenshots/01-home-analysis.gif" width="1024" alt="HUWARI Home — 사진 업로드 후 조화 점수·피드백 분석" />

---

## 목차

| 문서 | 내용 |
|------|------|
| [서비스 소개](docs/01-service-overview.md) | 페이지 구성, 주요 기능, 기술 스택 |
| [연구·개발 스토리](docs/02-research-story.md) | 베이스라인 → 선행연구 흐름 |
| [FashionHarmony 모델 실험](docs/03-model-experiments.md) | 데이터 전처리, 아키텍처, Ablation Study, 비율 튜닝 |
| [서비스 구현](docs/04-service-implementation.md) | 런타임 흐름, 조화 점수 계산, 히스토리 |
| [웹캠](docs/05-webcam.md) | 변화 감지, 원근 보정, 실시간·캡처 |
| [XAI & 피드백](docs/06-xai.md) | 설명 파이프라인, 피드백 문장 카탈로그 |
| [한계점 & 향후 개선](docs/07-limitations-future.md) | 현재 한계, 개선 방향 |

---

## 주요 결과

직접 설계한 **FashionHarmony 모델**의 조화 판별 AUC(높을수록 좋음).

| 모델 | AUC |
|------|------|
| MLP | 0.6957 |
| MH-Attn (베이스라인) | 0.7524 |
| **FashionHarmony** | **0.8801** |

베이스라인 MH-Attn 대비 약 **+0.13 AUC** 향상. 설계 의도와 Ablation 인사이트는 [FashionHarmony 모델 실험](docs/03-model-experiments.md) 참고.

---

## HUWARI 핵심 기여

HUWARI는 여러 모델을 단순히 연결해 둔 서비스가 아니다. 패션 조화도 예측 모델 **FashionHarmony**를 직접 설계·학습하고, 그 결과를 그대로 웹에 옮긴 프로젝트다.

- **FashionHarmony 모델 직접 설계** — EfficientNet-B3 + 속성 헤드 + Set Transformer를 결합한 멀티태스크 세트 조화 모델. 조화 예측과 속성 예측을 공동 학습한다.
- **세트 단위 조화 모델링** — 쌍 단위(pairwise)가 아니라 코디 전체를 한 번에 본다. Set Transformer가 아이템 사이 attention을 직접 모델링한다.
- **K-Fashion 라벨 체계 재정의** — 과다 클래스(재질 97·패턴 70)를 실용 단위(재질 8·패턴 9·스타일 10)로 정리해 학습 안정성과 라벨 품질을 함께 끌어올렸다.
- **도메인 사전학습 적용** — K-Fashion으로 백본·속성 헤드를 사전학습한 뒤 Polyvore-U에서 조화 학습을 이어, 단순 구조 변경 이상으로 성능을 끌어올렸다.
- **XAI 통합** — Set Transformer attention 가중치와 속성 규칙을 묶어 한국어 피드백 문장을 자동으로 만든다.
- **실제 서비스 적용** — FastAPI + React 웹 서비스로 옮기고, 사용자가 속성을 직접 수정하면 점수가 다시 계산되는 인터랙티브 흐름까지 구현했다.

**[Ablation Study](docs/03-model-experiments.md#44-ablation-study)** 결과: Set Transformer 같은 새 구조를 끼워 넣는 것만으로는 점수가 거의 안 올랐고(+0.0043), K-Fashion으로 백본을 미리 학습시키고 속성 라벨을 정리한 효과가 훨씬 컸다(최종 모델 0.8726, +0.0848).

---

## 기술 스택

- **Frontend**: React, Vite, TypeScript, Tailwind CSS, React Router
- **Backend**: FastAPI, Uvicorn
- **ML/CV**: PyTorch, torchvision, timm(EfficientNet 백본·전이학습), transformers, open-clip-torch(OpenAI CLIP·FashionCLIP), ultralytics YOLOv8, rembg, MediaPipe Pose, scikit-learn(색 군집)

---

## 프로젝트 구조

```text
huwari/
├─ src/                    # 프론트엔드(React + Vite)
│  ├─ main.tsx
│  ├─ App.tsx              # 라우팅(Home / History / Info)
│  ├─ components/
│  │  ├─ Layout.tsx
│  │  ├─ Header.tsx
│  │  ├─ Footer.tsx
│  │  ├─ MouseStarTrail.tsx
│  │  ├─ ItemPlacementArea.tsx
│  │  └─ CustomSelect.tsx
│  ├─ pages/
│  │  ├─ Home.tsx
│  │  ├─ History.tsx
│  │  └─ Info.tsx
│  ├─ hooks/
│  │  └─ useStyleProfile.ts
│  ├─ lib/
│  │  └─ styleHistory.ts
│  └─ constants/
│     ├─ fashionClassOptions.ts
│     └─ outfitGuide.ts
├─ public/
│  └─ assets/
│     ├─ normal_gini.svg
│     ├─ happy_gini.svg
│     └─ angry_gini.svg
├─ docs/                   # 문서
│  ├─ 01-service-overview.md
│  ├─ 02-research-story.md
│  ├─ 03-model-experiments.md
│  ├─ 04-service-implementation.md
│  ├─ 05-webcam.md
│  ├─ 06-xai.md
│  ├─ 07-limitations-future.md
│  ├─ screenshots/
│  └─ charts/
├─ main.py                 # FastAPI 서버 및 API 엔드포인트
├─ harmony.py              # 규칙 기반 조화 점수·피드백 보조 로직
├─ harmony_label_bridge.py # UI/모델 한글 라벨 → rulebook 입력 변환
├─ label_maps.py           # 과거 라벨 맵 참고용
├─ models/
│  ├─ fashion_harmony.py    # FashionHarmonyModel (백본+속성헤드+Set Transformer)
│  ├─ pose_landmarker_lite.task
│  ├─ harmony_ranker.py     # MHAttentionRanker (예전 베이스라인)
│  └─ fashion_mtl.py        # 재질/패턴/스타일 MTL (과거 실험·참고용)
├─ requirements.txt
├─ package.json
├─ tailwind.config.js
├─ postcss.config.js
├─ index.html
├─ start-api.sh
└─ vite.config.ts
```

---

## AI 도구 활용

개발 과정에서 Claude(Anthropic)와 Cursor를 코드 작성·디버깅·문서 작성 보조 도구로 활용했습니다.

---

<a id="image-credits"></a>
## 이미지 저작권 안내

※ 본 README에 첨부된 예시 이미지(스크린샷·데모 화면 등)에 포함된 의류 컷은 각 브랜드 및 쇼핑몰의 상품 이미지를 사용하였으며, **모든 저작권은 원저작자에게 있습니다**. HUWARI는 비상업적 연구·교육·포트폴리오 목적의 시연 자료로만 해당 이미지를 인용하며, 저작권자의 요청이 있을 경우 즉시 교체·삭제합니다.
