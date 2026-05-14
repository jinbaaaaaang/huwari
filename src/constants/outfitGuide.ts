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
