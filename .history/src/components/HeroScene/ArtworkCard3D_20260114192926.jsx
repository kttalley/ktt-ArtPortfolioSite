import { useRef, useMemo, useState, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Layered sine noise for organic, sweeping movement
 */
function noise2D(x, y) {
  return (
    Math.sin(x * 0.8) * 0.6 +
    Math.sin(y * 0.5) * 0.6 +
    Math.sin(x * 0.3 + y * 0.2) * 0.4 +
    Math.sin(x * 1.5 - y * 0.6) * 0.25
  ) / 1.85
}

/**
 * Floating artwork card with click-to-focus functionality
 */
function ArtworkCard3D({
  artwork,
  position,
  index,
  seed = 0,
  lightPhase = 0,
  isFocused = false,
  onFocus,
  onUnfocus
}) {
  const groupRef = useRef()
  const imageMatRef = useRef()
  const frameMatRef = useRef()
  const innerFrameRef = useRef()
  const shadowPlaneRef = useRef()

  const { mouse, camera, gl } = useThree()

  const [aspect, setAspect] = useState(0.75)
  const [textureLoaded, setTextureLoaded] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  // Focus animation state
  const focusProgress = useRef(0)
  const preFocusPosition = useRef(new THREE.Vector3())
  const preFocusRotation = useRef(new THREE.Euler())

  // Load image texture
  useEffect(() => {
    const loader = new THREE.TextureLoader()
    loader.load(artwork.src, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 16
      tex.minFilter = THREE.LinearMipmapLinearFilter
      tex.magFilter = THREE.LinearFilter
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

  // Card dimensions
  const cardHeight = 3.2
  const cardWidth = cardHeight * aspect
  const frameThickness = 0.35
  const frameDepth = 0.42

  // Animation offsets
  const offsets = useMemo(
    () => ({
      x: seed + index * 2.1,
      y: seed + index * 3.7,
      z: seed + index * 1.3,
      rotX: seed + index * 1.8,
      rotY: seed + index * 1.2,
      rotZ: seed + index * 2.9,
      phase: index * 0.6 + seed * 0.1,
      patternX: (index % 3) * 0.3 + 0.7,
      patternZ: ((index + 1) % 3) * 0.4 + 0.6,
    }),
    [index, seed]
  )

  const basePosition = useMemo(() => [...position], [position])

  // Drag state
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState([0, 0, 0])
  const snapBack = useRef(1)

  const handlePointerDown = (e) => {
    if (isFocused) return
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

  const handlePointerUp = (e) => {
    if (isFocused) return
    setIsDragging(false)
    gl.domElement.style.cursor = isHovered ? 'pointer' : 'auto'
  }

  const handlePointerMove = (e) => {
    if (!isDragging || isFocused) return
    e.stopPropagation()
    groupRef.current.position.x = e.point.x + dragOffset[0]
    groupRef.current.position.y = e.point.y + dragOffset[1]
  }

  const handleClick = (e) => {
    e.stopPropagation()
    if (isFocused) {
      onUnfocus?.()
    } else {
      // Store current position before focusing
      if (groupRef.current) {
        preFocusPosition.current.copy(groupRef.current.position)
        preFocusRotation.current.copy(groupRef.current.rotation)
      }
      focusProgress.current = 0
      onFocus?.(artwork, index)
    }
  }

  useFrame((state, delta) => {
    if (!groupRef.current) return

    const t = state.clock.elapsedTime

    // ══════════════════════════════════════════════════════════════
    // FOCUS MODE - Animate to center of view
    // ══════════════════════════════════════════════════════════════
    if (isFocused) {
      focusProgress.current = Math.min(1, focusProgress.current + delta * 2.5)
      const ease = 1 - Math.pow(1 - focusProgress.current, 4)

      // Calculate target position in front of camera
      const targetPos = new THREE.Vector3(0, 0, -5)
      targetPos.applyQuaternion(camera.quaternion)
      targetPos.add(camera.position)

      // Lerp to focus position
      groupRef.current.position.lerp(targetPos, ease * 0.15)

      // Face camera
      const targetRotY = Math.atan2(
        camera.position.x - groupRef.current.position.x,
        camera.position.z - groupRef.current.position.z
      )
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, 0, ease * 0.1)
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetRotY, ease * 0.1)
      groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, 0, ease * 0.1)

      // Slight scale up when focused
      const focusScale = 1 + ease * 0.15
      groupRef.current.scale.setScalar(focusScale)

      // Keep shadow visible but adjusted
      if (shadowPlaneRef.current) {
        shadowPlaneRef.current.material.opacity = 0.3 * ease
      }

      return
    }

    // ══════════════════════════════════════════════════════════════
    // NORMAL MODE - Sweeping motion
    // ══════════════════════════════════════════════════════════════
    const slowTime = t * 0.08
    const medTime = t * 0.15

    const sweepX = Math.sin(slowTime * offsets.patternX + offsets.x) * 3.5
    const driftX = noise2D(slowTime + offsets.x, offsets.y) * 1.2

    const bobY = Math.sin(medTime * 0.6 + offsets.phase) * 0.8
    const driftY = noise2D(slowTime + offsets.y, offsets.z) * 0.6

    const sweepZ = Math.sin(slowTime * offsets.patternZ + offsets.z) * 2.5
    const driftZ = noise2D(slowTime + offsets.z, offsets.x) * 1.0

    const breathe = 1 + Math.sin(medTime * 0.3 + offsets.phase) * 0.03
    // Hover scale boost
    const hoverScale = isHovered ? 1.08 : 1

    const target = new THREE.Vector3(
      basePosition[0] + sweepX + driftX,
      basePosition[1] + bobY + driftY,
      basePosition[2] + sweepZ + driftZ
    )

    if (!isDragging) {
      snapBack.current = Math.min(1, snapBack.current + delta * 1.2)
      const ease = 1 - Math.pow(1 - snapBack.current, 4)
      const lerpFactor = 0.015 + ease * 0.025

      groupRef.current.position.lerp(target, lerpFactor)
      groupRef.current.scale.setScalar(breathe * hoverScale)
    }

    // ══════════════════════════════════════════════════════════════
    // ROTATION
    // ══════════════════════════════════════════════════════════════
    const rotSpeed = 0.1
    const velocityInfluence = 0.08

    const targetRotX = Math.sin(t * rotSpeed * 0.5 + offsets.rotX) * 0.12 +
                       Math.cos(slowTime * offsets.patternX) * velocityInfluence
    const targetRotY = Math.sin(t * rotSpeed * 0.4 + offsets.rotY) * 0.18 +
                       mouse.x * 0.04 +
                       Math.sin(slowTime * offsets.patternZ) * velocityInfluence
    const targetRotZ = Math.sin(t * rotSpeed * 0.25 + offsets.rotZ) * 0.06

    groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetRotX, 0.06)
    groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetRotY, 0.06)
    groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, targetRotZ, 0.06)

    // ══════════════════════════════════════════════════════════════
    // FRAME EFFECTS
    // ══════════════════════════════════════════════════════════════
    if (frameMatRef.current) {
      const viewDir = new THREE.Vector3()
        .subVectors(camera.position, groupRef.current.position)
        .normalize()

      const frontalness = Math.max(0, viewDir.z)
      const sideGlance = Math.abs(viewDir.x) * 0.5
      const lightPulse = Math.sin(t * 0.25 + lightPhase) * 0.15 + 0.85
      const hoverGlow = isHovered ? 0.15 : 0

      frameMatRef.current.emissiveIntensity = (0.1 + frontalness * 0.3 + sideGlance * 0.2 + hoverGlow) * lightPulse
    }

    if (innerFrameRef.current) {
      const glowPulse = Math.sin(t * 0.15 + offsets.phase) * 0.1 + 0.9
      innerFrameRef.current.emissiveIntensity = 0.03 * glowPulse
    }

    // ══════════════════════════════════════════════════════════════
    // PROMINENT CAST SHADOW
    // ══════════════════════════════════════════════════════════════
    if (shadowPlaneRef.current) {
      const heightAboveGround = groupRef.current.position.y + 3
      // Larger, more prominent shadow
      const shadowScale = 1.3 + heightAboveGround * 0.35
      // Darker shadow, stays visible
      const shadowOpacity = THREE.MathUtils.clamp(0.4 - heightAboveGround * 0.025, 0.15, 0.45)

      shadowPlaneRef.current.position.y = -3 - groupRef.current.position.y
      shadowPlaneRef.current.scale.set(shadowScale, shadowScale * 0.6, 1)
      shadowPlaneRef.current.material.opacity = shadowOpacity
    }
  })

  return (
    <group
      ref={groupRef}
      position={position}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        handlePointerUp()
        setIsHovered(false)
        if (!isFocused) gl.domElement.style.cursor = 'auto'
      }}
      onPointerMove={handlePointerMove}
      onPointerOver={() => {
        setIsHovered(true)
        if (!isDragging && !isFocused) gl.domElement.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setIsHovered(false)
        if (!isDragging && !isFocused) gl.domElement.style.cursor = 'auto'
      }}
      onClick={handleClick}
    >
      {/* IMAGE PLANE */}
      <mesh position={[0, 0, frameDepth / 2 + 0.01]}>
        <planeGeometry args={[cardWidth - frameThickness * 0.5, cardHeight - frameThickness * 0.5]} />
        <meshBasicMaterial
          ref={imageMatRef}
          color={textureLoaded ? '#ffffff' : '#e8e8e8'}
          toneMapped={false}
          transparent
        />
      </mesh>

      {/* INNER FRAME / MAT */}
      <mesh position={[0, 0, frameDepth / 2 - 0.005]}>
        <planeGeometry args={[cardWidth - frameThickness * 0.3, cardHeight - frameThickness * 0.3]} />
        <meshStandardMaterial
          ref={innerFrameRef}
          color="#fafafa"
          roughness={0.95}
          metalness={0}
          emissive="#ffffff"
          emissiveIntensity={0.02}
        />
      </mesh>

      {/* OUTER FRAME */}
      <mesh castShadow receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[cardWidth, cardHeight, frameDepth]} />
        <meshStandardMaterial
          ref={frameMatRef}
          color="#080808"
          roughness={0.25}
          metalness={0.5}
          emissive="#d0d8e0"
          emissiveIntensity={0.15}
          envMapIntensity={1.0}
        />
      </mesh>

      {/* FRAME EDGE HIGHLIGHT */}
      <lineSegments position={[0, 0, frameDepth / 2 + 0.002]}>
        <edgesGeometry args={[new THREE.BoxGeometry(cardWidth + 0.02, cardHeight + 0.02, 0.001)]} />
        <lineBasicMaterial color="#333333" transparent opacity={0.25} />
      </lineSegments>

      {/* PROMINENT GROUND SHADOW - Elliptical, soft */}
      <mesh
        ref={shadowPlaneRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -3, 0]}
        renderOrder={-1}
      >
        <planeGeometry args={[cardWidth * 1.4, cardHeight * 0.5]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

export default ArtworkCard3D
