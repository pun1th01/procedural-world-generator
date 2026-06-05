import { useMemo } from 'react';
import * as THREE from 'three';
import { ALPINE_TERRAIN, TerrainGenerator } from '../utils/terrainMath';

// ─────────────────────────────────────────────────────────────────────────────
// DETERMINISTIC HASH — stable per grid cell, avoids float precision drift
// ─────────────────────────────────────────────────────────────────────────────
function hash2D(ix, iz) {
  let h = (ix * 374761393) ^ (iz * 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return Math.abs((h ^ (h >>> 16)) / 0x7fffffff);
}

export default function Terrain({
  size     = ALPINE_TERRAIN.worldSize,
  segments = 240,
  seed     = 42,
}) {

  // ───────────────────────────────────────────────────────────────────────────
  // GEOMETRY
  // ───────────────────────────────────────────────────────────────────────────
  const geometry = useMemo(() => {
    const generator = new TerrainGenerator(seed, { worldSize: size });
    const cellSize  = size / segments;
    const jitterAmt = cellSize * 0.30;
    const edgeGuard = size * 0.5 - cellSize * 1.5;

    let geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const positions    = geo.attributes.position;
    const terrainMasks = new Float32Array(positions.count * 3);

    for (let i = 0; i < positions.count; i++) {
      let x = positions.getX(i);
      let z = positions.getZ(i);

      const ix     = Math.round(x / cellSize);
      const iz     = Math.round(z / cellSize);
      const isEdge = Math.abs(x) > edgeGuard || Math.abs(z) > edgeGuard;

      if (!isEdge) {
        x += (hash2D(ix,        iz       ) - 0.5) * 2 * jitterAmt;
        z += (hash2D(ix + 4919, iz + 3571) - 0.5) * 2 * jitterAmt;
      }

      const sample = generator.sample(x, z);

      // Hard clamp prevents extreme noise accumulation spikes.
      // ridgedFbm stacking can push isolated vertices far beyond neighbours.
      const rawHeight = Math.max(-18, Math.min(72, sample.height));
      const height = rawHeight < -14 ? -14 : rawHeight;

      positions.setX(i, x);
      positions.setZ(i, z);
      positions.setY(i, height);

      terrainMasks[i * 3    ] = sample.mountainMask;
      terrainMasks[i * 3 + 1] = sample.valleyMask;
      terrainMasks[i * 3 + 2] = sample.snowAmount;
    }

    positions.needsUpdate = true;
    geo.setAttribute('terrainMasks', new THREE.BufferAttribute(terrainMasks, 3));
    geo.computeVertexNormals();
    geo = geo.toNonIndexed();

    return geo;
  }, [size, segments, seed]);

  // ───────────────────────────────────────────────────────────────────────────
  // MATERIAL
  // flatShading: false — we compute flat normals manually via dFdx/dFdy.
  // flatShading: true restructures Three.js's internal shader in ways that
  // break onBeforeCompile injections, so we handle it ourselves.
  //
  // VARIABLE NAMING RULES (prevents silent GLSL compile failures):
  //   normal_fragment_begin  → uses: normalSlope, flatNrm, isMountain, isCliff, flatFactor
  //   color_fragment         → uses: slope, altitude, faceID, faceID2
  //   No variable is declared in both blocks.
  // ───────────────────────────────────────────────────────────────────────────
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      roughness:   1.0,
      metalness:   0.0,
      flatShading: false,
    });

    mat.onBeforeCompile = (shader) => {

      // ── VERTEX ────────────────────────────────────────────────────────────
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `
        #include <common>
        attribute vec3 terrainMasks;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        varying vec3 vTerrainMasks;
        `
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWorldNormal   = normalize(mat3(modelMatrix) * normal);
        vTerrainMasks  = terrainMasks;
        `
      );

      // ── FRAGMENT COMMON ───────────────────────────────────────────────────
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `
        #include <common>
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        varying vec3 vTerrainMasks;
        `
      );

      // ── NORMAL BLENDING ───────────────────────────────────────────────────
      // Smooth normals on grass (looks natural on rolling hills),
      // flat normals on mountains/cliffs (sharp facets = readable rock).
      // All variables here are unique to this block — no overlap with color_fragment.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        `
        #include <normal_fragment_begin>

        vec3  _fdx       = dFdx(vViewPosition);
        vec3  _fdy       = dFdy(vViewPosition);
        vec3  flatNrm    = normalize(cross(_fdx, _fdy));

        float normalSlope = dot(normalize(vWorldNormal), vec3(0.0, 1.0, 0.0));
        float isMountain  = smoothstep(0.25, 0.60, vTerrainMasks.x);
        float isCliff     = 1.0 - smoothstep(0.55, 0.80, normalSlope);
        float flatFactor  = clamp(max(isMountain, isCliff), 0.0, 1.0);

        normal = normalize(mix(normal, flatNrm, flatFactor));
        `
      );

      // ── COLOR FRAGMENT ────────────────────────────────────────────────────
      // Recomputes the flat normal from derivatives independently.
      // All variables here use names that don't appear in normal_fragment_begin.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        // Flat normal for this face — constant within a triangle,
        // so it's a perfect per-face hash seed.
        vec3  _cfdx  = dFdx(vViewPosition);
        vec3  _cfdy  = dFdy(vViewPosition);
        vec3  faceNrm = normalize(cross(_cfdx, _cfdy));

        // slope and altitude — declared only here, not in normal_fragment_begin
        float slope    = dot(faceNrm, vec3(0.0, 1.0, 0.0));
        float altitude = vWorldPosition.y;

        // Per-face hash: faceNrm is constant per triangle → unique value per face.
        // Two channels for independent variation on color axes.
        float faceID  = 0.5;
        float faceID2 = 0.5;

        // ── GRASS ─────────────────────────────────────────────────────────
        // faceID at 0.48 weight = strong per-face brightness swing (~38%).
        // This is what makes low-poly terrain read as intentional facets
        // rather than a uniform surface. slope multiply adds micro-shadowing:
        // upward faces lighter, tilted faces darker.
        vec3 grassDark  = vec3(0.13, 0.21, 0.15);
        vec3 grassLight = vec3(0.25, 0.37, 0.27);
        float altGrass  = smoothstep(5.0, 30.0, altitude);
        vec3 grass = mix(
          grassDark, grassLight,
          clamp(altGrass * 0.30 + faceID * 0.48 + faceID2 * 0.12, 0.0, 1.0)
        );
        grass *= 0.78 + slope * 0.26;

        // ── FROZEN GROUND (altitude transition) ───────────────────────────
        vec3 frozen = vec3(0.56, 0.63, 0.60);

        // ── ROCK ──────────────────────────────────────────────────────────
        // Per-face variation between cool slate and warm grey.
        // Rock brightness also varies by faceID for visible cliff faceting.
        vec3 rockCool = vec3(0.20, 0.24, 0.32);
        vec3 rockWarm = vec3(0.40, 0.38, 0.38);
        vec3 rock = mix(rockCool, rockWarm, faceID * 0.65 + faceID2 * 0.35);
        rock *= 0.82 + faceID * 0.20;

        // ── DARK ROCK (deep cliff shadow) ─────────────────────────────────
        vec3 darkRock = mix(
          vec3(0.08, 0.10, 0.14),
          vec3(0.14, 0.16, 0.20),
          faceID
        );

        // ── SNOW ──────────────────────────────────────────────────────────
        // Lit faces: pure white. Shadowed faces: faint blue-grey.
        vec3 snow = mix(
          vec3(0.80, 0.86, 0.95),
          vec3(1.00, 1.00, 1.00),
          smoothstep(0.20, 0.80, slope)
        );

        // ── AMOUNTS ───────────────────────────────────────────────────────
        // Rock: slope-based — steep faces become rock regardless of altitude
        float rockAmt = clamp(1.0 - smoothstep(0.48, 0.68, slope), 0.0, 1.0);

        // Snow: requires BOTH high altitude AND a flat surface (slopeFactor²
        // makes the threshold sharp — no half-snowed cliff streaks)
        float snowAmt = clamp(
          smoothstep(26.0, 42.0, altitude) *
          pow(smoothstep(0.58, 0.82, slope), 2.0) * 1.2,
          0.0, 1.0
        );

        // ── LAYERING ──────────────────────────────────────────────────────
        vec3 base = mix(grass, frozen, smoothstep(10.0, 24.0, altitude));
        vec3 terr = mix(base, rock, rockAmt);
        terr = mix(terr, darkRock, smoothstep(0.12, 0.50, rockAmt) * 0.22);
        terr = mix(terr, snow, snowAmt);
        terr *= 0.93;

        diffuseColor.rgb = clamp(terr, 0.0, 1.0);
        `
      );
    };

    return mat;
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // RENDER
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <mesh
      geometry={geometry}
      material={material}
      receiveShadow
    />
  );
}
