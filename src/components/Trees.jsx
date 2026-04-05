import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

function createRandomTrees(count, terrainSize) {
  const half = terrainSize / 2;

  return Array.from({ length: count }, () => {
    const x = THREE.MathUtils.randFloatSpread(terrainSize);
    const z = THREE.MathUtils.randFloatSpread(terrainSize);
    const rotationY = THREE.MathUtils.randFloat(0, Math.PI * 2);
    const scale = THREE.MathUtils.randFloat(0.8, 1.2);

    return {
      position: [THREE.MathUtils.clamp(x, -half, half), 0, THREE.MathUtils.clamp(z, -half, half)],
      rotationY,
      scale,
    };
  });
}

export default function Trees({ terrainSize = 100, count = 100, modelPath }) {
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

  const trees = useMemo(() => createRandomTrees(count, terrainSize), [count, terrainSize]);

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
