import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import CustomSelect from '../components/CustomSelect'

interface HistoryItem {
  id: string
  beforeItems: Array<{
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
    category?: string
  }>
  harmonyScore: {
    score_total: number
    score_color: number
    score_texture: number
    score_pattern: number
    score_style: number
    reasons: string[]
    debug: any
  }
  layoutImage?: string
  createdAt: string
}

const HISTORY_UI_KEY = 'huwari_history_filters'

function readHistoryUiState() {
  try {
    const raw = sessionStorage.getItem(HISTORY_UI_KEY)
    if (!raw) return { sortBy: 'latest', filterBy: 'all' }
    const p = JSON.parse(raw) as { sortBy?: string; filterBy?: string }
    return {
      sortBy: typeof p.sortBy === 'string' ? p.sortBy : 'latest',
      filterBy: typeof p.filterBy === 'string' ? p.filterBy : 'all',
    }
  } catch {
    return { sortBy: 'latest', filterBy: 'all' }
  }
}

const History = () => {
  const navigate = useNavigate()
  const initialUi = readHistoryUiState()
  const [sortBy, setSortBy] = useState(initialUi.sortBy)
  const [filterBy, setFilterBy] = useState(initialUi.filterBy)
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const sortOptions = [
    { value: 'latest', label: '최신순' },
    { value: 'oldest', label: '오래된순' },
    { value: 'score-high', label: '조화 점수\n높은순' },
    { value: 'score-low', label: '조화 점수\n낮은순' },
  ]

  useEffect(() => {
    try {
      sessionStorage.setItem(HISTORY_UI_KEY, JSON.stringify({ sortBy, filterBy }))
    } catch {
      /* ignore */
    }
  }, [sortBy, filterBy])

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setIsLoading(true)
        const response = await fetch('/api/get-history')
        const data = await response.json()
        
        if (data.success) {
          setHistoryItems(data.history || [])
        } else {
          console.error('히스토리 불러오기 실패:', data.error)
        }
      } catch (error) {
        console.error('히스토리 불러오기 오류:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchHistory()
  }, [])

  // 필터링된 히스토리 아이템
  const filteredHistory = historyItems.filter((item) => {
    if (filterBy === 'all') return true
    
    const itemDate = new Date(item.createdAt)
    const now = new Date()
    const diffTime = now.getTime() - itemDate.getTime()
    const diffDays = diffTime / (1000 * 60 * 60 * 24)
    
    if (filterBy === 'week') return diffDays <= 7
    if (filterBy === 'month') return diffDays <= 30
    if (filterBy === '3months') return diffDays <= 90
    
    return true
  })

  // 정렬된 히스토리 아이템
  const sortedHistory = [...filteredHistory].sort((a, b) => {
    if (sortBy === 'latest') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    } else if (sortBy === 'oldest') {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    } else if (sortBy === 'score-high') {
      return b.harmonyScore.score_total - a.harmonyScore.score_total
    } else if (sortBy === 'score-low') {
      return a.harmonyScore.score_total - b.harmonyScore.score_total
    }
    return 0
  })
  const visibleHistory = sortedHistory.slice(0, 10)

  // 날짜 포맷팅
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
  }

  return (
    <Layout>
      <div className="h-screen flex flex-col bg-[#FAFAF8]">

        {/* 필터 및 정렬 */}
        <div className="relative z-30 overflow-visible bg-[#FAFAF8] p-6 border-b border-secondary flex items-center translate-y-[1.375px]">
          <div className="w-full flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex gap-3 flex-wrap">
                  <button 
                    onClick={() => setFilterBy('all')}
                    className={`px-3 py-1 border border-secondary rounded-full hover:bg-secondary hover:text-cream transition-all text-xs font-regular uppercase tracking-wider ${
                      filterBy === 'all' ? 'bg-secondary text-cream' : 'text-secondary'
                    }`}
                  >
                전체
              </button>
                  <button 
                    onClick={() => setFilterBy('week')}
                    className={`px-3 py-1 border border-secondary rounded-full hover:bg-secondary hover:text-cream transition-all text-xs font-regular uppercase tracking-wider ${
                      filterBy === 'week' ? 'bg-secondary text-cream' : 'text-secondary'
                    }`}
                  >
                최근 일주일
              </button>
                  <button 
                    onClick={() => setFilterBy('month')}
                    className={`px-3 py-1 border border-secondary rounded-full hover:bg-secondary hover:text-cream transition-all text-xs font-regular uppercase tracking-wider ${
                      filterBy === 'month' ? 'bg-secondary text-cream' : 'text-secondary'
                    }`}
                  >
                최근 한 달
              </button>
                  <button 
                    onClick={() => setFilterBy('3months')}
                    className={`px-3 py-1 border border-secondary rounded-full hover:bg-secondary hover:text-cream transition-all text-xs font-regular uppercase tracking-wider ${
                      filterBy === '3months' ? 'bg-secondary text-cream' : 'text-secondary'
                    }`}
                  >
                최근 3개월
              </button>
            </div>
            <CustomSelect
              options={sortOptions}
              value={sortBy}
              onChange={setSortBy}
            />
          </div>
        </div>

        {/* 히스토리 목록 */}
        <div className="relative z-0 grid flex-1 min-h-0 grid-cols-5 overflow-hidden [grid-template-rows:repeat(2,minmax(0,1fr))]">
          {isLoading ? (
            <>
              {[...Array(10)].map((_, i) => (
                <div key={i} className={`min-h-0 overflow-hidden bg-[#FAFAF8] border-secondary p-6 ${i % 5 !== 4 ? 'border-r' : ''} ${i < 5 ? 'border-b' : ''}`}>
                  <div className="relative mb-4">
                    <div className="aspect-square bg-[#FAFAF8] border border-secondary flex items-center justify-center">
                      <div className="text-xs text-secondary">로딩 중...</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-6"></div>
                    <div className="h-8"></div>
                    <div className="pt-3 flex gap-2">
                      <div className="flex-1 h-8"></div>
                      <div className="flex-1 h-8"></div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : visibleHistory.length === 0 ? (
            <div className="col-span-5 row-span-2 flex flex-col items-center justify-center gap-3 px-6 py-12 text-center min-h-[200px]">
              <p className="text-sm text-secondary">
                저장된 히스토리가 없습니다.
              </p>
              <p className="text-xs text-secondary/70 max-w-md leading-relaxed">
                홈에서 코디를 저장하면 이 목록에 카드가 생기며, 각 카드에서{' '}
                <span className="text-secondary">불러오기</span>·
                <span className="text-secondary">삭제</span>를 사용할 수 있어요.
              </p>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="mt-2 px-5 py-2 border border-secondary rounded-full text-xs text-secondary uppercase tracking-wider hover:bg-secondary hover:text-cream transition-all"
              >
                홈으로
              </button>
            </div>
          ) : (
            <>
              {visibleHistory.map((item, index) => {
                const score = Math.round(item.harmonyScore.score_total)

                return (
                  <div
                    key={item.id}
                    className={`min-h-0 overflow-hidden bg-[#FAFAF8] border-secondary p-6 hover:bg-[#FAFAF8] transition-all ${
                      index % 5 !== 4 ? 'border-r' : ''
                    } ${index < 5 ? 'border-b' : ''}`}
                  >
                  {/* 썸네일 이미지 영역 */}
                  <div className="relative mb-4">
                    <div className="aspect-square bg-[#FAFAF8] border border-secondary flex items-center justify-center overflow-hidden">
                      {item.layoutImage ? (
                        <img 
                          src={item.layoutImage} 
                          alt="코디 레이아웃 미리보기" 
                          className="w-full h-full object-contain bg-[#FAFAF8]"
                        />
                      ) : item.beforeItems.length > 0 && item.beforeItems[0].imageUrl ? (
                        <img 
                          src={item.beforeItems[0].imageUrl} 
                          alt="코디 미리보기" 
                          className="w-full h-full object-contain bg-[#FAFAF8]"
                        />
                      ) : (
                        <div className="text-secondary text-xs">이미지 미리보기</div>
                      )}
                    </div>
                    <div className="absolute top-2 right-2 bg-secondary text-cream px-3 py-1 text-xs border border-secondary rounded-full">
                      조화 {score}점
                    </div>
                  </div>

                  {/* 정보 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-light text-secondary uppercase tracking-wider inline-block px-3 py-1 border border-secondary rounded-full">
                        코디 분석 #{index + 1}
                      </h3>
                      <span className="text-xs text-secondary">{formatDate(item.createdAt)}</span>
                    </div>

                    {/* 버튼 영역 */}
                    <div className="pt-3 flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          // localStorage에 히스토리 아이템 저장 후 Home으로 이동
                          localStorage.setItem('loadHistoryItems', JSON.stringify(item.beforeItems))
                          navigate('/', {
                            state: { restoreBeforeItems: item.beforeItems },
                          })
                        }}
                        className="flex-1 px-3 py-2 bg-[#FAFAF8] border border-secondary text-secondary text-xs font-regular uppercase tracking-wider rounded-full hover:bg-secondary hover:text-cream transition-all"
                      >
                        불러오기
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (window.confirm('정말 삭제하시겠습니까?')) {
                            try {
                              const response = await fetch(`/api/delete-history/${item.id}`, {
                                method: 'DELETE',
                                headers: {
                                  'Content-Type': 'application/json',
                                }
                              })
                              
                              if (!response.ok) {
                                const errorText = await response.text()
                                throw new Error(`HTTP error! status: ${response.status}, ${errorText}`)
                              }
                              
                              const data = await response.json()
                              
                              if (data.success) {
                                // 히스토리 목록에서 제거
                                setHistoryItems(prev => prev.filter(h => h.id !== item.id))
                              } else {
                                alert(`삭제 실패: ${data.error || '알 수 없는 오류'}`)
                              }
                            } catch (error) {
                              console.error('삭제 오류:', error)
                              alert(`삭제 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`)
                            }
                          }
                        }}
                        className="flex-1 px-3 py-2 bg-[#FAFAF8] border border-secondary text-secondary text-xs font-regular uppercase tracking-wider rounded-full hover:bg-secondary hover:text-cream transition-all"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
                )
              })}
              {visibleHistory.length < 10 && [...Array(10 - visibleHistory.length)].map((_, i) => {
                const emptyIndex = visibleHistory.length + i
                return (
                  <div
                    key={`empty-${i}`}
                    className={`min-h-0 overflow-hidden bg-[#FAFAF8] border-secondary p-6 ${
                      emptyIndex % 5 !== 4 ? 'border-r' : ''
                    } ${emptyIndex < 5 ? 'border-b' : ''}`}
                  >
                    <div className="relative mb-4">
                      <div className="aspect-square bg-[#FAFAF8] flex items-center justify-center overflow-hidden" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-light text-secondary uppercase tracking-wider inline-block px-3 py-1 border border-secondary rounded-full opacity-0">
                          코디 분석
                        </div>
                        <div className="text-xs text-secondary opacity-0">날짜</div>
                      </div>
                      <div className="pt-3 flex gap-2">
                        <div className="flex-1 px-3 py-2 bg-[#FAFAF8] border border-secondary text-secondary text-xs font-regular uppercase tracking-wider rounded-full opacity-0">
                          불러오기
                        </div>
                        <div className="flex-1 px-3 py-2 bg-[#FAFAF8] border border-secondary text-secondary text-xs font-regular uppercase tracking-wider rounded-full opacity-0">
                          삭제
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>

        {/* 빈 상태 (히스토리가 없을 때) */}
        {/* 
        <div className="text-center py-16">
          <div className="text-6xl mb-4 opacity-50">📋</div>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">아직 분석 기록이 없습니다</h3>
          <p className="text-gray-500 mb-6">패션 아이템 이미지를 업로드하여 첫 분석을 시작해보세요</p>
          <button className="px-6 py-3 bg-gradient-to-r from-yellow-400 to-pink-400 text-white rounded-lg font-medium hover:from-yellow-500 hover:to-pink-500 transition-all">
            분석 시작하기
          </button>
        </div>
        */}

        {/* 페이지네이션 */}
        <div className="h-24 border-t border-secondary flex items-center justify-center">
          <div className="flex items-center gap-1">
                <button className="w-10 h-10 text-xs text-secondary hover:bg-secondary hover:text-cream border border-secondary transition-all rounded-full flex items-center justify-center">
              이전
            </button>
                <button className="w-10 h-10 bg-secondary text-cream border border-secondary hover:bg-secondary transition-all text-xs rounded-full flex items-center justify-center">
              1
            </button>
                <button className="w-10 h-10 text-xs text-secondary hover:bg-secondary hover:text-cream border border-secondary transition-all rounded-full flex items-center justify-center">
              2
            </button>
                <button className="w-10 h-10 text-xs text-secondary hover:bg-secondary hover:text-cream border border-secondary transition-all rounded-full flex items-center justify-center">
              3
            </button>
                <button className="w-10 h-10 text-xs text-secondary hover:bg-secondary hover:text-cream border border-secondary transition-all rounded-full flex items-center justify-center">
              다음
            </button>
          </div>
        </div>
      </div>
    </Layout>
  )
}

export default History

