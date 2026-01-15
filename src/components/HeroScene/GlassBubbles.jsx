import { useRef, useMemo, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshTransmissionMaterial, useFBO } from '@react-three/drei'
import * as THREE from 'three'
import { easing } from 'maath'

/**
 * Single glass bubble with refraction and magnification
 */
function GlassBubble({
  initialPosition,
  phase,
  baseScale,
  squash,
  ior,
  thickness,
  chromaticAberration
}) {
  const meshRef = useRef()
  const velocity = useRef(new THREE.Vector3(
    (Math.random() - 0.5) * 0.02,
    (Math.random() - 0.5) * 0.015,
    (Math.random() - 0.5) * 0.02
  ))

  const basePos = useRef(new THREE.Vector3(...initialPosition))
  const currentPos = useRef(new THREE.Vector3(...initialPosition))

  // Bounds for movement
  const bounds = useMemo(() => ({
    min: new THREE.Vector3(-10, -3, -15),
    max: new THREE.Vector3(10, 4, 3)
  }), [])

  useFrame((state, delta) => {
    if (!meshRef.current) return

    const t = state.clock.elapsedTime

    // Gentle floating motion with sine waves
    const floatX = Math.sin(t * 0.15 + phase * 5) * 2
    const floatY = Math.sin(t * 0.12 + phase * 3) * 1.5 + Math.cos(t * 0.08 + phase) * 0.5
    const floatZ = Math.sin(t * 0.1 + phase * 4) * 1.5

    // Target position
    const target = new THREE.Vector3(
      basePos.current.x + floatX,
      basePos.current.y + floatY,
      basePos.current.z + floatZ
    )

    // Smooth movement
    easing.damp3(currentPos.current, target, 0.3, delta)
    meshRef.current.position.copy(currentPos.current)

    // Gentle rotation
    meshRef.current.rotation.x = Math.sin(t * 0.2 + phase) * 0.3
    meshRef.current.rotation.y = t * 0.1 + phase
    meshRef.current.rotation.z = Math.sin(t * 0.15 + phase * 2) * 0.2

    // Breathing scale
    const breathe = 1 + Math.sin(t * 0.3 + phase * 2) * 0.08
    meshRef.current.scale.set(
      baseScale * squash.x * breathe,
      baseScale * squash.y * breathe,
      baseScale * squash.z * breathe
    )

    // Keep in bounds with soft wrapping
    const pos = meshRef.current.position
    if (pos.x < bounds.min.x) basePos.current.x += 0.1
    if (pos.x > bounds.max.x) basePos.current.x -= 0.1
    if (pos.y < bounds.min.y) basePos.current.y += 0.08
    if (pos.y > bounds.max.y) basePos.current.y -= 0.08
    if (pos.z < bounds.min.z) basePos.current.z += 0.1
    if (pos.z > bounds.max.z) basePos.current.z -= 0.1
  })

  return (
    <mesh ref={meshRef} position={initialPosition}>
      <sphereGeometry args={[1, 32, 32]} />
      <MeshTransmissionMaterial
        backside
        samples={6}
        resolution={256}
        transmission={1}
        roughness={0.0}
        thickness={thickness}
        ior={ior}
        chromaticAberration={chromaticAberration}
        anisotropy={0.2}
        distortion={0.1}
        distortionScale={0.2}
        temporalDistortion={0.1}
        color="#ffffff"
        attenuationDistance={3}
        attenuationColor="#f0f8ff"
      />
    </mesh>
  )
}

/**
 * Collection of refractive glass bubbles floating through the scene
 */
function GlassBubbles({ count = 8 }) {
  // Generate bubble configurations
  const bubbles = useMemo(() => {
    const configs = []

    for (let i = 0; i < count; i++) {
      // Random position spread through the scene
      const position = [
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 5,
        -2 - Math.random() * 10
      ]

      // Varying sizes - some larger, some smaller
      const sizeVariant = Math.random()
      const baseScale = sizeVariant < 0.3
        ? 0.3 + Math.random() * 0.2  // Small bubbles
        : sizeVariant < 0.7
          ? 0.5 + Math.random() * 0.3  // Medium bubbles
          : 0.8 + Math.random() * 0.4  // Large bubbles

      // Ellipsoid squash for variety - some spherical, some elongated
      const squashType = Math.random()
      const squash = squashType < 0.4
        ? { x: 1, y: 1, z: 1 }  // Spherical
        : squashType < 0.7
          ? { x: 1.2, y: 0.85, z: 1 }  // Horizontally stretched
          : { x: 0.9, y: 1.3, z: 0.9 }  // Vertically stretched

      // Varying glass properties
      const ior = 1.1 + Math.random() * 0.15  // 1.1 - 1.25
      const thickness = 2 + Math.random() * 4  // 2 - 6
      const chromaticAberration = 0.02 + Math.random() * 0.08  // 0.02 - 0.1

      configs.push({
        id: i,
        position,
        phase: Math.random() * Math.PI * 2,
        baseScale,
        squash,
        ior,
        thickness,
        chromaticAberration
      })
    }

    return configs
  }, [count])

  return (
    <group>
      {bubbles.map((bubble) => (
        <GlassBubble
          key={bubble.id}
          initialPosition={bubble.position}
          phase={bubble.phase}
          baseScale={bubble.baseScale}
          squash={bubble.squash}
          ior={bubble.ior}
          thickness={bubble.thickness}
          chromaticAberration={bubble.chromaticAberration}
        />
      ))}
    </group>
  )
}

export default GlassBubbles
