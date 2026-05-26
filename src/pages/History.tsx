import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import CustomSelect from '../components/CustomSelect'
import { useStyleProfile } from '../hooks/useStyleProfile'
import type { StyleProfile } from '../lib/styleHistory'

/**
 * 흰 배경/투명 픽셀을 잘라내고 정사각형 가운데에 배치한 dataURL을 반환.
 * 모듈 스코프 Map에 캐싱해 동일 src 재요청 시 즉시 반환한다.
 */
const TRIM_VERSION = 'v4'
const TRIM_BG_COLOR = '#FAFAF8'
const trimCache = new Map<string, string>()
const trimKey = (src: string) => `${TRIM_VERSION}:${src}`

function trimToCenter(src: string): Promise<string> {
  const key = trimKey(src)
  const cached = trimCache.get(key)
  if (cached) return Promise.resolve(cached)
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const w = img.naturalWidth
        const h = img.naturalHeight
        if (!w || !h) return resolve(src)
        const cnv = document.createElement('canvas')
        cnv.width = w
        cnv.height = h
        const ctx = cnv.getContext('2d')
        if (!ctx) return resolve(src)
        ctx.drawImage(img, 0, 0)
        const data = ctx.getImageData(0, 0, w, h).data

        // 코너 4픽셀 평균 → 배경색으로 추정
        const cornerIdx = [
          0,
          (w - 1) * 4,
          (h - 1) * w * 4,
          ((h - 1) * w + (w - 1)) * 4,
        ]
        let br = 0, bg = 0, bb = 0
        for (const ci of cornerIdx) {
          br += data[ci]
          bg += data[ci + 1]
          bb += data[ci + 2]
        }
        br /= 4
        bg /= 4
        bb /= 4
        const DIST_T = 28 // 배경색에서 이만큼 떨어지면 옷 픽셀로 간주
        const WHITE_T = 230 // 코너가 흰색에 가까우면 흰색 기준도 함께 사용

        let minX = w, minY = h, maxX = -1, maxY = -1
        for (let y = 0; y < h; y++) {
          const rowBase = y * w * 4
          for (let x = 0; x < w; x++) {
            const i = rowBase + x * 4
            const a = data[i + 3]
            if (a < 16) continue
            const r = data[i]
            const g = data[i + 1]
            const b = data[i + 2]
            const dr = r - br
            const dg = g - bg
            const db = b - bb
            const dist2 = dr * dr + dg * dg + db * db
            const isBgByDist = dist2 < DIST_T * DIST_T
            const isBgByWhite = r >= WHITE_T && g >= WHITE_T && b >= WHITE_T
            if (isBgByDist || isBgByWhite) continue
            if (x < minX) minX = x
            if (y < minY) minY = y
            if (x > maxX) maxX = x
            if (y > maxY) maxY = y
          }
        }
        if (maxX < 0) {
          trimCache.set(key, src)
          return resolve(src)
        }
        const bw = maxX - minX + 1
        const bh = maxY - minY + 1
        const side = Math.max(bw, bh)
        const pad = Math.round(side * 0.08)
        const size = side + pad * 2
        const out = document.createElement('canvas')
        out.width = size
        out.height = size
        const octx = out.getContext('2d')
        if (!octx) return resolve(src)
        octx.fillStyle = TRIM_BG_COLOR
        octx.fillRect(0, 0, size, size)
        const dx = pad + Math.round((side - bw) / 2)
        const dy = pad + Math.round((side - bh) / 2)
        octx.drawImage(cnv, minX, minY, bw, bh, dx, dy, bw, bh)
        const url = out.toDataURL('image/png')
        trimCache.set(key, url)
        resolve(url)
      } catch {
        resolve(src)
      }
    }
    img.onerror = () => resolve(src)
    img.src = src
  })
}

function CenteredCodiImage({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className?: string
}) {
  const [processed, setProcessed] = useState<string | null>(
    trimCache.get(trimKey(src)) ?? null,
  )
  useEffect(() => {
    let cancelled = false
    const k = trimKey(src)
    if (trimCache.has(k)) {
      setProcessed(trimCache.get(k)!)
      return
    }
    setProcessed(null)
    trimToCenter(src).then((url) => {
      if (!cancelled) setProcessed(url)
    })
    return () => {
      cancelled = true
    }
  }, [src])
  return <img src={processed ?? src} alt={alt} className={className} />
}

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
    reasons: string[]
    debug: any
  }
  layoutImage?: string
  createdAt: string
}

const HISTORY_UI_KEY = 'huwari_history_filters'

function StyleReportCard({ profile }: { profile: StyleProfile }) {
  const maxStyleCount = profile.topStyles[0]?.count || 1
  const hasData = profile.totalCount > 0
  const countLabel = hasData ? `${profile.totalCount}개 코디 기반` : '저장된 코디 없음'
  return (
    <section
      aria-label="내 스타일 리포트"
      className="shrink-0 border-b border-secondary bg-[#FAFAF8] px-6 py-3"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xs font-regular text-secondary uppercase tracking-wider inline-block px-3 py-1 border border-secondary rounded-full">
          내 스타일 리포트
        </h2>
        <span className="text-[11px] text-secondary/70">{countLabel}</span>
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="text-[11px] text-secondary uppercase tracking-wider mb-2">
            자주 입는 스타일 top 3
          </div>
          {profile.topStyles.length === 0 ? (
            <div className="text-xs text-secondary/60">
              {hasData ? '스타일 데이터 부족' : '코디를 저장하면 자주 입는 스타일이 표시돼요'}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {profile.topStyles.map((s) => (
                <li key={s.name} className="flex items-center gap-3">
                  <span className="text-xs text-secondary w-16 shrink-0 truncate">
                    {s.name}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-secondary/15 overflow-hidden">
                    <div
                      className="h-full bg-secondary"
                      style={{
                        width: `${Math.max(8, (s.count / maxStyleCount) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-[11px] text-secondary/80 w-12 text-right shrink-0">
                    {s.percentage}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="text-[11px] text-secondary uppercase tracking-wider mb-2">
            자주 쓰는 색상 top 5
          </div>
          {profile.topColors.length === 0 ? (
            <div className="text-xs text-secondary/60">
              {hasData ? '색상 데이터 부족' : '아직 색상 데이터가 없어요'}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {profile.topColors.map((c) => (
                <div
                  key={c.hex}
                  title={`${c.hex} · ${c.count}회`}
                  className="w-6 h-6 rounded-full border border-secondary"
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
          <div className="border border-secondary/40 rounded-lg px-3 py-2 bg-[#FAFAF8]">
            <div className="text-[10px] text-secondary/70 uppercase tracking-wider">
              평균 조화 점수
            </div>
            <div className="text-lg font-light text-secondary mt-0.5">
              {hasData ? profile.avgScore.toFixed(1) : '—'}
            </div>
          </div>
          <div className="border border-secondary/40 rounded-lg px-3 py-2 bg-[#FAFAF8]">
            <div className="text-[10px] text-secondary/70 uppercase tracking-wider">
              역대 최고 점수
            </div>
            <div className="text-lg font-light text-secondary mt-0.5">
              {hasData ? profile.bestScore : '—'}
            </div>
          </div>
        </div>
      </div>

      {profile.bestCombo ? (
        <div className="mt-3 text-[11px] text-secondary/80">
          가장 잘 어울린 재질 조합 · <span className="text-secondary">{profile.bestCombo}</span>
        </div>
      ) : null}
    </section>
  )
}

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
  const { profile } = useStyleProfile()

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
  const visibleHistory = sortedHistory.slice(0, 12)

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

        <StyleReportCard profile={profile} />

        {/* 히스토리 목록 */}
        <div className="relative z-0 grid flex-1 min-h-0 grid-cols-6 overflow-hidden [grid-template-rows:repeat(2,minmax(0,1fr))]">
          {isLoading ? (
            <>
              {[...Array(12)].map((_, i) => (
                <div key={i} className={`min-h-0 overflow-hidden bg-[#FAFAF8] border-secondary p-3 flex flex-col gap-2 ${i % 6 !== 5 ? 'border-r' : ''} ${i < 6 ? 'border-b' : ''}`}>
                  <div className="relative flex-1 min-h-0">
                    <div className="w-full h-full bg-[#FAFAF8] border border-secondary flex items-center justify-center">
                      <div className="text-[10px] text-secondary">로딩 중...</div>
                    </div>
                  </div>
                  <div className="shrink-0 space-y-1.5">
                    <div className="h-5"></div>
                    <div className="flex gap-1.5">
                      <div className="flex-1 h-7"></div>
                      <div className="flex-1 h-7"></div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : visibleHistory.length === 0 ? (
            <div className="col-span-6 row-span-2 flex flex-col items-center justify-center gap-3 px-6 py-12 text-center min-h-[200px]">
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
                    className={`min-h-0 overflow-hidden bg-[#FAFAF8] border-secondary p-3 flex flex-col gap-2 hover:bg-[#FAFAF8] transition-all ${
                      index % 6 !== 5 ? 'border-r' : ''
                    } ${index < 6 ? 'border-b' : ''}`}
                  >
                  {/* 썸네일 이미지 영역 */}
                  <div className="relative flex-1 min-h-0">
                    <div className="w-full h-full bg-[#FAFAF8] border border-secondary flex items-center justify-center overflow-hidden p-2">
                      {item.layoutImage ? (
                        <CenteredCodiImage
                          src={item.layoutImage}
                          alt="코디 레이아웃 미리보기"
                          className="max-w-full max-h-full w-auto h-auto object-contain bg-[#FAFAF8] block"
                        />
                      ) : item.beforeItems.length > 0 && item.beforeItems[0].imageUrl ? (
                        <CenteredCodiImage
                          src={item.beforeItems[0].imageUrl}
                          alt="코디 미리보기"
                          className="max-w-full max-h-full w-auto h-auto object-contain bg-[#FAFAF8] block"
                        />
                      ) : (
                        <div className="text-secondary text-[10px]">이미지 미리보기</div>
                      )}
                    </div>
                    <div className="absolute top-1.5 right-1.5 bg-secondary text-cream px-2 py-0.5 text-[10px] border border-secondary rounded-full">
                      {score}점
                    </div>
                  </div>

                  {/* 정보 */}
                  <div className="shrink-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-1">
                      <h3 className="text-[10px] font-light text-secondary uppercase tracking-wider inline-block px-2 py-0.5 border border-secondary rounded-full truncate">
                        #{index + 1}
                      </h3>
                      <span className="text-[10px] text-secondary truncate">{formatDate(item.createdAt)}</span>
                    </div>

                    {/* 버튼 영역 */}
                    <div className="flex gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          // localStorage에 히스토리 아이템 저장 후 Home으로 이동
                          localStorage.setItem('loadHistoryItems', JSON.stringify(item.beforeItems))
                          navigate('/', {
                            state: { restoreBeforeItems: item.beforeItems },
                          })
                        }}
                        className="flex-1 px-2 py-1.5 bg-[#FAFAF8] border border-secondary text-secondary text-[10px] font-regular uppercase tracking-wider rounded-full hover:bg-secondary hover:text-cream transition-all"
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
                        className="flex-1 px-2 py-1.5 bg-[#FAFAF8] border border-secondary text-secondary text-[10px] font-regular uppercase tracking-wider rounded-full hover:bg-secondary hover:text-cream transition-all"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
                )
              })}
              {visibleHistory.length < 12 && [...Array(12 - visibleHistory.length)].map((_, i) => {
                const emptyIndex = visibleHistory.length + i
                return (
                  <div
                    key={`empty-${i}`}
                    className={`min-h-0 overflow-hidden bg-[#FAFAF8] border-secondary p-3 flex flex-col gap-2 ${
                      emptyIndex % 6 !== 5 ? 'border-r' : ''
                    } ${emptyIndex < 6 ? 'border-b' : ''}`}
                  >
                    <div className="relative flex-1 min-h-0">
                      <div className="w-full h-full bg-[#FAFAF8] flex items-center justify-center overflow-hidden" />
                    </div>
                    <div className="shrink-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <div className="text-[10px] font-light text-secondary uppercase tracking-wider inline-block px-2 py-0.5 border border-secondary rounded-full opacity-0">
                          #
                        </div>
                        <div className="text-[10px] text-secondary opacity-0">날짜</div>
                      </div>
                      <div className="flex gap-1.5">
                        <div className="flex-1 px-2 py-1.5 bg-[#FAFAF8] border border-secondary text-secondary text-[10px] font-regular uppercase tracking-wider rounded-full opacity-0">
                          불러오기
                        </div>
                        <div className="flex-1 px-2 py-1.5 bg-[#FAFAF8] border border-secondary text-secondary text-[10px] font-regular uppercase tracking-wider rounded-full opacity-0">
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

