import { Link } from 'react-router-dom'
import { useState, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

const BUBBLE_Z = 10050
const PAD = 8
const MAX_BUBBLE_W = 320

function clampLeftForBubble(rectLeft: number, innerWidth: number) {
  const maxW = Math.min(MAX_BUBBLE_W, innerWidth - 2 * PAD)
  return Math.max(PAD, Math.min(rectLeft, innerWidth - PAD - maxW))
}

function bubbleStyleRightIcon(rect: DOMRect, innerWidth: number) {
  const maxW = Math.min(MAX_BUBBLE_W, innerWidth - 2 * PAD)
  const top = rect.bottom + 8
  if (rect.right - maxW < PAD) {
    return { top, left: PAD as number, right: undefined as number | undefined }
  }
  return { top, left: undefined as number | undefined, right: innerWidth - rect.right }
}

const Header = () => {
  const [leftBubble, setLeftBubble] = useState<{ show: boolean; message: string }>({ show: false, message: '' })
  const [rightBubble, setRightBubble] = useState<{ show: boolean; message: string }>({ show: false, message: '' })
  const [leftFixed, setLeftFixed] = useState({ top: 0, left: 0 })
  const [rightFixed, setRightFixed] = useState<{ top: number; left?: number; right?: number }>({ top: 0, right: 0 })

  const leftWrapRef = useRef<HTMLDivElement>(null)
  const rightWrapRef = useRef<HTMLDivElement>(null)

  const messages = [
    '안녕하기니! 오늘도 멋진 코디 만들어보기니!',
    '코디가 잘 맞는지 확인해보세요! 꾸잉~',
    '꾸잉꾸잉',
    '예쁜 코디로 자신감을 키워보세요! 꾸잉~',
    '색상과 스타일의 조화를 찾아보시기니! 꾸잉~',
    '완벽한 코디를 위해 함께해요! 꾸잉~',
    '당신의 스타일을 응원해요! 꾸잉~',
  ]

  const showBubble = (side: 'left' | 'right') => {
    const randomMessage = messages[Math.floor(Math.random() * messages.length)]

    if (side === 'left') {
      setLeftBubble({ show: true, message: randomMessage })
      setTimeout(() => {
        setLeftBubble({ show: false, message: '' })
      }, 3000)
    } else {
      setRightBubble({ show: true, message: randomMessage })
      setTimeout(() => {
        setRightBubble({ show: false, message: '' })
      }, 3000)
    }
  }

  useLayoutEffect(() => {
    if (!leftBubble.show || !leftWrapRef.current) return
    const el = leftWrapRef.current
    const update = () => {
      const r = el.getBoundingClientRect()
      const innerWidth = window.innerWidth
      setLeftFixed({
        top: r.bottom + 8,
        left: clampLeftForBubble(r.left, innerWidth),
      })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [leftBubble.show])

  useLayoutEffect(() => {
    if (!rightBubble.show || !rightWrapRef.current) return
    const el = rightWrapRef.current
    const update = () => {
      const r = el.getBoundingClientRect()
      setRightFixed(bubbleStyleRightIcon(r, window.innerWidth))
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [rightBubble.show])

  const bubbleShell = 'w-max max-w-[min(20rem,calc(100vw-1rem))] animate-fadeIn'

  const leftPortal =
    leftBubble.show &&
    createPortal(
      <div
        className={bubbleShell}
        style={{
          position: 'fixed',
          top: leftFixed.top,
          left: leftFixed.left,
          zIndex: BUBBLE_Z,
        }}
      >
        <div className="bg-secondary border border-secondary px-3 py-2 relative shadow-md">
          <p className="text-xs text-cream whitespace-normal text-left break-keep leading-relaxed">{leftBubble.message}</p>
          <div className="absolute bottom-full left-3 -mb-1">
            <div className="w-2 h-2 bg-secondary border-l border-t border-secondary transform rotate-45" />
          </div>
        </div>
      </div>,
      document.body
    )

  const rightPortal =
    rightBubble.show &&
    createPortal(
      <div
        className={bubbleShell}
        style={{
          position: 'fixed',
          top: rightFixed.top,
          ...(rightFixed.left != null ? { left: rightFixed.left } : { right: rightFixed.right }),
          zIndex: BUBBLE_Z,
        }}
      >
        <div className="bg-secondary border border-secondary px-3 py-2 relative shadow-md">
          <p className="text-xs text-cream whitespace-normal text-left break-keep leading-relaxed">{rightBubble.message}</p>
          <div className="absolute bottom-full right-3 -mb-1">
            <div className="w-2 h-2 bg-secondary border-l border-t border-secondary transform rotate-45" />
          </div>
        </div>
      </div>,
      document.body
    )

  return (
    <header className="w-full p-6 border-b border-secondary flex items-center box-border">
      {leftPortal}
      {rightPortal}
      <div className="flex items-center justify-center gap-4 w-full box-border">
        <div ref={leftWrapRef} className="relative flex items-center">
          <img
            src="/assets/normal_gini.svg"
            alt="Gini"
            className="w-5 h-5 cursor-pointer hover:opacity-70 transition-opacity"
            onClick={(e) => {
              e.preventDefault()
              showBubble('left')
            }}
          />
        </div>
        <Link to="/" className="flex items-center gap-2">
          <h1 className="text-lg font-regular text-secondary uppercase tracking-wider">HUWARI</h1>
        </Link>
        <div ref={rightWrapRef} className="relative flex items-center">
          <img
            src="/assets/normal_gini.svg"
            alt="Gini"
            className="w-5 h-5 cursor-pointer hover:opacity-70 transition-opacity"
            onClick={(e) => {
              e.preventDefault()
              showBubble('right')
            }}
          />
        </div>
      </div>
    </header>
  )
}

export default Header
