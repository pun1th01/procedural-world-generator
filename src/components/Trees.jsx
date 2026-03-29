import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

const LEAVES_COLOR = new THREE.Color('#2F5D3A');
const TRUNK_COLOR = new THREE.Color('#7A6654');

function createRandomTrees(count, terrainSize, variantCount) {
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
      variantIndex: Math.floor(Math.random() * variantCount),
    };
  });
}

function extractVariants(root) {
  if (!root || !root.children?.length) {
    return [];
  }

  const variants = root.children.filter((child) => child.isObject3D);
  return variants.length > 0 ? variants : [root];
}

function cloneVariantWithMaterials(variant) {
  const object = variant.clone(true);

  const applyColorFallback = (material, meshName) => {
    if (!material || !('color' in material) || !material.color) {
      return material;
    }

    const meshNameLower = (meshName || '').toLowerCase();
    const materialNameLower = (material.name || '').toLowerCase();
    const id = `${meshNameLower} ${materialNameLower}`;

    if (id.includes('leaf') || id.includes('leaves')) {
      material.color.copy(LEAVES_COLOR);
    } else if (id.includes('trunk') || id.includes('bark') || id.includes('stem')) {
      material.color.copy(TRUNK_COLOR);
    }

    return material;
  };

  object.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    if (Array.isArray(node.material)) {
      node.material = node.material.map((material) => {
        const cloned = material?.clone();
        return applyColorFallback(cloned, node.name);
      });
    } else if (node.material) {
      const cloned = node.material.clone();
      node.material = applyColorFallback(cloned, node.name);
    }
  });

  return object;
}

export default function Trees({ terrainSize = 100, count = 100, modelPath }) {
  const gltf = useGLTF(modelPath);

  const variants = useMemo(() => extractVariants(gltf.scene), [gltf.scene]);
  const treeData = useMemo(
    () => createRandomTrees(count, terrainSize, Math.max(variants.length, 1)),
    [count, terrainSize, variants.length]
  );
  const trees = useMemo(
    () =>
      treeData.map((tree) => {
        const variant = variants[tree.variantIndex] || gltf.scene;
        return {
          ...tree,
          object: cloneVariantWithMaterials(variant),
        };
      }),
    [treeData, variants, gltf.scene]
  );

  return (
    <group>
      {trees.map((tree, index) => {
        return (
          <group
            key={index}
            position={tree.position}
            rotation={[0, tree.rotationY, 0]}
            scale={[tree.scale, tree.scale, tree.scale]}
          >
            <primitive object={tree.object} dispose={null} />
          </group>
        );
      })}
    </group>
  );
}

useGLTF.preload('/Assets/Models/pine_tree.glb');
