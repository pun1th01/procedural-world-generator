import { useMemo, useRef, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { ALPINE_TERRAIN, TerrainGenerator, mulberry32 } from '../utils/terrainMath';

// ─────────────────────────────────────────────────────────────────────────────
// PALETTE
// 4 foliage tones arranged low→high altitude.
// Dark, desaturated, blue-shifted to match the moody sky and terrain.
// Trunk is dark brown — never warm/orange.
// ─────────────────────────────────────────────────────────────────────────────
const FOLIAGE_COLORS = [
  new THREE.Color('#2A4A34'), // valley — dark but readable
  new THREE.Color('#325442'), // mid slope
  new THREE.Color('#3A5C48'), // upland
  new THREE.Color('#3E6248'), // near tree line
];
const TRUNK_COLOR = new THREE.Color('#38201A');

// ─────────────────────────────────────────────────────────────────────────────
// LEDGE DETECTION CONSTANTS
// Trees growing on terrace ledge edges look wrong — the terrain drops sharply
// right next to them. We sample 4 neighbours and reject if the terrain falls
// away faster than LEDGE_DROP_THRESHOLD within LEDGE_DIST units.
// ─────────────────────────────────────────────────────────────────────────────
const LEDGE_DIST      = 4.5;  // world units to check
const LEDGE_THRESHOLD = 3.2;  // max acceptable height drop
const LEDGE_DIST_NEAR = 2.2;

export default function Trees({
  terrainSize = ALPINE_TERRAIN.worldSize,
  count       = 260,
  modelPath,
  seed        = 42,
}) {
  const { nodes } = useGLTF(modelPath);

  // ── Parse GLB ──────────────────────────────────────────────────────────────
  // Extract trunk and foliage geometries.
  // Build one material per foliage color group (4 total) so altitude-based
  // color variation works across instances — standard InstancedMesh only
  // supports one material per draw call, so we render one call per color.
  // ──────────────────────────────────────────────────────────────────────────
  const parsedMeshes = useMemo(() => {
    const meshes = Object.values(nodes).filter(n => n.isMesh);

    const trunkGeos   = [];
    const foliageGeos = [];

    meshes.forEach(mesh => {
      const id = ((mesh.name ?? '') + (mesh.material?.name ?? '')).toLowerCase();
      const isTrunk = /trunk|bark|wood/.test(id);
      (isTrunk ? trunkGeos : foliageGeos).push(mesh.geometry);
    });

    // One material per foliage color — instances are distributed across them by altitude
    const foliageMaterials = FOLIAGE_COLORS.map(color =>
      new THREE.MeshStandardMaterial({
        color:     color.clone(),
        roughness: 0.82, // fully matte — no specular on pine foliage
        metalness: 0,
        side:      THREE.DoubleSide,
      })
    );

    const trunkMaterial = new THREE.MeshStandardMaterial({
      color:     TRUNK_COLOR.clone(),
      roughness: 0.90,
      metalness: 0,
    });

    return { trunkGeos, foliageGeos, foliageMaterials, trunkMaterial };
  }, [nodes]);

  // ── Placement ──────────────────────────────────────────────────────────────
  // Natural alpine pine placement rules:
  //   1. getForestSuitability() is the primary gate — it combines valley mask,
  //      slope flatness, below-tree-line, away-from-summits, and grove noise.
  //      Using it as spawn probability means grove interiors are dense and
  //      edges taper off naturally.
  //   2. Ledge detection rejects flat points that sit at the edge of a drop.
  //   3. Scale decreases with altitude — trees shrink near the tree line.
  //   4. Color groups are assigned by altitude — lower = darker, cooler tone.
  // ──────────────────────────────────────────────────────────────────────────
  const instancedData = useMemo(() => {
    const { foliageMaterials } = parsedMeshes;
    const numColorGroups = foliageMaterials.length; // 4

    // One matrix array per foliage color group + one for trunks
    const colorGroupMatrices = Array.from({ length: numColorGroups }, () => []);
    const trunkMatrices      = [];
    const colorGroupSourceRefs = Array.from({ length: numColorGroups }, () => []);
    const trunkSourceRefs      = [];

    const generator = new TerrainGenerator(seed, { worldSize: terrainSize });
    const rng       = mulberry32(seed ^ 0x9e3779b9);
    const dummy     = new THREE.Object3D();

    const half    = terrainSize / 2;
    const spacing = 5.5;
    let   placed  = 0;

    outerLoop:
    for (let gx = -half + spacing; gx < half - spacing; gx += spacing) {
      for (let gz = -half + spacing; gz < half - spacing; gz += spacing) {

        // ── Jitter the grid point ────────────────────────────────────────
        const jx = gx + (rng() - 0.5) * spacing * 0.85;
        const jz = gz + (rng() - 0.5) * spacing * 0.85;

        // ── Suitability gate ─────────────────────────────────────────────
        // Returns 0–1. Encodes: valleyMask × flatness × belowTreeLine ×
        // awayFromSummits × groveMask (cluster noise).
        // Using it as a spawn probability gives natural grove clustering —
        // high-suitability zones are dense, edges thin out organically.
        const suitability = generator.getForestSuitability(jx, jz);
        if (suitability < 0.08)    continue; // outside any suitable zone
        if (rng() > suitability)   continue; // probabilistic — creates clearings

        // ── Height sample ────────────────────────────────────────────────
        const sample = generator.sample(jx, jz);
        const height = sample.height;

        // ── Ledge detection ──────────────────────────────────────────────
        // A terrace ledge is a locally flat point where the terrain drops
        // sharply within a few units. Sample height in all 4 directions;
        // if any neighbour is more than LEDGE_THRESHOLD below, skip.
        const hN = generator.getHeight(jx,           jz + LEDGE_DIST);
        const hS = generator.getHeight(jx,           jz - LEDGE_DIST);
        const hE = generator.getHeight(jx + LEDGE_DIST, jz          );
        const hW = generator.getHeight(jx - LEDGE_DIST, jz          );

        const maxDrop = Math.max(
          height - hN,
          height - hS,
          height - hE,
          height - hW,
        );
        if (maxDrop > LEDGE_THRESHOLD) continue;

        // ── Slope double-check ───────────────────────────────────────────
        // getForestSuitability already gates on ALPINE_TERRAIN.treeMinSlope
        // but we re-check here as a hard guard after the ledge check, since
        // any slope-passing ledge that sneaks through should still be caught.
        const { slope } = generator.getNormalAndSlope(jx, jz);
        if (slope < ALPINE_TERRAIN.treeMinSlope) continue;

        // ── Altitude-based scale ─────────────────────────────────────────
        // Pine trees near the tree line are stunted — shorter and sparser.
        // altitudeFactor: 1.0 at height 0 → ~0.55 at treeLine (~34).
        const altNorm       = Math.max(0, Math.min(1,
          (height - 5) / (ALPINE_TERRAIN.treeLine - 5)
        ));
        const altitudeFactor= 1.0 - 0.42 * altNorm;

        // Suitability also nudges scale: grove interiors → full size,
        // edges of a grove → slightly smaller, matching nature.
        const suitabilityFactor = 0.78 + suitability * 0.22;

        const baseScale  = 0.38 + rng() * 0.30;
        const finalScale = baseScale * altitudeFactor * suitabilityFactor;

        // ── Foliage color by altitude ────────────────────────────────────
        // 4 color groups: 0=darkest/lowest, 3=lightest/highest.
        // Keeps valley trees distinctly darker than near-treeline trees.
        const colorIdx = Math.min(
          numColorGroups - 1,
          Math.floor(altNorm * numColorGroups)
        );

        // ── Transform ────────────────────────────────────────────────────
        dummy.position.set(jx, height, jz);
        const yaw = rng() * Math.PI * 2;
        dummy.rotation.set(0, yaw, 0); // yaw only — pines grow straight
        dummy.scale.setScalar(finalScale);
        dummy.updateMatrix();

        const instanceRef = {
          sourceRef: {
            file: "src/components/Trees.jsx",
            function: "Trees",
            line: 178, // Points to this instanceRef construction block
            args: {
              x: Number(jx.toFixed(3)),
              z: Number(jz.toFixed(3)),
              height: Number(height.toFixed(3)),
              scale: Number(finalScale.toFixed(3)),
              yaw: Number(yaw.toFixed(3)),
            },
          }
        };

        colorGroupMatrices[colorIdx].push(dummy.matrix.clone());
        colorGroupSourceRefs[colorIdx].push(instanceRef);

        trunkMatrices.push(dummy.matrix.clone());
        trunkSourceRefs.push(instanceRef);

        placed++;
        if (placed >= count) break outerLoop;
      }
    }

    return { colorGroupMatrices, trunkMatrices, colorGroupSourceRefs, trunkSourceRefs };
  }, [parsedMeshes, terrainSize, count, seed]);

  const { trunkGeos, foliageGeos, foliageMaterials, trunkMaterial } = parsedMeshes;
  const { colorGroupMatrices, trunkMatrices, colorGroupSourceRefs, trunkSourceRefs } = instancedData;

  // Use the first available geometry for each part (GLB may have one of each)
  const foliageGeo = foliageGeos[0];
  const trunkGeo   = trunkGeos[0];

  return (
    <group>
      {/* Trunks — one instanced mesh, single dark brown material */}
      {trunkGeo && trunkMatrices.length > 0 && (
        <InstancedTreeMesh
          key="trunk"
          geometry={trunkGeo}
          material={trunkMaterial}
          matrices={trunkMatrices}
          sourceRefs={trunkSourceRefs}
        />
      )}

      {/* Foliage — one instanced mesh per color group (altitude tier) */}
      {foliageGeo && foliageMaterials.map((mat, i) =>
        colorGroupMatrices[i]?.length > 0 && (
          <InstancedTreeMesh
            key={`foliage-${i}`}
            geometry={foliageGeo}
            material={mat}
            matrices={colorGroupMatrices[i]}
            sourceRefs={colorGroupSourceRefs[i]}
          />
        )
      )}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INSTANCED MESH HELPER
// ─────────────────────────────────────────────────────────────────────────────
function InstancedTreeMesh({ geometry, material, matrices, sourceRefs }) {
  const meshRef = useRef();

  useEffect(() => {
    if (!meshRef.current || !matrices?.length) return;
    matrices.forEach((m, i) => meshRef.current.setMatrixAt(i, m));
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.computeBoundingBox();
    meshRef.current.computeBoundingSphere();
    
    if (sourceRefs) {
      meshRef.current.userData.instanceSourceRefs = sourceRefs;
    }
  }, [matrices, sourceRefs]);

  if (!matrices?.length) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, matrices.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}

useGLTF.preload('/Assets/Models/pine_tree.glb');