import { useMemo } from 'react'
import { allArtworks } from '../../data/artworks'

/**
 * Fisher-Yates shuffle with seed for reproducibility within session
 */
function shuffleWithSeed(array, seed) {
  const arr = [...array]
  let currentSeed = seed

  // Simple seeded random
  const seededRandom = () => {
    currentSeed = (currentSeed * 9301 + 49297) % 233280
    return currentSeed / 233280
  }

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Hook to select N random artworks from the ENTIRE collection
 * Different selection each page load
 */
export function useRandomArtworks(count) {
  return useMemo(() => {
    // Generate a random seed for this page load
    const seed = Math.floor(Math.random() * 100000)

    // Shuffle ALL artworks and take the requested count
    const shuffled = shuffleWithSeed(allArtworks, seed)

    // Take N random artworks from entire collection
    return shuffled.slice(0, count)
  }, [count])
}

export default useRandomArtworks
