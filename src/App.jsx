import { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Loader from './components/Loader'
import Gallery from './pages/Gallery'
import TaggedGallery from './pages/TaggedGallery'
import ArtworkDetail from './components/ArtworkDetail'

function App() {
  const [loading, setLoading] = useState(true)

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-white">
        {loading && <Loader onComplete={() => setLoading(false)} />}

        <Sidebar />

        {/* Main content area - offset by sidebar width */}
        <main className="ml-[250px] p-6 max-md:ml-0 max-md:pt-20">
          <div className="max-w-[80vw] max-md:max-w-full">
            <Routes>
              {/* Home gallery */}
              <Route path="/" element={<Gallery />} />

              {/* Filtered gallery by medium tag */}
              <Route path="/tagged/:medium" element={<TaggedGallery />} />

              {/* Artwork detail page */}
              <Route path="/post/:id" element={<ArtworkDetail />} />
            </Routes>
          </div>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
