import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface Option {
  value: string
  label: string
}

interface CustomSelectProps {
  options: Option[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

interface MenuPos {
  top: number
  left: number
  width: number
  maxHeight: number
}

const CustomSelect = ({ options, value, onChange, placeholder = '선택하세요' }: CustomSelectProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((opt) => opt.value === value)

  const updateMenuPos = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const gap = 8
    const estimatedMenuHeight = Math.min(280, options.length * 38 + 16)
    const spaceBelow = window.innerHeight - rect.bottom - gap
    const spaceAbove = rect.top - gap
    const openAbove = spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow
    const maxHeight = Math.max(
      120,
      Math.min(280, openAbove ? spaceAbove - gap : spaceBelow - gap),
    )
    setMenuPos({
      top: openAbove
        ? Math.max(8, rect.top - Math.min(estimatedMenuHeight, maxHeight) - gap)
        : rect.bottom + gap,
      left: rect.left,
      width: rect.width,
      maxHeight,
    })
  }, [options.length])

  useLayoutEffect(() => {
    if (isOpen) updateMenuPos()
  }, [isOpen, updateMenuPos])

  useEffect(() => {
    if (!isOpen) return
    const handleScrollOrResize = () => updateMenuPos()
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [isOpen, updateMenuPos])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node
      const insideTrigger = triggerRef.current?.contains(t)
      const insideMenu = menuRef.current?.contains(t)
      if (!insideTrigger && !insideMenu) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative inline-block">
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setIsOpen((v) => !v)}
        className="relative px-3 py-1 pr-8 bg-[#FAFAF8] border border-secondary rounded-full text-secondary hover:bg-secondary hover:text-cream transition-all text-xs font-regular uppercase tracking-wider appearance-none cursor-pointer whitespace-nowrap"
      >
        <span className="pr-6">{selectedOption ? selectedOption.label : placeholder}</span>
        <svg
          className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && menuPos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              style={{
                position: 'fixed',
                top: menuPos.top,
                left: menuPos.left,
                width: menuPos.width,
                maxHeight: menuPos.maxHeight,
                zIndex: 2147483647,
              }}
              className="bg-[#FAFAF8] border border-secondary rounded-lg overflow-y-auto shadow-xl scrollbar-thin"
            >
              {options.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value)
                    setIsOpen(false)
                  }}
                  className={`w-full px-4 py-2 text-left hover:bg-secondary hover:text-cream transition-colors text-xs font-light uppercase tracking-wider ${
                    value === option.value ? 'bg-secondary text-cream font-medium' : 'text-secondary'
                  } ${index === 0 ? 'pt-3' : ''} ${index === options.length - 1 ? 'pb-3' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="whitespace-pre-line leading-tight">{option.label}</span>
                    {value === option.value && (
                      <svg className="w-4 h-4 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

export default CustomSelect
