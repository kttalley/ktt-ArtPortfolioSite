import { useRef, useMemo } from 'react'
import { useFrame, extend } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Custom shader material for large prismatic shimmer particles
 */
class PrismaticShimmerMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 180.0 },
      },
      vertexShader: `
        attribute float aPhase;
        attribute float aScale;
        varying float vPhase;
        varying float vAlpha;
        uniform float uTime;
        uniform float uSize;

        void main() {
          vPhase = aPhase;

          // Flutter scale animation
          float flutter = 1.0 + sin(uTime * 2.5 + aPhase * 6.28) * 0.4;
          float breathe = 1.0 + sin(uTime * 0.8 + aPhase * 3.14) * 0.3;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

          // Distance-based alpha with wider visible range
          float dist = -mvPosition.z;
          vAlpha = smoothstep(50.0, 3.0, dist) * smoothstep(0.5, 2.0, dist);

          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = uSize * aScale * flutter * breathe * (1.0 / -mvPosition.z) * 0.5;
          gl_PointSize = clamp(gl_PointSize, 20.0, 300.0);
        }
      `,
      fragmentShader: `
        varying float vPhase;
        varying float vAlpha;
        uniform float uTime;

        void main() {
          vec2 center = gl_PointCoord - 0.5;
          float dist = length(center);

          if (dist > 0.5) discard;

          // Soft radial gradient
          float softEdge = smoothstep(0.5, 0.0, dist);
          float core = smoothstep(0.3, 0.0, dist);

          // Prismatic color based on angle and time
          float angle = atan(center.y, center.x);
          float hue = angle / 6.28 + uTime * 0.1 + vPhase;

          // Rainbow to white gradient
          vec3 rainbow = vec3(
            sin(hue * 6.28) * 0.15 + 0.95,
            sin(hue * 6.28 + 2.09) * 0.12 + 0.95,
            sin(hue * 6.28 + 4.18) * 0.18 + 0.92
          );

          // Shimmer pulse
          float shimmer = sin(uTime * 3.0 + vPhase * 12.0 + dist * 8.0) * 0.3 + 0.7;

          // Combine: bright white core, prismatic edge
          vec3 color = mix(rainbow, vec3(1.0), core * 0.8) * shimmer;

          // Sparkle highlights
          float sparkle = pow(sin(uTime * 5.0 + vPhase * 20.0) * 0.5 + 0.5, 8.0);
          color += sparkle * 0.4;

          float alpha = softEdge * vAlpha * 0.85;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  }
}

extend({ PrismaticShimmerMaterial })

/**
 * Boid class for flocking behavior
 */
class Boid {
  constructor(x, y, z, index) {
    this.position = new THREE.Vector3(x, y, z)
    this.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.04,
      (Math.random() - 0.5) * 0.03,
      (Math.random() - 0.5) * 0.04
    )
    this.acceleration = new THREE.Vector3()
    this.maxSpeed = 0.06 + Math.random() * 0.03
    this.maxForce = 0.002
    this.phase = Math.random()
    this.scale = 0.8 + Math.random() * 0.6
    this.index = index
  }

  separate(boids, desiredSeparation = 2.5) {
    const steer = new THREE.Vector3()
    let count = 0

    for (const other of boids) {
      const d = this.position.distanceTo(other.position)
      if (d > 0 && d < desiredSeparation) {
        const diff = new THREE.Vector3().subVectors(this.position, other.position)
        diff.normalize()
        diff.divideScalar(d)
        steer.add(diff)
        count++
      }
    }

    if (count > 0) {
      steer.divideScalar(count)
      steer.normalize()
      steer.multiplyScalar(this.maxSpeed)
      steer.sub(this.velocity)
      steer.clampLength(0, this.maxForce)
    }

    return steer
  }

  align(boids, neighborDist = 5) {
    const sum = new THREE.Vector3()
    let count = 0

    for (const other of boids) {
      const d = this.position.distanceTo(other.position)
      if (d > 0 && d < neighborDist) {
        sum.add(other.velocity)
        count++
      }
    }

    if (count > 0) {
      sum.divideScalar(count)
      sum.normalize()
      sum.multiplyScalar(this.maxSpeed)
      const steer = new THREE.Vector3().subVectors(sum, this.velocity)
      steer.clampLength(0, this.maxForce)
      return steer
    }

    return new THREE.Vector3()
  }

  cohesion(boids, neighborDist = 6) {
    const sum = new THREE.Vector3()
    let count = 0

    for (const other of boids) {
      const d = this.position.distanceTo(other.position)
      if (d > 0 && d < neighborDist) {
        sum.add(other.position)
        count++
      }
    }

    if (count > 0) {
      sum.divideScalar(count)
      return this.seek(sum)
    }

    return new THREE.Vector3()
  }

  seek(target) {
    const desired = new THREE.Vector3().subVectors(target, this.position)
    desired.normalize()
    desired.multiplyScalar(this.maxSpeed)
    const steer = new THREE.Vector3().subVectors(desired, this.velocity)
    steer.clampLength(0, this.maxForce)
    return steer
  }

  flock(boids, time) {
    const sep = this.separate(boids)
    const ali = this.align(boids)
    const coh = this.cohesion(boids)

    sep.multiplyScalar(2.0)
    ali.multiplyScalar(1.2)
    coh.multiplyScalar(1.0)

    this.acceleration.add(sep)
    this.acceleration.add(ali)
    this.acceleration.add(coh)

    // Gentle sine wave wandering
    const wander = new THREE.Vector3(
      Math.sin(time * 0.4 + this.phase * 10) * 0.001,
      Math.sin(time * 0.3 + this.phase * 8) * 0.0015,
      Math.sin(time * 0.35 + this.phase * 6) * 0.001
    )
    this.acceleration.add(wander)
  }

  bounds(min, max) {
    const margin = 3
    const turnForce = 0.003

    if (this.position.x < min.x + margin) this.acceleration.x += turnForce
    if (this.position.x > max.x - margin) this.acceleration.x -= turnForce
    if (this.position.y < min.y + margin) this.acceleration.y += turnForce
    if (this.position.y > max.y - margin) this.acceleration.y -= turnForce
    if (this.position.z < min.z + margin) this.acceleration.z += turnForce
    if (this.position.z > max.z - margin) this.acceleration.z -= turnForce
  }

  update() {
    this.velocity.add(this.acceleration)
    this.velocity.clampLength(0, this.maxSpeed)
    this.position.add(this.velocity)
    this.acceleration.set(0, 0, 0)
  }
}

/**
 * Large flocking particles with prismatic shimmer
 */
function FlockingParticles({ count = 25 }) {
  const meshRef = useRef()
  const materialRef = useRef()

  const boids = useMemo(() => {
    const arr = []
    for (let i = 0; i < count; i++) {
      arr.push(new Boid(
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 8,
        -2 - Math.random() * 12,
        i
      ))
    }
    return arr
  }, [count])

  const bounds = useMemo(() => ({
    min: new THREE.Vector3(-12, -4, -18),
    max: new THREE.Vector3(12, 5, 4)
  }), [])

  const { positions, phases, scales } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const phases = new Float32Array(count)
    const scales = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      positions[i * 3] = boids[i].position.x
      positions[i * 3 + 1] = boids[i].position.y
      positions[i * 3 + 2] = boids[i].position.z
      phases[i] = boids[i].phase
      scales[i] = boids[i].scale
    }

    return { positions, phases, scales }
  }, [boids, count])

  useFrame((state) => {
    if (!meshRef.current || !materialRef.current) return

    const time = state.clock.elapsedTime
    materialRef.current.uniforms.uTime.value = time

    for (const boid of boids) {
      boid.flock(boids, time)
      boid.bounds(bounds.min, bounds.max)
      boid.update()
    }

    const posArray = meshRef.current.geometry.attributes.position.array
    for (let i = 0; i < count; i++) {
      posArray[i * 3] = boids[i].position.x
      posArray[i * 3 + 1] = boids[i].position.y
      posArray[i * 3 + 2] = boids[i].position.z
    }
    meshRef.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aPhase"
          count={count}
          array={phases}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-aScale"
          count={count}
          array={scales}
          itemSize={1}
        />
      </bufferGeometry>
      <prismaticShimmerMaterial ref={materialRef} />
    </points>
  )
}

export default FlockingParticles
