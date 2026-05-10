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
  const treeMeshes = useMemo(() => {

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

    const tuneMaterial = (sourceMaterial) => {
      const material = sourceMaterial.clone();
      const materialName = material.name?.toLowerCase() ?? '';
      const isTrunk =
        materialName.includes('trunk') ||
        materialName.includes('bark') ||
        materialName.includes('wood');

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

    return meshes.map(mesh => {

      // Clone material so we can safely modify it
      const material = Array.isArray(mesh.material)
        ? mesh.material.map(tuneMaterial)
        : tuneMaterial(mesh.material);

      return {
        geometry: mesh.geometry,
        material
      };
    });

  }, [nodes]);

  // Generate deterministic transforms
  const matrices = useMemo(() => {

    const results = [];

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

        dummy.scale.set(
          scale * (0.92 + rng() * 0.16),
          scale * (0.95 + rng() * 0.22),
          scale * (0.92 + rng() * 0.16)
        );

        dummy.updateMatrix();

        results.push(dummy.matrix.clone());

        if (results.length >= count) {
          return results;
        }
      }
    }

    return results;

  }, [terrainSize, count, seed]);

  if (treeMeshes.length === 0) return null;

  return (
    <group>
      {treeMeshes.map((meshData, index) => (
        <InstancedTreeMesh
          key={index}
          geometry={meshData.geometry}
          material={meshData.material}
          matrices={matrices}
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
