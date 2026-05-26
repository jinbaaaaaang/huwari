/**
 * 프론트엔드 전용 코디 히스토리 (localStorage).
 * 서버 메모리 히스토리(`/api/save-history`)는 재시작 시 사라지므로,
 * 이 모듈은 사용자 단말에 누적 데이터를 남겨 「내 스타일 리포트」·개인화 피드백을 만든다.
 */

export const LS_KEY = 'huwari_history'
export const MAX_ENTRIES = 50
/** 같은 탭 안에서 저장 발생 시 화면 즉시 갱신을 위한 커스텀 이벤트 이름. */
export const LS_HISTORY_EVENT = 'huwari:history-changed'

export interface LocalHistoryItem {
  category: string
  texture: string
  pattern: string
  style: string
  colors: Array<{ hex: string; percentage: number }>
}

export interface LocalHistoryEntry {
  id: string
  createdAt: string
  score: number
  items: LocalHistoryItem[]
}

export interface StyleProfileSlice {
  name: string
  count: number
  percentage: number
}

export interface StyleProfileColor {
  hex: string
  count: number
}

export interface StyleProfile {
  topStyles: StyleProfileSlice[]
  topColors: StyleProfileColor[]
  topTextures: StyleProfileSlice[]
  avgScore: number
  totalCount: number
  bestScore: number
  bestCombo: string
  /** 평소 한 코디에 사용한 메인 의류 색상 종류 수 평균(중복 제거). */
  avgColorCount: number
}

interface SourcePlacedItem {
  category?: string
  texture?: string
  pattern?: string
  style?: string
  colors?: Array<{ hex?: string; percentage?: number }>
}

const ACCESSORY_CATEGORIES = new Set(['신발', '모자', '악세서리'])

function safeString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function clampHex(hex: string): string {
  if (!hex || typeof hex !== 'string') return ''
  return hex.startsWith('#') ? hex.toLowerCase() : `#${hex.toLowerCase()}`
}

/** PlacedItem → LocalHistoryItem 변환. 색은 hex/percentage만 남겨 용량을 줄인다. */
export function normalizeHistoryItem(item: SourcePlacedItem): LocalHistoryItem {
  const colors: Array<{ hex: string; percentage: number }> = []
  if (Array.isArray(item.colors)) {
    for (const c of item.colors) {
      const hex = clampHex(safeString(c?.hex))
      if (!hex) continue
      const percentage = typeof c?.percentage === 'number' ? c.percentage : 0
      colors.push({ hex, percentage })
    }
  }
  return {
    category: safeString(item.category),
    texture: safeString(item.texture),
    pattern: safeString(item.pattern),
    style: safeString(item.style),
    colors,
  }
}

export function buildEntry(
  beforeItems: SourcePlacedItem[],
  score: number,
): LocalHistoryEntry {
  return {
    id:
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
    createdAt: new Date().toISOString(),
    score: Math.round(score),
    items: beforeItems.map(normalizeHistoryItem),
  }
}

export function readLocalHistory(): LocalHistoryEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is LocalHistoryEntry =>
        e &&
        typeof e === 'object' &&
        typeof e.id === 'string' &&
        typeof e.createdAt === 'string' &&
        typeof e.score === 'number' &&
        Array.isArray(e.items),
    )
  } catch {
    return []
  }
}

export function writeLocalHistory(entries: LocalHistoryEntry[]): void {
  try {
    const sliced = entries.slice(-MAX_ENTRIES)
    localStorage.setItem(LS_KEY, JSON.stringify(sliced))
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent(LS_HISTORY_EVENT))
      } catch {
        /* CustomEvent 미지원 환경은 무시 */
      }
    }
  } catch {
    /* quota 초과 등은 조용히 무시 */
  }
}

export function appendLocalHistory(entry: LocalHistoryEntry): LocalHistoryEntry[] {
  const prev = readLocalHistory()
  const next = [...prev, entry].slice(-MAX_ENTRIES)
  writeLocalHistory(next)
  return next
}

function rank<T extends { count: number }>(arr: T[], n: number): T[] {
  return [...arr].sort((a, b) => b.count - a.count).slice(0, n)
}

function tallySlices(values: string[]): StyleProfileSlice[] {
  const counts = new Map<string, number>()
  let total = 0
  for (const v of values) {
    if (!v) continue
    counts.set(v, (counts.get(v) ?? 0) + 1)
    total += 1
  }
  const list: StyleProfileSlice[] = []
  counts.forEach((count, name) => {
    list.push({
      name,
      count,
      percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    })
  })
  return list
}

function tallyColors(items: LocalHistoryItem[]): StyleProfileColor[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    for (const c of item.colors) {
      if (!c.hex) continue
      counts.set(c.hex, (counts.get(c.hex) ?? 0) + 1)
    }
  }
  const out: StyleProfileColor[] = []
  counts.forEach((count, hex) => out.push({ hex, count }))
  return out
}

/** 메인 의류만 추린 다음, 한 entry당 등장한 재질 set을 만들어 `데님·니트`처럼 묶는다. */
function bestTextureCombo(entries: LocalHistoryEntry[], avgScore: number): string {
  const candidates = entries.filter(
    (e) => e.score >= Math.max(avgScore, 70),
  )
  if (candidates.length === 0) return ''
  const comboCounts = new Map<string, number>()
  let bestPair: { combo: string; score: number; count: number } | null = null

  for (const entry of candidates) {
    const textures = Array.from(
      new Set(
        entry.items
          .filter((it) => !ACCESSORY_CATEGORIES.has(it.category) && it.texture)
          .map((it) => it.texture),
      ),
    ).sort()
    if (textures.length === 0) continue
    const combo = textures.join('·')
    const cnt = (comboCounts.get(combo) ?? 0) + 1
    comboCounts.set(combo, cnt)
    if (!bestPair || cnt > bestPair.count || entry.score > bestPair.score) {
      bestPair = { combo, score: entry.score, count: cnt }
    }
  }

  return bestPair?.combo ?? ''
}

export function computeStyleProfile(entries: LocalHistoryEntry[]): StyleProfile {
  if (entries.length === 0) {
    return {
      topStyles: [],
      topColors: [],
      topTextures: [],
      avgScore: 0,
      totalCount: 0,
      bestScore: 0,
      bestCombo: '',
      avgColorCount: 0,
    }
  }

  const mainItems: LocalHistoryItem[] = []
  for (const entry of entries) {
    for (const item of entry.items) {
      if (ACCESSORY_CATEGORIES.has(item.category)) continue
      mainItems.push(item)
    }
  }

  const topStyles = rank(
    tallySlices(mainItems.map((it) => it.style)),
    3,
  )
  const topTextures = rank(
    tallySlices(mainItems.map((it) => it.texture)),
    3,
  )
  const topColors = rank(tallyColors(mainItems.concat(...entries.flatMap((e) => e.items.filter((it) => ACCESSORY_CATEGORIES.has(it.category))))), 5)

  const scoreSum = entries.reduce((acc, e) => acc + (e.score || 0), 0)
  const avgScore = Math.round((scoreSum / entries.length) * 10) / 10
  const bestScore = entries.reduce((acc, e) => Math.max(acc, e.score || 0), 0)
  const bestCombo = bestTextureCombo(entries, avgScore)

  // 각 entry의 메인 의류에서 사용된 색상 종류 수(중복 제거)의 평균
  let colorCountSum = 0
  let colorEntryCount = 0
  for (const entry of entries) {
    const set = new Set<string>()
    for (const it of entry.items) {
      if (ACCESSORY_CATEGORIES.has(it.category)) continue
      for (const c of it.colors) if (c.hex) set.add(c.hex)
    }
    if (set.size > 0) {
      colorCountSum += set.size
      colorEntryCount += 1
    }
  }
  const avgColorCount =
    colorEntryCount > 0
      ? Math.round((colorCountSum / colorEntryCount) * 10) / 10
      : 0

  return {
    topStyles,
    topColors,
    topTextures,
    avgScore,
    totalCount: entries.length,
    bestScore,
    bestCombo,
    avgColorCount,
  }
}

export interface PersonalizationContext {
  /** 새 분석에 사용된 메인 아이템 스타일 */
  currentStyles: string[]
  /** 새 분석에 사용된 메인 아이템 색상(중복 제거된 hex 목록). 선택사항. */
  currentColors?: string[]
}

export type PersonalizationKey =
  | 'best'
  | 'above-avg'
  | 'below-avg'
  | 'different-style'
  | 'more-colors'
  | 'fewer-colors'

export interface PersonalizationLine {
  key: PersonalizationKey
  text: string
}

/**
 * 현재 분석 점수·스타일이 프로필 대비 어떤 한 줄 피드백을 받을지 결정.
 * - 히스토리 0이면 null.
 * - 우선순위: best > below-avg(점수차) > above-avg(점수차) > different-style > 색상 수 비교.
 */
export function pickPersonalizationLine(
  profile: StyleProfile,
  score: number | null | undefined,
  context: PersonalizationContext,
): PersonalizationLine | null {
  if (profile.totalCount === 0) return null
  if (score == null || !Number.isFinite(score)) return null

  if (profile.bestScore > 0 && score >= profile.bestScore) {
    return { key: 'best', text: '최고 점수예요!' }
  }

  // 점수가 평소보다 의미 있게 낮으면 점수 차이를 명시한다.
  if (profile.avgScore > 0) {
    const diff = Math.round(profile.avgScore - score)
    if (diff >= 5) {
      return {
        key: 'below-avg',
        text: `평소 코디보다 ${diff}점 낮아요`,
      }
    }
    if (diff <= -5) {
      return {
        key: 'above-avg',
        text: `평소보다 ${Math.abs(diff)}점 높은 코디예요 ✓`,
      }
    }
  }

  const topStyle = profile.topStyles[0]?.name
  if (topStyle) {
    const currentSet = Array.from(
      new Set(context.currentStyles.filter(Boolean)),
    )
    if (currentSet.length > 0 && !currentSet.includes(topStyle)) {
      const mixed = currentSet[0]
      return {
        key: 'different-style',
        text: `평소 ${topStyle} 스타일인데 이번엔 ${mixed}가 섞였어요`,
      }
    }
  }

  // 색상 수 비교 (메인 의류 기준 hex 종류 수)
  if (
    profile.avgColorCount > 0 &&
    context.currentColors &&
    context.currentColors.length > 0
  ) {
    const currentCount = new Set(context.currentColors.filter(Boolean)).size
    const colorDiff = currentCount - profile.avgColorCount
    if (colorDiff >= 1.5) {
      return { key: 'more-colors', text: '평소보다 색상 수가 많아요' }
    }
    if (colorDiff <= -1.5) {
      return { key: 'fewer-colors', text: '평소보다 색상 수가 적어요' }
    }
  }

  return null
}
