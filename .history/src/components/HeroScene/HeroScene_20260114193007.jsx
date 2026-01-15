import { Suspense, useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { PerspectiveCamera, Preload, Environment } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import ArtworkCard3D from './ArtworkCard3D'
import FlockingParticles from './FlockingParticles'
import useRandomArtworks from './useRandomArtworks'

/**
 * Calculate card positions - spread across depth
 */
function calculateCardPositions(count, seed) {
  const positions = []

  for (let i = 0; i < count; i++) {
    const spreadX = 8
    const spreadY = 3
    const spreadZ = 10

    const baseX = (i - (count - 1) / 2) * (spreadX / count) * 1.5
    const randX = baseX + (Math.random() - 0.5) * 3
    const randY = (Math.random() - 0.5) * spreadY
    const randZ = -3 - (i % 3) * 3 - Math.random() * spreadZ

    positions.push([randX, randY, randZ])
  }

  return positions
}

/**
 * Responsive card count
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
 * Undulating ambient light
 */
function UndulatingLight() {
  const lightRef = useRef()
  const light2Ref = useRef()

  useFrame((state) => {
    const t = state.clock.elapsedTime

    if (lightRef.current) {
      lightRef.current.intensity = 0.7 + Math.sin(t * 0.15) * 0.25
      lightRef.current.position.x = Math.sin(t * 0.08) * 4
      lightRef.current.position.y = 10 + Math.sin(t * 0.1) * 3
    }

    if (light2Ref.current) {
      light2Ref.current.intensity = 0.4 + Math.sin(t * 0.2 + 1.5) * 0.15
      light2Ref.current.position.x = Math.sin(t * 0.06 + 2) * 5
    }
  })

  return (
    <>
      <directionalLight
        ref={lightRef}
        position={[3, 12, 6]}
        intensity={0.8}
        color="#866523"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-far={60}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-bias={-0.0001}
      />

      <directionalLight
        ref={light2Ref}
        position={[-6, 8, 4]}
        intensity={0.45}
        color="#f0f5ff"
      />

      <pointLight
        position={[0, 15, -5]}
        intensity={0.35}
        color="#ffffff"
        distance={40}
        decay={2}
      />
    </>
  )
}

/**
 * Subtle floor grid for depth perception
 */
function FloorGrid() {
  const gridRef = useRef()

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (gridRef.current) {
      gridRef.current.material.opacity = 0.08 + Math.sin(t * 0.1) * 0.02
    }
  })

  // Create grid lines
  const gridLines = useMemo(() => {
    const lines = []
    const size = 60
    const divisions = 30
    const step = size / divisions

    // Horizontal lines (along X)
    for (let i = -divisions / 2; i <= divisions / 2; i++) {
      lines.push(
        new THREE.Vector3(-size / 2, 0, i * step),
        new THREE.Vector3(size / 2, 0, i * step)
      )
    }

    // Vertical lines (along Z)
    for (let i = -divisions / 2; i <= divisions / 2; i++) {
      lines.push(
        new THREE.Vector3(i * step, 0, -size / 2),
        new THREE.Vector3(i * step, 0, size / 2)
      )
    }

    return new Float32Array(lines.flatMap(v => [v.x, v.y, v.z]))
  }, [])

  return (
    <lineSegments ref={gridRef} position={[0, -3.02, -15]} rotation={[0, 0, 0]}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={gridLines.length / 3}
          array={gridLines}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color="#b0b0b0" transparent opacity={0.1} />
    </lineSegments>
  )
}

/**
 * Liminal ground plane with horizon and depth cues
 */
function LiminalGround() {
  const horizonRef = useRef()
  const gradientRef = useRef()

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (horizonRef.current) {
      horizonRef.current.opacity = 0.6 + Math.sin(t * 0.12) * 0.15
    }
  })

  return (
    <group>
      {/* Main floor - subtle warm tint */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3, -8]} receiveShadow>
        <planeGeometry args={[120, 80]} />
        <meshStandardMaterial
          color="#f0f0ec"
          roughness={0.95}
          metalness={0}
          transparent
          opacity={0.25}
        />
      </mesh>

      {/* Shadow receiver */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.01, -8]} receiveShadow>
        <planeGeometry args={[120, 80]} />
        <shadowMaterial transparent opacity={0.15} />
      </mesh>

      {/* Horizon line - more prominent */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.99, -25]}>
        <planeGeometry args={[150, 0.08]} />
        <meshBasicMaterial
          ref={horizonRef}
          color="#a0a0a0"
          transparent
          opacity={0.7}
        />
      </mesh>

      {/* Horizon glow band */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.98, -25]}>
        <planeGeometry args={[150, 3]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.12}
        />
      </mesh>

      {/* Distance fade - white void */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.02, -45]}>
        <planeGeometry args={[150, 50]} />
        <meshBasicMaterial
          ref={gradientRef}
          color="#ffffff"
          transparent
          opacity={0.98}
        />
      </mesh>

      {/* Vertical back wall hint - very subtle */}
      <mesh position={[0, 8, -50]}>
        <planeGeometry args={[150, 30]} />
        <meshBasicMaterial
          color="#fafafa"
          transparent
          opacity={0.5}
        />
      </mesh>
    </group>
  )
}

/**
 * Loading fallback
 */
function LoadingFallback() {
  return null
}

/**
 * Scene content with focus management
 */
function SceneContent({ artworks, positions, seed, focusedIndex, onFocus, onUnfocus }) {
  const lightPhaseRef = useRef(0)

  useFrame((state) => {
    lightPhaseRef.current = state.clock.elapsedTime * 0.25
  })

  return (
    <>
      <UndulatingLight />

      <ambientLight intensity={0.75} color="#fafafa" />

      <hemisphereLight
        color="#ffffff"
        groundColor="#e0e0e0"
        intensity={0.6}
      />

      {/* Artwork cards */}
      {artworks.map((artwork, i) => (
        <ArtworkCard3D
          key={artwork.id}
          artwork={artwork}
          position={positions[i]}
          index={i}
          seed={seed}
          lightPhase={lightPhaseRef.current}
          isFocused={focusedIndex === i}
          onFocus={onFocus}
          onUnfocus={onUnfocus}
        />
      ))}

      <FlockingParticles count={30} />
      <FloorGrid />
      <LiminalGround />
    </>
  )
}

/**
 * Artwork info overlay component
 */
function ArtworkOverlay({ artwork, isVisible, onClose }) {
  const [opacity, setOpacity] = useState(0)

  useEffect(() => {
    if (isVisible) {
      // Fade in
      const timer = setTimeout(() => setOpacity(1), 100)
      return () => clearTimeout(timer)
    } else {
      setOpacity(0)
    }
  }, [isVisible])

  if (!artwork && !isVisible) return null

  return (
    <div
      className="absolute inset-0 pointer-events-none flex items-end justify-center pb-16 sm:pb-20"
      style={{
        opacity,
        transition: 'opacity 0.5s ease-out',
      }}
    >
      {/* Info panel */}
      <div
        className="pointer-events-auto bg-white/90 backdrop-blur-sm rounded-lg shadow-lg px-6 py-4 mx-4 max-w-lg"
        style={{
          transform: `translateY(${opacity === 1 ? 0 : 20}px)`,
          transition: 'transform 0.5s ease-out',
        }}
      >
        {artwork && (
          <>
            <h3 className="text-lg sm:text-xl font-medium text-gray-900 mb-1">
              {artwork.title || 'Untitled'}
            </h3>
            {artwork.year && (
              <p className="text-sm text-gray-500 mb-2">{artwork.year}</p>
            )}
            {artwork.medium && (
              <p className="text-sm text-gray-600 mb-2">{artwork.medium}</p>
            )}
            {artwork.description && (
              <p className="text-sm text-gray-700 leading-relaxed">
                {artwork.description}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-3">
              Click anywhere to close
            </p>
          </>
        )}
      </div>

      {/* Click backdrop to close */}
      <div
        className="absolute inset-0 pointer-events-auto"
        onClick={onClose}
        style={{ zIndex: -1 }}
      />
    </div>
  )
}

/**
 * Main 3D Hero Scene - Liminal gallery with floating paintings
 */
function HeroScene() {
  const cardCount = useResponsiveCardCount()
  const artworks = useRandomArtworks(cardCount)

  const seed = useMemo(() => Math.random() * 1000, [])
  const positions = useMemo(() => calculateCardPositions(cardCount, seed), [cardCount, seed])

  const cameraPosition = useMemo(() => {
    const baseX = (Math.random() - 0.5) * 1
    const baseY = 0.5 + Math.random() * 0.3
    const baseZ = 10 + Math.random() * 2
    return [baseX, baseY, baseZ]
  }, [])

  // Focus state
  const [focusedIndex, setFocusedIndex] = useState(null)
  const [focusedArtwork, setFocusedArtwork] = useState(null)
  const [showOverlay, setShowOverlay] = useState(false)

  const handleFocus = useCallback((artwork, index) => {
    setFocusedArtwork(artwork)
    setFocusedIndex(index)
    // Delay overlay appearance for smooth animation
    setTimeout(() => setShowOverlay(true), 400)
  }, [])

  const handleUnfocus = useCallback(() => {
    setShowOverlay(false)
    // Delay state reset for animation
    setTimeout(() => {
      setFocusedIndex(null)
      setFocusedArtwork(null)
    }, 300)
  }, [])

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && focusedIndex !== null) {
        handleUnfocus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focusedIndex, handleUnfocus])

  return (
    <div className="hero-scene-container h-[50vh] sm:h-[60vh] lg:h-[70vh] w-full relative">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.15,
          powerPreference: 'high-performance',
        }}
      >
        <PerspectiveCamera
          makeDefault
          position={cameraPosition}
          fov={50}
          near={0.1}
          far={120}
        />

        <Environment preset="studio" background={false} />

        <Suspense fallback={<LoadingFallback />}>
          <SceneContent
            artworks={artworks}
            positions={positions}
            seed={seed}
            focusedIndex={focusedIndex}
            onFocus={handleFocus}
            onUnfocus={handleUnfocus}
          />
          <Preload all />
        </Suspense>

        <fog attach="fog" args={['#ffffff', 15, 55]} />

        <EffectComposer multisampling={0}>
          <Bloom
            intensity={0.25}
            luminanceThreshold={0.8}
            luminanceSmoothing={0.6}
            mipmapBlur
          />
          <Vignette
            offset={0.4}
            darkness={0.2}
            eskil={false}
          />
        </EffectComposer>
      </Canvas>

      {/* Artwork info overlay */}
      <ArtworkOverlay
        artwork={focusedArtwork}
        isVisible={showOverlay}
        onClose={handleUnfocus}
      />

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent pointer-events-none" />
    </div>
  )
}

export default HeroScene
