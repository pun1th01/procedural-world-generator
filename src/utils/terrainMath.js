import { createNoise2D } from 'simplex-noise';
import * as THREE from 'three';

export const ALPINE_TERRAIN = {
  worldSize: 380,
  snowStart: 32.0,
  snowFull: 48.0,
  treeLine: 34.0,
  treeMinHeight: -8.0,
  treeMinSlope: 0.78,
};

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ─────────────────────────────────────────────────────────────────────────────
// SEEDED PRNG
// ─────────────────────────────────────────────────────────────────────────────
export function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TERRAIN GENERATOR
// ─────────────────────────────────────────────────────────────────────────────
export class TerrainGenerator {
  constructor(seed, options = {}) {
    this.seed = seed;
    this.worldSize = options.worldSize ?? ALPINE_TERRAIN.worldSize;

    const rng = mulberry32(seed);

    this.noise2D    = createNoise2D(rng);
    this.warpNoise  = createNoise2D(rng);
    this.regionNoise= createNoise2D(rng);
    this.hillNoise  = createNoise2D(rng);
    this.ridgeNoise = createNoise2D(rng);
    this.flowNoise  = createNoise2D(rng);
    this.detailNoise= createNoise2D(rng);
    this.forestNoise= createNoise2D(rng);

    this.mountainRegions = this.createMountainRegions(rng);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // MOUNTAIN REGION SETUP
  // Each region now has a style (0=sharp alpine, 1=broad massif, 2=plateau)
  // and per-region domain warp parameters so no two mountains look the same.
  // ───────────────────────────────────────────────────────────────────────────
  createMountainRegions(rng) {
    const count          = 5 + Math.floor(rng() * 3); // 5–7 regions
    const half           = this.worldSize * 0.5;
    const placementBounds= half * 0.74;
    const angleOffset    = rng() * TAU;

    return Array.from({ length: count }, (_, index) => {
      const sectorAngle = angleOffset + (index / count) * TAU;
      const angle       = sectorAngle + (rng() - 0.5) * 0.72;
      const distance    = this.worldSize * (0.17 + rng() * 0.25);
      const jitter      = this.worldSize * 0.075;

      const centerX = clamp(
        Math.cos(angle) * distance + (rng() - 0.5) * jitter,
        -placementBounds, placementBounds
      );
      const centerZ = clamp(
        Math.sin(angle) * distance + (rng() - 0.5) * jitter,
        -placementBounds, placementBounds
      );

      const radiusA = this.worldSize * (0.105 + rng() * 0.055);
      const radiusB = this.worldSize * (0.090 + rng() * 0.045);

      // Mountain personality — drives the entire height formula
      // 0 = sharp alpine ridges (jagged, tall)
      // 1 = rounded massif (broad dome, softer)
      // 2 = plateau with cliff edges (flat top, sharp drop)
      const style = Math.floor(rng() * 3);

      return {
        centerX,
        centerZ,
        radiusX:      Math.max(radiusA, radiusB),
        radiusZ:      Math.min(radiusA, radiusB) * (0.85 + rng() * 0.25),
        rotation:     angle + Math.PI * 0.5 + (rng() - 0.5) * 0.9,
        height:       28.0 + rng() * 22.0,         // wider range = more height contrast
        ridgeFreq:    0.011 + rng() * 0.015,        // wider range = more ridge density variety
        noiseOffset:  rng() * 1000,
        style,
        // Per-region domain warp: each mountain's internal shape is independently warped
        // so the same ridge formula produces organically different silhouettes
        warpStrength: 4.0 + rng() * 9.0,
        warpFreq:     0.011 + rng() * 0.009,
      };
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // NOISE PRIMITIVES
  // ───────────────────────────────────────────────────────────────────────────
  smoothstep(e0, e1, x) {
    if (e0 === e1) return x < e0 ? 0 : 1;
    const t = clamp((x - e0) / (e1 - e0));
    return t * t * (3.0 - 2.0 * t);
  }

  fbm(noise, x, z, baseFreq, octaves, lacunarity = 2.0, gain = 0.5) {
    let value = 0, amplitude = 1, frequency = baseFreq, normalizer = 0;
    for (let i = 0; i < octaves; i++) {
      value     += noise(x * frequency, z * frequency) * amplitude;
      normalizer+= amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }
    return value / normalizer;
  }

  ridgedFbm(noise, x, z, baseFreq, octaves) {
    let value = 0, amplitude = 1, frequency = baseFreq, normalizer = 0, weight = 1;
    for (let i = 0; i < octaves; i++) {
      let n = 1 - Math.abs(noise(x * frequency, z * frequency));
      n = n * n * weight;
      value     += n * amplitude;
      normalizer+= amplitude;
      weight     = clamp(n * 1.6);
      amplitude *= 0.48;
      frequency *= 2.05;
    }
    return clamp(value / normalizer);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // GLOBAL DOMAIN WARP
  // Applies a broad warp to the world coordinates before any region sampling.
  // This makes mountain outlines organic at a global scale.
  // ───────────────────────────────────────────────────────────────────────────
  getWarpedCoords(x, z) {
    const broadFreq  = 0.0065;
    const detailFreq = 0.018;

    const dx =
      this.warpNoise(x * broadFreq, z * broadFreq) * 10.0 +
      this.detailNoise((x + 131.7) * detailFreq, (z - 47.3) * detailFreq) * 3.0;

    const dz =
      this.warpNoise((x - 219.4) * broadFreq, (z + 173.1) * broadFreq) * 10.0 +
      this.detailNoise((x - 84.2) * detailFreq, (z + 96.8) * detailFreq) * 3.0;

    return { wx: x + dx, wz: z + dz };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // MOUNTAIN REGIONALIZATION
  // Each region applies its own local domain warp BEFORE ridge sampling,
  // then uses its style to compute a distinct height profile.
  // faceDetail is masked away from the summit tip to prevent isolated spikes.
  // ───────────────────────────────────────────────────────────────────────────
  getMountainRegionalization(x, z) {
    let regionalMountainHeight = 0;
    let mountainMask  = 0;
    let mountainCore  = 0;
    let ridgeAmount   = 0;

    for (const region of this.mountainRegions) {
      const dx  = x - region.centerX;
      const dz  = z - region.centerZ;
      const cos = Math.cos(region.rotation);
      const sin = Math.sin(region.rotation);

      // Rotate into region-local space
      const rx = dx * cos + dz * sin;
      const rz = -dx * sin + dz * cos;

      const radial = Math.sqrt(
        (rx / region.radiusX) ** 2 +
        (rz / region.radiusZ) ** 2
      );

      const shoulder = 1 - this.smoothstep(0.56, 1.3,  radial);
      const core     = 1 - this.smoothstep(0.24, 0.76, radial);
      const mask     = Math.pow(clamp(shoulder), 1.08);
      const summit   = Math.pow(1 - this.smoothstep(0.06, 0.5, radial), 1.15);

      if (mask <= 0) continue;

      // ── Per-region local domain warp ────────────────────────────────────
      // Warp the local (rx, rz) coordinates before passing to ridge noise.
      // Each region has unique warpStrength and warpFreq so mountains look
      // fundamentally different from each other, not just rescaled copies.
      const lwx = rx + this.warpNoise(
        (rx + region.noiseOffset) * region.warpFreq,
        (rz - region.noiseOffset * 0.7) * region.warpFreq
      ) * region.warpStrength;

      const lwz = rz + this.warpNoise(
        (rx - region.noiseOffset * 1.3) * region.warpFreq,
        (rz + region.noiseOffset) * region.warpFreq
      ) * region.warpStrength;

      // ── Style-based height profile ───────────────────────────────────────
      let ridgeNoise, mountainHeight;

      if (region.style === 0) {
        // SHARP ALPINE — aggressive ridges, jagged summit
        const localRidge = this.ridgedFbm(
          this.ridgeNoise,
          lwx + region.noiseOffset,
          lwz - region.noiseOffset,
          region.ridgeFreq,
          5
        );
        ridgeNoise    = clamp(localRidge * 0.65 + summit * 0.35);
        mountainHeight= Math.pow(ridgeNoise, 2.0) * 42.0;

      } else if (region.style === 1) {
        // ROUNDED MASSIF — softer ridges, broad dome profile
        const localRidge = this.ridgedFbm(
          this.ridgeNoise,
          lwx + region.noiseOffset,
          lwz - region.noiseOffset,
          region.ridgeFreq * 0.65,
          4
        );
        // Dome profile: smooth falloff from centre, no sharp tips
        const dome    = Math.pow(1 - this.smoothstep(0.0, 0.70, radial), 1.5);
        ridgeNoise    = clamp(localRidge * 0.40 + dome * 0.60);
        mountainHeight= Math.pow(ridgeNoise, 1.55) * 36.0;

      } else {
        // PLATEAU WITH CLIFFS — flat top, sharp drop at the shoulder ring
        const localRidge = this.ridgedFbm(
          this.ridgeNoise,
          lwx + region.noiseOffset,
          lwz - region.noiseOffset,
          region.ridgeFreq * 1.15,
          4
        );
        const plateauTop = 1 - this.smoothstep(0.0,  0.38, radial);
        const cliffBand  = this.smoothstep(0.30, 0.52, radial)
                         * (1 - this.smoothstep(0.52, 0.78, radial));
        ridgeNoise    = clamp(plateauTop * 0.72 + localRidge * 0.18 + cliffBand * 0.10);
        mountainHeight= Math.pow(ridgeNoise, 1.75) * 38.0 + cliffBand * 7.0;
      }

      // ── Face detail ──────────────────────────────────────────────────────
      // Masked away from the summit (1 - summit * 0.8) to prevent the isolated
      // spike artifact where detail noise creates a single towering point.
      // Also masked to mid-slope only (smoothstep 0.15 → 0.55 of mask).
      const faceDetail =
        Math.pow(
          1.0 - Math.abs(this.noise2D(lwx * 0.040, lwz * 0.040)),
          2.5
        ) * 8.0
        * this.smoothstep(0.15, 0.55, mask)
        * (1.0 - summit * 0.8);

      const regionalBase = Math.pow(mask, 1.25) * region.height * 0.72;
      const regionHeight =
        regionalBase +
        (mountainHeight + faceDetail) *
        Math.pow(mask, 1.35) *
        (0.68 + summit * 0.32);

      regionalMountainHeight = Math.max(regionalMountainHeight, regionHeight);
      mountainMask  = Math.max(mountainMask, mask);
      mountainCore  = Math.max(mountainCore, core);
      ridgeAmount   = Math.max(ridgeAmount, ridgeNoise * mask);
    }

    return { height: regionalMountainHeight, mountainMask, mountainCore, ridgeAmount };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // VALLEY FLOW
  // ───────────────────────────────────────────────────────────────────────────
  getValleyFlow(x, z, mountainMask) {
    const lowlandMask    = 1 - this.smoothstep(0.08, 0.84, mountainMask);
    const drainageRaw    = 1 - Math.abs(this.flowNoise(x * 0.012, z * 0.012));
    const drainage       = Math.pow(clamp(drainageRaw), 2.1);
    const basinVariation = this.fbm(this.flowNoise, x + 300, z - 200, 0.0055, 3);
    const valleyMask     = clamp(lowlandMask * (0.66 + drainage * 0.34));
    const carve          = valleyMask * (2.0 + drainage * 3.1 + (0.5 - basinVariation) * 0.9);

    return { valleyMask, drainage, carve, lowlandMask };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SAMPLE
  // Three targeted ground noise fixes applied here:
  //   1. midDetail masked by mountainMask — grasslands get almost none
  //   2. Terrace step varies by mountainMask — smaller on lowlands
  //   3. Post-terrace noise masked by mountainMask — smooth lowland grass
  // ───────────────────────────────────────────────────────────────────────────
  sample(x, z) {
    const { wx, wz } = this.getWarpedCoords(x, z);
    const region     = this.getMountainRegionalization(wx, wz);
    const valley     = this.getValleyFlow(wx, wz, region.mountainMask);

    const nx = wx;
    const nz = wz;

    const broadLand =
      this.fbm(this.noise2D, nx - 90, nz + 160, 0.0055, 3) * 3.2;

    const rollingHills =
      this.fbm(this.hillNoise,   nx + 45,   nz - 125, 0.017, 4) * 5.0 +
      this.fbm(this.detailNoise, nx - 260,  nz + 70,  0.047, 2) * 1.0;

    const foothillMask =
      this.smoothstep(0.12, 0.48, region.mountainMask) *
      (1 - this.smoothstep(0.58, 0.88, region.mountainCore));

    const hillMask = clamp(valley.lowlandMask * 0.92 + foothillMask * 0.45);
    const hills    = rollingHills * (0.25 + hillMask * 0.85);

    const foothills =
      this.noise2D(nx * 0.022, nz * 0.022) * 10.0 * region.mountainMask;

    // FIX 1: midDetail masked — flat ground gets only 20% of mountain detail
    const midDetail =
      this.noise2D(nx * 0.035, nz * 0.035) * 1.8 *
      (0.20 + region.mountainMask * 0.80);

    const largeShapes =
      this.noise2D(nx * 0.004, nz * 0.004) * 18.0;

    let height =
      broadLand +
      largeShapes +
      hills +
      region.height +
      foothills -
      valley.carve -
      valley.lowlandMask * 1.1 +
      midDetail;

    // FIX 2: Terrace step smaller on lowlands (4.5) → full on mountains (7.5)
    // Removes the visible polygon ledges on gentle grass slopes
    const terrace = lerp(4.5, 7.5, region.mountainMask);
    height = Math.round(height / terrace) * terrace;

    // FIX 3: Post-terrace noise masked — 15% on lowlands, full on mountains
    height +=
      this.noise2D(nx * 0.045, nz * 0.045) * 1.8 *
      (0.15 + region.mountainMask * 0.85);

    const snowAmount =
      this.smoothstep(ALPINE_TERRAIN.snowStart, ALPINE_TERRAIN.snowFull, height) *
      this.smoothstep(0.34, 0.76, region.mountainMask);

    return {
      height,
      warpedX:      wx,
      warpedZ:      wz,
      mountainMask: region.mountainMask,
      mountainCore: region.mountainCore,
      ridgeAmount:  region.ridgeAmount,
      valleyMask:   valley.valleyMask,
      drainage:     valley.drainage,
      lowlandMask:  valley.lowlandMask,
      hillMask,
      snowAmount,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // UTILITY
  // ───────────────────────────────────────────────────────────────────────────
  getHeight(x, z) {
    return this.sample(x, z).height;
  }

  getForestSuitability(x, z) {
    const s = this.sample(x, z);

    if (
      s.height < ALPINE_TERRAIN.treeMinHeight ||
      s.height > ALPINE_TERRAIN.treeLine      ||
      s.snowAmount > 0.18
    ) return 0;

    const { slope }      = this.getNormalAndSlope(x, z);
    const flatness       = this.smoothstep(ALPINE_TERRAIN.treeMinSlope, 0.96, slope);
    const belowTreeLine  = 1 - this.smoothstep(ALPINE_TERRAIN.treeLine - 1.8, ALPINE_TERRAIN.treeLine + 0.4, s.height);
    const awayFromSummits= 1 - this.smoothstep(0.42, 0.78, s.mountainMask);
    const groveNoise     = this.fbm(this.forestNoise, x + 80, z - 40, 0.018, 3) * 0.5 + 0.5;
    const groveMask      = this.smoothstep(0.42, 0.78, groveNoise + s.drainage * 0.16);

    return clamp(s.valleyMask * flatness * belowTreeLine * awayFromSummits * groveMask);
  }

  getRidge(x, z, octaves, baseFreq) {
    return this.ridgedFbm(this.ridgeNoise, x, z, baseFreq, octaves);
  }

  terrace(y, terraceScale) {
    return lerp(y, Math.round(y / terraceScale) * terraceScale, 0.18);
  }

  getNormalAndSlope(x, z) {
    const offset = 1.0;
    const hL = this.getHeight(x - offset, z);
    const hR = this.getHeight(x + offset, z);
    const hD = this.getHeight(x, z - offset);
    const hU = this.getHeight(x, z + offset);
    const normal = new THREE.Vector3(hL - hR, offset * 2, hD - hU).normalize();
    return { normal, slope: clamp(normal.dot(UP)) };
  }
}