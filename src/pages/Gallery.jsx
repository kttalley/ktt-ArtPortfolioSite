import { allArtworks } from '../data/artworks'
import MasonryGallery from '../components/MasonryGallery'

function Gallery() {
  return <MasonryGallery artworks={allArtworks} />
}

export default Gallery
