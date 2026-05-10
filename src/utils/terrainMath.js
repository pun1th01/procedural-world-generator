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

// Seeded PRNG
export function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Encapsulates all mathematical evaluation for the terrain.
 * The terrain is built from separated alpine regions, shared valley basins,
 * rolling lowland hills, and local summit detail so every consumer can sample
 * the same deterministic world.
 */
export class TerrainGenerator {
  constructor(seed, options = {}) {
    this.seed = seed;
    this.worldSize = options.worldSize ?? ALPINE_TERRAIN.worldSize;

    const rng = mulberry32(seed);

    this.noise2D = createNoise2D(rng);
    this.warpNoise = createNoise2D(rng);
    this.regionNoise = createNoise2D(rng);
    this.hillNoise = createNoise2D(rng);
    this.ridgeNoise = createNoise2D(rng);
    this.flowNoise = createNoise2D(rng);
    this.detailNoise = createNoise2D(rng);
    this.forestNoise = createNoise2D(rng);

    this.mountainRegions = this.createMountainRegions(rng);
  }

  createMountainRegions(rng) {
    const count = 5 + Math.floor(rng() * 2);
    const half = this.worldSize * 0.5;
    const placementBounds = half * 0.74;
    const angleOffset = rng() * TAU;

    return Array.from({ length: count }, (_, index) => {
      const sectorAngle = angleOffset + (index / count) * TAU;
      const angle = sectorAngle + (rng() - 0.5) * 0.72;
      const distance = this.worldSize * (0.17 + rng() * 0.25);
      const jitter = this.worldSize * 0.075;

      const centerX = clamp(
        Math.cos(angle) * distance + (rng() - 0.5) * jitter,
        -placementBounds,
        placementBounds
      );

      const centerZ = clamp(
        Math.sin(angle) * distance + (rng() - 0.5) * jitter,
        -placementBounds,
        placementBounds
      );

      const radiusA = this.worldSize * (0.105 + rng() * 0.055);
      const radiusB = this.worldSize * (0.09 + rng() * 0.045);

      return {
        centerX,
        centerZ,
        radiusX: Math.max(radiusA, radiusB),
        radiusZ: Math.min(radiusA, radiusB) * (0.85 + rng() * 0.25),
        rotation: angle + Math.PI * 0.5 + (rng() - 0.5) * 0.9,
        height: 28.0 + rng() * 18.0,
        ruggedness: 8.0 + rng() * 6.0,
        ridgeFreq: 0.015 + rng() * 0.01,
        detailFreq: 0.045 + rng() * 0.026,
        noiseOffset: rng() * 1000,
      };
    });
  }

  smoothstep(e0, e1, x) {
    if (e0 === e1) return x < e0 ? 0 : 1;
    const t = clamp((x - e0) / (e1 - e0));
    return t * t * (3.0 - 2.0 * t);
  }

  fbm(noise, x, z, baseFreq, octaves, lacunarity = 2.0, gain = 0.5) {
    let value = 0;
    let amplitude = 1;
    let frequency = baseFreq;
    let normalizer = 0;

    for (let i = 0; i < octaves; i++) {
      value += noise(x * frequency, z * frequency) * amplitude;
      normalizer += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return value / normalizer;
  }

  ridgedFbm(noise, x, z, baseFreq, octaves) {
    let value = 0;
    let amplitude = 1;
    let frequency = baseFreq;
    let normalizer = 0;
    let weight = 1;

    for (let i = 0; i < octaves; i++) {
      let n = 1 - Math.abs(noise(x * frequency, z * frequency));
      n = n * n;
      n *= weight;

      value += n * amplitude;
      normalizer += amplitude;

      weight = clamp(n * 1.6);
      amplitude *= 0.48;
      frequency *= 2.05;
    }

    return clamp(value / normalizer);
  }

  getWarpedCoords(x, z) {
    const broadFreq = 0.0065;
    const detailFreq = 0.018;

    const dx =
      this.warpNoise(x * broadFreq, z * broadFreq) * 10.0 +
      this.detailNoise((x + 131.7) * detailFreq, (z - 47.3) * detailFreq) * 3.0;

    const dz =
      this.warpNoise((x - 219.4) * broadFreq, (z + 173.1) * broadFreq) * 10.0 +
      this.detailNoise((x - 84.2) * detailFreq, (z + 96.8) * detailFreq) * 3.0;

    return { wx: x + dx, wz: z + dz };
  }

  getMountainRegionalization(x, z) {
    let regionalMountainHeight = 0;
    let mountainMask = 0;
    let mountainCore = 0;
    let ridgeAmount = 0;

    for (const region of this.mountainRegions) {
      const dx = x - region.centerX;
      const dz = z - region.centerZ;
      const cos = Math.cos(region.rotation);
      const sin = Math.sin(region.rotation);

      const rx = dx * cos + dz * sin;
      const rz = -dx * sin + dz * cos;
      const radial = Math.sqrt(
        (rx / region.radiusX) * (rx / region.radiusX) +
          (rz / region.radiusZ) * (rz / region.radiusZ)
      );

      const shoulder = 1 - this.smoothstep(0.56, 1.3, radial);
      const core = 1 - this.smoothstep(0.24, 0.76, radial);
      const mask = Math.pow(clamp(shoulder), 1.08);
      const summit = Math.pow(1 - this.smoothstep(0.06, 0.5, radial), 1.15);

      if (mask <= 0) continue;

      const localRidge =
        1.0 -
        Math.abs(
          this.ridgeNoise(
            (rx + region.noiseOffset) * region.ridgeFreq,
            (rz - region.noiseOffset) * region.ridgeFreq
          )
        );

      const ridgeNoise = clamp(localRidge * 0.7 + summit * 0.3);
      const mountainHeight = Math.pow(ridgeNoise, 2.3) * 38.0;

      const detailRidge =
        Math.pow(
          1.0 -
            Math.abs(
              this.noise2D(
                x * 0.045,
                z * 0.045
              )
            ),
          3.0
        ) * 12.0;

      const nx = x;
      const nz = z;

      const broadMountains =
        this.noise2D(
          nx * 0.008,
          nz * 0.008
        ) * 18.0;

      const mountains =
        mountainHeight +
        detailRidge +
        broadMountains;

      const regionalBase = Math.pow(mask, 1.25) * region.height * 0.72;
      const regionHeight =
        regionalBase +
        mountains *
          Math.pow(mask, 1.35) *
          (0.68 + summit * 0.32);

      regionalMountainHeight = Math.max(regionalMountainHeight, regionHeight);
      mountainMask = Math.max(mountainMask, mask);
      mountainCore = Math.max(mountainCore, core);
      ridgeAmount = Math.max(ridgeAmount, ridgeNoise * mask);
    }

    return {
      height: regionalMountainHeight,
      mountainMask,
      mountainCore,
      ridgeAmount,
    };
  }

  getValleyFlow(x, z, mountainMask) {
    const lowlandMask = 1 - this.smoothstep(0.08, 0.84, mountainMask);
    const drainageRaw = 1 - Math.abs(this.flowNoise(x * 0.012, z * 0.012));
    const drainage = Math.pow(clamp(drainageRaw), 2.1);
    const basinVariation = this.fbm(this.flowNoise, x + 300, z - 200, 0.0055, 3);

    const valleyMask = clamp(lowlandMask * (0.66 + drainage * 0.34));
    const carve = valleyMask * (2.0 + drainage * 3.1 + (0.5 - basinVariation) * 0.9);

    return {
      valleyMask,
      drainage,
      carve,
      lowlandMask,
    };
  }

  stylizeHeight(height, mountainMask) {
    const terraceStrength = 0.14 + this.smoothstep(0.42, 0.88, mountainMask) * 0.06;
    const terraceScale = lerp(0.18, 0.32, this.smoothstep(0.25, 0.78, mountainMask));
    const stepped = Math.round(height / terraceScale) * terraceScale;

    return lerp(height, stepped, terraceStrength);
  }

  sample(x, z) {
    const { wx, wz } = this.getWarpedCoords(x, z);
    const region = this.getMountainRegionalization(wx, wz);
    const valley = this.getValleyFlow(wx, wz, region.mountainMask);

    const nx = wx;
    const nz = wz;

    const broadLand =
      this.fbm(this.noise2D, nx - 90, nz + 160, 0.0055, 3) * 3.2;

    const rollingHills =
      this.fbm(this.hillNoise, nx + 45, nz - 125, 0.017, 4) * 5.0 +
      this.fbm(this.detailNoise, nx - 260, nz + 70, 0.047, 2) * 1.0;

    const foothillMask =
      this.smoothstep(0.12, 0.48, region.mountainMask) *
      (1 - this.smoothstep(0.58, 0.88, region.mountainCore));

    const hillMask = clamp(valley.lowlandMask * 0.92 + foothillMask * 0.45);
    const hills = rollingHills * (0.25 + hillMask * 0.85);

    const foothills =
      this.noise2D(nx * 0.022, nz * 0.022)
      * 10.0
      * region.mountainMask;

    const midDetail =
      this.noise2D(
        nx * 0.035,
        nz * 0.035
      ) * 1.8;

    const largeShapes =
      this.noise2D(
        nx * 0.004,
        nz * 0.004
      ) * 18.0;

    let height =
      broadLand +
      largeShapes +
      hills +
      region.height +
      foothills -
      valley.carve -
      valley.lowlandMask * 1.1 +
      midDetail;

    const terrace = 7.5;

    height =
      Math.round(height / terrace)
      * terrace;

    height +=
      this.noise2D(
        nx * 0.045,
        nz * 0.045
      ) * 3.5;

    const snowAmount =
      this.smoothstep(ALPINE_TERRAIN.snowStart, ALPINE_TERRAIN.snowFull, height) *
      this.smoothstep(0.34, 0.76, region.mountainMask);

    return {
      height,
      warpedX: wx,
      warpedZ: wz,
      mountainMask: region.mountainMask,
      mountainCore: region.mountainCore,
      ridgeAmount: region.ridgeAmount,
      valleyMask: valley.valleyMask,
      drainage: valley.drainage,
      lowlandMask: valley.lowlandMask,
      hillMask,
      snowAmount,
    };
  }

  getHeight(x, z) {
    return this.sample(x, z).height;
  }

  getForestSuitability(x, z) {
    const sample = this.sample(x, z);

    if (
      sample.height < ALPINE_TERRAIN.treeMinHeight ||
      sample.height > ALPINE_TERRAIN.treeLine ||
      sample.snowAmount > 0.18
    ) {
      return 0;
    }

    const { slope } = this.getNormalAndSlope(x, z);
    const flatness = this.smoothstep(ALPINE_TERRAIN.treeMinSlope, 0.96, slope);
    const belowTreeLine = 1 - this.smoothstep(ALPINE_TERRAIN.treeLine - 1.8, ALPINE_TERRAIN.treeLine + 0.4, sample.height);
    const awayFromSummits = 1 - this.smoothstep(0.42, 0.78, sample.mountainMask);
    const groveNoise = this.fbm(this.forestNoise, x + 80, z - 40, 0.018, 3) * 0.5 + 0.5;
    const groveMask = this.smoothstep(0.42, 0.78, groveNoise + sample.drainage * 0.16);

    return clamp(sample.valleyMask * flatness * belowTreeLine * awayFromSummits * groveMask);
  }

  getRidge(x, z, octaves, baseFreq) {
    return this.ridgedFbm(this.ridgeNoise, x, z, baseFreq, octaves);
  }

  terrace(y, terraceScale) {
    const stepped = Math.round(y / terraceScale) * terraceScale;
    return lerp(y, stepped, 0.18);
  }

  getNormalAndSlope(x, z) {
    const offset = 1.0;

    const hL = this.getHeight(x - offset, z);
    const hR = this.getHeight(x + offset, z);
    const hD = this.getHeight(x, z - offset);
    const hU = this.getHeight(x, z + offset);

    const normal = new THREE.Vector3(hL - hR, offset * 2, hD - hU).normalize();
    const slope = clamp(normal.dot(UP));

    return { normal, slope };
  }
}
