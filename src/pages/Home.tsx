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
  const [inputMode, setInputMode] = useState<'upload' | 'webcam'>('upload')
  const [beforeItems, setBeforeItems] = useState<PlacedItem[]>([])
  const [afterItems] = useState<PlacedItem[]>([])
  const [harmonyScore, setHarmonyScore] = useState<HarmonyScore | null>(null)
  const [isLoadingHarmony, setIsLoadingHarmony] = useState(false)
  const [isCameraOn, setIsCameraOn] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [webcamError, setWebcamError] = useState('')
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null)
  const webcamStreamRef = useRef<MediaStream | null>(null)

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
    const guidePositions: { [key: string]: { x: number; y: number; width: number; height: number } } = {
      '상의': { x: 50, y: 20, width: 144, height: 112 },
      '하의': { x: 50, y: 46, width: 128, height: 176 },
      '모자': { x: 50, y: 4, width: 96, height: 64 },
      '신발': { x: 50, y: 96, width: 128, height: 48 },
      '악세서리': { x: 8, y: 38, width: 96, height: 96 },
    }

    const basePosition = guidePositions[clothingType] || guidePositions['악세서리']
    if (clothingType !== '악세서리') return basePosition

    const leftAccessoryExists = items.some(item => item.x === 8 && item.y === 38)
    return leftAccessoryExists
      ? { x: 92, y: 38, width: 96, height: 96 }
      : basePosition
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
          <div className="bg-cream border-r border-secondary flex flex-col">
            <div className="p-6 flex items-center justify-between border-b border-secondary translate-y-[1.375px]">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setInputMode('upload')}
                  className={`text-xs font-regular uppercase tracking-wider inline-block px-3 py-1 border border-secondary rounded-full transition-all ${
                    inputMode === 'upload' ? 'bg-secondary text-cream' : 'text-secondary'
                  }`}
                >
                  코디 업로드
                </button>
                <button
                  onClick={() => setInputMode('webcam')}
                  className={`text-xs font-regular uppercase tracking-wider inline-block px-3 py-1 border border-secondary rounded-full transition-all ${
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
                        className="px-4 py-2 border border-secondary rounded-full text-xs text-secondary uppercase tracking-wider hover:bg-primary transition-all"
                      >
                        {isCameraOn ? '카메라 끄기' : '카메라 켜기'}
                      </button>
                      <button
                        onClick={captureFromWebcam}
                        disabled={!isCameraOn || isCapturing}
                        className="px-4 py-2 border border-secondary rounded-full text-xs text-secondary uppercase tracking-wider hover:bg-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isCapturing ? '처리 중...' : '캡처'}
                      </button>
                    </div>
                  </div>
                )}
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
            <div className="p-6 flex items-center justify-between border-b border-secondary translate-y-[1.375px]">
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


