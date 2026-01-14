import { useState, useEffect, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Masonry from 'react-masonry-css'
import InfiniteScroll from 'react-infinite-scroll-component'

function MasonryGallery({ artworks, title }) {
  const location = useLocation()
  const currentPath = location.pathname
  const [displayedArtworks, setDisplayedArtworks] = useState([])
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(0)
  const artworksPerPage = 12

  // Reset when artworks change (e.g., when filtering by tag)
  useEffect(() => {
    setDisplayedArtworks([])
    setPage(0)
    setHasMore(true)
  }, [artworks])

  // Load initial artworks after reset
  useEffect(() => {
    if (displayedArtworks.length === 0 && artworks.length > 0) {
      loadMoreArtworks()
    }
  }, [displayedArtworks, artworks])

  const loadMoreArtworks = useCallback(() => {
    const startIndex = page * artworksPerPage
    const endIndex = startIndex + artworksPerPage
    const newArtworks = artworks.slice(startIndex, endIndex)

    if (newArtworks.length === 0) {
      setHasMore(false)
      return
    }

    setDisplayedArtworks(prev => [...prev, ...newArtworks])
    setPage(prev => prev + 1)

    if (endIndex >= artworks.length) {
      setHasMore(false)
    }
  }, [page, artworks])

  // Responsive breakpoints for masonry columns
  const breakpointColumns = {
    default: 4,
    1200: 3,
    900: 2,
    600: 1
  }

  return (
    <div>
      {/* Optional title for filtered views */}
      {title && (
        <div className="mb-8">
          <h2 className="text-2xl font-light tracking-wide uppercase">
            {title}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {artworks.length} work{artworks.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      <InfiniteScroll
        dataLength={displayedArtworks.length}
        next={loadMoreArtworks}
        hasMore={hasMore}
        loader={
          <div className="flex justify-center py-8">
            <div className="loader"></div>
          </div>
        }
        endMessage={
          <p className="text-center py-8 text-gray-500 text-sm">
            {artworks.length === 0 ? 'No artworks found' : 'End of gallery'}
          </p>
        }
        className="w-full"
      >
        <Masonry
          breakpointCols={breakpointColumns}
          className="masonry-grid"
          columnClassName="masonry-grid-column"
        >
          {displayedArtworks.map((artwork) => (
            <ImageCard key={artwork.id} artwork={artwork} returnPath={currentPath} />
          ))}
        </Masonry>
      </InfiniteScroll>
    </div>
  )
}

function ImageCard({ artwork, returnPath }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  if (error) {
    return null
  }

  return (
    <Link to={`/post/${artwork.id}`} state={{ from: returnPath }} className="entry-card block">
      <div className={`bg-gray-100 ${loaded ? '' : 'min-h-[200px]'}`}>
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-[#00deff] rounded-full animate-spin"></div>
          </div>
        )}
        <img
          src={artwork.src}
          alt={artwork.alt}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={`w-full h-auto block transition-opacity duration-500 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
          loading="lazy"
        />
        {/* Hover overlay with title - uses CSS classes from index.css */}
        <div className="image-overlay">
          <div className="image-title">
            <p className="text-white text-sm font-light truncate">
              {artwork.title}
            </p>
          </div>
        </div>
      </div>
    </Link>
  )
}

export default MasonryGallery
