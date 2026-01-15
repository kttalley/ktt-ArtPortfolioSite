import { useRef, useMemo, useState, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Layered sine noise
 */
function noise2D(x, y) {
  return (
    Math.sin(x * 1.1) * 0.5 +
    Math.sin(y * 0.7) * 0.5 +
    Math.sin(x * 0.4 + y * 0.25) * 0.35
  ) / 1.35
}

function ArtworkCard3D({ artwork, position, index, seed = 0 }) {
  const groupRef = useRef()
  const imageMatRef = useRef()
  const frameMatRef = useRef()

  const { mouse, camera, gl } = useThree()

  const [aspect, setAspect] = useState(0.75)
  const [textureLoaded, setTextureLoaded] = useState(false)

  // Load image
  useEffect(() => {
    const loader = new THREE.TextureLoader()
    loader.load(artwork.src, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 8
      tex.needsUpdate = true

      if (imageMatRef.current) {
        imageMatRef.current.map = tex
        imageMatRef.current.needsUpdate = true
      }

      if (tex.image) {
        setAspect(tex.image.width / tex.image.height)
      }

      setTextureLoaded(true)
    })
  }, [artwork.src])

  const cardHeight = 2
  const cardWidth = cardHeight * aspect

  // Animation offsets
  const offsets = useMemo(
    () => ({
      x: seed + index * 1.3,
      y: seed + index * 2.1,
      z: seed + index * 0.8,
      r: seed + index * 1.7,
    }),
    [index, seed]
  )

  const basePosition = useMemo(() => [...position], [position])

  // Drag
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState([0, 0, 0])
  const snapBack = useRef(1)

  const handlePointerDown = (e) => {
    e.stopPropagation()
    setIsDragging(true)
    snapBack.current = 0
    gl.domElement.style.cursor = 'grabbing'

    setDragOffset([
      groupRef.current.position.x - e.point.x,
      groupRef.current.position.y - e.point.y,
      0,
    ])
  }

  const handlePointerUp = () => {
    setIsDragging(false)
    gl.domElement.style.cursor = 'grab'
  }

  const handlePointerMove = (e) => {
    if (!isDragging) return
    e.stopPropagation()
    groupRef.current.position.x = e.point.x + dragOffset[0]
    groupRef.current.position.y = e.point.y + dragOffset[1]
  }

  useFrame((state, delta) => {
    if (!groupRef.current) return

    const t = state.clock.elapsedTime * 0.18

    // ── FLOATING MOTION (more pronounced)
    const driftX = noise2D(t + offsets.x, offsets.y) * 0.45
    const driftY =
      noise2D(t + offsets.y, offsets.z) * 0.35 +
      Math.sin(t * 0.8 + index) * 0.15
    const driftZ = noise2D(t + offsets.z, offsets.x) * 0.25

    const target = [
      basePosition[0] + driftX,
      basePosition[1] + driftY,
      basePosition[2] + driftZ,
    ]

    if (!isDragging) {
      snapBack.current = Math.min(1, snapBack.current + delta * 1.8)
      const ease = 1 - Math.pow(1 - snapBack.current, 3)

      groupRef.current.position.lerp(
        new THREE.Vector3(...target),
        0.04 + ease * 0.06
      )
    }

    // ── ROTATION
    groupRef.current.rotation.x = Math.sin(t * 0.6 + offsets.r) * 0.08
    groupRef.current.rotation.y =
      Math.sin(t * 0.45 + offsets.x) * 0.12 + mouse.x * 0.05
    groupRef.current.rotation.z = Math.sin(t * 0.35 + offsets.y) * 0.04

    // ── FRAME PARALLAX "REFLECTION"
    if (frameMatRef.current) {
      const viewDir = new THREE.Vector3()
        .subVectors(camera.position, groupRef.current.position)
        .normalize()

      frameMatRef.current.emissiveIntensity =
        0.15 + Math.max(0, viewDir.z) * 0.35
    }

    // ── DEPTH BLUR (distance-based)
    const dist = Math.abs(groupRef.current.position.z)
    if (imageMatRef.current) {
      imageMatRef.current.opacity = THREE.MathUtils.clamp(
        1 - dist * 0.05,
        0.55,
        1
      )
    }
  })

  return (
    <group
      ref={groupRef}
      position={position}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerMove={handlePointerMove}
      onPointerOver={() => !isDragging && (gl.domElement.style.cursor = 'grab')}
      onPointerOut={() => !isDragging && (gl.domElement.style.cursor = 'auto')}
    >
      {/* IMAGE — pristine */}
      <mesh castShadow position={[0, 0, 0.03]}>
        <planeGeometry args={[cardWidth, cardHeight]} />
        <meshBasicMaterial
          ref={imageMatRef}
          color={textureLoaded ? '#ffffff' : '#cccccc'}
          toneMapped={false}
          transparent
        />
      </mesh>

      {/* FRAME — reflective parallax */}
      <mesh castShadow receiveShadow position={[0, 0, -0.05]}>
        <boxGeometry args={[cardWidth + 0.08, cardHeight + 0.08, 0.05]} />
        <meshStandardMaterial
          ref={frameMatRef}
          color="#0d0d0d"
          roughness={0.35}
          metalness={0.15}
          emissive="#ffffff"
          emissiveIntensity={0.2}
        />
      </mesh>
    </group>
  )
}

export default ArtworkCard3D
