import Layout from '../components/Layout'

const Info = () => {
  return (
    <Layout>
      <div className="grid grid-cols-12">
         {/* 헤더 */}
        <div className="col-span-12 p-6 flex items-center justify-between border-b border-secondary">
          <h3 className="text-xs font-regular text-secondary uppercase tracking-wider inline-block px-3 py-1 border border-secondary rounded-full">HUWARI란?</h3>
        </div>
        {/* 이름의 의미 */}
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
                <div className="flex flex-col items-center gap-2 mb-3">
                      <h4 className="text-lg font-light text-secondary uppercase tracking-wider inline-block px-3 py-1 border border-secondary rounded-full">Fuwari</h4>
                </div>
                    <p className="text-xs text-secondary leading-relaxed">
                      "가볍게 떠오르다, 부드럽게 스치다"라는 <br />느낌처럼 코디를 <span className="font-medium text-secondary">부담 없이 살펴보는 태도</span>를 담았습니다.
                </p>
              </div>

                  <div className="p-6 text-center">
                <div className="flex flex-col items-center gap-2 mb-3">
                      <h4 className="text-lg font-light text-secondary uppercase tracking-wider inline-block px-3 py-1 border border-secondary rounded-full">Huwari</h4>
                </div>
                    <p className="text-xs text-secondary leading-relaxed">
                      사용자의 코디를 딱딱하게 평가하기보다,<br /><span className="font-medium text-secondary">어울림을 편안하게 제안하는 패션 도우미</span>를 지향합니다.
                </p>
              </div>
            </div>

            <div className="text-center">
                  <p className="text-sm text-secondary leading-relaxed">
                    HUWARI는 옷의 <span className="font-medium text-secondary">색감, 분위기, 계절감, 조화로움</span>을<br />
                가볍고 자연스럽게 살펴보고, 더 편안한 코디 선택을 돕는 서비스입니다.
              </p>
            </div>
          </div>
        </div>

        {/* 서비스를 만들게 된 이유 */}
            <div className="col-span-12 border-b border-secondary">
              <h3 className="text-xs font-regular text-secondary uppercase tracking-wider p-8 pb-0"><span className="inline-block px-3 py-1 border border-secondary rounded-full">서비스를 만들게 된 이유</span></h3>
              <div className="p-8">
            <div className="space-y-4">
                  <p className="text-xs text-secondary leading-relaxed">
                    많은 사람들이 옷을 고를 때 <span className="font-medium text-secondary">색상, 패턴, 스타일이 잘 어울리는지</span> 고민합니다.<br /> 
                특히 새로운 아이템을 구매할 때 기존 옷장의 아이템들과 조화를 이루는지 확인하기 어려워합니다.
              </p>
                  <p className="text-xs text-secondary leading-relaxed">
                HUWARI는 이러한 고민을 해결하기 위해 만들어졌습니다.<br />
                    <span className="font-medium text-secondary">AI 기술을 활용</span>하여 패션 아이템의 특성을 분석하고, 
                새로운 아이템 추가 시 전체적인 조화를 예측하여 사용자가 더 자신감 있게 스타일링할 수 있도록 돕습니다.
              </p>
                  <p className="text-xs text-secondary leading-relaxed">
                    누구나 쉽게 <span className="font-medium text-secondary">조화로운 패션 스타일링</span>을 할 수 있도록, 
                복잡한 패션 원리를 간단하고 직관적인 방식으로 제공하는 것이 HUWARI의 목표입니다.
              </p>
            </div>
          </div>
        </div>

        {/* 주요 기능 */}
            <div className="col-span-12 border-b border-secondary">
              <h3 className="text-xs font-regular text-secondary uppercase tracking-wider p-8 pb-0"><span className="inline-block px-3 py-1 border border-secondary rounded-full">주요 기능</span></h3>
              <div className="p-4">
                <div className="grid grid-cols-3">
                <div className="border-r border-secondary p-6">
              <div className="flex items-center gap-4">
                    <div className="w-8 h-8 bg-secondary flex items-center justify-center flex-shrink-0 rounded-full">
                      <svg className="w-4 h-4 text-cream" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                </div>
                <div>
                      <h4 className="text-sm font-regular text-secondary mb-2 uppercase tracking-wider">이미지 분석</h4>
                      <p className="text-xs text-secondary">
                        업로드한 패션 아이템 이미지에서 색상, 재질, 패턴, 스타일을 자동으로 분석합니다
                  </p>
                </div>
              </div>
            </div>

                <div className="border-r border-secondary p-6">
              <div className="flex items-center gap-4">
                    <div className="w-8 h-8 bg-secondary flex items-center justify-center flex-shrink-0 rounded-full">
                      <svg className="w-4 h-4 text-cream" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                </div>
                <div>
                      <h4 className="text-sm font-regular text-secondary mb-2 uppercase tracking-wider">조화 예측</h4>
                      <p className="text-xs text-secondary">
                    새로운 아이템을 추가했을 때 전체적인 조화 점수를 예측하고 개선 방안을 제시합니다
                  </p>
                </div>
              </div>
            </div>

                <div className="p-6">
              <div className="flex items-center gap-4">
                    <div className="w-8 h-8 bg-secondary flex items-center justify-center flex-shrink-0 rounded-full">
                      <svg className="w-4 h-4 text-cream" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                </div>
                <div>
                      <h4 className="text-sm font-regular text-secondary mb-2 uppercase tracking-wider">히스토리 관리</h4>
                      <p className="text-xs text-secondary">
                    과거에 분석한 결과를 저장하고 관리하여 스타일링 기록을 확인할 수 있습니다
                  </p>
                </div>
              </div>
            </div>
                </div>
              </div>
        </div>

        {/* 사용 방법 */}
            <div className="col-span-12 border-b border-secondary">
              <h3 className="text-xs font-regular text-secondary uppercase tracking-wider p-8 pb-0"><span className="inline-block px-3 py-1 border border-secondary rounded-full">사용 방법</span></h3>
              <div className="p-4">
                <div className="grid grid-cols-3">
                <div className="border-r border-secondary p-6">
              <div className="flex items-center gap-4">
                    <div className="w-8 h-8 bg-secondary flex items-center justify-center flex-shrink-0 rounded-full">
                      <span className="text-xs text-cream">1</span>
                </div>
                <div>
                      <h4 className="text-sm font-regular text-secondary mb-2 uppercase tracking-wider">이미지 업로드</h4>
                      <p className="text-xs text-secondary">
                        기존 패션 아이템 이미지를 업로드하면 자동으로 색상, 재질, 패턴, 스타일이 분석됩니다
                  </p>
                </div>
              </div>
            </div>

                <div className="border-r border-secondary p-6">
              <div className="flex items-center gap-4">
                    <div className="w-8 h-8 bg-secondary flex items-center justify-center flex-shrink-0 rounded-full">
                      <span className="text-xs text-cream">2</span>
                </div>
                <div>
                      <h4 className="text-sm font-regular text-secondary mb-2 uppercase tracking-wider">새 패션 아이템 추가</h4>
                      <p className="text-xs text-secondary">
                    추가하고 싶은 패션 아이템 이미지를 업로드하면 기존 패션 아이템와의 조화를 예측합니다
                  </p>
                </div>
              </div>
            </div>

                <div className="p-6">
              <div className="flex items-center gap-4">
                    <div className="w-8 h-8 bg-secondary flex items-center justify-center flex-shrink-0 rounded-full">
                      <span className="text-xs text-cream">3</span>
                </div>
                <div>
                      <h4 className="text-sm font-regular text-secondary mb-2 uppercase tracking-wider">결과 확인</h4>
                      <p className="text-xs text-secondary">
                    조화 점수와 상세 분석 결과를 확인하고, 히스토리에서 과거 분석 기록을 관리할 수 있습니다
                  </p>
                </div>
              </div>
            </div>
                </div>
              </div>
        </div>

        {/* 기니피그 표정 설명 */}
            <div className="col-span-12 border-b border-secondary">
              <h3 className="text-xs font-regular text-secondary uppercase tracking-wider p-8 pb-0"><span className="inline-block px-3 py-1 border border-secondary rounded-full">조화 상태 표시</span></h3>
              <div className="p-8 pt-5">
                <p className="text-xs text-secondary leading-relaxed mb-6 text-left">
              HUWARI는 조화 점수에 따라 기니피그의 표정이 달라집니다
            </p>
                <div className="grid grid-cols-3">
                  <div className="border-r border-secondary p-6 text-center">
                <div className="flex justify-center mb-4">
                      <div className="bg-secondary p-4 rounded-full">
                        <img src="/assets/angry_gini.svg" alt="Angry Gini" className="w-24 h-24" />
                  </div>
                </div>
                    <h4 className="text-sm font-regular text-secondary mb-2 uppercase tracking-wider">나쁨 (Angry)</h4>
                    <p className="text-xs text-secondary">
                  조화 점수가 낮은 상태입니다.<br />
                  패션 아이템들 간의 조화가 부족하며<br />
                  코디를 다시 고려해볼 필요가 있습니다.
                </p>
              </div>

                  <div className="border-r border-secondary p-6 text-center">
                <div className="flex justify-center mb-4">
                      <div className="bg-secondary p-4 rounded-full">
                        <img src="/assets/normal_gini.svg" alt="Normal Gini" className="w-24 h-24" />
                  </div>
                </div>
                    <h4 className="text-sm font-regular text-secondary mb-2 uppercase tracking-wider">보통 (Normal)</h4>
                    <p className="text-xs text-secondary">
                  조화 점수가 평범한 상태입니다.<br />
                  기본적인 조화는 이루어지고 있지만<br />
                  더 개선할 여지가 있습니다.
                </p>
              </div>

                  <div className="p-6 text-center">
                <div className="flex justify-center mb-4">
                      <div className="bg-secondary p-4 rounded-full">
                        <img src="/assets/happy_gini.svg" alt="Happy Gini" className="w-24 h-24" />
                  </div>
                </div>
                    <h4 className="text-sm font-regular text-secondary mb-2 uppercase tracking-wider">좋음 (Happy)</h4>
                    <p className="text-xs text-secondary">
                  조화 점수가 높은 상태입니다.<br />
                  패션 아이템들이 잘 어울리며<br />
                  완벽한 코디가 완성되었습니다!
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 기술 스택 */}
            <div className="col-span-12">
              <h3 className="text-xs font-regular text-secondary uppercase tracking-wider p-8 pb-0"><span className="inline-block px-3 py-1 border border-secondary rounded-full">기술 스택</span></h3>
              <div className="p-6">
                <div className="grid grid-cols-4">
                  <div className="border-r border-secondary text-center">
                    <div className="text-lg font-light text-secondary mb-2">React</div>
                    <div className="text-xs text-secondary">프론트엔드</div>
                  </div>
                  <div className="border-r border-secondary text-center">
                    <div className="text-lg font-light text-secondary mb-2">TypeScript</div>
                    <div className="text-xs text-secondary">타입 안정성</div>
                  </div>
                  <div className="border-r border-secondary text-center">
                    <div className="text-lg font-light text-secondary mb-2">FastAPI</div>
                    <div className="text-xs text-secondary">백엔드</div>
              </div>
              <div className="text-center">
                    <div className="text-lg font-light text-secondary mb-2">AI</div>
                    <div className="text-xs text-secondary">이미지 분석</div>
              </div>
              </div>
              </div>
            </div>
          </div>
    </Layout>
  )
}

export default Info

