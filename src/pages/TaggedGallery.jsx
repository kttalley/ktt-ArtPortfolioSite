import { useParams, Link } from 'react-router-dom'
import { getArtworksByMedium, MEDIUMS } from '../data/artworks'
import MasonryGallery from '../components/MasonryGallery'

function TaggedGallery() {
  const { medium } = useParams()

  // Validate medium
  const isValidMedium = Object.values(MEDIUMS).includes(medium)

  if (!isValidMedium) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <h2 className="text-2xl font-light mb-4">Category not found</h2>
        <p className="text-gray-500 mb-6">
          The medium "{medium}" doesn't exist.
        </p>
        <Link
          to="/"
          className="px-4 py-2 border border-[#0c0c0c] hover:bg-[#0c0c0c] hover:text-white transition-colors"
        >
          Back to Gallery
        </Link>
      </div>
    )
  }

  const filteredArtworks = getArtworksByMedium(medium)

  return (
    <MasonryGallery
      artworks={filteredArtworks}
      title={medium}
    />
  )
}

export default TaggedGallery
