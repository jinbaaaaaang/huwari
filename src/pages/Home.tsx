import { useState, useMemo, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import Layout from '../components/Layout'
import ItemPlacementArea from '../components/ItemPlacementArea'

interface PlacedItem {
  id: string
  imageUrl: string
  x: number
  y: number
  width: number
  height: number
  colors?: Array<{ rgb: number[]; hex: string; percentage: number }>
  texture?: string
  pattern?: string
  style?: string
}

interface HarmonyScore {
  score_total: number
  score_color: number
  score_texture: number
  score_pattern: number
  score_style: number
  reasons: string[]
  debug: any
}

function Home() {
  const location = useLocation()
  const [beforeItems, setBeforeItems] = useState<PlacedItem[]>([])
  const [afterItems] = useState<PlacedItem[]>([])
  const [harmonyScore, setHarmonyScore] = useState<HarmonyScore | null>(null)
  const [isLoadingHarmony, setIsLoadingHarmony] = useState(false)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // 페이지 로드 및 경로 변경 시 아이템 복원
  useEffect(() => {
    // 1. 히스토리에서 불러온 아이템이 있으면 우선 사용
    const loadHistoryItems = localStorage.getItem('loadHistoryItems')
    console.log('loadHistoryItems:', loadHistoryItems)
    if (loadHistoryItems) {
      try {
        const items = JSON.parse(loadHistoryItems)
        console.log('파싱된 아이템:', items)
        if (Array.isArray(items) && items.length > 0) {
          console.log('beforeItems 설정:', items)
          setBeforeItems(items)
          localStorage.removeItem('loadHistoryItems')
          // 히스토리에서 불러온 아이템도 currentItems에 저장
          localStorage.setItem('currentItems', JSON.stringify(items))
        }
      } catch (error) {
        console.error('히스토리 불러오기 오류:', error)
        localStorage.removeItem('loadHistoryItems')
      }
    } else {
      // 2. 히스토리에서 불러온 아이템이 없으면 저장된 아이템 복원
      const savedItems = localStorage.getItem('currentItems')
      if (savedItems) {
        try {
          const items = JSON.parse(savedItems)
          if (Array.isArray(items) && items.length > 0) {
            setBeforeItems(items)
          }
        } catch (error) {
          console.error('저장된 아이템 불러오기 오류:', error)
        }
      }
    }
  }, [location.pathname])

  // beforeItems 변경 시 localStorage에 저장 (초기화 버튼을 누르지 않는 한 유지)
  useEffect(() => {
    if (beforeItems.length > 0) {
      localStorage.setItem('currentItems', JSON.stringify(beforeItems))
    } else {
      // 빈 배열일 때는 저장하지 않음 (초기화된 상태)
      localStorage.removeItem('currentItems')
    }
  }, [beforeItems])

  // Before 아이템들의 질감, 패턴, 스타일 정보 종합
  const beforeFashionAttributes = useMemo(() => {
    const textures: string[] = []
    const patterns: string[] = []
    const styles: string[] = []
    
    // Before 아이템들의 속성 수집
    beforeItems.forEach(item => {
      if (item.texture) textures.push(item.texture)
      if (item.pattern) patterns.push(item.pattern)
      if (item.style) styles.push(item.style)
    })
    
    // 가장 많이 나타나는 속성 선택
    const getMostCommon = (arr: string[]) => {
      if (arr.length === 0) return null
      const counts: { [key: string]: number } = {}
      arr.forEach(item => {
        counts[item] = (counts[item] || 0) + 1
      })
      return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b)
    }
    
    // 모든 속성 목록 반환 (중복 제거)
    const getAllUnique = (arr: string[]) => {
      return Array.from(new Set(arr))
    }
    
    return {
      texture: getMostCommon(textures),
      pattern: getMostCommon(patterns),
      style: getMostCommon(styles),
      allTextures: getAllUnique(textures),
      allPatterns: getAllUnique(patterns),
      allStyles: getAllUnique(styles)
    }
  }, [beforeItems])


  // Before 아이템들의 색상을 종합하여 상위 5개 선택
  const beforeTopColors = useMemo(() => {
    const allColors: Array<{ hex: string; percentage: number; rgb: number[] }> = []
    
    // Before 아이템들의 색상
    beforeItems.forEach(item => {
      if (item.colors && item.colors.length > 0) {
        item.colors.forEach(color => {
          allColors.push({
            hex: color.hex,
            percentage: color.percentage,
            rgb: color.rgb
          })
        })
      }
    })
    
    if (allColors.length === 0) {
      return []
    }
    
    // 같은 HEX 색상끼리 그룹화하고 비율 합산
    const colorMap = new Map<string, { hex: string; totalPercentage: number; rgb: number[] }>()
    
    allColors.forEach(color => {
      const existing = colorMap.get(color.hex)
      if (existing) {
        existing.totalPercentage += color.percentage
      } else {
        colorMap.set(color.hex, {
          hex: color.hex,
          totalPercentage: color.percentage,
          rgb: color.rgb
        })
      }
    })
    
    // 비율이 높은 순으로 정렬
    const sortedColors = Array.from(colorMap.values())
      .sort((a, b) => b.totalPercentage - a.totalPercentage)
      .slice(0, 5) // 상위 5개만 선택
    
    return sortedColors
  }, [beforeItems])


  // 조화 점수 계산 API 호출 (debounce)
  useEffect(() => {
    // 이전 타이머 취소
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Before 아이템이 없으면 점수 표시 안 함
    if (beforeItems.length === 0) {
      setHarmonyScore(null)
      return
    }

    // 400ms debounce
    setIsLoadingHarmony(true)
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const response = await fetch('http://localhost:8000/api/predict-harmony', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            beforeItems,
            afterItems
          })
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data: HarmonyScore = await response.json()
        setHarmonyScore(data)
      } catch (error) {
        console.error('조화 점수 계산 오류:', error)
        // 에러 발생 시 기존 점수 유지
      } finally {
        setIsLoadingHarmony(false)
      }
    }, 400)

    // cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [beforeItems, afterItems])

  // 캐릭터 이미지 경로 결정
  const getCharacterImage = () => {
    if (!harmonyScore) return '/assets/normal_gini.svg'
    
    const score = harmonyScore.score_total
    if (score < 30) {
      return '/assets/bad_gini.svg'  // angry
    } else if (score < 60) {
      return '/assets/normal_gini.svg'  // normal
    } else {
      return '/assets/good_gini.svg'  // happy
    }
  }
  
  return (
    <Layout>
      <div className="h-screen flex flex-col">
        {/* 상단: Before 섹션과 분석 결과 */}
        <div className="grid grid-cols-2 flex-1 min-h-0">
          {/* 왼쪽: 기존 패션 아이템 */}
          <div className="bg-cream border-r border-secondary flex flex-col">
            <div className="p-6 flex items-center justify-between border-b border-secondary">
              <h3 className="text-xs font-regular text-secondary uppercase tracking-wider inline-block px-3 py-1 border border-secondary rounded-full">코디 업로드</h3>
            </div>
            
            {/* 이미지 업로드 및 아이템 배치 영역 - flex-1 영역 */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 min-h-0">
                <ItemPlacementArea
                  key={beforeItems.length > 0 ? `items-${beforeItems.map(i => i.id).join('-')}` : 'empty'}
                  buttonText="이미지 업로드"
                  buttonIcon="upload"
                  instructionText="이미지를 업로드하면<br />자동으로 배치됩니다"
                  containerId="item-container-before"
                  onItemsChange={setBeforeItems}
                  onReset={() => {
                    setBeforeItems([])
                    localStorage.removeItem('currentItems')
                  }}
                  harmonyScore={harmonyScore}
                  initialItems={beforeItems}
                />
              </div>
            </div>

            {/* 분석 결과 - 상세 분석과 같은 높이에서 시작 */}
            <div className="bg-cream p-4 border-t border-secondary overflow-y-auto scrollbar-thin h-[260px]">
              <h4 className="text-xs font-regular text-secondary mb-4 uppercase tracking-wider inline-block px-3 py-1 border border-secondary rounded-full">분석 결과</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-cream p-3 flex flex-col">
                  <div className="text-xs text-secondary mb-2 uppercase tracking-wider">색상</div>
                  <div className="flex space-x-1 flex-wrap gap-1 min-h-[16px] items-center">
                    {beforeTopColors.length > 0 ? (
                      beforeTopColors.map((color, idx) => (
                        <div
                          key={idx}
                          className="w-4 h-4 rounded-full border border-secondary"
                          style={{ backgroundColor: color.hex }}
                          title={`${color.hex}`}
                        />
                      ))
                    ) : (
                      <div className="text-xs text-secondary leading-none">-</div>
                    )}
                  </div>
                </div>
                <div className="bg-cream p-3 flex flex-col">
                  <div className="text-xs text-secondary mb-2 uppercase tracking-wider">재질</div>
                  <div className="flex flex-wrap gap-1 min-h-[28px] items-center">
                    {beforeFashionAttributes.allTextures && beforeFashionAttributes.allTextures.length > 0 ? (
                      beforeFashionAttributes.allTextures.map((texture, idx) => (
                        <span
                          key={idx}
                          className={`text-xs px-3 py-1 border border-secondary rounded-full ${
                            texture === beforeFashionAttributes.texture
                              ? 'bg-secondary text-cream'
                              : 'bg-cream text-secondary'
                          }`}
                        >
                          {texture}
                        </span>
                      ))
                    ) : (
                      <div className="text-xs text-secondary">-</div>
                    )}
                  </div>
                </div>
                <div className="bg-cream p-3 flex flex-col">
                  <div className="text-xs text-secondary mb-2 uppercase tracking-wider">패턴</div>
                  <div className="flex flex-wrap gap-1 min-h-[28px] items-center">
                    {beforeFashionAttributes.allPatterns && beforeFashionAttributes.allPatterns.length > 0 ? (
                      beforeFashionAttributes.allPatterns.map((pattern, idx) => (
                        <span
                          key={idx}
                          className={`text-xs px-3 py-1 border border-secondary rounded-full ${
                            pattern === beforeFashionAttributes.pattern
                              ? 'bg-secondary text-cream'
                              : 'bg-cream text-secondary'
                          }`}
                        >
                          {pattern}
                        </span>
                      ))
                    ) : (
                      <div className="text-xs text-secondary">-</div>
                    )}
                  </div>
                </div>
                <div className="bg-cream p-3 flex flex-col">
                  <div className="text-xs text-secondary mb-2 uppercase tracking-wider">스타일</div>
                  <div className="flex flex-wrap gap-1 min-h-[28px] items-center">
                    {beforeFashionAttributes.allStyles && beforeFashionAttributes.allStyles.length > 0 ? (
                      beforeFashionAttributes.allStyles.map((style, idx) => (
                        <span
                          key={idx}
                          className={`text-xs px-3 py-1 border border-secondary rounded-full ${
                            style === beforeFashionAttributes.style
                              ? 'bg-secondary text-cream'
                              : 'bg-cream text-secondary'
                          }`}
                        >
                          {style}
                        </span>
                      ))
                    ) : (
                      <div className="text-xs text-secondary">-</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 오른쪽: 조화 분석 결과 */}
          <div className="bg-cream flex flex-col">
            <div className="p-6 flex items-center justify-between border-b border-secondary">
              <h3 className="text-xs font-regular text-secondary uppercase tracking-wider inline-block px-3 py-1 border border-secondary rounded-full">코디 평가</h3>
            </div>
            
            {/* 조화 점수, 캐릭터, 분석 이유 - flex-1 영역 */}
            <div className="flex-1 flex flex-col min-h-0">
              {/* 조화 점수와 캐릭터 */}
              <div className="p-4 border-b border-secondary">
                <div className="grid grid-cols-2 gap-3">
                  {/* 조화 점수 */}
                  <div className="bg-cream p-3 flex flex-col items-center justify-center">
                    <div className="w-28 h-28 bg-secondary flex items-center justify-center rounded-full mb-2">
                      {isLoadingHarmony ? (
                        <div className="text-sm text-cream">계산 중...</div>
                      ) : (
                        <div className="text-4xl font-light text-cream">
                          {harmonyScore ? Math.round(harmonyScore.score_total) : '-'}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-secondary uppercase tracking-wider">점수</div>
                  </div>

                  {/* 캐릭터 표시 */}
                  <div className="bg-cream p-3 flex flex-col items-center justify-center">
                    <div className="w-28 h-28 bg-secondary flex items-center justify-center rounded-full mb-2">
                      <img 
                        src={getCharacterImage()} 
                        alt="Gini" 
                        className="w-20 h-20"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.src = '/assets/normal_gini.svg'
                        }}
                      />
                    </div>
                    <div className="text-xs text-secondary uppercase tracking-wider">조화 상태</div>
                  </div>
                </div>
              </div>

              {/* 분석 이유 - 기니피그 말풍선 */}
              <div className="bg-cream p-4 min-h-[120px]">
                <div className="space-y-3">
                  {[0, 1, 2, 3].map((idx) => {
                    const reason = harmonyScore?.reasons?.[idx]
                    return (
                      <div key={idx} className="flex items-center gap-4">
                        {/* 기니피그 캐릭터 - 항상 표시 */}
                        <div className="flex-shrink-0">
                          <img 
                            src={getCharacterImage()} 
                            alt="Gini" 
                            className="w-16 h-16"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              target.src = '/assets/normal_gini.svg'
                            }}
                          />
                        </div>
                        {/* 말풍선 - 이유가 있을 때만 표시 */}
                        {reason && (
                          <div className="flex-1 relative">
                            <div className="bg-cream border border-secondary px-4 py-3 rounded-lg relative">
                              <p className="text-xs text-secondary leading-relaxed">
                                {reason}
                              </p>
                              {/* 말풍선 꼬리 */}
                              <div className="absolute left-0 top-4 -ml-2">
                                <div className="w-3 h-3 bg-cream border-l border-b border-secondary transform rotate-45"></div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* 상세 분석 - Before의 분석 결과와 같은 높이에서 시작 */}
            <div className="bg-cream p-4 border-t border-secondary overflow-y-auto scrollbar-thin h-[260px]">
              <h4 className="text-xs font-regular text-secondary mb-3 uppercase tracking-wider inline-block px-3 py-1 border border-secondary rounded-full">상세 분석</h4>
              <div className="space-y-1.5">
                <div className="bg-cream border border-secondary rounded-lg p-3 flex justify-between items-center hover:bg-secondary/5 transition-colors">
                  <span className="text-xs text-secondary uppercase tracking-wider">색상 조화</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-2 bg-secondary/20 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-secondary transition-all duration-300"
                        style={{ 
                          width: `${isLoadingHarmony ? 0 : (harmonyScore ? harmonyScore.score_color : 0)}%` 
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-secondary w-8 text-right">
                      {isLoadingHarmony ? '-' : (harmonyScore ? Math.round(harmonyScore.score_color) : '-')}
                    </span>
                  </div>
                </div>
                <div className="bg-cream border border-secondary rounded-lg p-3 flex justify-between items-center hover:bg-secondary/5 transition-colors">
                  <span className="text-xs text-secondary uppercase tracking-wider">재질 조화</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-2 bg-secondary/20 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-secondary transition-all duration-300"
                        style={{ 
                          width: `${isLoadingHarmony ? 0 : (harmonyScore ? harmonyScore.score_texture : 0)}%` 
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-secondary w-8 text-right">
                      {isLoadingHarmony ? '-' : (harmonyScore ? Math.round(harmonyScore.score_texture) : '-')}
                    </span>
                  </div>
                </div>
                <div className="bg-cream border border-secondary rounded-lg p-3 flex justify-between items-center hover:bg-secondary/5 transition-colors">
                  <span className="text-xs text-secondary uppercase tracking-wider">패턴 조화</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-2 bg-secondary/20 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-secondary transition-all duration-300"
                        style={{ 
                          width: `${isLoadingHarmony ? 0 : (harmonyScore ? harmonyScore.score_pattern : 0)}%` 
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-secondary w-8 text-right">
                      {isLoadingHarmony ? '-' : (harmonyScore ? Math.round(harmonyScore.score_pattern) : '-')}
                    </span>
                  </div>
                </div>
                <div className="bg-cream border border-secondary rounded-lg p-3 flex justify-between items-center hover:bg-secondary/5 transition-colors">
                  <span className="text-xs text-secondary uppercase tracking-wider">스타일 조화</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-2 bg-secondary/20 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-secondary transition-all duration-300"
                        style={{ 
                          width: `${isLoadingHarmony ? 0 : (harmonyScore ? harmonyScore.score_style : 0)}%` 
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-secondary w-8 text-right">
                      {isLoadingHarmony ? '-' : (harmonyScore ? Math.round(harmonyScore.score_style) : '-')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}

export default Home


