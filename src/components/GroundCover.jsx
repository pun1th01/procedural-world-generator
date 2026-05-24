import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ALPINE_TERRAIN, TerrainGenerator, mulberry32 } from '../utils/terrainMath';

const TAU = Math.PI * 2;
const LEDGE_CHECK_DIST = 3.0;
const LEDGE_DROP_LIMIT = 2.2;

const GRASS_PALETTES = [
  { mat: '#536d55', base: '#344b39', blade: '#6f8068', tip: '#829077' },
  { mat: '#5f755e', base: '#3c543f', blade: '#78876f', tip: '#91a084' },
  { mat: '#48634d', base: '#2f4635', blade: '#63795f', tip: '#798b70' },
];

const BUSH_PALETTES = [
  { leafA: '#2f4a35', leafB: '#496448', stem: '#283229' },
  { leafA: '#38513a', leafB: '#587051', stem: '#2b342b' },
];

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function addVertex(positions, colors, point, color) {
  positions.push(point.x, point.y, point.z);
  colors.push(color.r, color.g, color.b);
}

function addTriangle(positions, colors, a, b, c, ca, cb = ca, cc = ca) {
  addVertex(positions, colors, a, ca);
  addVertex(positions, colors, b, cb);
  addVertex(positions, colors, c, cc);
}

function addQuad(positions, colors, a, b, c, d, ca, cb = ca, cc = ca, cd = ca) {
  addTriangle(positions, colors, a, b, c, ca, cb, cc);
  addTriangle(positions, colors, a, c, d, ca, cc, cd);
}

function appendGeometry(positions, colors, geometry, matrix, color) {
  const source = geometry.toNonIndexed();
  const position = source.getAttribute('position');
  const point = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(matrix);
    addVertex(positions, colors, point, color);
  }
}

function finishGeometry(positions, colors) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createAlpineGrassGeometry({ radius, height, blades, palette, twist }) {
  const positions = [];
  const colors = [];
  const matColor = new THREE.Color(palette.mat);
  const baseColor = new THREE.Color(palette.base);
  const bladeColor = new THREE.Color(palette.blade);
  const tipColor = new THREE.Color(palette.tip);
  const center = new THREE.Vector3(0, 0.018, 0);
  const ring = [];
  const ringCount = 9;

  for (let i = 0; i < ringCount; i++) {
    const angle = (i / ringCount) * TAU + twist;
    const wobble = 0.76 + ((i * 37) % 11) * 0.025;
    ring.push(new THREE.Vector3(
      Math.cos(angle) * radius * wobble,
      0.018,
      Math.sin(angle) * radius * (0.72 + ((i * 17) % 7) * 0.032),
    ));
  }

  for (let i = 0; i < ringCount; i++) {
    addTriangle(positions, colors, center, ring[i], ring[(i + 1) % ringCount], matColor);
  }

  for (let i = 0; i < blades; i++) {
    const angle = (i / blades) * TAU + twist * 0.7;
    const heightPulse = 0.68 + ((i * 23) % 9) * 0.045;
    const radialPulse = 0.15 + ((i * 19) % 10) * 0.055;
    const width = radius * (0.05 + ((i * 13) % 6) * 0.008);
    const bladeHeight = height * heightPulse;
    const baseRadius = radius * radialPulse;
    const lean = radius * (0.18 + ((i * 29) % 8) * 0.028);
    const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const base = dir.clone().multiplyScalar(baseRadius);
    const mid = base.clone().add(dir.clone().multiplyScalar(lean * 0.52));
    const tip = base.clone().add(dir.clone().multiplyScalar(lean));

    const baseLeft = base.clone().add(side.clone().multiplyScalar(width));
    const baseRight = base.clone().add(side.clone().multiplyScalar(-width));
    const midLeft = mid.clone().add(side.clone().multiplyScalar(width * 0.48));
    const midRight = mid.clone().add(side.clone().multiplyScalar(-width * 0.48));

    baseLeft.y = 0.03;
    baseRight.y = 0.03;
    midLeft.y = bladeHeight * 0.52;
    midRight.y = bladeHeight * 0.52;
    tip.y = bladeHeight;

    addQuad(positions, colors, baseLeft, baseRight, midRight, midLeft, baseColor, baseColor, bladeColor, bladeColor);
    addTriangle(positions, colors, midLeft, midRight, tip, bladeColor, bladeColor, tipColor);
  }

  return finishGeometry(positions, colors);
}

function createAlpineBushGeometry({ palette, variant }) {
  const positions = [];
  const colors = [];
  const leafA = new THREE.Color(palette.leafA);
  const leafB = new THREE.Color(palette.leafB);
  const stem = new THREE.Color(palette.stem);
  const lobeGeometry = new THREE.DodecahedronGeometry(1, 0);
  const stemGeometry = new THREE.CylinderGeometry(0.035, 0.055, 0.48, 5, 1);
  const lobes = variant === 0
    ? [
        { p: [-0.52, 0.32, 0.02], s: [0.56, 0.32, 0.46], c: leafA },
        { p: [ 0.04, 0.44, 0.10], s: [0.78, 0.44, 0.62], c: leafB },
        { p: [ 0.48, 0.30,-0.16], s: [0.50, 0.30, 0.42], c: leafA },
        { p: [-0.06, 0.28,-0.48], s: [0.48, 0.26, 0.38], c: leafA },
      ]
    : [
        { p: [-0.60, 0.30,-0.20], s: [0.52, 0.30, 0.42], c: leafA },
        { p: [-0.12, 0.43, 0.02], s: [0.72, 0.44, 0.58], c: leafB },
        { p: [ 0.54, 0.35, 0.10], s: [0.58, 0.34, 0.48], c: leafA },
        { p: [ 0.08, 0.30, 0.52], s: [0.52, 0.30, 0.44], c: leafB },
        { p: [-0.18, 0.24,-0.52], s: [0.38, 0.22, 0.32], c: leafA },
      ];

  for (const lobe of lobes) {
    const matrix = new THREE.Matrix4()
      .makeScale(...lobe.s)
      .premultiply(new THREE.Matrix4().makeRotationY((lobe.p[0] + lobe.p[2]) * 2.1))
      .premultiply(new THREE.Matrix4().makeTranslation(...lobe.p));

    appendGeometry(positions, colors, lobeGeometry, matrix, lobe.c);
  }

  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * TAU + variant * 0.4;
    const matrix = new THREE.Matrix4()
      .makeScale(0.65, 1, 0.65)
      .premultiply(new THREE.Matrix4().makeRotationZ((i % 2 === 0 ? 1 : -1) * 0.22))
      .premultiply(new THREE.Matrix4().makeRotationY(angle))
      .premultiply(new THREE.Matrix4().makeTranslation(Math.cos(angle) * 0.18, 0.22, Math.sin(angle) * 0.18));

    appendGeometry(positions, colors, stemGeometry, matrix, stem);
  }

  return finishGeometry(positions, colors);
}

function isStableGround(generator, x, z, height) {
  const hN = generator.getHeight(x, z + LEDGE_CHECK_DIST);
  const hS = generator.getHeight(x, z - LEDGE_CHECK_DIST);
  const hE = generator.getHeight(x + LEDGE_CHECK_DIST, z);
  const hW = generator.getHeight(x - LEDGE_CHECK_DIST, z);

  return Math.max(
    height - hN,
    height - hS,
    height - hE,
    height - hW,
  ) <= LEDGE_DROP_LIMIT;
}

function getGroundCoverSuitability(generator, sample, x, z) {
  if (
    sample.height < ALPINE_TERRAIN.treeMinHeight - 2 ||
    sample.height > ALPINE_TERRAIN.snowStart - 3.4 ||
    sample.snowAmount > 0.008
  ) {
    return 0;
  }

  const belowSnowLine = 1 - smoothstep(
    ALPINE_TERRAIN.snowStart - 10,
    ALPINE_TERRAIN.snowStart - 3.4,
    sample.height
  );
  const awayFromRock = 1 - smoothstep(0.56, 0.84, sample.mountainMask);
  const greenShelf = clamp(sample.valleyMask * 0.76 + sample.lowlandMask * 0.36);
  const patchNoise = generator.fbm(generator.forestNoise, x - 120, z + 90, 0.024, 3) * 0.5 + 0.5;
  const patchMask = smoothstep(0.24, 0.74, patchNoise + sample.drainage * 0.14);
  const cheapSuitability = belowSnowLine * awayFromRock * greenShelf * patchMask;

  if (cheapSuitability < 0.045) return 0;

  const { slope } = generator.getNormalAndSlope(x, z);
  if (slope < 0.83 || !isStableGround(generator, x, z, sample.height)) return 0;

  const flatness = smoothstep(0.83, 0.98, slope);

  return clamp(flatness * cheapSuitability);
}

export default function GroundCover({
  terrainSize = ALPINE_TERRAIN.worldSize,
  grassCount = 750,
  bushCount = 55,
  seed = 42,
}) {
  const assets = useMemo(() => {
    const grassGeometries = [
      createAlpineGrassGeometry({ radius: 0.58, height: 0.92, blades: 13, palette: GRASS_PALETTES[0], twist: 0.1 }),
      createAlpineGrassGeometry({ radius: 0.72, height: 1.12, blades: 16, palette: GRASS_PALETTES[1], twist: 0.45 }),
      createAlpineGrassGeometry({ radius: 0.86, height: 0.76, blades: 15, palette: GRASS_PALETTES[2], twist: 0.82 }),
    ];

    const bushGeometries = [
      createAlpineBushGeometry({ palette: BUSH_PALETTES[0], variant: 0 }),
      createAlpineBushGeometry({ palette: BUSH_PALETTES[1], variant: 1 }),
    ];

    const grassMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      emissive: new THREE.Color('#121b13'),
      emissiveIntensity: 0.18,
    });

    const bushMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      emissive: new THREE.Color('#0b120c'),
      emissiveIntensity: 0.12,
    });

    return { grassGeometries, bushGeometries, grassMaterial, bushMaterial };
  }, []);

  const instancedData = useMemo(() => {
    const generator = new TerrainGenerator(seed, { worldSize: terrainSize });
    const rng = mulberry32(seed ^ 0x6a09e667);
    const dummy = new THREE.Object3D();
    const grassMatrices = Array.from({ length: 3 }, () => []);
    const bushMatrices = Array.from({ length: 2 }, () => []);
    const half = terrainSize / 2;
    const spacing = 3.9;
    let placedGrass = 0;
    let placedBush = 0;

    outerLoop:
    for (let gx = -half + spacing; gx < half - spacing; gx += spacing) {
      for (let gz = -half + spacing; gz < half - spacing; gz += spacing) {
        const x = gx + (rng() - 0.5) * spacing * 0.94;
        const z = gz + (rng() - 0.5) * spacing * 0.94;
        const sample = generator.sample(x, z);
        const suitability = getGroundCoverSuitability(generator, sample, x, z);

        if (suitability <= 0 || rng() > suitability * 0.96) continue;

        if (placedGrass < grassCount) {
          const variantRoll = rng();
          const grassVariant = variantRoll < 0.36 ? 0 : variantRoll < 0.72 ? 1 : 2;
          const altitudeFade = 1 - smoothstep(17, ALPINE_TERRAIN.snowStart - 3.4, sample.height);
          const patchScale = 0.9 + rng() * 0.86;
          const heightScale = (0.86 + rng() * 0.48) * (0.82 + altitudeFade * 0.18);

          dummy.position.set(x, sample.height + 0.035, z);
          dummy.rotation.set(0, rng() * TAU, 0);
          dummy.scale.set(patchScale * (0.88 + rng() * 0.26), heightScale, patchScale);
          dummy.updateMatrix();
          grassMatrices[grassVariant].push(dummy.matrix.clone());
          placedGrass++;
        }

        if (
          placedBush < bushCount &&
          rng() < suitability * 0.12 &&
          sample.height < ALPINE_TERRAIN.treeLine - 6 &&
          sample.snowAmount <= 0.004
        ) {
          const bushVariant = rng() < 0.54 ? 0 : 1;
          const bushScale = 0.76 + rng() * 0.72;

          dummy.position.set(
            x + (rng() - 0.5) * 1.4,
            sample.height + 0.025,
            z + (rng() - 0.5) * 1.4,
          );
          dummy.rotation.set(0, rng() * TAU, 0);
          dummy.scale.set(
            bushScale * (1.0 + rng() * 0.32),
            bushScale * (0.88 + rng() * 0.22),
            bushScale * (0.92 + rng() * 0.30),
          );
          dummy.updateMatrix();
          bushMatrices[bushVariant].push(dummy.matrix.clone());
          placedBush++;
        }

        if (placedGrass >= grassCount && placedBush >= bushCount) break outerLoop;
      }
    }

    return { grassMatrices, bushMatrices };
  }, [terrainSize, grassCount, bushCount, seed]);

  return (
    <group>
      {assets.grassGeometries.map((geometry, index) => (
        <InstancedGroundCoverMesh
          key={`grass-${index}`}
          geometry={geometry}
          material={assets.grassMaterial}
          matrices={instancedData.grassMatrices[index]}
        />
      ))}
      {assets.bushGeometries.map((geometry, index) => (
        <InstancedGroundCoverMesh
          key={`bush-${index}`}
          geometry={geometry}
          material={assets.bushMaterial}
          matrices={instancedData.bushMatrices[index]}
        />
      ))}
    </group>
  );
}

function InstancedGroundCoverMesh({ geometry, material, matrices }) {
  const meshRef = useRef();

  useEffect(() => {
    if (!meshRef.current || !matrices?.length) return;

    matrices.forEach((matrix, index) => meshRef.current.setMatrixAt(index, matrix));
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.computeBoundingBox();
    meshRef.current.computeBoundingSphere();
  }, [matrices]);

  if (!matrices?.length) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, matrices.length]}
      matrixAutoUpdate={false}
      frustumCulled
    />
  );
}
