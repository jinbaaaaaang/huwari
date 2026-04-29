import { Link } from 'react-router-dom'
import { useState } from 'react'

const Header = () => {
  const [leftBubble, setLeftBubble] = useState<{ show: boolean; message: string }>({ show: false, message: '' })
  const [rightBubble, setRightBubble] = useState<{ show: boolean; message: string }>({ show: false, message: '' })

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

  return (
    <header className="w-full p-6 border-b border-secondary flex items-center box-border -mt-[2px]">
      <div className="flex items-center justify-center gap-4 w-full box-border">
            <div className="relative flex items-center">
              <img 
                src="/assets/normal_gini.svg" 
                alt="Gini" 
            className="w-5 h-5 cursor-pointer hover:opacity-70 transition-opacity" 
                onClick={(e) => {
                  e.preventDefault()
                  showBubble('left')
                }}
              />
              {leftBubble.show && (
            <div className="absolute top-full left-0 mt-2 animate-fadeIn z-[60]">
              <div className="bg-secondary border border-secondary px-3 py-2 max-w-xs relative">
                <p className="text-xs text-cream whitespace-nowrap">
                      {leftBubble.message}
                    </p>
                <div className="absolute bottom-full left-3 -mb-1">
                  <div className="w-2 h-2 bg-secondary border-l border-t border-secondary transform rotate-45"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
        <Link to="/" className="flex items-center">
          <h1 className="text-lg font-regular text-secondary uppercase tracking-wider">
              Codimodi
            </h1>
          </Link>
        <div className="relative flex items-center">
                <img 
                  src="/assets/normal_gini.svg" 
                  alt="Gini" 
            className="w-5 h-5 cursor-pointer hover:opacity-70 transition-opacity" 
                  onClick={(e) => {
                    e.preventDefault()
                    showBubble('right')
                  }}
                />
                {rightBubble.show && (
            <div className="absolute top-full right-0 mt-2 animate-fadeIn z-[60]">
              <div className="bg-secondary border border-secondary px-3 py-2 max-w-xs relative">
                <p className="text-xs text-cream whitespace-nowrap">
                        {rightBubble.message}
                      </p>
                <div className="absolute bottom-full right-3 -mb-1">
                  <div className="w-2 h-2 bg-secondary border-l border-t border-secondary transform rotate-45"></div>
                      </div>
                    </div>
                  </div>
                )}
        </div>
      </div>
    </header>
  )
}

export default Header
