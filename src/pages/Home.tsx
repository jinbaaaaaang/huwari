import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import ItemPlacementArea from '../components/ItemPlacementArea'
import { OUTFIT_GUIDE, accessoryLeftOccupied } from '../constants/outfitGuide'

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
  category?: string
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

const LS_ITEMS = 'currentItems'
const LS_LOAD_HISTORY = 'loadHistoryItems'
const LS_HARMONY_CACHE = 'huwari_harmony_cache'
const LS_INPUT_MODE = 'huwari_input_mode'

function itemSignature(items: PlacedItem[]) {
  return [...items].map((i) => i.id).sort().join('\0')
}

function readHarmonyCacheForItems(items: PlacedItem[]): HarmonyScore | null {
  if (items.length === 0) return null
  try {
    const raw = localStorage.getItem(LS_HARMONY_CACHE)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { signature?: string; harmonyScore?: HarmonyScore }
    if (parsed.signature === itemSignature(items) && parsed.harmonyScore) {
      return parsed.harmonyScore
    }
  } catch {
    /* ignore */
  }
  return null
}

/** localStorage만 읽고 키는 건드리지 않음(Strict/이펙트 순서 안전) */
function readInitialBeforeItemsFromStorage(): PlacedItem[] {
  if (typeof window === 'undefined') return []
  try {
    const pending = localStorage.getItem(LS_LOAD_HISTORY)
    if (pending) {
      const parsed = JSON.parse(pending) as PlacedItem[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
    const saved = localStorage.getItem(LS_ITEMS)
    if (saved) {
      const parsed = JSON.parse(saved) as PlacedItem[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    /* ignore */
  }
  return []
}

/** 피드백 패널에 기본으로 보이는 기니피그(행) 개수 */
const FEEDBACK_MIN_ROWS = 4

function Home() {
  const location = useLocation()
  const navigate = useNavigate()
  const [inputMode, setInputMode] = useState<'upload' | 'webcam'>(() => {
    try {
      const m = localStorage.getItem(LS_INPUT_MODE)
      if (m === 'webcam' || m === 'upload') return m
    } catch {
      /* ignore */
    }
    return 'upload'
  })
  const [beforeItems, setBeforeItems] = useState<PlacedItem[]>(readInitialBeforeItemsFromStorage)
  const [afterItems] = useState<PlacedItem[]>([])
  const [harmonyScore, setHarmonyScore] = useState<HarmonyScore | null>(null)
  const [isLoadingHarmony, setIsLoadingHarmony] = useState(false)
  const [isCameraOn, setIsCameraOn] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [webcamError, setWebcamError] = useState('')
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null)
  const webcamStreamRef = useRef<MediaStream | null>(null)
  const beforeItemsRef = useRef<PlacedItem[]>([])
  beforeItemsRef.current = beforeItems

  // 라우터 state 복원 + loadHistoryItems 키 정리·LS 동기화(초기 state는 lazy read로 이미 채워질 수 있음)
  useLayoutEffect(() => {
    const navState = location.state as { restoreBeforeItems?: PlacedItem[] } | null | undefined
    const fromNav = navState?.restoreBeforeItems
    if (fromNav && Array.isArray(fromNav) && fromNav.length > 0) {
      setBeforeItems(fromNav)
      localStorage.setItem(LS_ITEMS, JSON.stringify(fromNav))
      localStorage.removeItem(LS_LOAD_HISTORY)
      const cached = readHarmonyCacheForItems(fromNav)
      if (cached) setHarmonyScore(cached)
      navigate(location.pathname, { replace: true, state: {} })
      return
    }

    const loadHistoryItems = localStorage.getItem(LS_LOAD_HISTORY)
    if (loadHistoryItems) {
      try {
        const items = JSON.parse(loadHistoryItems) as PlacedItem[]
        if (Array.isArray(items) && items.length > 0) {
          setBeforeItems(items)
          localStorage.removeItem(LS_LOAD_HISTORY)
          localStorage.setItem(LS_ITEMS, JSON.stringify(items))
          const cached = readHarmonyCacheForItems(items)
          if (cached) setHarmonyScore(cached)
        }
      } catch (error) {
        console.error('히스토리 불러오기 오류:', error)
        localStorage.removeItem(LS_LOAD_HISTORY)
      }
    }
  }, [location.pathname, location.key, location.state, navigate])

  useEffect(() => {
    try {
      localStorage.setItem(LS_INPUT_MODE, inputMode)
    } catch {
      /* ignore */
    }
  }, [inputMode])

  // beforeItems 변경 시 localStorage에 저장 (초기화 버튼을 누르지 않는 한 유지)
  useEffect(() => {
    if (beforeItems.length > 0) {
      localStorage.setItem(LS_ITEMS, JSON.stringify(beforeItems))
    } else {
      try {
        if (localStorage.getItem(LS_LOAD_HISTORY)) return
      } catch {
        /* ignore */
      }
      localStorage.removeItem(LS_ITEMS)
      localStorage.removeItem(LS_HARMONY_CACHE)
    }
  }, [beforeItems])

  // lazy 초기화로만 아이템이 채워진 경우(LS 복원) 조화 캐시 복원
  useEffect(() => {
    if (beforeItems.length === 0) return
    setHarmonyScore((prev) => {
      if (prev != null) return prev
      return readHarmonyCacheForItems(beforeItems) ?? prev
    })
  }, [beforeItems])

  useEffect(() => {
    if (!harmonyScore) return
    const items = beforeItemsRef.current
    if (items.length === 0) return
    try {
      localStorage.setItem(
        LS_HARMONY_CACHE,
        JSON.stringify({
          signature: itemSignature(items),
          harmonyScore,
        })
      )
    } catch {
      /* ignore */
    }
  }, [harmonyScore])

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

    beforeItems.forEach((item) => {
      if (item.colors && item.colors.length > 0) {
        item.colors.forEach((color) => {
          allColors.push({
            hex: color.hex,
            percentage: color.percentage,
            rgb: color.rgb,
          })
        })
      }
    })

    if (allColors.length === 0) {
      return []
    }

    const colorMap = new Map<string, { hex: string; totalPercentage: number; rgb: number[] }>()

    allColors.forEach((color) => {
      const existing = colorMap.get(color.hex)
      if (existing) {
        existing.totalPercentage += color.percentage
      } else {
        colorMap.set(color.hex, {
          hex: color.hex,
          totalPercentage: color.percentage,
          rgb: color.rgb,
        })
      }
    })

    return Array.from(colorMap.values())
      .sort((a, b) => b.totalPercentage - a.totalPercentage)
      .slice(0, 5)
  }, [beforeItems])

  const feedbackRows = useMemo(() => {
    if (isLoadingHarmony) {
      return Array.from({ length: FEEDBACK_MIN_ROWS }, (_, i) => ({
        id: `loading-${i}`,
        text: i === 0 ? '코디를 분석하는 중입니다…' : null,
      }))
    }
    const reasons = harmonyScore?.reasons ?? []
    if (reasons.length === 0) {
      return Array.from({ length: FEEDBACK_MIN_ROWS }, (_, i) => ({
        id: `idle-${i}`,
        text:
          i === 0
            ? '코디 이미지를 올리면 피드백이 여기에 표시됩니다.'
            : null,
      }))
    }
    const n = Math.max(FEEDBACK_MIN_ROWS, reasons.length)
    return Array.from({ length: n }, (_, i) => ({
      id: `reason-${i}`,
      text: reasons[i] ?? null,
    }))
  }, [isLoadingHarmony, harmonyScore?.reasons])

  // 조화 점수 계산 API 호출 (debounce)
  useEffect(() => {
    // 이전 타이머 취소
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Before 아이템이 없으면 점수 표시 안 함
    if (beforeItems.length === 0) {
      setHarmonyScore(null)
      setIsLoadingHarmony(false)
      return
    }

    // 400ms debounce (복원 직후에는 로딩 표시를 지연해 캐시 점수가 보이게 함)
    debounceTimerRef.current = setTimeout(async () => {
      setIsLoadingHarmony(true)
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

  // 조화 상태 영역 전용: 점수 구간별 표정 (0~39 화남, 40~69 보통, 70~100 행복). 피드백 줄 기니는 항상 normal.
  const getHarmonyStateCharacterImage = () => {
    if (!harmonyScore) return '/assets/normal_gini.svg'

    const score = harmonyScore.score_total
    if (score < 40) {
      return '/assets/angry_gini.svg'
    }
    if (score < 70) {
      return '/assets/normal_gini.svg'
    }
    return '/assets/happy_gini.svg'
  }

  const stopWebcam = () => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach(track => track.stop())
      webcamStreamRef.current = null
    }
    if (webcamVideoRef.current) {
      webcamVideoRef.current.srcObject = null
    }
    setIsCameraOn(false)
  }

  const startWebcam = async () => {
    try {
      setWebcamError('')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false
      })
      webcamStreamRef.current = stream
      setIsCameraOn(true)
    } catch (error) {
      console.error('웹캠 시작 오류:', error)
      setWebcamError('웹캠을 사용할 수 없습니다. 브라우저 권한을 확인해주세요.')
    }
  }

  const getPositionByClothingType = (clothingType: string, items: PlacedItem[]) => {
    if (clothingType === '악세서리') {
      const slot = accessoryLeftOccupied(items)
        ? OUTFIT_GUIDE.악세서리_우
        : OUTFIT_GUIDE.악세서리_왼
      return { x: slot.x, y: slot.y, width: slot.width, height: slot.height }
    }
    const main: Record<string, (typeof OUTFIT_GUIDE)['모자']> = {
      모자: OUTFIT_GUIDE.모자,
      상의: OUTFIT_GUIDE.상의,
      하의: OUTFIT_GUIDE.하의,
      신발: OUTFIT_GUIDE.신발,
    }
    const s = main[clothingType] ?? OUTFIT_GUIDE.악세서리_왼
    return { x: s.x, y: s.y, width: s.width, height: s.height }
  }

  const extractColorsAsync = async (base64Image: string, itemId: string) => {
    try {
      if (!base64Image || !base64Image.includes(',')) return
      const base64Data = base64Image.split(',')[1]
      const byteCharacters = atob(base64Data)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: 'image/png' })
      const colorFormData = new FormData()
      colorFormData.append('file', blob, 'webcam-capture.png')

      const colorResponse = await fetch('/api/extract-colors', {
        method: 'POST',
        body: colorFormData,
      })
      if (!colorResponse.ok) return

      const colorData = await colorResponse.json()
      if (!colorData.success || !Array.isArray(colorData.colors)) return

      const extractedColors = colorData.colors.map((c: any) => ({
        rgb: c.rgb || [0, 0, 0],
        hex: c.hex || '#000000',
        percentage: c.percentage || 0,
      }))

      setBeforeItems(prevItems =>
        prevItems.map(item =>
          item.id === itemId ? { ...item, colors: extractedColors } : item
        )
      )
    } catch (error) {
      console.error('웹캠 색상 추출 오류:', error)
    }
  }

  const analyzeFashionAttributesAsync = async (file: File, itemId: string) => {
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/classify-fashion-attributes', {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) return

      const data = await response.json()
      if (!data.success || !data.texture || !data.pattern || !data.style) return

      setBeforeItems(prevItems =>
        prevItems.map(item =>
          item.id === itemId
            ? {
                ...item,
                texture: data.texture.class,
                pattern: data.pattern.class,
                style: data.style.class
              }
            : item
        )
      )
    } catch (error) {
      console.error('웹캠 속성 분석 오류:', error)
    }
  }

  const captureFromWebcam = async () => {
    if (!webcamVideoRef.current || !isCameraOn) return
    try {
      setIsCapturing(true)
      setWebcamError('')

      const video = webcamVideoRef.current
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 1280
      canvas.height = video.videoHeight || 720
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('캔버스 컨텍스트 생성 실패')

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95))
      if (!blob) throw new Error('캡처 이미지 생성 실패')
      const captureFile = new File([blob], `webcam-${Date.now()}.jpg`, { type: 'image/jpeg' })

      const classifyFormData = new FormData()
      classifyFormData.append('file', captureFile)
      const bgFormData = new FormData()
      bgFormData.append('file', captureFile)

      const [classifyResponse, bgResponse] = await Promise.all([
        fetch('/api/classify-clothing-type', { method: 'POST', body: classifyFormData }),
        fetch('/api/remove-background', { method: 'POST', body: bgFormData })
      ])

      if (!classifyResponse.ok || !bgResponse.ok) {
        throw new Error('웹캠 이미지 분석 API 호출 실패')
      }

      const classifyData = await classifyResponse.json()
      const bgData = await bgResponse.json()
      if (!classifyData.success || !bgData.success || !bgData.image) {
        throw new Error(classifyData.error || bgData.error || '분석 실패')
      }

      const clothingType = classifyData.clothing_type || '악세서리'
      const itemId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const position = getPositionByClothingType(clothingType, beforeItems)
      const newItem: PlacedItem = {
        id: itemId,
        imageUrl: bgData.image,
        x: position.x,
        y: position.y,
        width: position.width,
        height: position.height,
      }

      setBeforeItems(prev => [...prev, newItem])
      Promise.all([
        extractColorsAsync(bgData.image, itemId),
        analyzeFashionAttributesAsync(captureFile, itemId)
      ]).catch(error => console.error('웹캠 후처리 오류:', error))
    } catch (error) {
      console.error('웹캠 캡처 오류:', error)
      setWebcamError('캡처 처리 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsCapturing(false)
    }
  }

  useEffect(() => {
    if (inputMode !== 'webcam') {
      stopWebcam()
    }
  }, [inputMode])

  useEffect(() => {
    const attachStreamToVideo = async () => {
      if (!isCameraOn || !webcamVideoRef.current || !webcamStreamRef.current) return
      try {
        webcamVideoRef.current.srcObject = webcamStreamRef.current
        await webcamVideoRef.current.play()
      } catch (error) {
        console.error('웹캠 비디오 재생 오류:', error)
        setWebcamError('웹캠 화면 재생에 실패했습니다. 다시 시도해주세요.')
      }
    }
    attachStreamToVideo()
  }, [isCameraOn])

  useEffect(() => {
    return () => stopWebcam()
  }, [])
  
  return (
    <Layout>
      <div className="h-screen flex flex-col">
        {/* 상단: Before 섹션과 분석 결과 */}
        <div className="grid grid-cols-2 flex-1 min-h-0">
          {/* 왼쪽: 기존 패션 아이템 */}
          <div className="bg-[#FAFAF8] border-r border-secondary flex flex-col">
            <div className="p-6 flex items-center justify-between border-b border-secondary translate-y-[1.375px]">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setInputMode('upload')}
                  className={`text-xs font-regular uppercase tracking-wider inline-block px-3 py-1 border border-secondary rounded-full hover:bg-secondary hover:text-cream transition-all ${
                    inputMode === 'upload' ? 'bg-secondary text-cream' : 'text-secondary'
                  }`}
                >
                  코디 업로드
                </button>
                <button
                  onClick={() => setInputMode('webcam')}
                  className={`text-xs font-regular uppercase tracking-wider inline-block px-3 py-1 border border-secondary rounded-full hover:bg-secondary hover:text-cream transition-all ${
                    inputMode === 'webcam' ? 'bg-secondary text-cream' : 'text-secondary'
                  }`}
                >
                  웹캠
                </button>
              </div>
            </div>
            
            {/* 코디 업로드 / 웹캠 전환 영역 */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 min-h-0">
                {inputMode === 'upload' ? (
                  <ItemPlacementArea
                    key="before-upload"
                    buttonText="이미지 업로드"
                    buttonIcon="upload"
                    instructionText="이미지를 업로드하면<br />자동으로 배치됩니다"
                    containerId="item-container-before"
                    onItemsChange={setBeforeItems}
                    onReset={() => {
                      setBeforeItems([])
                      localStorage.removeItem(LS_ITEMS)
                      localStorage.removeItem(LS_HARMONY_CACHE)
                    }}
                    harmonyScore={harmonyScore}
                    initialItems={beforeItems}
                  />
                ) : (
                  <div className="h-full p-6 flex flex-col">
                    <div className="flex-1 border border-secondary rounded-2xl flex flex-col items-center justify-center gap-4">
                      {isCameraOn ? (
                        <video
                          ref={webcamVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-contain rounded-2xl -scale-x-100"
                        />
                      ) : (
                        <>
                          <div className="w-16 h-16 rounded-full border border-secondary flex items-center justify-center">
                            <svg className="w-7 h-7 text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5a2.5 2.5 0 012.5-2.5h7a2.5 2.5 0 012.5 2.5v1.2l3.4-2.3A1 1 0 0120 7.2v9.6a1 1 0 01-1.6.8L15 15.3v1.2a2.5 2.5 0 01-2.5 2.5h-7A2.5 2.5 0 013 16.5v-9z" />
                            </svg>
                          </div>
                          <p className="text-xs text-secondary text-center leading-relaxed">
                            카메라를 켜면 실시간 화면이 표시됩니다.<br />
                            캡처한 이미지는 코디 업로드 영역에 자동 반영됩니다.
                          </p>
                        </>
                      )}
                    </div>
                    {webcamError && (
                      <p className="mt-3 text-xs text-red-500 text-center">{webcamError}</p>
                    )}
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        onClick={isCameraOn ? stopWebcam : startWebcam}
                        className="px-4 py-2 border border-secondary rounded-full text-xs text-secondary uppercase tracking-wider hover:bg-secondary hover:text-cream transition-all"
                      >
                        {isCameraOn ? '카메라 끄기' : '카메라 켜기'}
                      </button>
                      <button
                        onClick={captureFromWebcam}
                        disabled={!isCameraOn || isCapturing}
                        className="px-4 py-2 border border-secondary rounded-full text-xs text-secondary uppercase tracking-wider hover:bg-secondary hover:text-cream transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isCapturing ? '처리 중...' : '캡처'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 분석 결과 */}
            <div className="bg-[#FAFAF8] p-4 border-t border-secondary h-[260px] overflow-y-auto scrollbar-thin shrink-0">
              <h4 className="text-xs font-regular text-secondary mb-4 uppercase tracking-wider inline-block px-3 py-1 border border-secondary rounded-full">분석 결과</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#FAFAF8] p-3 flex flex-col">
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
                <div className="bg-[#FAFAF8] p-3 flex flex-col">
                  <div className="text-xs text-secondary mb-2 uppercase tracking-wider">재질</div>
                  <div className="flex flex-wrap gap-1 min-h-[28px] items-center">
                    {beforeFashionAttributes.allTextures && beforeFashionAttributes.allTextures.length > 0 ? (
                      beforeFashionAttributes.allTextures.map((texture, idx) => (
                        <span
                          key={idx}
                          className={`text-xs px-3 py-1 border border-secondary rounded-full ${
                            texture === beforeFashionAttributes.texture
                              ? 'bg-secondary text-cream'
                              : 'bg-[#FAFAF8] text-secondary'
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
                <div className="bg-[#FAFAF8] p-3 flex flex-col">
                  <div className="text-xs text-secondary mb-2 uppercase tracking-wider">패턴</div>
                  <div className="flex flex-wrap gap-1 min-h-[28px] items-center">
                    {beforeFashionAttributes.allPatterns && beforeFashionAttributes.allPatterns.length > 0 ? (
                      beforeFashionAttributes.allPatterns.map((pattern, idx) => (
                        <span
                          key={idx}
                          className={`text-xs px-3 py-1 border border-secondary rounded-full ${
                            pattern === beforeFashionAttributes.pattern
                              ? 'bg-secondary text-cream'
                              : 'bg-[#FAFAF8] text-secondary'
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
                <div className="bg-[#FAFAF8] p-3 flex flex-col">
                  <div className="text-xs text-secondary mb-2 uppercase tracking-wider">스타일</div>
                  <div className="flex flex-wrap gap-1 min-h-[28px] items-center">
                    {beforeFashionAttributes.allStyles && beforeFashionAttributes.allStyles.length > 0 ? (
                      beforeFashionAttributes.allStyles.map((style, idx) => (
                        <span
                          key={idx}
                          className={`text-xs px-3 py-1 border border-secondary rounded-full ${
                            style === beforeFashionAttributes.style
                              ? 'bg-secondary text-cream'
                              : 'bg-[#FAFAF8] text-secondary'
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
          <div className="bg-[#FAFAF8] flex flex-col min-h-0">
            <div className="p-6 flex items-center justify-between border-b border-secondary translate-y-[1.375px] shrink-0">
              <h3 className="text-xs font-regular text-secondary uppercase tracking-wider inline-block px-3 py-1 border border-secondary rounded-full">코디 평가</h3>
            </div>
            
            {/* 피드백(위) + 점수/조화(아래 260px) — 왼쪽 분석 결과 패널과 높이·구분선 정렬 */}
            <div className="flex-1 flex flex-col min-h-0">
              {/* 피드백 */}
              <div className="flex-1 min-h-0 flex flex-col bg-[#FAFAF8]">
                <div className="shrink-0 px-4 pt-4 pb-2">
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 pb-5">
                  <div className="min-h-full flex flex-col justify-center py-4">
                    <div className="space-y-4">
                    {feedbackRows.map((row) => {
                      const hasText = row.text != null && row.text !== ''
                      return (
                        <div key={row.id} className="flex items-start gap-4">
                          <div className="flex-shrink-0 pt-0.5">
                            <img
                              src="/assets/normal_gini.svg"
                              alt="Gini"
                              className="w-[72px] h-[72px]"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement
                                target.src = '/assets/normal_gini.svg'
                              }}
                            />
                          </div>
                          <div className="flex-1 min-w-0 relative pt-1">
                            <div
                              className={`rounded-xl relative px-4 py-3.5 ${
                                hasText
                                  ? 'bg-[#FAFAF8] border border-secondary shadow-sm'
                                  : 'border border-dashed border-secondary/30 bg-[#FAFAF8]/80'
                              }`}
                            >
                              {hasText ? (
                                <p className="text-sm text-secondary leading-relaxed">
                                  {row.text}
                                </p>
                              ) : (
                                <p className="text-sm text-secondary/25 leading-relaxed min-h-[1.375rem]">
                                  &nbsp;
                                </p>
                              )}
                              {hasText && (
                                <div className="absolute left-0 top-5 -ml-2">
                                  <div className="w-3 h-3 bg-[#FAFAF8] border-l border-b border-secondary transform rotate-45" />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    </div>
                  </div>
                </div>
              </div>

              {/* 조화 점수와 캐릭터 — 왼쪽 분석 결과와 동일 h·border-t */}
              <div className="h-[260px] shrink-0 border-t border-secondary bg-[#FAFAF8] p-4 overflow-hidden flex flex-col justify-center">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#FAFAF8] p-3 flex flex-col items-center justify-center">
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

                  <div className="bg-[#FAFAF8] p-3 flex flex-col items-center justify-center">
                    <div className="w-28 h-28 bg-secondary flex items-center justify-center rounded-full mb-2">
                      <img
                        src={getHarmonyStateCharacterImage()}
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
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}

export default Home


