import type { ReactNode } from 'react'
import Layout from '../components/Layout'

const FEATURES = [
  {
    title: '코디 캔버스',
    desc: '모자·상의·하의·신발·악세서리 가이드에 맞춰 아이템이 자동 배치됩니다. 드래그로 위치를 바꾸면 카테고리도 함께 갱신됩니다.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM9 9h6v6H9V9z"
      />
    ),
  },
  {
    title: '이미지 분석',
    desc: '업로드·웹캠 이미지에서 배경을 제거하고, 색상·재질·패턴·스타일·의류 종류를 자동으로 추출합니다. 신발·모자·악세서리는 색 위주로 분석합니다.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    ),
  },
  {
    title: '조화 예측',
    desc: '직접 설계한 FashionHarmony 모델이 코디 전체를 한 세트로 보고 점수를 매기고, FashionCLIP 색 점수·룰북 규칙을 함께 합쳐 0–100점을 만듭니다. XAI 피드백 말풍선으로 이유까지 설명합니다.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    ),
  },
  {
    title: '속성 수정',
    desc: '분석된 재질·패턴·스타일을 직접 고칠 수 있습니다. 수정·아이템 추가·삭제 시 점수와 피드백 문장이 자동으로 다시 생성됩니다.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    ),
  },
  {
    title: '웹캠 실시간·캡처',
    desc: '카메라를 켜면 10초마다 조화 점수·피드백·옷 영역 박스가 갱신됩니다. 상의만 보여도 분석 가능하며, 「캡처」 시 크롭본을 캔버스에 추가합니다.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    ),
  },
  {
    title: '히스토리',
    desc: '마음에 드는 코디 분석 결과를 저장하고, 이후 히스토리에서 다시 불러와 비교·확인할 수 있습니다.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    ),
  },
] as const

const STEPS = [
  {
    n: '1',
    title: '아이템 추가',
    desc: '「코디 업로드」에서 이미지를 고르거나 「웹캠」을 켜세요. 웹캠은 10초마다 실시간 조화·피드백·분석 결과(색·속성)가 갱신되고, 「캡처」 시 배경 제거 후 가이드에 배치됩니다.',
  },
  {
    n: '2',
    title: '코디 구성',
    desc: '드래그·리사이즈로 배치를 조정하세요. 다른 구역으로 옮기면 의류 종류(카테고리)가 자동으로 맞춰집니다.',
  },
  {
    n: '3',
    title: '결과 확인',
    desc: '아이템을 추가·삭제하거나 재질·패턴·스타일·색 정보가 바뀌면 조화 점수와 말풍선 피드백이 갱신됩니다. 위치만 옮긴 경우에는 점수 재계산을 생략합니다.',
  },
  {
    n: '4',
    title: '저장',
    desc: '캔버스의 「저장」으로 히스토리에 남기고, 나중에 같은 코디를 다시 불러올 수 있습니다.',
  },
] as const

const GINI_MOODS = [
  {
    src: '/assets/angry_gini.svg',
    alt: 'Angry Gini',
    label: '나쁨',
    range: '0 ~ 39점',
    anim: 'animate-harmony-gini-angry',
    desc: '점수가 낮을 때 말풍선에 개선·부정 톤 문장(색·패턴·스타일 충돌 등)이 더 자주 표시됩니다. 아이템 교체나 속성 수정을 시도해 보세요.',
  },
  {
    src: '/assets/normal_gini.svg',
    alt: 'Normal Gini',
    label: '보통',
    range: '40 ~ 69점',
    anim: 'animate-harmony-gini',
    desc: '기본적인 조화는 갖추었지만, 한두 가지 요소를 바꾸면 더 안정적인 코디가 될 수 있습니다.',
  },
  {
    src: '/assets/happy_gini.svg',
    alt: 'Happy Gini',
    label: '좋음',
    range: '70 ~ 100점',
    anim: 'animate-harmony-gini-happy',
    desc: '전체적으로 잘 어울리는 코디입니다. 세부 점수와 피드백 문장도 함께 참고하세요.',
  },
] as const

const XAI_SOURCES = [
  {
    title: 'Attention',
    desc: '세트 조화 모델이 아이템끼리 어디에 주목했는지를 읽어, 예: 「상의와 하의의 조화가 코디의 핵심」처럼 관계 문장을 만듭니다.',
  },
  {
    title: '색·재질·패턴·스타일',
    desc: '추출·분류된 속성과 대표색을 규칙 템플릿으로 설명합니다. 점수가 60점 미만이면 「산만해 보일 수 있습니다」 등 개선 문장으로 바뀝니다.',
  },
  {
    title: '룰북 규칙',
    desc: '색상환·조합 점수표 기준으로 「조화롭지 않음」「충돌」 같은 이유를 붙입니다. 낮은 점수일 때 말풍선 앞쪽에 우선 노출됩니다.',
  },
  {
    title: 'FashionCLIP',
    desc: '코디 이미지와 문장을 비교해 색 점수에 반영하고, 점수가 낮을 때 「색상 톤이 맞지 않습니다」 같은 부정 피드백을 덧붙일 수 있습니다.',
  },
] as const

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <h3 className="text-xs font-regular text-secondary uppercase tracking-wider p-8 pb-0">
    <span className="inline-block px-3 py-1 border border-secondary rounded-full">{children}</span>
  </h3>
)

const Info = () => {
  return (
    <Layout>
      <div className="grid grid-cols-12">
        <div className="col-span-12 p-6 flex items-center justify-between border-b border-secondary translate-y-[1.375px]">
          <h3 className="text-xs font-regular text-secondary uppercase tracking-wider inline-block px-3 py-1 border border-secondary rounded-full">
            HUWARI란?
          </h3>
        </div>

        <div className="col-span-12 border-b border-secondary">
          <div className="p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center gap-3 mb-4">
                <img
                  src="/assets/normal_gini.svg"
                  alt="Gini"
                  className="w-14 h-14"
                />
                <h3 className="text-2xl font-light text-secondary inline-block px-4 py-2 border border-secondary rounded-full">
                  HUWARI
                </h3>
              </div>
              <p className="text-sm text-secondary">
                일본어 표현 <span className="font-medium text-secondary">ふわり (fuwari)</span>에서 착안한 이름
              </p>
            </div>

            <div className="grid grid-cols-2 mb-8">
              <div className="border-r border-secondary p-6 text-center">
                <h4 className="text-lg font-light text-secondary uppercase tracking-wider inline-block px-3 py-1 border border-secondary rounded-full mb-3">
                  Fuwari
                </h4>
                <p className="text-xs text-secondary leading-relaxed">
                  &quot;가볍게 떠오르다, 부드럽게 스치다&quot;라는 느낌처럼 코디를{' '}
                  <span className="font-medium text-secondary">부담 없이 살펴보는 태도</span>를 담았습니다.
                </p>
              </div>
              <div className="p-6 text-center">
                <h4 className="text-lg font-light text-secondary uppercase tracking-wider inline-block px-3 py-1 border border-secondary rounded-full mb-3">
                  Huwari
                </h4>
                <p className="text-xs text-secondary leading-relaxed">
                  딱딱한 평가보다{' '}
                  <span className="font-medium text-secondary">어울림을 편안하게 제안하는 패션 도우미</span>를
                  지향합니다.
                </p>
              </div>
            </div>

            <p className="text-sm text-secondary leading-relaxed text-center">
              HUWARI는 옷의 <span className="font-medium text-secondary">색감, 질감, 패턴, 스타일, 조화</span>를
              가볍게 살펴보고, 더 편안한 코디 선택을 돕는 웹 서비스입니다. 핵심에는 직접 설계·학습한{' '}
              <span className="font-medium text-secondary">FashionHarmony 모델</span>이 있습니다.
            </p>
          </div>
        </div>

        <div className="col-span-12 border-b border-secondary">
          <SectionTitle>프로젝트 요약</SectionTitle>
          <div className="p-8 pt-5 space-y-5">
            <p className="text-xs text-secondary leading-relaxed">
              HUWARI는 여러 모델을 단순히 연결한 서비스가 아니라,{' '}
              <span className="font-medium text-secondary">패션 조화도 예측 모델 FashionHarmony</span>를 직접 설계·학습하고
              이를 웹 서비스로 옮긴 프로젝트입니다. EfficientNet-B3 백본 위에 속성 헤드(재질·패턴·스타일)와
              Set Transformer를 결합해, <span className="font-medium text-secondary">조화 예측과 속성 예측을 하나의 모델에서 공동 학습</span>하도록 설계했습니다.
            </p>
            <div className="border border-secondary rounded-xl overflow-hidden">
              <div className="grid grid-cols-3">
                {[
                  { model: 'MLP', auc: '0.6957' },
                  { model: 'MH-Attn (베이스라인)', auc: '0.7524' },
                  { model: 'FashionHarmony', auc: '0.8710', highlight: true },
                ].map((row, i) => (
                  <div
                    key={row.model}
                    className={`p-5 text-center ${i < 2 ? 'border-r border-secondary' : ''} ${row.highlight ? 'bg-secondary/5' : ''}`}
                  >
                    <div className={`text-xs uppercase tracking-wider mb-2 ${row.highlight ? 'font-medium text-secondary' : 'text-secondary/80'}`}>
                      {row.model}
                    </div>
                    <div className={`text-lg ${row.highlight ? 'font-medium text-secondary' : 'font-light text-secondary'}`}>
                      AUC {row.auc}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-secondary leading-relaxed">
              베이스라인(MH-Attn) 대비 약 <span className="font-medium text-secondary">+0.12 AUC</span> 향상.
              Ablation 결과, Set Transformer 같은 새 구조를 더하는 것만으로는 효과가 작았고,{' '}
              <span className="font-medium text-secondary">K-Fashion 기반 도메인 사전학습과 속성 체계 정리</span>가
              성능 향상에 더 크게 기여했습니다.
            </p>
          </div>
        </div>

        <div className="col-span-12 border-b border-secondary">
          <SectionTitle>서비스를 만들게 된 이유</SectionTitle>
          <div className="p-8 space-y-4">
            <p className="text-xs text-secondary leading-relaxed">
              많은 사람들이 옷을 고를 때{' '}
              <span className="font-medium text-secondary">색상, 패턴, 질감, 스타일이 잘 어울리는지</span> 고민합니다.
              특히 새 아이템을 더할 때 기존 옷장과의 조화를 한눈에 보기 어렵습니다.
            </p>
            <p className="text-xs text-secondary leading-relaxed">
              HUWARI는 <span className="font-medium text-secondary">AI 기반 패션 분석</span>으로 아이템 특성을 읽고,
              여러 벌을 한 코디로 묶었을 때의 조화를 점수와 <span className="font-medium text-secondary">설명 가능한 피드백(XAI)</span> 문장으로 알려 줍니다.
            </p>
            <p className="text-xs text-secondary leading-relaxed">
              복잡한 패션 이론 대신, 캔버스에 올리고 점수를 보며{' '}
              <span className="font-medium text-secondary">직관적으로 코디를 실험</span>할 수 있도록 설계했습니다.
            </p>
          </div>
        </div>

        <div className="col-span-12 border-b border-secondary">
          <SectionTitle>주요 기능</SectionTitle>
          <div className="p-4">
            <div className="grid grid-cols-3">
              {FEATURES.map((f, i) => (
                <div
                  key={f.title}
                  className={`p-6 ${i % 3 !== 2 ? 'border-r border-secondary' : ''} ${i < 3 ? 'border-b border-secondary' : ''}`}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 bg-secondary flex items-center justify-center flex-shrink-0 rounded-full">
                      <svg className="w-4 h-4 text-cream" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {f.icon}
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-regular text-secondary mb-2 uppercase tracking-wider">{f.title}</h4>
                      <p className="text-xs text-secondary leading-relaxed">{f.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col-span-12 border-b border-secondary">
          <SectionTitle>웹캠</SectionTitle>
          <div className="p-8 pt-5 space-y-4">
            <p className="text-xs text-secondary leading-relaxed">
              홈 화면 상단에서 <span className="font-medium text-secondary">「웹캠」</span> 탭을 선택하면 카메라 프리뷰가
              표시됩니다. 선택한 입력 방식은 브라우저에 저장되어 다음 방문 시에도 유지됩니다.
            </p>
            <div className="grid grid-cols-2 border border-secondary rounded-xl overflow-hidden">
              <div className="border-r border-secondary p-6">
                <h4 className="text-sm font-regular text-secondary mb-3 uppercase tracking-wider">실시간 분석</h4>
                <ul className="text-xs text-secondary space-y-2 leading-relaxed list-disc list-inside">
                  <li>카메라 ON 후 즉시 1회, 이후 <span className="font-medium text-secondary">10초마다</span> 프레임을 분석합니다.</li>
                  <li>
                    <span className="font-medium text-secondary">MediaPipe Pose</span>로 옷 영역(상·하의·신발)을 우선 인식하고, 실패 시{' '}
                    <span className="font-medium text-secondary">YOLOv8</span> 비율 크롭으로 폴백합니다.{' '}
                    <span className="font-medium text-secondary">상의만</span> 보여도 분석할 수 있습니다.
                  </li>
                  <li>
                    프리뷰 위에 인식된 <span className="font-medium text-secondary">옷 영역 점선 박스</span>(상·하의·신발 라벨)가 표시됩니다.
                  </li>
                  <li>
                    왼쪽 <span className="font-medium text-secondary">「분석 결과」</span>에 실시간 색상·재질·패턴·스타일이 채워집니다(「실시간 인식」 표시).
                  </li>
                  <li>오른쪽 「코디 평가」에 점수·기니 표정·말풍선 피드백이 표시됩니다. 캔버스에는 아이템을 넣지 않습니다.</li>
                  <li>첫 분석은 모델 로딩으로 잠시 시간이 걸릴 수 있고, 이전 분석이 끝나지 않았으면 그 주기는 건너뜁니다.</li>
                </ul>
              </div>
              <div className="p-6">
                <h4 className="text-sm font-regular text-secondary mb-3 uppercase tracking-wider">캡처</h4>
                <ul className="text-xs text-secondary space-y-2 leading-relaxed list-disc list-inside">
                  <li>「캡처」를 누르면 인식된 상·하의·신발이 그대로 캔버스에 추가됩니다.</li>
                  <li>배경 제거·색·재질·패턴·스타일 분석은 업로드와 동일하게 이어집니다.</li>
                  <li>캔버스 구성이 바뀌면 조화 점수가 자동으로 다시 계산됩니다.</li>
                </ul>
              </div>
            </div>
            <p className="text-xs text-secondary leading-relaxed">
              실시간 총점은 FashionHarmony 세트 점수와 FashionCLIP 색 점수를{' '}
              <span className="font-medium text-secondary">75% / 25%</span>로 합친 0–100점입니다. 피드백 문장은 attention·속성·색·총점 구간 등 XAI 규칙으로 생성됩니다.
            </p>
          </div>
        </div>

        <div className="col-span-12 border-b border-secondary">
          <SectionTitle>코디 캔버스</SectionTitle>
          <div className="p-8 pt-5">
            <p className="text-xs text-secondary leading-relaxed mb-6">
              홈 화면 왼쪽의 캔버스는 실제 코디를 시각적으로 맞춰 보는 공간입니다.
            </p>
            <div className="grid grid-cols-2 border border-secondary rounded-xl overflow-hidden">
              <div className="border-r border-secondary p-6">
                <h4 className="text-sm font-regular text-secondary mb-3 uppercase tracking-wider">가이드 슬롯</h4>
                <ul className="text-xs text-secondary space-y-2 leading-relaxed list-disc list-inside">
                  <li>모자 · 상의 · 하의 · 신발 · 악세서리(좌/우) 영역이 표시됩니다.</li>
                  <li>업로드 시 AI가 의류 종류를 판별해 해당 슬롯에 배치합니다.</li>
                  <li>같은 영역에 여러 아이템을 겹쳐 올릴 수 있습니다(레이어드).</li>
                </ul>
              </div>
              <div className="p-6">
                <h4 className="text-sm font-regular text-secondary mb-3 uppercase tracking-wider">인터랙션</h4>
                <ul className="text-xs text-secondary space-y-2 leading-relaxed list-disc list-inside">
                  <li>드래그·리사이즈로 자유롭게 배치를 조정할 수 있습니다.</li>
                  <li>다른 가이드 구역으로 옮기면 카테고리가 자동으로 바뀝니다.</li>
                  <li>새 아이템이 놓일 때 부드러운 등장 애니메이션이 적용됩니다.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 border-b border-secondary">
          <SectionTitle>사용 방법</SectionTitle>
          <div className="p-4">
            <div className="grid grid-cols-2">
              {STEPS.map((s, i) => (
                <div
                  key={s.n}
                  className={`p-6 ${i % 2 === 0 ? 'border-r border-secondary' : ''} ${i < 2 ? 'border-b border-secondary' : ''}`}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 bg-secondary flex items-center justify-center flex-shrink-0 rounded-full">
                      <span className="text-xs text-cream">{s.n}</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-regular text-secondary mb-2 uppercase tracking-wider">{s.title}</h4>
                      <p className="text-xs text-secondary leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col-span-12 border-b border-secondary">
          <SectionTitle>설명 가능 AI (XAI)</SectionTitle>
          <div className="p-8 pt-5 space-y-6">
            <p className="text-xs text-secondary leading-relaxed">
              HUWARI는 숫자만 주지 않고, <span className="font-medium text-secondary">왜 그렇게 평가했는지</span>를
              말풍선 피드백으로 설명합니다. 여러 신호를 합쳐 최대 6줄(마지막은 총점 요약)까지 보여 줍니다.
            </p>
            <div className="grid grid-cols-2 border border-secondary rounded-xl overflow-hidden">
              {XAI_SOURCES.map((x, i) => (
                <div
                  key={x.title}
                  className={`p-5 ${i % 2 === 0 ? 'border-r border-secondary' : ''} ${i < 2 ? 'border-b border-secondary' : ''}`}
                >
                  <h4 className="text-xs font-medium text-secondary uppercase tracking-wider mb-2">{x.title}</h4>
                  <p className="text-xs text-secondary leading-relaxed">{x.desc}</p>
                </div>
              ))}
            </div>
            <div className="border border-secondary rounded-xl p-5">
              <h4 className="text-xs font-medium text-secondary uppercase tracking-wider mb-2">말풍선 문장 순서</h4>
              <ol className="text-xs text-secondary space-y-1.5 leading-relaxed list-decimal list-inside">
                <li>아이템 관계(Attention, 메인 2장 이상·고점수일 때)</li>
                <li>색감 설명(최대 2줄)</li>
                <li>재질 → 패턴 → 스타일</li>
                <li>총점 구간 요약(마지막 1줄)</li>
              </ol>
              <p className="text-[10px] text-secondary/70 mt-3 leading-relaxed">
                Grad-CAM·Attention 히트맵 UI 등 이미지 위 시각적 설명은 현재 버전에 포함하지 않습니다.
              </p>
            </div>
          </div>
        </div>

        <div className="col-span-12 border-b border-secondary">
          <SectionTitle>조화 상태 표시</SectionTitle>
          <div className="p-8 pt-5">
            <p className="text-xs text-secondary leading-relaxed mb-6">
              오른쪽 「코디 평가」 패널의 조화 점수에 따라 기니피그 표정이 바뀌며, 위아래로 살짝 움직이는 애니메이션이
              적용됩니다. 피드백 말풍선 옆 기니는 항상 기본 표정입니다.
            </p>
            <div className="grid grid-cols-3">
              {GINI_MOODS.map((g, i) => (
                <div key={g.label} className={`p-6 text-center ${i < 2 ? 'border-r border-secondary' : ''}`}>
                  <div className="flex justify-center mb-4">
                    <div className="bg-secondary p-4 rounded-full">
                      <img src={g.src} alt={g.alt} className={`w-24 h-24 ${g.anim}`} />
                    </div>
                  </div>
                  <h4 className="text-sm font-regular text-secondary mb-1 uppercase tracking-wider">{g.label}</h4>
                  <p className="text-[10px] text-secondary/80 mb-3">{g.range}</p>
                  <p className="text-xs text-secondary leading-relaxed">{g.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col-span-12 border-b border-secondary">
          <SectionTitle>점수 안내</SectionTitle>
          <div className="p-8 pt-5 space-y-4">
            <p className="text-xs text-secondary leading-relaxed">
              <span className="font-medium text-secondary">총점</span>은 FashionHarmony 세트 점수(75%)와
              FashionCLIP 색 점수(25%)를 합친 뒤, 사용자가 속성을 입력한 경우 룰북 규칙과 50:50으로 병합한 0–100점입니다.
              코디 업로드·캔버스에서는 아이템을 추가·삭제하거나 속성·색을 바꾸면 잠깐 후 점수와 말풍선 피드백이 자동으로
              다시 생성됩니다. 위치만 옮긴 경우에는 재계산하지 않습니다. 웹캠 실시간은 캔버스 없이{' '}
              <span className="font-medium text-secondary">일정 주기로</span> 점수·피드백·왼쪽 분석 결과(색·속성)가 갱신됩니다.
            </p>
            <div className="border border-secondary rounded-xl p-5">
              <h4 className="text-xs font-medium text-secondary uppercase tracking-wider mb-2">피드백 톤</h4>
              <ul className="text-xs text-secondary space-y-1.5 leading-relaxed list-disc list-inside">
                <li>60점 이상: 중립~긍정 설명 위주</li>
                <li>60점 미만: 개선·부정 문장(색·패턴·스타일·룰북)이 더 자주 표시</li>
                <li>40점 미만: 코디 밸런스 재정비 안내가 추가</li>
              </ul>
            </div>
            <div className="grid grid-cols-2 border border-secondary rounded-xl overflow-hidden">
              <div className="border-r border-secondary p-5">
                <h4 className="text-xs font-medium text-secondary uppercase tracking-wider mb-2">메인 의류</h4>
                <p className="text-xs text-secondary leading-relaxed">
                  상의·하의 등은 재질·패턴·스타일 분석과 조화 세트 계산에 포함됩니다. 분석 패널에서 속성을 직접 수정할 수
                  있습니다.
                </p>
              </div>
              <div className="p-5">
                <h4 className="text-xs font-medium text-secondary uppercase tracking-wider mb-2">악세서리·신발·모자</h4>
                <p className="text-xs text-secondary leading-relaxed">
                  색 조화와 피드백에는 참여하지만, 재질·패턴·스타일 UI는 표시하지 않습니다. 세트 조화에는 메인 의류가
                  우선 반영됩니다.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12">
          <SectionTitle>기술 스택</SectionTitle>
          <div className="p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4">
              {[
                { name: 'React', sub: '프론트엔드 UI' },
                { name: 'TypeScript', sub: '타입 안정성' },
                { name: 'FastAPI', sub: '백엔드 API' },
                { name: 'FashionHarmony', sub: '직접 설계한 세트 조화 모델' },
                { name: 'FashionCLIP', sub: '색 점수·XAI 피드백' },
                { name: 'OpenAI CLIP', sub: '의류 종류 분류' },
                { name: '룰북', sub: '조합 규칙·설명' },
                { name: 'PyTorch', sub: '딥러닝 추론' },
                { name: 'MediaPipe', sub: '웹캠 옷 영역(관절)' },
                { name: 'YOLOv8', sub: '웹캠 폴백 크롭' },
                { name: 'Tailwind CSS', sub: '스타일링' },
              ].map((t, i) => (
                <div
                  key={t.name}
                  className={`py-4 text-center ${i % 4 !== 3 ? 'sm:border-r border-secondary' : ''} ${i < 4 ? 'border-b sm:border-b-0 border-secondary' : ''}`}
                >
                  <div className="text-lg font-light text-secondary mb-1">{t.name}</div>
                  <div className="text-xs text-secondary">{t.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}

export default Info
