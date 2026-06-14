import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom'
import { getArtworkById, allArtworks } from '../data/artworks'

function ArtworkDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [loaded, setLoaded] = useState(false)
  const [artwork, setArtwork] = useState(null)
  const [slide, setSlide] = useState(0)

  // Track the gallery route we came from (stored in location state or default to home)
  const returnTo = location.state?.from || '/'

  useEffect(() => {
    // Reset scroll to top so each artwork opens showing the work, not mid-page.
    window.scrollTo(0, 0)
    const found = getArtworkById(id)
    if (found) {
      setArtwork(found)
      setLoaded(false) // Reset loaded state when artwork changes
      setSlide(0) // Reset carousel position for the new artwork
    } else {
      // Artwork not found, redirect to home
      navigate('/')
    }
  }, [id, navigate])

  // Carousel images: multi-image posts carry an `images` array; otherwise the single src.
  const images = artwork?.images?.length ? artwork.images : artwork ? [artwork.src] : []
  const isCarousel = images.length > 1
  const goPrev = () => { setLoaded(false); setSlide((s) => (s - 1 + images.length) % images.length) }
  const goNext = () => { setLoaded(false); setSlide((s) => (s + 1) % images.length) }

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

  const metaDesc = (artwork.description || artwork.alt || `${artwork.title} by Kristian Talley`).slice(0, 200)
  const metaImg = `https://kristiantalley.com${artwork.src}`

  return (
    <div className="min-h-screen">
      {/* Per-route SEO metadata (React 19 hoists these into <head>) */}
      <title>{`${artwork.title} — Kristian Talley`}</title>
      <meta name="description" content={metaDesc} />
      <link rel="canonical" href={`https://kristiantalley.com/post/${artwork.id}`} />
      <meta property="og:type" content="article" />
      <meta property="og:title" content={`${artwork.title} — Kristian Talley`} />
      <meta property="og:description" content={metaDesc} />
      <meta property="og:image" content={metaImg} />
      <meta property="og:url" content={`https://kristiantalley.com/post/${artwork.id}`} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content={metaImg} />

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
        {/* Image / carousel */}
        <div className="relative mb-8 group">
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 min-h-[400px]">
              <div className="loader"></div>
            </div>
          )}
          <img
            key={slide}
            src={images[slide]}
            alt={isCarousel ? `${artwork.alt} (${slide + 1} of ${images.length})` : artwork.alt}
            onLoad={() => setLoaded(true)}
            className={`block mx-auto w-auto max-w-full max-h-[80vh] object-contain transition-opacity duration-500 ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {isCarousel && (
            <>
              {/* Prev / next arrows */}
              <button
                onClick={goPrev}
                aria-label="Previous image"
                className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-white/80 backdrop-blur rounded-full shadow-md hover:bg-white hover:text-[#00deff] transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={goNext}
                aria-label="Next image"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-white/80 backdrop-blur rounded-full shadow-md hover:bg-white hover:text-[#00deff] transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* Counter */}
              <div className="absolute top-3 right-3 px-2 py-1 text-xs bg-black/60 text-white rounded-full">
                {slide + 1} / {images.length}
              </div>

              {/* Dot indicators */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {images.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => { setLoaded(false); setSlide(i) }}
                    aria-label={`Go to image ${i + 1}`}
                    className={`w-2 h-2 rounded-full transition-all ${
                      i === slide ? 'bg-white scale-110' : 'bg-white/50 hover:bg-white/80'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Carousel thumbnails */}
        {isCarousel && (
          <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
            {images.map((img, i) => (
              <button
                key={img}
                onClick={() => { setLoaded(false); setSlide(i) }}
                className={`shrink-0 w-16 h-16 overflow-hidden border-2 transition-colors ${
                  i === slide ? 'border-[#00deff]' : 'border-transparent hover:border-gray-300'
                }`}
              >
                <img src={img} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Artwork info */}
        <div className="space-y-4">
          {/* Title */}
          <h1 className="text-3xl font-light tracking-wide">
            {artwork.title}
          </h1>

          {/* Description */}
          {artwork.description && (
            <p className="text-gray-700 leading-relaxed">
              {artwork.description}
            </p>
          )}

          {/* Date */}
          {artwork.date && (
            <p className="text-sm text-gray-500">
              {artwork.date}
            </p>
          )}

          {/* Available for purchase CTA - links to the store (styled to match store .btn) */}
          {artwork.storeUrl && (
            <div className="pt-2">
              <a
                href={artwork.storeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-6 py-2 text-xs uppercase tracking-wider border border-black text-black bg-white hover:bg-black hover:text-white transition-all duration-200"
              >
                Available for purchase →
              </a>
            </div>
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
