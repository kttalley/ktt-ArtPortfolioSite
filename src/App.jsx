import { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Footer from './components/Footer'
import Loader from './components/Loader'
import Gallery from './pages/Gallery'
import TaggedGallery from './pages/TaggedGallery'
import ArtworkDetail from './components/ArtworkDetail'
import { IS_SERVER } from './env'

// The app without a router, so the prerender step can wrap it in a StaticRouter.
export function AppShell() {
  // The intro loader only exists in the browser; prerendered HTML shows the content.
  const [loading, setLoading] = useState(!IS_SERVER)

  return (
    <div className="min-h-screen bg-white">
      {loading && <Loader onComplete={() => setLoading(false)} />}

      <Sidebar />

      {/* Main content area - offset by sidebar width */}
      <main className="ml-[250px] p-6 pb-10 max-md:ml-0 max-md:pt-20 max-md:pb-10">
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

      {/* Footer caption - hidden for now */}
      {/* <Footer /> */}
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}

export default App
