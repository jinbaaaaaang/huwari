import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import ItemPlacementArea from '../components/ItemPlacementArea'
import CustomSelect from '../components/CustomSelect'
import {
  MATERIAL_CLASS_OPTIONS,
  PATTERN_CLASS_OPTIONS,
  STYLE_CLASS_OPTIONS,
} from '../constants/fashionClassOptions'
import { OUTFIT_GUIDE, accessoryLeftOccupied, isAccessoryCategory } from '../constants/outfitGuide'

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

interface WebcamCropItem {
  category: string
  imageBase64: string | null
}

interface WebcamHarmonyResponse {
  success: boolean
  harmony_score?: number
  harmony_sigmoid_raw?: number
  color_score?: number
  reasons?: string[]
  crop_items?: WebcamCropItem[]
  error?: string
}

const LS_ITEMS = 'currentItems'
const LS_LOAD_HISTORY = 'loadHistoryItems'
const LS_HARMONY_CACHE = 'huwari_harmony_cache'
const LS_INPUT_MODE = 'huwari_input_mode'

/** 조화 캐시 키 — id만 쓰면 이미지·종류가 바뀌어도 예전 점수가 계속 맞는 것처럼 남을 수 있음 */
function fingerprintImageUrl(url: string): string {
  if (!url) return '0'
  const len = url.length
  const head = url.slice(0, 48)
  const tail = len > 96 ? url.slice(-48) : ''
  return `${len}:${head}:${tail}`
}

function itemSignature(items: PlacedItem[]) {
  return [...items]
    .map((i) => {
      const fp = fingerprintImageUrl(i.imageUrl ?? '')
      const cat = i.category ?? ''
      const tex = i.texture ?? ''
      const pat = i.pattern ?? ''
      const sty = i.style ?? ''
      const colorKey = (i.colors ?? [])
        .slice(0, 3)
        .map((c) => c.hex)
        .join(',')
      return `${i.id}:${cat}:${tex}:${pat}:${sty}:${colorKey}:${fp}`
    })
    .sort()
    .join('\0')
}

/** 추가·삭제 감지 — id 집합만 비교 */
function itemCompositionSignature(items: PlacedItem[]) {
  return [...items]
    .map((i) => i.id)
    .sort()
    .join('|')
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

/** 웹캠 실시간 조화 분석 주기 (ms) */
const WEBCAM_LIVE_INTERVAL_MS = 5000

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
  const [beforeItems, setBeforeItems] = useState<PlacedItem[]>(() => readInitialBeforeItemsFromStorage())
  const [afterItems] = useState<PlacedItem[]>([])
  const [harmonyScore, setHarmonyScore] = useState<HarmonyScore | null>(() => {
    const items = readInitialBeforeItemsFromStorage()
    if (items.length === 0) return null
    return readHarmonyCacheForItems(items)
  })
  const [isLoadingHarmony, setIsLoadingHarmony] = useState(false)
  const [isCameraOn, setIsCameraOn] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [webcamError, setWebcamError] = useState('')
  const [webcamLiveScore, setWebcamLiveScore] = useState<number | null>(null)
  const [webcamVideoReady, setWebcamVideoReady] = useState(false)
  const [isWebcamLiveLoading, setIsWebcamLiveLoading] = useState(false)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null)
  const webcamStreamRef = useRef<MediaStream | null>(null)
  const webcamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const webcamAnalyzingRef = useRef(false)
  const isCameraOnRef = useRef(false)
  const inputModeRef = useRef(inputMode)
  inputModeRef.current = inputMode
  isCameraOnRef.current = isCameraOn
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
      try {
        localStorage.setItem(LS_ITEMS, JSON.stringify(beforeItems))
      } catch {
        // 배경 제거 PNG(base64) 3장 이상이면 5MB 한도 초과 가능 — 메타만 저장해 앱이 깨지지 않게 함
        try {
          const metaOnly = beforeItems.map(({ imageUrl: _img, ...rest }) => rest)
          localStorage.setItem(LS_ITEMS, JSON.stringify(metaOnly))
        } catch {
          /* ignore */
        }
      }
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

  // Before 아이템들의 질감, 패턴, 스타일 정보 종합 (신발·모자·악세서리는 제외 — 색만 사용)
  const beforeFashionAttributes = useMemo(() => {
    const textures: string[] = []
    const patterns: string[] = []
    const styles: string[] = []

    beforeItems.forEach(item => {
      if (isAccessoryCategory(item.category)) return
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

  /** 캔버스가 전부 신발·모자·악세서리일 때 — 우측 분석 패널에서 재질·패턴·스타일 블록 숨김 */
  const accessoryOnlyOutfit = useMemo(
    () =>
      beforeItems.length > 0 &&
      beforeItems.every((i) => isAccessoryCategory(i.category)),
    [beforeItems]
  )

  const beforeMainItemsForEdit = useMemo(
    () => beforeItems.filter((it) => !isAccessoryCategory(it.category)),
    [beforeItems]
  )

  const patchBeforeItemAttr = (
    id: string,
    patch: Partial<Pick<PlacedItem, 'texture' | 'pattern' | 'style'>>
  ) => {
    setBeforeItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }

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

  /** 조화 재계산 — 구성(추가·삭제) + 속성·색·이미지 변경. 위치·크기만 바뀌면 생략 */
  const harmonyInputSig = useMemo(() => itemSignature(beforeItems), [beforeItems])
  const itemCompositionSig = useMemo(
    () => itemCompositionSignature(beforeItems),
    [beforeItems],
  )
  const prevHarmonyInputSigRef = useRef<string | null>(null)
  const prevCompositionSigRef = useRef<string | null>(null)

  const isWebcamLiveActive = inputMode === 'webcam' && isCameraOn
  /** 카메라 ON 동안 항상 표시할 상태 문구 (null이면 점수 줄만 표시) */
  const webcamStatusMessage = useMemo(() => {
    if (!isWebcamLiveActive) return ''
    if (!webcamVideoReady) return '카메라 화면을 준비하는 중입니다…'
    if (isWebcamLiveLoading) return '실시간 코디를 분석하는 중입니다… (수 초 걸릴 수 있어요)'
    if (webcamLiveScore == null) return '실시간 분석을 시작합니다…'
    return ''
  }, [isWebcamLiveActive, webcamVideoReady, isWebcamLiveLoading, webcamLiveScore])

  const feedbackRows = useMemo(() => {
    if (inputMode === 'webcam') {
      if (!isCameraOn) {
        return Array.from({ length: FEEDBACK_MIN_ROWS }, (_, i) => ({
          id: `webcam-hint-${i}`,
          text: i === 0 ? '카메라를 켜면 실시간 조화 분석이 시작됩니다.' : null,
        }))
      }
      const reasons = harmonyScore?.reasons ?? []
      if (reasons.length > 0) {
        const n = Math.max(FEEDBACK_MIN_ROWS, reasons.length)
        return Array.from({ length: n }, (_, i) => ({
          id: `webcam-reason-${i}-${reasons[i] ?? 'empty'}`,
          text: reasons[i] ?? null,
        }))
      }
      if (isWebcamLiveLoading) {
        return Array.from({ length: FEEDBACK_MIN_ROWS }, (_, i) => ({
          id: `webcam-loading-${i}`,
          text: i === 0 ? '실시간 코디를 분석하는 중입니다…' : null,
        }))
      }
      const hint = webcamStatusMessage || '실시간 코디를 분석하는 중입니다…'
      return Array.from({ length: FEEDBACK_MIN_ROWS }, (_, i) => ({
        id: `webcam-hint-${i}`,
        text: i === 0 ? hint : null,
      }))
    }
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
      id: `reason-${i}-${reasons[i] ?? 'empty'}`,
      text: reasons[i] ?? null,
    }))
  }, [
    isLoadingHarmony,
    isWebcamLiveLoading,
    harmonyScore?.reasons,
    webcamStatusMessage,
    inputMode,
    isCameraOn,
  ])

  // 조화 점수·피드백 API (debounce) — 아이템 추가·삭제·속성 변경 시 재생성
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    if (beforeItems.length === 0) {
      prevHarmonyInputSigRef.current = null
      prevCompositionSigRef.current = null
      if (inputMode !== 'webcam' || !isCameraOn) {
        setHarmonyScore(null)
      }
      setIsLoadingHarmony(false)
      return
    }

    const compositionChanged =
      prevCompositionSigRef.current !== itemCompositionSig
    const attrsChanged = prevHarmonyInputSigRef.current !== harmonyInputSig

    // 드래그·리사이즈만 바뀐 경우
    if (!compositionChanged && !attrsChanged) {
      return
    }

    if (compositionChanged) {
      setIsLoadingHarmony(true)
      try {
        localStorage.removeItem(LS_HARMONY_CACHE)
      } catch {
        /* ignore */
      }
    }

    const sigAtRequest = harmonyInputSig
    const compositionAtRequest = itemCompositionSig

    debounceTimerRef.current = setTimeout(async () => {
      const itemsSnapshot = beforeItemsRef.current
      if (itemsSnapshot.length === 0) return

      setIsLoadingHarmony(true)
      try {
        const response = await fetch('/api/predict-harmony', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            beforeItems: itemsSnapshot,
            afterItems,
          }),
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data: HarmonyScore = await response.json()
        setHarmonyScore(data)
        prevHarmonyInputSigRef.current = sigAtRequest
        prevCompositionSigRef.current = compositionAtRequest
      } catch (error) {
        console.error('조화 점수 계산 오류:', error)
      } finally {
        setIsLoadingHarmony(false)
      }
    }, compositionChanged ? 200 : 400)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [beforeItems.length, itemCompositionSig, harmonyInputSig, afterItems, inputMode, isCameraOn])

  // 조화 상태 영역 전용: 점수 구간별 표정 (0~39 화남, 40~69 보통, 70~100 행복). 피드백 줄 기니는 항상 normal.
  const harmonyGiniMood = useMemo((): 'neutral' | 'angry' | 'normal' | 'happy' => {
    if (!harmonyScore) return 'neutral'
    const score = harmonyScore.score_total
    if (score < 40) return 'angry'
    if (score < 70) return 'normal'
    return 'happy'
  }, [harmonyScore])

  const getHarmonyStateCharacterImage = () => {
    switch (harmonyGiniMood) {
      case 'angry':
        return '/assets/angry_gini.svg'
      case 'happy':
        return '/assets/happy_gini.svg'
      case 'neutral':
      case 'normal':
      default:
        return '/assets/normal_gini.svg'
    }
  }

  const harmonyGiniAnimClass =
    harmonyGiniMood === 'happy'
      ? 'animate-harmony-gini-happy'
      : harmonyGiniMood === 'angry'
        ? 'animate-harmony-gini-angry'
        : 'animate-harmony-gini'

  const clearWebcamInterval = () => {
    if (webcamIntervalRef.current) {
      clearInterval(webcamIntervalRef.current)
      webcamIntervalRef.current = null
    }
  }

  const stopWebcam = () => {
    clearWebcamInterval()
    webcamAnalyzingRef.current = false
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach(track => track.stop())
      webcamStreamRef.current = null
    }
    if (webcamVideoRef.current) {
      webcamVideoRef.current.srcObject = null
    }
    setIsCameraOn(false)
    setWebcamLiveScore(null)
    setWebcamVideoReady(false)
    setIsWebcamLiveLoading(false)
  }

  const waitForVideoFrames = (video: HTMLVideoElement) =>
    new Promise<void>(resolve => {
      if (video.readyState >= 2 && video.videoWidth > 0) {
        resolve()
        return
      }
      let settled = false
      const done = () => {
        if (settled || video.videoWidth === 0) return
        settled = true
        video.removeEventListener('loadeddata', done)
        video.removeEventListener('loadedmetadata', done)
        resolve()
      }
      video.addEventListener('loadeddata', done)
      video.addEventListener('loadedmetadata', done)
      window.setTimeout(() => {
        if (!settled) {
          settled = true
          video.removeEventListener('loadeddata', done)
          video.removeEventListener('loadedmetadata', done)
          resolve()
        }
      }, 4000)
    })

  const startWebcamLiveInterval = () => {
    if (webcamIntervalRef.current) return
    clearWebcamInterval()
    void runLiveWebcamAnalysis()
    webcamIntervalRef.current = setInterval(() => {
      void runLiveWebcamAnalysis()
    }, WEBCAM_LIVE_INTERVAL_MS)
  }

  const onWebcamVideoReady = () => {
    setWebcamVideoReady(true)
    if (inputModeRef.current === 'webcam' && isCameraOnRef.current) {
      startWebcamLiveInterval()
    }
  }

  const captureWebcamFrameBlob = async (): Promise<Blob | null> => {
    const video = webcamVideoRef.current
    if (!video || !isCameraOnRef.current) return null
    if (video.readyState < 2 || video.videoWidth === 0) return null
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  }

  const dataUrlToFile = (dataUrl: string, filename: string): File | null => {
    if (!dataUrl.includes(',')) return null
    const [header, b64] = dataUrl.split(',')
    const mime = header.match(/data:([^;]+)/)?.[1] ?? 'image/png'
    const byteCharacters = atob(b64)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    return new File([new Uint8Array(byteNumbers)], filename, { type: mime })
  }

  const applyWebcamHarmonyToScore = (data: WebcamHarmonyResponse) => {
    if (data.harmony_score == null) return
    const total = data.harmony_score
    const color = data.color_score ?? total
    setWebcamLiveScore(Math.round(total))
    setHarmonyScore(prev => ({
      score_total: total,
      score_color: color,
      score_texture: prev?.score_texture ?? total,
      score_pattern: prev?.score_pattern ?? total,
      score_style: prev?.score_style ?? total,
      reasons: data.reasons ?? [],
      debug: { source: 'webcam-harmony' },
    }))
  }

  const callWebcamHarmony = async (blob: Blob): Promise<WebcamHarmonyResponse | null> => {
    const file = new File([blob], `webcam-${Date.now()}.jpg`, { type: 'image/jpeg' })
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch('/api/webcam-harmony', { method: 'POST', body: formData })
    if (!response.ok) return null
    return response.json() as Promise<WebcamHarmonyResponse>
  }

  const runLiveWebcamAnalysis = async () => {
    if (
      webcamAnalyzingRef.current ||
      !isCameraOnRef.current ||
      inputModeRef.current !== 'webcam'
    ) {
      return
    }
    webcamAnalyzingRef.current = true
    setIsWebcamLiveLoading(true)
    try {
      const blob = await captureWebcamFrameBlob()
      if (!blob) {
        setWebcamError('카메라 프레임을 읽지 못했습니다. 잠시 후 다시 시도합니다.')
        return
      }

      const data = await callWebcamHarmony(blob)
      if (!data?.success) {
        setWebcamError(data?.error || '실시간 분석에 실패했습니다.')
        return
      }
      setWebcamError('')
      applyWebcamHarmonyToScore(data)
    } catch (error) {
      console.error('웹캠 실시간 분석 오류:', error)
      setWebcamError('서버에 연결할 수 없습니다. 백엔드(8000)가 실행 중인지 확인해주세요.')
    } finally {
      webcamAnalyzingRef.current = false
      setIsWebcamLiveLoading(false)
    }
  }

  const startWebcam = async () => {
    try {
      setWebcamError('')
      setWebcamVideoReady(false)
      setWebcamLiveScore(null)
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

      const blob = await captureWebcamFrameBlob()
      if (!blob) throw new Error('캡처 이미지 생성 실패')

      const data = await callWebcamHarmony(blob)
      if (!data?.success) {
        throw new Error(data?.error || '웹캠 분석 실패')
      }

      applyWebcamHarmonyToScore(data)

      const crops = (data.crop_items ?? []).filter(
        (c): c is WebcamCropItem & { imageBase64: string } =>
          Boolean(c.imageBase64) && c.category !== '전체',
      )
      if (crops.length === 0) {
        throw new Error('인식된 의류 영역이 없습니다.')
      }

      let acc = [...beforeItemsRef.current]
      const newItems: PlacedItem[] = []

      for (const crop of crops) {
        const cropFile = dataUrlToFile(
          crop.imageBase64,
          `webcam-${crop.category}-${Date.now()}.png`,
        )
        if (!cropFile) continue

        const bgFormData = new FormData()
        bgFormData.append('file', cropFile)
        const bgResponse = await fetch('/api/remove-background', {
          method: 'POST',
          body: bgFormData,
        })
        if (!bgResponse.ok) continue

        const bgData = await bgResponse.json()
        if (!bgData.success || !bgData.image) continue

        const clothingType = crop.category
        const itemId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const position = getPositionByClothingType(clothingType, acc)
        const newItem: PlacedItem = {
          id: itemId,
          imageUrl: bgData.image,
          x: position.x,
          y: position.y,
          width: position.width,
          height: position.height,
          category: clothingType,
        }
        acc = [...acc, newItem]
        newItems.push(newItem)

        const postTasks: Promise<void>[] = [extractColorsAsync(bgData.image, itemId)]
        if (!isAccessoryCategory(clothingType)) {
          postTasks.push(analyzeFashionAttributesAsync(cropFile, itemId))
        }
        Promise.all(postTasks).catch(error => console.error('웹캠 후처리 오류:', error))
      }

      if (newItems.length === 0) {
        throw new Error('아이템 추가에 실패했습니다.')
      }

      setBeforeItems(acc)
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
    if (!isCameraOn || inputMode !== 'webcam') {
      clearWebcamInterval()
      if (!isCameraOn) {
        setWebcamLiveScore(null)
        setWebcamVideoReady(false)
      }
      return
    }
    return () => clearWebcamInterval()
  }, [isCameraOn, inputMode])

  useEffect(() => {
    const attachStreamToVideo = async () => {
      if (!isCameraOn || !webcamVideoRef.current || !webcamStreamRef.current) return
      try {
        setWebcamError('')
        const video = webcamVideoRef.current
        video.srcObject = webcamStreamRef.current
        await video.play()
        await waitForVideoFrames(video)
        onWebcamVideoReady()
      } catch (error) {
        console.error('웹캠 비디오 재생 오류:', error)
        setWebcamError('웹캠 화면 재생에 실패했습니다. 다시 시도해주세요.')
      }
    }
    attachStreamToVideo()
  }, [isCameraOn, inputMode])

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
                  <div className="h-full min-h-0 p-6 flex flex-col gap-3">
                    <div className="flex-1 min-h-0 border border-secondary rounded-2xl overflow-hidden bg-[#FAFAF8] relative">
                      {isCameraOn ? (
                        <video
                          ref={webcamVideoRef}
                          autoPlay
                          playsInline
                          muted
                          onLoadedData={onWebcamVideoReady}
                          className="absolute inset-0 w-full h-full object-cover -scale-x-100"
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-4">
                          <div className="w-16 h-16 rounded-full border border-secondary flex items-center justify-center">
                            <svg className="w-7 h-7 text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5a2.5 2.5 0 012.5-2.5h7a2.5 2.5 0 012.5 2.5v1.2l3.4-2.3A1 1 0 0120 7.2v9.6a1 1 0 01-1.6.8L15 15.3v1.2a2.5 2.5 0 01-2.5 2.5h-7A2.5 2.5 0 013 16.5v-9z" />
                            </svg>
                          </div>
                          <p className="text-xs text-secondary text-center leading-relaxed">
                            카메라를 켜면 실시간 화면이 표시됩니다.<br />
                            캡처한 이미지는 코디 업로드 영역에 자동 반영됩니다.
                          </p>
                        </div>
                      )}
                    </div>
                    <div
                      id="webcam-live-status"
                      className="shrink-0 py-2 text-center text-sm leading-relaxed text-secondary"
                      role="status"
                      aria-live="polite"
                    >
                      {!isCameraOn ? (
                        <p>카메라를 켜면 실시간 조화 분석이 시작됩니다.</p>
                      ) : (
                        <>
                          <p>{webcamStatusMessage || '분석 중…'}</p>
                          <p className="mt-1 font-medium">
                            실시간 조화도:{' '}
                            {webcamLiveScore != null ? `${webcamLiveScore}점` : '—'}
                          </p>
                        </>
                      )}
                      {webcamError ? (
                        <p className="mt-1 text-xs text-red-600">{webcamError}</p>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-2 shrink-0">
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
              <div className={`grid gap-3 ${accessoryOnlyOutfit ? 'grid-cols-1' : 'grid-cols-2'}`}>
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
                {!accessoryOnlyOutfit && (
                  <>
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
                {beforeMainItemsForEdit.length > 0 && (
                  <div className="col-span-2 border-t border-secondary/50 pt-3 mt-1 space-y-2.5">
                    <div className="text-[10px] text-secondary uppercase tracking-wider">
                      속성 수정 · 선택 시 점수 자동 재계산
                    </div>
                    {beforeMainItemsForEdit.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center gap-x-2 gap-y-2 border border-secondary/40 rounded-lg p-2 bg-[#FAFAF8]/80"
                      >
                        <div className="flex items-center gap-2 shrink-0">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt=""
                              className="w-9 h-9 object-contain rounded border border-secondary/30 bg-white/50"
                            />
                          ) : null}
                          <span className="text-[10px] text-secondary max-w-[4.5rem] truncate">
                            {item.category ?? '의류'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 flex-1 min-w-0 justify-end sm:justify-start">
                          <CustomSelect
                            options={MATERIAL_CLASS_OPTIONS}
                            value={item.texture ?? ''}
                            onChange={(v) => patchBeforeItemAttr(item.id, { texture: v })}
                            placeholder="재질"
                          />
                          <CustomSelect
                            options={PATTERN_CLASS_OPTIONS}
                            value={item.pattern ?? ''}
                            onChange={(v) => patchBeforeItemAttr(item.id, { pattern: v })}
                            placeholder="패턴"
                          />
                          <CustomSelect
                            options={STYLE_CLASS_OPTIONS}
                            value={item.style ?? ''}
                            onChange={(v) => patchBeforeItemAttr(item.id, { style: v })}
                            placeholder="스타일"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                  </>
                )}
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
                      {isLoadingHarmony || (inputMode === 'webcam' && isWebcamLiveLoading && webcamLiveScore == null) ? (
                        <div className="text-sm text-cream text-center">계산 중...</div>
                      ) : inputMode === 'webcam' && isWebcamLiveActive && webcamLiveScore == null && webcamStatusMessage ? (
                        <div className="text-xs text-cream text-center leading-snug px-1">
                          준비 중
                        </div>
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
                        key={harmonyGiniMood}
                        src={getHarmonyStateCharacterImage()}
                        alt="Gini"
                        className={`w-20 h-20 ${harmonyGiniAnimClass}`}
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


