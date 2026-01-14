// Artwork data with metadata
// Medium categories matching kristiantalley.com
export const MEDIUMS = {
  illustration: 'illustration',
  painting: 'painting',
  sculpture: 'sculpture',
  printmaking: 'printmaking',
  programming: 'programming'
}

// Helper to generate artwork entry
const createArtwork = (id, src, title, description, date, mediums) => ({
  id,
  src,
  title,
  description,
  date,
  mediums, // array of medium tags
  alt: title
})

// Main art folder images with sample metadata
// You can update these with actual artwork details
export const artFolderWorks = [
  createArtwork(
    'art-1',
    '/art/1.jpg',
    'Untitled Work 1',
    'Mixed media on paper',
    '2023',
    [MEDIUMS.illustration]
  ),
  createArtwork(
    'art-2',
    '/art/2.jpg',
    'Untitled Work 2',
    'Digital illustration',
    '2023',
    [MEDIUMS.illustration]
  ),
  createArtwork(
    'art-3',
    '/art/3.jpg',
    'Untitled Work 3',
    'Ink on paper',
    '2022',
    [MEDIUMS.illustration, MEDIUMS.printmaking]
  ),
  createArtwork(
    'art-4',
    '/art/4.jpg',
    'Untitled Work 4',
    'Acrylic on canvas',
    '2022',
    [MEDIUMS.painting]
  ),
  createArtwork(
    'art-5',
    '/art/5.jpg',
    'Untitled Work 5',
    'Mixed media',
    '2021',
    [MEDIUMS.illustration]
  ),
  createArtwork(
    'art-6',
    '/art/6.jpg',
    'Untitled Work 6',
    'Digital artwork',
    '2021',
    [MEDIUMS.illustration]
  ),
  createArtwork(
    'art-7',
    '/art/7.jpg',
    'Untitled Work 7',
    'Ink and watercolor',
    '2020',
    [MEDIUMS.painting, MEDIUMS.illustration]
  ),
  createArtwork(
    'art-8',
    '/art/8.jpg',
    'Untitled Work 8',
    'Screenprint',
    '2020',
    [MEDIUMS.printmaking]
  )
]

// Import all tumblr images and convert to artwork format
import tumblrImagesRaw from './tumblrImages.js'

// Convert tumblr images to artwork format with metadata
export const tumblrWorks = tumblrImagesRaw.map((img, index) => ({
  id: img.id,
  src: img.src,
  title: `Archive ${index + 1}`,
  description: 'Archived work from tumblr',
  date: '',
  mediums: [MEDIUMS.illustration], // Default medium, can be customized
  alt: img.alt
}))

// Combined artworks - featured art first, then tumblr archive
export const allArtworks = [...artFolderWorks, ...tumblrWorks]

// Get artwork by ID
export const getArtworkById = (id) => {
  return allArtworks.find(artwork => artwork.id === id)
}

// Get artworks by medium
export const getArtworksByMedium = (medium) => {
  return allArtworks.filter(artwork => artwork.mediums.includes(medium))
}

// Get all unique mediums from artworks
export const getAllMediums = () => {
  const mediums = new Set()
  allArtworks.forEach(artwork => {
    artwork.mediums.forEach(m => mediums.add(m))
  })
  return Array.from(mediums)
}

export default allArtworks
