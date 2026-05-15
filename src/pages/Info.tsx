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
    desc: 'FashionHarmony 세트 모델과 색 조화(FashionCLIP), 룰북 점수를 결합해 코디 전체 조화 점수(0~100)와 피드백 문장을 제공합니다.',
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
    desc: '분석된 재질·패턴·스타일을 직접 고칠 수 있습니다. 수정하면 조화 점수가 자동으로 다시 계산됩니다.',
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
    title: '웹캠 캡처',
    desc: '카메라로 찍은 프레임을 바로 코디 캔버스에 추가할 수 있습니다. 업로드와 동일한 분석·조화 파이프라인이 적용됩니다.',
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
    desc: '「코디 업로드」에서 이미지를 고르거나 「웹캠」으로 촬영하세요. 배경이 제거되고 가이드 위치에 자동 배치됩니다.',
  },
  {
    n: '2',
    title: '코디 구성',
    desc: '드래그·리사이즈로 배치를 조정하세요. 다른 구역으로 옮기면 의류 종류(카테고리)가 자동으로 맞춰집니다.',
  },
  {
    n: '3',
    title: '결과 확인',
    desc: '아이템이 바뀔 때마다 조화 점수와 기니피그 피드백이 갱신됩니다. 필요하면 재질·패턴·스타일을 수정해 점수를 다시 볼 수 있습니다.',
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
    desc: '색·질감·패턴·스타일 조합이 어색할 수 있습니다. 아이템 교체나 속성 수정을 시도해 보세요.',
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
              <div className="inline-block mb-4">
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
              가볍게 살펴보고, 더 편안한 코디 선택을 돕는 웹 서비스입니다.
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
              여러 벌을 한 코디로 묶었을 때의 조화를 점수와 문장으로 알려 줍니다.
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
              <span className="font-medium text-secondary">총점(score_total)</span>은 FashionHarmony 세트 모델과 색
              조화, 룰북 규칙을 함께 반영한 0~100 점수입니다. 아이템을 추가·이동·속성 수정하면 약 0.4초 후 자동으로
              다시 계산됩니다.
            </p>
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
                { name: 'FashionHarmony', sub: '세트 조화 모델' },
                { name: 'FashionCLIP', sub: '색·피드백' },
                { name: 'OpenAI CLIP', sub: '의류 종류 분류' },
                { name: 'PyTorch', sub: '딥러닝 추론' },
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
