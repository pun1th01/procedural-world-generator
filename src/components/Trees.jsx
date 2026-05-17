import { useMemo, useRef, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { ALPINE_TERRAIN, TerrainGenerator, mulberry32 } from '../utils/terrainMath';

export default function Trees({
  terrainSize = ALPINE_TERRAIN.worldSize,
  count = 260,
  modelPath,
  seed = 42
}) {

  const { nodes } = useGLTF(modelPath);

  // Grab ALL meshes from GLB
  const parsedMeshes = useMemo(() => {

    const meshes = Object.values(nodes).filter(
      (node) => node.isMesh
    );

    const foliageColors = [
      new THREE.Color('#234434'),
      new THREE.Color('#2F5A46'),
      new THREE.Color('#4F7A61')
    ];

    const trunkColor = new THREE.Color('#5B3A29');
    let foliageIndex = 0;

    const tuneMaterial = (sourceMaterial, isTrunk) => {
      const material = sourceMaterial.clone();

      if (material.color?.isColor) {
        material.color.copy(
          isTrunk
            ? trunkColor
            : foliageColors[foliageIndex++ % foliageColors.length]
        );
      }

      material.map = null;
      material.side = THREE.DoubleSide;
      material.transparent = false;
      material.depthWrite = true;
      material.roughness = isTrunk ? 0.62 : 0.38;
      material.needsUpdate = true;

      return material;
    };

    const trunks = [];
    const foliages = [];

    meshes.forEach(mesh => {
      const matName = Array.isArray(mesh.material)
        ? (mesh.material[0]?.name ?? '').toLowerCase()
        : (mesh.material?.name ?? '').toLowerCase();
      
      const meshName = (mesh.name ?? '').toLowerCase();

      const isTrunk =
        matName.includes('trunk') ||
        matName.includes('bark') ||
        matName.includes('wood') ||
        meshName.includes('trunk') ||
        meshName.includes('bark') ||
        meshName.includes('wood');

      const material = Array.isArray(mesh.material)
        ? mesh.material.map(m => tuneMaterial(m, isTrunk))
        : tuneMaterial(mesh.material, isTrunk);

      if (isTrunk) {
        trunks.push({ geometry: mesh.geometry, material });
      } else {
        foliages.push({ geometry: mesh.geometry, material });
      }
    });

    return { trunks, foliages };

  }, [nodes]);

  // Generate deterministic transforms per mesh variant
  const instancedData = useMemo(() => {
    
    const { trunks, foliages } = parsedMeshes;
    const trunkMatrices = trunks.map(() => []);
    const foliageMatrices = foliages.map(() => []);
    let currentCount = 0;

    const dummy = new THREE.Object3D();

    const generator = new TerrainGenerator(seed, { worldSize: terrainSize });

    const rng = mulberry32(seed ^ 0x9e3779b9);

    const spacing = 6.0;

    const half = terrainSize / 2;

    for (let x = -half + spacing; x < half - spacing; x += spacing) {

      for (let z = -half + spacing; z < half - spacing; z += spacing) {

        // organic jitter
        const jitterX =
          x + (rng() - 0.5) * spacing;

        const jitterZ =
          z + (rng() - 0.5) * spacing;

        if (rng() > 0.22) continue;

        const forestMask =
          generator.noise2D(
            jitterX * 0.009,
            jitterZ * 0.009
          );

        if (forestMask <= 0.22) continue;

        const sample =
          generator.sample(
            jitterX,
            jitterZ
          );

        const { slope } =
          generator.getNormalAndSlope(
            jitterX,
            jitterZ
          );

        const finalY = sample.height;

        if (
          finalY > 34 ||
          slope < 0.78
        ) continue;

        if (
          sample.mountainCore > 0.36 ||
          sample.mountainMask > 0.72
        ) continue;

        const scale =
          0.38 + rng() * 0.32;

        dummy.position.set(
          jitterX,
          finalY,
          jitterZ
        );

        dummy.position.y +=
          rng() * 0.15;

        dummy.rotation.y =
          rng() * Math.PI * 2;

        // Apply uniform scaling so proportions remain exactly as designed
        // and trunks do not poke through the foliage
        const uniformScale = scale * (0.9 + rng() * 0.2);
        dummy.scale.set(
          uniformScale,
          uniformScale,
          uniformScale
        );

        dummy.updateMatrix();

        // Select ONE matching variant instead of mixing trunks and foliages
        const maxVariants = Math.max(trunks.length, foliages.length);
        const variantIdx = maxVariants > 0 ? Math.floor(rng() * maxVariants) : 0;

        if (trunks.length > 0) {
          trunkMatrices[variantIdx % trunks.length].push(dummy.matrix.clone());
        }
        
        if (foliages.length > 0) {
          foliageMatrices[variantIdx % foliages.length].push(dummy.matrix.clone());
        }

        currentCount++;

        if (currentCount >= count) {
          return { trunkMatrices, foliageMatrices };
        }
      }
    }

    return { trunkMatrices, foliageMatrices };

  }, [parsedMeshes, terrainSize, count, seed]);

  if (!instancedData) return null;
  const { trunks, foliages } = parsedMeshes;
  const { trunkMatrices, foliageMatrices } = instancedData;

  return (
    <group>
      {trunks.map((meshData, index) => (
        <InstancedTreeMesh
          key={`trunk-${index}`}
          geometry={meshData.geometry}
          material={meshData.material}
          matrices={trunkMatrices[index]}
        />
      ))}
      {foliages.map((meshData, index) => (
        <InstancedTreeMesh
          key={`foliage-${index}`}
          geometry={meshData.geometry}
          material={meshData.material}
          matrices={foliageMatrices[index]}
        />
      ))}
    </group>
  );
}

function InstancedTreeMesh({
  geometry,
  material,
  matrices
}) {

  const meshRef = useRef();

  useEffect(() => {

    if (!meshRef.current) return;

    matrices.forEach((matrix, i) => {
      meshRef.current.setMatrixAt(i, matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;

  }, [matrices]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[
        geometry,
        material,
        matrices.length
      ]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}

useGLTF.preload('/Assets/Models/pine_tree.glb');
