import { Link, useLocation } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'
import MouseStarTrail from './MouseStarTrail'

interface LayoutProps {
  children: React.ReactNode
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation()

  return (
    <div className="bg-[#FAFAF8]">
      <MouseStarTrail />
      {/* Grid-based Minimal Layout */}
      <div className="grid grid-cols-12">
        {/* Left Sidebar - Fixed with Header */}
        <aside className="col-span-12 lg:col-span-2 bg-[#FAFAF8] border-r border-secondary sticky top-0 h-screen overflow-y-auto">
          <div className="grid grid-rows-[auto_auto_1fr_auto] h-full">
            {/* Header in Sidebar - 코디 업로드/코디 평가와 같은 높이 */}
            <div className="row-span-1">
              <Header />
            </div>
            
            {/* Brand Description */}
            <div className="row-span-1 px-4 pt-8 pb-8 text-center">
              <p className="text-xs text-secondary leading-relaxed">
                HUWARI가 색감, 분위기, 조화로움을<br />
                가볍고 자연스럽게 살펴봐요
              </p>
            </div>

            {/* Navigation */}
            <nav className="row-span-1 px-4 pt-8 pb-16 flex flex-col items-center justify-start">
              <div className="flex flex-col items-center">
                <h2 className="text-xs font-light text-secondary mb-4 uppercase tracking-wider inline-block px-3 py-1 border border-secondary rounded-full">Menu</h2>
                <ul className="space-y-1 flex flex-col items-center">
                  <li>
                    <Link 
                      to="/" 
                      className={`text-xs text-secondary inline-block py-1 px-2 transition-all uppercase tracking-wider ${
                        location.pathname === '/' 
                          ? 'font-medium border-b-2 border-secondary' 
                          : 'hover:font-medium hover:border-b border-secondary'
                      }`}
                    >
                      분석
                    </Link>
                  </li>
                  <li>
                    <Link 
                      to="/history" 
                      className={`text-xs text-secondary inline-block py-1 px-2 transition-all uppercase tracking-wider ${
                        location.pathname === '/history' 
                          ? 'font-medium border-b-2 border-secondary' 
                          : 'hover:font-medium hover:border-b border-secondary'
                      }`}
                    >
                      히스토리
                    </Link>
                  </li>
                  <li>
                    <Link 
                      to="/info" 
                      className={`text-xs text-secondary inline-block py-1 px-2 transition-all uppercase tracking-wider ${
                        location.pathname === '/info' 
                          ? 'font-medium border-b-2 border-secondary' 
                          : 'hover:font-medium hover:border-b border-secondary'
                      }`}
                    >
                      정보
                    </Link>
                  </li>
                </ul>
              </div>
            </nav>

            {/* Footer in Sidebar */}
            <div className="row-span-1 h-24 border-t border-secondary w-full flex items-center justify-center">
              <Footer />
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="col-span-12 lg:col-span-10 h-screen overflow-y-auto bg-[#FAFAF8]">
          {children}
        </main>
      </div>
    </div>
  )
}

export default Layout
