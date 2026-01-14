import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom'
import { getArtworkById, allArtworks } from '../data/artworks'

function ArtworkDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [loaded, setLoaded] = useState(false)
  const [artwork, setArtwork] = useState(null)

  // Track the gallery route we came from (stored in location state or default to home)
  const returnTo = location.state?.from || '/'

  useEffect(() => {
    const found = getArtworkById(id)
    if (found) {
      setArtwork(found)
      setLoaded(false) // Reset loaded state when artwork changes
    } else {
      // Artwork not found, redirect to home
      navigate('/')
    }
  }, [id, navigate])

  // Get prev/next artworks for navigation
  const currentIndex = allArtworks.findIndex(a => a.id === id)
  const prevArtwork = currentIndex > 0 ? allArtworks[currentIndex - 1] : null
  const nextArtwork = currentIndex < allArtworks.length - 1 ? allArtworks[currentIndex + 1] : null

  // Close handler - returns to the gallery we came from
  const handleClose = () => {
    navigate(returnTo)
  }

  if (!artwork) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="loader"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Close button - returns to gallery */}
      <button
        onClick={handleClose}
        className="fixed top-6 right-6 z-50 p-2 bg-white/90 backdrop-blur rounded-full shadow-md hover:bg-white hover:text-[#00deff] transition-all duration-300"
        aria-label="Close and return to gallery"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Image */}
        <div className="relative mb-8">
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 min-h-[400px]">
              <div className="loader"></div>
            </div>
          )}
          <img
            src={artwork.src}
            alt={artwork.alt}
            onLoad={() => setLoaded(true)}
            className={`w-full h-auto transition-opacity duration-500 ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </div>

        {/* Artwork info */}
        <div className="space-y-4">
          {/* Title */}
          <h1 className="text-3xl font-light tracking-wide">
            {artwork.title}
          </h1>

          {/* Description */}
          <p className="text-gray-700 leading-relaxed">
            {artwork.description}
          </p>

          {/* Date */}
          {artwork.date && (
            <p className="text-sm text-gray-500">
              {artwork.date}
            </p>
          )}

          {/* Medium tags */}
          <div className="flex flex-wrap gap-2 pt-4">
            {artwork.mediums.map(medium => (
              <Link
                key={medium}
                to={`/tagged/${medium}`}
                className="px-3 py-1 text-xs uppercase tracking-widest border border-[#0c0c0c] hover:bg-[#0c0c0c] hover:text-white transition-colors duration-300"
              >
                {medium}
              </Link>
            ))}
          </div>
        </div>

        {/* Prev/Next navigation - uses replace to avoid history stacking */}
        <div className="flex justify-between items-center mt-12 pt-8 border-t border-gray-200">
          {prevArtwork ? (
            <Link
              to={`/post/${prevArtwork.id}`}
              state={{ from: returnTo }}
              replace
              className="flex items-center gap-2 text-sm hover:text-[#00deff] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </Link>
          ) : (
            <div />
          )}

          <button
            onClick={handleClose}
            className="text-sm hover:text-[#00deff] transition-colors"
          >
            Back to Gallery
          </button>

          {nextArtwork ? (
            <Link
              to={`/post/${nextArtwork.id}`}
              state={{ from: returnTo }}
              replace
              className="flex items-center gap-2 text-sm hover:text-[#00deff] transition-colors"
            >
              Next
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ) : (
            <div />
          )}
        </div>
      </div>
    </div>
  )
}

export default ArtworkDetail
