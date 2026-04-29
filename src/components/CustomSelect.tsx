import { useState, useRef, useEffect } from 'react'

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

const CustomSelect = ({ options, value, onChange, placeholder = '선택하세요' }: CustomSelectProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find(opt => opt.value === value)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  return (
    <div className="relative inline-block" ref={dropdownRef} style={{ zIndex: 1000 }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative px-3 py-1 pr-8 bg-cream border border-secondary rounded-full text-secondary hover:bg-primary transition-all text-xs font-regular uppercase tracking-wider appearance-none cursor-pointer whitespace-nowrap"
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

      {isOpen && (
        <div className="absolute w-full mt-2 bg-cream border border-secondary rounded-lg overflow-hidden" style={{ zIndex: 1001 }}>
          {options.map((option, index) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value)
                setIsOpen(false)
              }}
              className={`w-full px-4 py-2 text-left text-secondary hover:bg-primary transition-colors text-xs font-light uppercase tracking-wider ${
                value === option.value ? 'bg-primary font-medium' : ''
              } ${index === 0 ? 'pt-3' : ''} ${index === options.length - 1 ? 'pb-3' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="whitespace-pre-line leading-tight">{option.label}</span>
                {value === option.value && (
                  <svg className="w-4 h-4 text-secondary flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default CustomSelect

