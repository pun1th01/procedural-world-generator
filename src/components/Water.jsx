import { useMemo } from 'react'
import * as THREE from 'three'

const WATER_LEVEL = -13

export default function Water({ terrainSize = 380 }) {
  const geometry = useMemo(
    () => new THREE.PlaneGeometry(terrainSize , terrainSize , 1, 1),
    [terrainSize]
  )

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color('#2a6e85'),
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        metalness: 0.1,
        roughness: 0.2,
        side: THREE.FrontSide,
      }),
    []
  )

  return (
    <mesh
      geometry={geometry}
      material={material}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, WATER_LEVEL, 0]}
      renderOrder={2}
      frustumCulled={false}
    />
  )
}
