import { useRef, useMemo } from 'react'
import { useFrame, extend } from '@react-three/fiber'
import { shaderMaterial } from '@react-three/drei'
import * as THREE from 'three'

const WATER_LEVEL = -13

const WaterMaterial = shaderMaterial(
  {
    uTime: 0,
    uDeepColor: new THREE.Color('#1a4a5c'),
    uShallowColor: new THREE.Color('#3a8fa3'),
  },
  // vertex shader
  `
    uniform float uTime;
    varying vec2 vUv;
    varying float vElevation;

    void main() {
      vUv = uv;
      vec4 modelPosition = modelMatrix * vec4(position, 1.0);

      float elevation =
  (sin(modelPosition.x * 0.06 + uTime * 0.8) * 0.5 + 0.5) * 0.22 +
  (sin(modelPosition.z * 0.08 + uTime * 0.6) * 0.5 + 0.5) * 0.18 +
  (sin(modelPosition.x * 0.03 + modelPosition.z * 0.04 + uTime * 0.4) * 0.5 + 0.5) * 0.12;

modelPosition.y += elevation;
      vElevation = elevation;

      gl_Position = projectionMatrix * viewMatrix * modelPosition;
    }
  `,
  // fragment shader
  `
    uniform vec3 uDeepColor;
    uniform vec3 uShallowColor;
    uniform float uTime;
    varying vec2 vUv;
    varying float vElevation;

    void main() {
      float mixStrength = (vElevation + 0.5) * 0.6;
      vec3 color = mix(uDeepColor, uShallowColor, mixStrength);

      // Edge fade — transparent where water meets terrain edge
      float edgeFadeX = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x);
      float edgeFadeZ = smoothstep(0.0, 0.04, vUv.y) * smoothstep(1.0, 0.96, vUv.y);
      float edgeFade = edgeFadeX * edgeFadeZ;

      gl_FragColor = vec4(color, 0.82 * edgeFade);
    }
  `
)

extend({ WaterMaterial })

export default function Water({ terrainSize = 380 }) {
  const materialRef = useRef()

  const geometry = useMemo(
    () => new THREE.PlaneGeometry(terrainSize, terrainSize, 32, 32),
    [terrainSize]
  )

  useFrame((_, delta) => {
    if (materialRef.current) {
      materialRef.current.uTime += delta
    }
  })

  return (
    <mesh
      geometry={geometry}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, WATER_LEVEL, 0]}
      renderOrder={2}
      frustumCulled={false}
    >
      <waterMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        side={0}
      />
    </mesh>
  )
}

