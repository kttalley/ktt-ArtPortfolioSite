import { useRef, useMemo, useState, useEffect } from 'react'
import { useFrame, useThree, extend } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
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
 * Soft gradient shadow material
 */
class SoftShadowMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        uOpacity: { value: 0.4 },
        uColor: { value: new THREE.Color('#000000') },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        uniform vec3 uColor;
        varying vec2 vUv;

        void main() {
          vec2 center = vUv - 0.5;
          center.x *= 0.7;
          float dist = length(center) * 2.0;
          float alpha = smoothstep(1.0, 0.0, dist);
          alpha *= smoothstep(1.0, 0.3, dist);
          alpha *= uOpacity;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
    })
  }
}

extend({ SoftShadowMaterial })

/**
 * Floating artwork card with rounded frame
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
  const shadowMatRef = useRef()

  const { mouse, camera, gl } = useThree()

  const [aspect, setAspect] = useState(0.75)
  const [textureLoaded, setTextureLoaded] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const textureRef = useRef(null)
  const focusProgress = useRef(0)

  // Load image texture ONCE
  useEffect(() => {
    if (textureRef.current) return

    const loader = new THREE.TextureLoader()
    loader.load(artwork.src, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 16
      tex.minFilter = THREE.LinearMipmapLinearFilter
      tex.magFilter = THREE.LinearFilter
      tex.needsUpdate = true

      textureRef.current = tex

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

  // Ensure texture stays applied
  useEffect(() => {
    if (textureRef.current && imageMatRef.current && !imageMatRef.current.map) {
      imageMatRef.current.map = textureRef.current
      imageMatRef.current.needsUpdate = true
    }
  })

  // Card dimensions
  const cardHeight = 3.2
  const cardWidth = cardHeight * aspect
  const frameThickness = 0.35
  const frameDepth = 0.42
  const borderRadius = 0.08 // Rounded corners

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

  // Interaction state
  const [isDragging, setIsDragging] = useState(false)
  const dragStartPos = useRef({ x: 0, y: 0 })
  const hasDragged = useRef(false)
  const DRAG_THRESHOLD = 5

  const snapBack = useRef(1)

  const handlePointerDown = (e) => {
    if (isFocused) return
    e.stopPropagation()
    dragStartPos.current = { x: e.clientX, y: e.clientY }
    hasDragged.current = false
    setIsDragging(true)
    gl.domElement.style.cursor = 'grabbing'
  }

  const handlePointerUp = (e) => {
    if (isFocused) {
      onUnfocus?.()
      return
    }

    const wasDragging = isDragging
    setIsDragging(false)
    gl.domElement.style.cursor = isHovered ? 'pointer' : 'auto'

    if (wasDragging && !hasDragged.current) {
      e.stopPropagation()
      focusProgress.current = 0
      onFocus?.(artwork, index)
    }
  }

  const handlePointerMove = (e) => {
    if (!isDragging || isFocused) return

    const dx = e.clientX - dragStartPos.current.x
    const dy = e.clientY - dragStartPos.current.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance > DRAG_THRESHOLD) {
      hasDragged.current = true
      snapBack.current = 0

      if (groupRef.current && e.point) {
        e.stopPropagation()
        groupRef.current.position.x = e.point.x
        groupRef.current.position.y = e.point.y
      }
    }
  }

  useFrame((state, delta) => {
    if (!groupRef.current) return

    const t = state.clock.elapsedTime

    // FOCUS MODE
    if (isFocused) {
      focusProgress.current = Math.min(1, focusProgress.current + delta * 2.5)
      const ease = 1 - Math.pow(1 - focusProgress.current, 4)

      const targetPos = new THREE.Vector3(0, 0, -4.5)
      targetPos.applyQuaternion(camera.quaternion)
      targetPos.add(camera.position)

      groupRef.current.position.lerp(targetPos, ease * 0.12)

      const targetRotY = Math.atan2(
        camera.position.x - groupRef.current.position.x,
        camera.position.z - groupRef.current.position.z
      )
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, 0, ease * 0.08)
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetRotY, ease * 0.08)
      groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, 0, ease * 0.08)

      const focusScale = 1 + ease * 0.12
      groupRef.current.scale.setScalar(focusScale)

      if (shadowMatRef.current) {
        shadowMatRef.current.uniforms.uOpacity.value = THREE.MathUtils.lerp(0.5, 0.15, ease)
      }

      return
    }

    // NORMAL MODE - Sweeping motion
    const slowTime = t * 0.08
    const medTime = t * 0.15

    const sweepX = Math.sin(slowTime * offsets.patternX + offsets.x) * 3.5
    const driftX = noise2D(slowTime + offsets.x, offsets.y) * 1.2

    const bobY = Math.sin(medTime * 0.6 + offsets.phase) * 0.8
    const driftY = noise2D(slowTime + offsets.y, offsets.z) * 0.6

    const sweepZ = Math.sin(slowTime * offsets.patternZ + offsets.z) * 2.5
    const driftZ = noise2D(slowTime + offsets.z, offsets.x) * 1.0

    const breathe = 1 + Math.sin(medTime * 0.3 + offsets.phase) * 0.03
    const hoverScale = isHovered ? 1.06 : 1

    const target = new THREE.Vector3(
      basePosition[0] + sweepX + driftX,
      basePosition[1] + bobY + driftY,
      basePosition[2] + sweepZ + driftZ
    )

    if (!isDragging || !hasDragged.current) {
      snapBack.current = Math.min(1, snapBack.current + delta * 1.2)
      const ease = 1 - Math.pow(1 - snapBack.current, 4)
      const lerpFactor = 0.015 + ease * 0.025

      groupRef.current.position.lerp(target, lerpFactor)
      groupRef.current.scale.setScalar(breathe * hoverScale)
    }

    // ROTATION
    if (!isDragging || !hasDragged.current) {
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
    }

    // FRAME EFFECTS
    if (frameMatRef.current) {
      const viewDir = new THREE.Vector3()
        .subVectors(camera.position, groupRef.current.position)
        .normalize()

      const frontalness = Math.max(0, viewDir.z)
      const sideGlance = Math.abs(viewDir.x) * 0.5
      const lightPulse = Math.sin(t * 0.25 + lightPhase) * 0.15 + 0.85
      const hoverGlow = isHovered ? 0.12 : 0

      frameMatRef.current.emissiveIntensity = (0.1 + frontalness * 0.3 + sideGlance * 0.2 + hoverGlow) * lightPulse
    }

    if (innerFrameRef.current) {
      const glowPulse = Math.sin(t * 0.15 + offsets.phase) * 0.1 + 0.9
      innerFrameRef.current.emissiveIntensity = 0.03 * glowPulse
    }

    // SOFT SHADOW
    if (shadowMatRef.current) {
      const heightAboveGround = groupRef.current.position.y + 3
      const shadowOpacity = THREE.MathUtils.clamp(0.5 - heightAboveGround * 0.04, 0.15, 0.55)
      shadowMatRef.current.uniforms.uOpacity.value = shadowOpacity
    }
  })

  const shadowWidth = cardWidth * 1.8
  const shadowHeight = cardHeight * 0.8

  return (
    <group
      ref={groupRef}
      position={position}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={(e) => {
        if (isDragging && !isFocused) {
          setIsDragging(false)
          gl.domElement.style.cursor = 'auto'
        }
        setIsHovered(false)
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

      {/* INNER FRAME / MAT - with rounded corners */}
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

      {/* OUTER FRAME - Rounded corners */}
      <RoundedBox
        args={[cardWidth, cardHeight, frameDepth]}
        radius={borderRadius}
        smoothness={4}
        castShadow
        receiveShadow
        position={[0, 0, 0]}
      >
        <meshStandardMaterial
          ref={frameMatRef}
          color="#080808"
          roughness={0.25}
          metalness={0.5}
          emissive="#d0d8e0"
          emissiveIntensity={0.15}
          envMapIntensity={1.0}
        />
      </RoundedBox>

      {/* SOFT GRADIENT SHADOW */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -3.01, 0]}
        renderOrder={-1}
      >
        <planeGeometry args={[shadowWidth, shadowHeight]} />
        <softShadowMaterial ref={shadowMatRef} />
      </mesh>
    </group>
  )
}

export default ArtworkCard3D
