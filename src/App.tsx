import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import History from './pages/History'
import Info from './pages/Info'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/history" element={<History />} />
        <Route path="/info" element={<Info />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
