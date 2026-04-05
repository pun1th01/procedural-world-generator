import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

function mulberry32(seed) {
  let t = seed >>> 0;

  return function random() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function createRandomTrees(count, terrainSize, seed) {
  const random = mulberry32(seed);
  const half = terrainSize / 2;

  return Array.from({ length: count }, () => {
    const x = (random() - 0.5) * terrainSize;
    const z = (random() - 0.5) * terrainSize;
    const rotationY = random() * Math.PI * 2;
    const scale = 0.8 + random() * 0.4;

    return {
      position: [THREE.MathUtils.clamp(x, -half, half), 0, THREE.MathUtils.clamp(z, -half, half)],
      rotationY,
      scale,
    };
  });
}

export default function Trees({ terrainSize = 100, count = 100, modelPath, seed = 42 }) {
  const { scene } = useGLTF(modelPath);

  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh) {
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => {
            if (material) {
              material.needsUpdate = true;
            }
          });
        } else if (child.material) {
          child.material.needsUpdate = true;
        }

        console.log('[Trees] mesh material:', child.name, child.material);
      }
    });
  }, [scene]);

  const trees = useMemo(() => createRandomTrees(count, terrainSize, seed), [count, terrainSize, seed]);

  return (
    <group>
      {trees.map((tree, index) => (
        <group
          key={index}
          position={tree.position}
          rotation={[0, tree.rotationY, 0]}
          scale={[tree.scale, tree.scale, tree.scale]}
        >
          <primitive object={scene.clone()} dispose={null} />
        </group>
      ))}
    </group>
  );
}

useGLTF.preload('/Assets/Models/pine_tree.glb');
