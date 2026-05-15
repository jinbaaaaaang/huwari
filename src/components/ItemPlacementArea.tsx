import { useRef, useState, useEffect, useMemo } from 'react'
import {
  OUTFIT_GUIDE,
  accessoryLeftOccupied,
  inferCategoryFromCanvasPosition,
  isAccessoryCategory,
} from '../constants/outfitGuide'

interface ItemPlacementAreaProps {
  buttonText: string
  buttonIcon: 'upload' | 'add'
  instructionText: string
  containerId: string
  onItemsChange?: (items: PlacedItem[]) => void
  onSave?: (items: PlacedItem[]) => void
  onReset?: () => void
  harmonyScore?: {
    score_total: number
    score_color: number
    score_texture: number
    score_pattern: number
    score_style: number
    reasons: string[]
    debug: any
  } | null
  initialItems?: PlacedItem[]
}

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

const ItemPlacementArea = ({ 
  buttonText, 
  buttonIcon, 
  instructionText, 
  containerId,
  onItemsChange,
  onSave,
  onReset,
  harmonyScore,
  initialItems
}: ItemPlacementAreaProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [placedItems, setPlacedItems] = useState<PlacedItem[]>(initialItems || [])
  const [processingCount, setProcessingCount] = useState(0)  // 처리 중인 아이템 개수
  const [draggingItem, setDraggingItem] = useState<string | null>(null)
  
  // initialItems를 문자열로 직렬화하여 비교
  const initialItemsKey = useMemo(() => {
    if (!initialItems || initialItems.length === 0) return 'empty'
    return JSON.stringify(
      [...initialItems]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((item) => ({
          id: item.id,
          texture: item.texture,
          pattern: item.pattern,
          style: item.style,
          category: item.category,
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
        }))
    )
  }, [initialItems])

  const prevInitialItemsKeyRef = useRef<string>(initialItemsKey)
  const isInitialMountRef = useRef(true)
  const prevPlacedJsonRef = useRef<string | null>(null)

  // initialItems가 변경되면 placedItems 업데이트
  useEffect(() => {
    // 실제로 변경되었는지 확인
    if (initialItemsKey !== prevInitialItemsKeyRef.current || isInitialMountRef.current) {
      console.log('ItemPlacementArea initialItems 변경:', initialItems)
      prevInitialItemsKeyRef.current = initialItemsKey
      isInitialMountRef.current = false
      
      if (initialItems !== undefined) {
        console.log('placedItems 업데이트:', initialItems)
        setPlacedItems([...initialItems])
      }
    }
  }, [initialItems, initialItemsKey])

  // placedItems 변경 시 상위에 동기화 (texture/pattern/style 등 id 외 필드만 바뀐 경우 포함)
  // 히스토리 불러오기 등: 부모가 initialItems를 준 직후 placedItems는 아직 []인 틱이 있어,
  // 그때 onItemsChange([])가 나가면 복원이 지워지므로 동기화 전에는 빈 배열을 올리지 않음
  useEffect(() => {
    if (!onItemsChange) return
    const json = JSON.stringify(placedItems)
    if (prevPlacedJsonRef.current === json) return
    if (placedItems.length === 0 && initialItems && initialItems.length > 0) {
      return
    }
    prevPlacedJsonRef.current = json
    onItemsChange(placedItems)
  }, [placedItems, onItemsChange, initialItems])
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [resizingItem, setResizingItem] = useState<string | null>(null)
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 })

  const iconPath = buttonIcon === 'upload' 
    ? "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
    : "M12 4v16m8-8H4"

  const handleFileSelect = async (file: File) => {
    if (!file || !file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.')
      return
    }

    // 처리 중 카운트 증가
    setProcessingCount(prev => prev + 1)

    try {
      // 같은 FormData를 두 fetch에 동시에 넘기면 브라우저마다 body가 비거나 깨질 수 있어 각각 생성한다.
      const classifyFormData = new FormData()
      classifyFormData.append('file', file)
      const bgFormData = new FormData()
      bgFormData.append('file', file)

      // 의류 타입 분류와 배경 제거를 병렬로 실행 (성능 최적화)
      const [classifyResponse, bgResponse] = await Promise.all([
        fetch('/api/classify-clothing-type', {
          method: 'POST',
          body: classifyFormData,
        }),
        fetch('/api/remove-background', {
          method: 'POST',
          body: bgFormData,
        })
      ])

      // 의류 타입 분류 결과 처리
      if (!classifyResponse.ok) {
        const errorText = await classifyResponse.text()
        console.error('의류 타입 분류 API 오류:', classifyResponse.status, errorText)
        throw new Error(`의류 타입 분류 실패: ${classifyResponse.status} ${errorText}`)
      }

      const classifyData = await classifyResponse.json()
      if (!classifyData.success) {
        console.error('의류 타입 분류 실패:', classifyData.error)
        throw new Error(classifyData.error || '의류 타입 분류에 실패했습니다.')
      }

      const clothingType = classifyData.clothing_type || '악세서리'

      // 배경 제거 결과 처리
      if (!bgResponse.ok) {
        const errorText = await bgResponse.text()
        console.error('배경 제거 API 오류:', bgResponse.status, errorText)
        throw new Error(`배경 제거 실패: ${bgResponse.status} ${errorText}`)
      }

      const bgData = await bgResponse.json()

      if (bgData.success && bgData.image) {
        // 가이드 라인 위치 정의 (의류 타입별)
        const guidePositions: { [key: string]: { x: number; y: number; width: number; height: number; label: string } } = {
          모자: { ...OUTFIT_GUIDE.모자 },
          상의: { ...OUTFIT_GUIDE.상의 },
          하의: { ...OUTFIT_GUIDE.하의 },
          신발: { ...OUTFIT_GUIDE.신발 },
          악세서리: { ...OUTFIT_GUIDE.악세서리_왼 },
        }

        let position
        if (clothingType === '악세서리') {
          const slot = accessoryLeftOccupied(placedItems)
            ? OUTFIT_GUIDE.악세서리_우
            : OUTFIT_GUIDE.악세서리_왼
          position = { ...slot, label: '악세서리' }
        } else {
          position = guidePositions[clothingType] || guidePositions['악세서리']
        }

        const newItem: PlacedItem = {
          id: Date.now().toString(),
          imageUrl: bgData.image,
          x: position.x,      // 가이드 라인 x 위치 (퍼센트)
          y: position.y,      // 가이드 라인 y 위치 (퍼센트)
          width: position.width,   // 가이드 라인 너비
          height: position.height, // 가이드 라인 높이
          category: clothingType,
        }

        // 처리 완료된 아이템을 화면에 추가
        setPlacedItems(prev => [...prev, newItem])
        
        // 처리 중 카운트 감소
        setProcessingCount(prev => Math.max(0, prev - 1))

        // 배경 제거 후: 색은 항상. 재질·패턴·스타일은 신발/모자/악세서리가 아닐 때만 요청
        const postTasks: Promise<void>[] = [extractColorsAsync(bgData.image, newItem.id)]
        if (!isAccessoryCategory(clothingType)) {
          postTasks.push(analyzeFashionAttributesAsync(file, newItem.id))
        }
        Promise.all(postTasks).catch(error => {
          console.error('후처리 작업 오류:', error)
        })
      } else {
        alert('배경 제거에 실패했습니다: ' + (bgData.error || '알 수 없는 오류'))
        // 처리 중 카운트 감소
        setProcessingCount(prev => Math.max(0, prev - 1))
      }
    } catch (error) {
      console.error('배경 제거 오류:', error)
      alert('배경 제거 중 오류가 발생했습니다.')
      // 처리 중 카운트 감소
      setProcessingCount(prev => Math.max(0, prev - 1))
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      // 여러 파일을 동시에 처리 (각 파일은 독립적으로 처리됨)
      Array.from(files).forEach(file => {
        handleFileSelect(file)
      })
    }
    // 같은 파일을 다시 선택할 수 있도록 리셋
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleButtonClick = () => {
    fileInputRef.current?.click()
  }

  const handleRemoveItem = (id: string) => {
    setPlacedItems(placedItems.filter(item => item.id !== id))
  }

  // 색상 추출 함수 (비동기, 배경 제거와 위치 판별 완료 후 실행)
  const extractColorsAsync = async (base64Image: string, itemId: string) => {
    try {
      // Base64 이미지를 Blob으로 변환
      if (!base64Image || !base64Image.includes(',')) {
        throw new Error('잘못된 Base64 형식')
      }
      
      const base64Data = base64Image.split(',')[1]
      const byteCharacters = atob(base64Data)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: 'image/png' })
      
      // FormData 생성
      const colorFormData = new FormData()
      colorFormData.append('file', blob, 'image.png')
      
      // 색상 추출 API 호출
      const colorResponse = await fetch('/api/extract-colors', {
        method: 'POST',
        body: colorFormData,
      })
      
      if (!colorResponse.ok) {
        throw new Error(`색상 추출 API 오류: ${colorResponse.status}`)
      }
      
      const colorData = await colorResponse.json()
      if (colorData.success && colorData.colors && Array.isArray(colorData.colors)) {
        const extractedColors = colorData.colors.map((c: any) => ({
          rgb: c.rgb || [0, 0, 0],
          hex: c.hex || '#000000',
          percentage: c.percentage || 0,
        }))

        // 아이템에 색상 정보 추가
        setPlacedItems(prevItems =>
          prevItems.map(item =>
            item.id === itemId
              ? { ...item, colors: extractedColors }
              : item
          )
        )
      }
    } catch (colorError) {
      console.error('색상 추출 오류:', colorError)
      // 색상 추출 실패해도 아이템은 이미 배치되어 있음
    }
  }

  // 질감, 패턴, 스타일 분석 함수 (비동기)
  const analyzeFashionAttributesAsync = async (file: File, itemId: string) => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      
      const response = await fetch('/api/classify-fashion-attributes', {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) {
        // 404 에러인 경우 API가 없거나 서버가 재시작되지 않았을 수 있음
        if (response.status === 404) {
          console.warn('질감/패턴/스타일 분석 API를 찾을 수 없습니다. 서버를 재시작했는지 확인하세요.')
          return
        }
        const errorText = await response.text()
        console.error(`질감/패턴/스타일 분석 API 오류: ${response.status}`, errorText)
        return
      }
      
      const data = await response.json()
      
      // API가 실패했지만 에러 메시지를 반환한 경우
      if (!data.success) {
        console.warn('질감/패턴/스타일 분석 실패:', data.error || '알 수 없는 오류')
        return
      }
      
      if (data.texture && data.pattern && data.style) {
        // 아이템에 질감/패턴/스타일 정보 추가
        setPlacedItems(prevItems =>
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
      }
    } catch (error) {
      console.error('질감/패턴/스타일 분석 오류:', error)
      // 분석 실패해도 아이템은 이미 배치되어 있음
    }
  }

  const handleMouseDown = (e: React.MouseEvent, itemId: string) => {
    // 리사이즈 중이면 드래그 시작하지 않음
    if (resizingItem) {
      return
    }
    
    e.preventDefault()
    e.stopPropagation()
    
    if (!containerRef.current) return
    
    const containerRect = containerRef.current.getBoundingClientRect()
    const item = placedItems.find(i => i.id === itemId)
    if (!item) return
    
    // 현재 아이템의 실제 위치 계산
    const itemX = (item.x / 100) * containerRect.width
    const itemY = (item.y / 100) * containerRect.height
    
    // 마우스 위치와 아이템 위치의 차이 계산
    const offsetX = e.clientX - containerRect.left - itemX
    const offsetY = e.clientY - containerRect.top - itemY
    
    setDraggingItem(itemId)
    setDragOffset({ x: offsetX, y: offsetY })
  }

  const handleResizeStart = (e: React.MouseEvent, itemId: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    const item = placedItems.find(i => i.id === itemId)
    if (!item) return
    
    setResizingItem(itemId)
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: item.width,
      height: item.height,
    })
  }

  const handleResizeMove = (e: React.MouseEvent) => {
    if (!resizingItem || !containerRef.current) return
    
    e.preventDefault()
    const item = placedItems.find(i => i.id === resizingItem)
    if (!item) return
    
    const deltaX = e.clientX - resizeStart.x
    
    // 비율 유지하면서 크기 조절
    const aspectRatio = resizeStart.width / resizeStart.height
    const newWidth = Math.max(50, Math.min(300, resizeStart.width + deltaX))
    const newHeight = newWidth / aspectRatio
    
    setPlacedItems(placedItems.map(i =>
      i.id === resizingItem
        ? { ...i, width: newWidth, height: newHeight }
        : i
    ))
  }

  const handleResizeEnd = () => {
    setResizingItem(null)
    setResizeStart({ x: 0, y: 0, width: 0, height: 0 })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingItem || !containerRef.current) return
    
    e.preventDefault()
    const containerRect = containerRef.current.getBoundingClientRect()
    
    // 마우스 위치를 컨테이너 기준으로 계산
    const mouseX = e.clientX - containerRect.left - dragOffset.x
    const mouseY = e.clientY - containerRect.top - dragOffset.y
    
    // 퍼센트로 변환
    const newX = Math.max(0, Math.min(100, (mouseX / containerRect.width) * 100))
    const newY = Math.max(0, Math.min(100, (mouseY / containerRect.height) * 100))
    
    // 아이템 위치 업데이트
    setPlacedItems(placedItems.map(item => 
      item.id === draggingItem 
        ? { ...item, x: newX, y: newY }
        : item
    ))
  }

  const handleMouseUp = () => {
    const endedId = draggingItem
    if (endedId && containerRef.current) {
      const { width: cw, height: ch } = containerRef.current.getBoundingClientRect()
      setPlacedItems((prev) => {
        const item = prev.find((i) => i.id === endedId)
        if (!item) return prev
        const inferred = inferCategoryFromCanvasPosition(item, cw, ch)
        if (!inferred || inferred === item.category) return prev
        return prev.map((i) => (i.id === endedId ? { ...i, category: inferred } : i))
      })
    }
    setDraggingItem(null)
    setDragOffset({ x: 0, y: 0 })
  }

  // 레이아웃 이미지 생성 함수
  const generateLayoutImage = async (): Promise<string | null> => {
    try {
      if (!containerRef.current || placedItems.length === 0) {
        return null
      }

      const container = containerRef.current
      const containerRect = container.getBoundingClientRect()
      
      // 캔버스 크기를 컨테이너 크기에 맞춤
      const canvasWidth = containerRect.width
      const canvasHeight = containerRect.height
      
      // 캔버스 생성
      const canvas = document.createElement('canvas')
      canvas.width = canvasWidth
      canvas.height = canvasHeight
      const ctx = canvas.getContext('2d')
      
      if (!ctx) {
        return null
      }

      // 배경색 설정 (cream 색상 - Tailwind와 동일)
      ctx.fillStyle = '#FFFFFF' // white 배경
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // 각 아이템을 캔버스에 그리기 (순서대로)
      const imagePromises = placedItems.map((item) => {
        return new Promise<void>((resolve) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          
          img.onload = () => {
            // 아이템의 위치는 퍼센트, 크기는 픽셀
            // 퍼센트를 픽셀로 변환
            const x = (item.x / 100) * canvasWidth - (item.width / 2) // transform: translate(-50%, 0) 반영
            const y = (item.y / 100) * canvasHeight
            const width = item.width
            const height = item.height
            
            ctx.drawImage(img, x, y, width, height)
            resolve()
          }
          
          img.onerror = () => {
            console.error('이미지 로드 실패:', item.imageUrl)
            resolve() // 실패해도 계속 진행
          }
          
          img.src = item.imageUrl
        })
      })

      // 모든 이미지 로드 대기
      await Promise.all(imagePromises)

      // 캔버스를 base64로 변환
      return canvas.toDataURL('image/png')
    } catch (error) {
      console.error('레이아웃 이미지 생성 실패:', error)
      return null
    }
  }

  return (
    <div className="relative p-3" style={{ minHeight: '300px' }}>
      {/* 업로드 버튼 - 가이드 라인 위에 배치 */}
      <div className="absolute top-6 right-5 z-10 flex flex-col gap-2 items-end">
        <button 
          onClick={handleButtonClick}
          className="px-4 py-2 bg-[#FAFAF8] border border-secondary text-secondary text-xs font-medium hover:bg-secondary hover:text-cream transition-all uppercase tracking-wider rounded-full flex items-center gap-1.5" 
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={iconPath} />
          </svg>
          <span>{buttonText}</span>
        </button>
        <button 
          onClick={() => {
            if (window.confirm('모든 아이템을 초기화하시겠습니까?')) {
              setPlacedItems([])
              if (onReset) {
                onReset()
              }
            }
          }}
          className="px-4 py-2 bg-[#FAFAF8] border border-secondary text-secondary text-xs font-medium hover:bg-secondary hover:text-cream transition-all uppercase tracking-wider rounded-full flex items-center gap-1.5 w-fit" 
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>초기화</span>
        </button>
        <button 
          onClick={async () => {
            if (!harmonyScore) {
              alert('조화 점수를 먼저 계산해주세요.')
              return
            }
            
            if (placedItems.length === 0) {
              alert('저장할 아이템이 없습니다.')
              return
            }
            
            try {
              // 레이아웃 이미지 생성
              const layoutImage = await generateLayoutImage()
              
              // 레이아웃 이미지가 포함된 아이템들 생성
              const itemsWithLayout = placedItems.map(item => ({
                ...item,
                layoutImage: layoutImage || undefined
              }))
              
              const response = await fetch('/api/save-history', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  beforeItems: itemsWithLayout,
                  harmonyScore: harmonyScore,
                  layoutImage: layoutImage
                })
              })
              
              const data = await response.json()
              
              if (data.success) {
                alert('히스토리에 저장되었습니다!')
                if (onSave) {
                  onSave(placedItems)
                }
              } else {
                alert(`저장 실패: ${data.error || '알 수 없는 오류'}`)
              }
            } catch (error) {
              console.error('저장 오류:', error)
              alert('저장 중 오류가 발생했습니다.')
            }
          }}
          className="px-4 py-2 bg-[#FAFAF8] border border-secondary text-secondary text-xs font-medium hover:bg-secondary hover:text-cream transition-all uppercase tracking-wider rounded-full flex items-center gap-1.5 w-fit" 
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          <span>저장</span>
        </button>
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
      
      {/* 아이템 배치 캔버스 영역 */}
      <div 
        ref={containerRef}
        className="relative w-full h-full" 
        style={{ minHeight: '460px' }}
        onMouseMove={(e) => {
          handleMouseMove(e)
          handleResizeMove(e)
        }}
        onMouseUp={() => {
          handleMouseUp()
          handleResizeEnd()
        }}
        onMouseLeave={() => {
          handleMouseUp()
          handleResizeEnd()
        }}
      >
        {/* 배치 가이드 라인 (좌표는 outfitGuide.ts와 업로드 삽입 위치 공통) */}
        <div className="absolute inset-0 pointer-events-none">
          {(['모자', '상의', '하의', '신발'] as const).map((key) => {
            const s = OUTFIT_GUIDE[key]
            const rounded = key === '상의' || key === '하의' ? 'rounded-xl' : 'rounded-lg'
            return (
              <div
                key={key}
                className={`absolute border border-secondary ${rounded} opacity-40 flex items-center justify-center`}
                style={{
                  left: `${s.x}%`,
                  top: `${s.y}%`,
                  transform: 'translate(-50%, 0)',
                  width: s.width,
                  height: s.height,
                }}
              >
                <div className="text-[10px] text-secondary font-bold uppercase">{s.label}</div>
              </div>
            )
          })}
          {(['악세서리_왼', '악세서리_우'] as const).map((key) => {
            const s = OUTFIT_GUIDE[key]
            return (
              <div
                key={key}
                className="absolute border border-secondary rounded-lg opacity-40 flex items-center justify-center"
                style={{
                  left: `${s.x}%`,
                  top: `${s.y}%`,
                  transform: 'translate(-50%, 0)',
                  width: s.width,
                  height: s.height,
                }}
              >
                <div className="text-[10px] text-secondary font-bold uppercase">{s.label}</div>
              </div>
            )
          })}
        </div>

        {/* 통합 처리 중 표시 (화면 중앙) */}
        {processingCount > 0 && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 rounded-lg p-8 bg-[#FAFAF8] border border-secondary">
            <div className="text-center">
              {/* 기니피그 이미지 - 부드러운 바운스 애니메이션 */}
              <div className="w-20 h-20 mx-auto mb-4">
                <img 
                  src="/assets/normal_gini.svg" 
                  alt="Loading" 
                  className="w-full h-full"
                  style={{ 
                    animation: 'gentleBounce 1.5s ease-in-out infinite'
                  }}
                />
              </div>
              <div className="text-xs text-secondary font-light uppercase tracking-wider mb-1">
                처리 중
                <span className="inline-block">
                  <span className="animate-dot1">.</span>
                  <span className="animate-dot2">.</span>
                  <span className="animate-dot3">.</span>
                </span>
              </div>
              <div className="text-xs text-secondary font-light uppercase tracking-wider">
                {processingCount}개 아이템 처리 중
              </div>
            </div>
          </div>
        )}

        {/* 배치된 아이템들 (처리 완료된 것만 표시) */}
        {placedItems.map((item) => (
          <div
            key={item.id}
            className={`absolute cursor-move group ${
              draggingItem === item.id || resizingItem === item.id
                ? 'z-[110]'
                : 'z-20 hover:z-[100]'
            }`}
            style={{
              left: `${item.x}%`,
              top: `${item.y}%`,
              transform: 'translate(-50%, 0)',
              width: `${item.width}px`,
              height: `${item.height}px`,
              opacity: draggingItem === item.id ? 0.8 : 1,
            }}
            onMouseDown={(e) => handleMouseDown(e, item.id)}
          >
            <img
              src={item.imageUrl}
              alt="Placed item"
              className="w-full h-full object-contain drop-shadow-lg"
              draggable={false}
            />
            {/* 리사이즈 핸들 */}
            {(
              <>
                <div
                  className={`absolute bottom-0 right-0 w-5 h-5 bg-secondary rounded-full transition-opacity cursor-se-resize z-40 border-2 border-white shadow-lg ${
                    resizingItem === item.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    handleResizeStart(e, item.id)
                  }}
                  style={{ transform: 'translate(25%, 25%)' }}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveItem(item.id)
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 z-30"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </>
            )}
            
            {/* 추출된 색상 및 속성 표시 (오른쪽 중앙) */}
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-[#FAFAF8] backdrop-blur-sm rounded-lg p-2 shadow-lg border border-secondary min-w-[120px] flex flex-col items-center gap-1.5">
              {/* 색상 표시 — w-full + justify-center 로 팝업 너비 기준 가운데 정렬 */}
              {item.colors && item.colors.length > 0 && (
                <div className="flex w-full justify-center gap-1">
                  {item.colors.slice(0, 5).map((color, idx) => (
                    <div
                      key={idx}
                      className="w-4 h-4 rounded-full border border-secondary shadow-sm shrink-0"
                      style={{ backgroundColor: color.hex }}
                      title={`${color.hex} (${color.percentage.toFixed(1)}%)`}
                    />
                  ))}
                </div>
              )}

              {isAccessoryCategory(item.category) ? (
                (!item.colors || item.colors.length === 0) && (
                  <div className="text-secondary text-[10px] w-full text-center">색 추출 중...</div>
                )
              ) : (
                <div className="space-y-1 text-xs w-full text-left">
                  {item.texture && (
                    <div className="text-secondary">
                      <span className="text-secondary">재질:</span> {item.texture}
                    </div>
                  )}
                  {item.pattern && (
                    <div className="text-secondary">
                      <span className="text-secondary">패턴:</span> {item.pattern}
                    </div>
                  )}
                  {item.style && (
                    <div className="text-secondary">
                      <span className="text-secondary">스타일:</span> {item.style}
                    </div>
                  )}
                  {(!item.texture && !item.pattern && !item.style) && (
                    <div className="text-secondary text-[10px]">분석 중...</div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* 안내 문구 영역 (아이템이 없을 때만 표시) */}
        {placedItems.length === 0 && (
          <div 
            id={containerId}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center pointer-events-none" 
            style={{ isolation: 'isolate' }}
          >
            <div className="translate-y-14 space-y-1.5">
              <p 
                className="text-sm font-medium text-gray-400 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: instructionText }}
              />
              <p className="text-[10px] text-gray-300">
                (영역별 레이어드 가능)
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ItemPlacementArea

