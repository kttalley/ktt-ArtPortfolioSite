import { allArtworks } from '../data/artworks'
import MasonryGallery from '../components/MasonryGallery'
import HeroScene from '../components/HeroScene'

function Gallery() {
  return (
    <>
      <HeroScene />
      <MasonryGallery artworks={allArtworks} />
    </>
  )
}

export default Gallery
