import { allArtworks } from '../data/artworks'
import MasonryGallery from '../components/MasonryGallery'
import HeroScene from '../components/HeroScene'

function Gallery() {
  return (
    <>
      <title>Kristian Talley - Art Portfolio</title>
      <meta name="description" content="Kristian Talley is a multidisciplinary artist working in illustration, painting, printmaking, and sculpture. Browse an archive of original artwork and recent work." />
      <link rel="canonical" href="https://kristiantalley.com/" />
      <HeroScene />
      <MasonryGallery artworks={allArtworks} />
    </>
  )
}

export default Gallery
