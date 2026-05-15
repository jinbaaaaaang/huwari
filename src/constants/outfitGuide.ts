/**
 * 코디 캔버스: 점선 가이드 박스와 업로드 시 자동 배치 좌표를 동일하게 유지
 * (left/top % + translate(-50%,0) 기준 — ItemPlacementArea 배치 아이템과 동일)
 */
export type OutfitGuideSlot = {
  x: number
  y: number
  width: number
  height: number
  label: string
}

export const OUTFIT_GUIDE: {
  모자: OutfitGuideSlot
  상의: OutfitGuideSlot
  하의: OutfitGuideSlot
  신발: OutfitGuideSlot
  악세서리_왼: OutfitGuideSlot
  악세서리_우: OutfitGuideSlot
} = {
  모자: { x: 50, y: 18, width: 96, height: 64, label: '모자' },
  상의: { x: 50, y: 34, width: 144, height: 112, label: '상의' },
  하의: { x: 50, y: 60, width: 128, height: 190, label: '하의' },
  신발: { x: 50, y: 105, width: 100, height: 48, label: '신발' },
  /** 가이드 left-[20%] 박스(96px) 중심에 가깝게 */
  악세서리_왼: { x: 27, y: 53, width: 96, height: 96, label: '악세서리' },
  /** 가이드 right-[20%] 박스 중심에 가깝게 */
  악세서리_우: { x: 73, y: 53, width: 96, height: 96, label: '악세서리' },
}

export function accessoryLeftOccupied(
  items: { x: number; y: number }[],
  tol = 0.5
): boolean {
  const { x, y } = OUTFIT_GUIDE.악세서리_왼
  return items.some((it) => Math.abs(it.x - x) < tol && Math.abs(it.y - y) < tol)
}

/** 서버 `predict-harmony`와 동일 — 이 카테고리는 UI에서 재질·패턴·스타일을 숨기고 색만 표시 */
export const ACCESSORY_CATEGORIES = ['신발', '모자', '악세서리'] as const

export function isAccessoryCategory(category: string | undefined): boolean {
  if (!category) return false
  return (ACCESSORY_CATEGORIES as readonly string[]).includes(category)
}

/** 배치 아이템·가이드와 동일: left/top은 %, translate(-50%,0), 높이·너비는 px */
export type CanvasPlacedLike = {
  x: number
  y: number
  width: number
  height: number
}

const GUIDE_INFER_KEYS = [
  '모자',
  '상의',
  '하의',
  '신발',
  '악세서리_왼',
  '악세서리_우',
] as const satisfies readonly (keyof typeof OUTFIT_GUIDE)[]

function slotBoundsPx(slot: OutfitGuideSlot, W: number, H: number) {
  const left = (slot.x / 100) * W - slot.width / 2
  const top = (slot.y / 100) * H
  return {
    left,
    top,
    right: left + slot.width,
    bottom: top + slot.height,
  }
}

function distSqPointToRect(
  px: number,
  py: number,
  b: { left: number; top: number; right: number; bottom: number }
): number {
  const dx = px < b.left ? b.left - px : px > b.right ? px - b.right : 0
  const dy = py < b.top ? b.top - py : py > b.bottom ? py - b.bottom : 0
  return dx * dx + dy * dy
}

export type InferredClothingCategory = '모자' | '상의' | '하의' | '신발' | '악세서리'

/**
 * 아이템 박스 중심이 가이드 슬롯에 가장 가까우면 해당 의류 구역으로 분류.
 * 슬롯 밖이면 스냅 거리 이내일 때만 바꾸고, 그보다 멀면 null (기존 category 유지).
 */
export function inferCategoryFromCanvasPosition(
  item: CanvasPlacedLike,
  containerWidth: number,
  containerHeight: number
): InferredClothingCategory | null {
  const W = containerWidth
  const H = containerHeight
  if (W <= 0 || H <= 0) return null

  const cx = (item.x / 100) * W
  const cy = (item.y / 100) * H + item.height / 2

  const maxSnapPx = Math.max(44, Math.min(W, H) * 0.07)
  const maxSnapSq = maxSnapPx * maxSnapPx

  const distByCategory = new Map<InferredClothingCategory, number>()
  for (const key of GUIDE_INFER_KEYS) {
    const slot = OUTFIT_GUIDE[key]
    const b = slotBoundsPx(slot, W, H)
    const distSq = distSqPointToRect(cx, cy, b)
    const cat: InferredClothingCategory =
      key === '악세서리_왼' || key === '악세서리_우' ? '악세서리' : key
    const prev = distByCategory.get(cat)
    if (prev === undefined || distSq < prev) {
      distByCategory.set(cat, distSq)
    }
  }

  let best: InferredClothingCategory | null = null
  let bestSq = Infinity
  for (const [cat, distSq] of distByCategory) {
    if (distSq < bestSq) {
      bestSq = distSq
      best = cat
    }
  }

  if (best === null || bestSq > maxSnapSq) return null
  return best
}
