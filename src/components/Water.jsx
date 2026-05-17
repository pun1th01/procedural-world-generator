import { useMemo } from 'react';
import * as THREE from 'three';
import { ALPINE_TERRAIN, TerrainGenerator } from '../utils/terrainMath';

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(e0, e1, x) {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3.0 - 2.0 * t);
}

function buildSurfaceGeometry(generator, kind) {
  const bodies = generator.getWaterBodies(kind);
  const positions = [];
  const uvs = [];
  const indices = [];

  for (const body of bodies) {
    const rings = body.grid;
    const angleSegments = Math.max(36, rings * 5);
    const cos = Math.cos(body.rotation);
    const sin = Math.sin(body.rotation);
    const centerIndex = positions.length / 3;

    positions.push(body.centerX, body.level + ALPINE_TERRAIN.shorelineLift, body.centerZ);
    uvs.push(0.5, 0.5);

    const ringIndices = [];
    const edgeScales = Array.from({ length: angleSegments }, (_, angleIndex) => {
      const angle = (angleIndex / angleSegments) * Math.PI * 2;
      const edgeX = body.centerX + Math.cos(angle) * body.radiusX;
      const edgeZ = body.centerZ + Math.sin(angle) * body.radiusZ;
      const edgeNoise =
        generator.fbm(
          generator.flowNoise,
          edgeX + body.noiseOffset,
          edgeZ - body.noiseOffset,
          0.026,
          2,
          2.0,
          0.42
        ) *
          0.5 +
        0.5;

      const baseEdge = kind === 'ice' ? 0.75 : 0.86;
      const noiseRange = kind === 'ice' ? 0.28 : 0.13;
      return baseEdge + edgeNoise * noiseRange;
    });

    for (let ring = 1; ring <= rings; ring++) {
      const ringRow = [];
      const ringT = ring / rings;

      for (let angleIndex = 0; angleIndex < angleSegments; angleIndex++) {
        const angle = (angleIndex / angleSegments) * Math.PI * 2;
        const radial = ringT * edgeScales[angleIndex];
        const lx = Math.cos(angle) * body.radiusX * radial;
        const lz = Math.sin(angle) * body.radiusZ * radial;
        const worldX = body.centerX + lx * cos - lz * sin;
        const worldZ = body.centerZ + lx * sin + lz * cos;
        const ripple =
          kind === 'water'
            ? Math.sin((worldX + body.noiseOffset) * 0.07) *
              Math.cos((worldZ - body.noiseOffset) * 0.061) *
              body.ripple *
              (1 - smoothstep(0.78, 1.0, ringT))
            : generator.fbm(
                generator.detailNoise,
                worldX - body.noiseOffset,
                worldZ + body.noiseOffset,
                0.032,
                2,
                2.0,
                0.38
              ) *
              body.ripple *
              0.8;

        ringRow.push(positions.length / 3);
        positions.push(
          worldX,
          body.level + ALPINE_TERRAIN.shorelineLift + ripple,
          worldZ
        );
        uvs.push(
          0.5 + Math.cos(angle) * ringT * 0.5,
          0.5 + Math.sin(angle) * ringT * 0.5
        );
      }

      ringIndices.push(ringRow);
    }

    const firstRing = ringIndices[0];
    for (let angleIndex = 0; angleIndex < angleSegments; angleIndex++) {
      const nextAngle = (angleIndex + 1) % angleSegments;
      indices.push(centerIndex, firstRing[nextAngle], firstRing[angleIndex]);
    }

    for (let ring = 1; ring < rings; ring++) {
      const inner = ringIndices[ring - 1];
      const outer = ringIndices[ring];

      for (let angleIndex = 0; angleIndex < angleSegments; angleIndex++) {
        const nextAngle = (angleIndex + 1) % angleSegments;
        const a = inner[angleIndex];
        const b = inner[nextAngle];
        const c = outer[angleIndex];
        const d = outer[nextAngle];

        indices.push(a, b, c, b, d, c);
      }
    }
  }

  if (positions.length === 0 || indices.length === 0) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  const faceted = geometry.toNonIndexed();
  faceted.computeVertexNormals();
  geometry.dispose();

  return faceted;
}

export default function Water({
  terrainSize = ALPINE_TERRAIN.worldSize,
  seed = 42,
  generator = null,
}) {
  const terrainGenerator = useMemo(
    () => generator ?? new TerrainGenerator(seed, { worldSize: terrainSize }),
    [generator, seed, terrainSize]
  );

  const waterGeometry = useMemo(
    () => buildSurfaceGeometry(terrainGenerator, 'water'),
    [terrainGenerator]
  );

  const iceGeometry = useMemo(
    () => buildSurfaceGeometry(terrainGenerator, 'ice'),
    [terrainGenerator]
  );

  const waterMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#4fabc6',
        roughness: 0.88,
        metalness: 0.0,
        transparent: true,
        opacity: 0.66,
        flatShading: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    []
  );

  const iceMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#f0fbfc',
        emissive: '#c9f3ff',
        emissiveIntensity: 0.1,
        roughness: 0.95, // Highly frosted appearance
        metalness: 0.05,
        transparent: false, // Make it opaque, a frozen solid lake
        flatShading: true,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    []
  );

  if (!waterGeometry && !iceGeometry) return null;

  return (
    <group>
      {waterGeometry && (
        <mesh
          geometry={waterGeometry}
          material={waterMaterial}
          receiveShadow
          renderOrder={2}
        />
      )}
      {iceGeometry && (
        <mesh
          geometry={iceGeometry}
          material={iceMaterial}
          receiveShadow
          castShadow
          renderOrder={3}
        />
      )}
    </group>
  );
}
