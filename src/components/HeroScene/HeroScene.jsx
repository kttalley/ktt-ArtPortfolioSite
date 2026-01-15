import { Suspense, useState, useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerspectiveCamera, Preload, ContactShadows } from '@react-three/drei'
import ArtworkCard3D from './ArtworkCard3D'
import useRandomArtworks from './useRandomArtworks'

/**
 * Calculate randomized card positions - different each page load
 */
function calculateCardPositions(count, seed) {
  const positions = []
  const random = (min, max) => min + (Math.sin(seed * positions.length * 9999) * 0.5 + 0.5) * (max - min)

  for (let i = 0; i < count; i++) {
    // Spread cards across the view with randomization
    const spreadX = 10
    const spreadY = 3
    const spreadZ = 5

    // Base position with randomized offsets
    const baseX = (i - (count - 1) / 2) * (spreadX / count)
    const randX = baseX + (Math.random() - 0.5) * 2
    const randY = (Math.random() - 0.5) * spreadY
    const randZ = -2 - Math.random() * spreadZ

    positions.push([randX, randY, randZ])
  }

  return positions
}

/**
 * Custom hook for responsive card count
 */
function useResponsiveCardCount() {
  const [count, setCount] = useState(5)

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 640) {
        setCount(3)
      } else if (window.innerWidth < 1024) {
        setCount(4)
      } else {
        setCount(5)
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return count
}

/**
 * Minimalist horizon line
 */
function HorizonLine() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.5, -8]}>
      <planeGeometry args={[60, 0.005]} />
      <meshBasicMaterial color="#d0d0d0" transparent opacity={0.5} />
    </mesh>
  )
}

/**
 * Loading fallback
 */
function LoadingFallback() {
  return null
}

/**
 * Main 3D Hero Scene - Liminal gallery space with floating paintings
 */
function HeroScene() {
  const cardCount = useResponsiveCardCount()
  const artworks = useRandomArtworks(cardCount)

  // Random seed generated once on mount - different each page load
  const seed = useMemo(() => Math.random() * 1000, [])

  // Randomized positions - different each page load
  const positions = useMemo(() => calculateCardPositions(cardCount, seed), [cardCount, seed])

  // Randomized camera position - slight variation each page load
  const cameraPosition = useMemo(() => {
    const baseX = (Math.random() - 0.5) * 2  // -1 to 1
    const baseY = 0.3 + Math.random() * 0.5  // 0.3 to 0.8
    const baseZ = 7 + Math.random() * 2      // 7 to 9
    return [baseX, baseY, baseZ]
  }, [])

  return (
    <div className="hero-scene-container h-[50vh] sm:h-[60vh] lg:h-[70vh] w-full relative">
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{
          antialias: true,
          alpha: true,
        }}
      >
        <PerspectiveCamera
          makeDefault
          position={cameraPosition}
          fov={45}
          near={0.1}
          far={100}
        />

        {/* Simple lighting */}
        <ambientLight intensity={0.8} />
        <directionalLight
          position={[5, 10, 5]}
          intensity={0.6}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />

        <Suspense fallback={<LoadingFallback />}>
          {artworks.map((artwork, i) => (
            <ArtworkCard3D
              key={artwork.id}
              artwork={artwork}
              position={positions[i]}
              index={i}
              seed={seed}
            />
          ))}

          <ContactShadows
            position={[0, -2.5, 0]}
            opacity={0.3}
            scale={25}
            blur={2}
            far={5}
          />

          <HorizonLine />
          <Preload all />
        </Suspense>

        <fog attach="fog" args={['#ffffff', 12, 35]} />
      </Canvas>

      {/* Gradient overlay for smooth transition */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent pointer-events-none" />
    </div>
  )
}

export default HeroScene
