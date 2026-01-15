import { useMemo } from 'react'
import { allArtworks, artFolderWorks } from '../../data/artworks'

/**
 * Fisher-Yates shuffle
 */
function shuffle(array) {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Hook to select N random artworks for the hero section
 * Different selection each page load
 */
export function useRandomArtworks(count) {
  // Empty dependency array + Date.now() ensures new selection each mount
  return useMemo(() => {
    // Prioritize featured art folder images
    const featured = shuffle(artFolderWorks)
    const archive = shuffle(allArtworks.filter(a => a.src.startsWith('/tumblr/')))

    const selected = []

    // Take from featured first
    const featuredCount = Math.min(count, featured.length)
    selected.push(...featured.slice(0, featuredCount))

    // Fill remaining from archive if needed
    if (selected.length < count) {
      const remaining = count - selected.length
      selected.push(...archive.slice(0, remaining))
    }

    return selected
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, Date.now()])
}

export default useRandomArtworks
