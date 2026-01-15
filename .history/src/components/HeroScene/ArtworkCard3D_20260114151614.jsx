import { useRef, useMemo, useState, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Simple layered sine noise for organic movement
 */
function noise2D(x, y) {
  return (
    Math.sin(x * 1.2) * 0.5 +
    Math.sin(y * 0.8) * 0.5 +
    Math.sin(x * 0.5 + y * 0.3) * 0.3
  ) / 1.3
}

/**
 * Floating artwork card - no frame, just the image
 */
function ArtworkCard3D({ artwork, position, index, seed = 0 }) {
  const groupRef = useRef()
  const materialRef = useRef()
  const { mouse, gl } = useThree()

  // Texture loading state
  const [textureLoaded, setTextureLoaded] = useState(false)
  const [aspect, setAspect] = useState(0.75)

  // Load texture manually and apply directly to material
  useEffect(() => {
    const loader = new THREE.TextureLoader()
    loader.load(
      artwork.src,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.needsUpdate = true
        if (materialRef.current) {
          materialRef.current.map = tex
          materialRef.current.needsUpdate = true
        }
        if (tex.image) {
          setAspect(tex.image.width / tex.image.height)
        }
        setTextureLoaded(true)
      },
      undefined,
      (err) => console.error('Texture load error:', artwork.src, err)
    )
  }, [artwork.src])

  // Drag state
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState([0, 0, 0])
  const snapBackProgress = useRef(1)

  // Card dimensions
  const cardHeight = 2
  const cardWidth = cardHeight * aspect

  // Unique animation offsets
  const offsets = useMemo(() => ({
    x: seed + index * 1.7,
    y: seed + index * 2.3,
    z: seed + index * 0.9,
    rotX: seed + index * 1.1,
    rotY: seed + index * 0.7,
    rotZ: seed + index * 1.9,
  }), [index, seed])

  const basePosition = useMemo(() => [...position], [position])

  // Drag handlers
  const handlePointerDown = (e) => {
    e.stopPropagation()
    setIsDragging(true)
    snapBackProgress.current = 0
    gl.domElement.style.cursor = 'grabbing'
    if (groupRef.current) {
      setDragOffset([
        groupRef.current.position.x - e.point.x,
        groupRef.current.position.y - e.point.y,
        0
      ])
    }
  }

  const handlePointerUp = (e) => {
    if (isDragging) {
      e.stopPropagation()
      setIsDragging(false)
      gl.domElement.style.cursor = 'grab'
    }
  }

  const handlePointerMove = (e) => {
    if (isDragging && groupRef.current) {
      e.stopPropagation()
      groupRef.current.position.x = e.point.x + dragOffset[0]
      groupRef.current.position.y = e.point.y + dragOffset[1]
    }
  }

  // Animation
  useFrame((state, delta) => {
    if (!groupRef.current) return

    const time = state.clock.elapsedTime * 0.15

    const driftX = noise2D(time + offsets.x, offsets.y) * 0.3
    const driftY = noise2D(time + offsets.y, offsets.z) * 0.2
    const driftZ = noise2D(time + offsets.z, offsets.x) * 0.15

    const targetX = basePosition[0] + driftX
    const targetY = basePosition[1] + driftY + Math.sin(time * 0.5 + index) * 0.1
    const targetZ = basePosition[2] + driftZ

    if (!isDragging) {
      snapBackProgress.current = Math.min(1, snapBackProgress.current + delta * 2)
      const ease = 1 - Math.pow(1 - snapBackProgress.current, 3)
      const lerpSpeed = 0.02 + ease * 0.05

      groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, targetX, lerpSpeed)
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, targetY, lerpSpeed)
      groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, targetZ, lerpSpeed)
    }

    // Gentle rotation
    const wiggleX = Math.sin(time * 0.7 + offsets.rotX) * 0.04
    const wiggleY = Math.sin(time * 0.5 + offsets.rotY) * 0.06
    const wiggleZ = Math.sin(time * 0.3 + offsets.rotZ) * 0.02
    const mouseInfluence = isDragging ? 0 : 0.03

    groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, wiggleX + mouse.y * mouseInfluence, 0.1)
    groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, wiggleY + mouse.x * mouseInfluence, 0.1)
    groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, wiggleZ, 0.1)
  })

  return (
    <group
      ref={groupRef}
      position={position}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerMove={handlePointerMove}
      onPointerOver={() => { if (!isDragging) gl.domElement.style.cursor = 'grab' }}
      onPointerOut={() => { if (!isDragging) gl.domElement.style.cursor = 'auto' }}
    >
      {/* Just the artwork - simple plane */}
      <mesh castShadow>
        <planeGeometry args={[cardWidth, cardHeight]} />
        <meshBasicMaterial
          ref={materialRef}
          color={textureLoaded ? '#ffffff' : '#cccccc'}
          side={THREE.FrontSide}
        />
      </mesh>

      {/* Thin backing for slight depth */}
      <mesh position={[0, 0, -0.02]} castShadow>
        <planeGeometry args={[cardWidth + 0.05, cardHeight + 0.05]} />
        <meshBasicMaterial color="#111111" side={THREE.FrontSide} />
      </mesh>
    </group>
  )
}

export default ArtworkCard3D
