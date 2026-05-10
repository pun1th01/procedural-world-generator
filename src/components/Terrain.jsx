import { useMemo } from 'react';
import * as THREE from 'three';
import { ALPINE_TERRAIN, TerrainGenerator } from '../utils/terrainMath';

export default function Terrain({
  size = ALPINE_TERRAIN.worldSize,
  segments = 180,
  seed = 42
}) {

  // =========================
  // GEOMETRY
  // =========================
  const geometry = useMemo(() => {

    const generator = new TerrainGenerator(seed, { worldSize: size });

    let geo = new THREE.PlaneGeometry(
      size,
      size,
      segments,
      segments
    );

    geo.rotateX(-Math.PI / 2);

    const positions = geo.attributes.position;
    const terrainMasks = new Float32Array(positions.count * 3);

    for (let i = 0; i < positions.count; i++) {

      const x = positions.getX(i);
      const z = positions.getZ(i);

      const sample = generator.sample(x, z);

      positions.setY(i, sample.height);

      terrainMasks[i * 3] = sample.mountainMask;
      terrainMasks[i * 3 + 1] = sample.valleyMask;
      terrainMasks[i * 3 + 2] = sample.snowAmount;
    }

    positions.needsUpdate = true;

    geo.setAttribute(
      'terrainMasks',
      new THREE.BufferAttribute(terrainMasks, 3)
    );

    geo = geo.toNonIndexed();

    geo.computeVertexNormals();

    return geo;

  }, [size, segments, seed]);

  // =========================
  // MATERIAL
  // =========================
  const material = useMemo(() => {

    const mat = new THREE.MeshStandardMaterial({

      roughness: 1.0,
      metalness: 0.0,
      flatShading: true

    });

    mat.onBeforeCompile = (shader) => {

      // =========================
      // VERTEX SHADER
      // =========================

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
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vTerrainMasks = terrainMasks;
        `
      );

      // =========================
      // FRAGMENT SHADER
      // =========================

      shader.fragmentShader = shader.fragmentShader.replace(

        '#include <common>',

        `
        #include <common>

        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        varying vec3 vTerrainMasks;
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(

        '#include <color_fragment>',

        `

        // =========================
        // BIOME COLORS
        // =========================

        vec3 snow = vec3(
          1.0,
          1.0,
          1.0
        );

        vec3 rock = vec3(
          0.30,
          0.34,
          0.40
        );

        vec3 darkRock = vec3(
          0.12,
          0.14,
          0.18
        );

        vec3 frozenGround = vec3(
          0.76,
          0.82,
          0.78
        );

        vec3 valleyGround = vec3(
          0.20,
          0.33,
          0.24
        );

        // =========================
        // SLOPE
        // =========================

        float slope =
          dot(
            normalize(vWorldNormal),
            vec3(0.0, 1.0, 0.0)
          );

        float altitude = vWorldPosition.y;

        // =========================
        // ROCK CLIFFS
        // =========================

        float rockAmount =
          1.0 -
          smoothstep(
            0.52,
            0.72,
            slope
          );

        rockAmount = clamp(rockAmount, 0.0, 1.0);

        // =========================
        // SNOW
        // =========================

        float snowAmount =

          smoothstep(
            20.0,
            34.0,
            altitude
          )

          *

          smoothstep(
            0.48,
            0.78,
            slope
          );

        snowAmount *= 1.35;

        snowAmount =
          clamp(
            snowAmount,
            0.0,
            1.0
          );

        snowAmount =
          pow(
            snowAmount,
            0.75
          );

        float snowShade =
          smoothstep(
            0.15,
            0.75,
            slope
          );

        vec3 shadowSnow =
          vec3(
            0.82,
            0.88,
            0.96
          );

        snow =
          mix(
            shadowSnow,
            snow,
            snowShade
          );

        // =========================
        // BASE TERRAIN
        // =========================

        float valleyTint =
          smoothstep(
            10.0,
            45.0,
            altitude
          );

        vec3 tintedValleyGround =
          mix(
            valleyGround,
            vec3(
              0.28,
              0.40,
              0.31
            ),
            valleyTint * 0.35
          );

        float grassNoise =
          sin(vWorldPosition.x * 0.035)
          *
          cos(vWorldPosition.z * 0.035);

        vec3 terrainGrass =
          tintedValleyGround;

        terrainGrass *=
          0.92 + grassNoise * 0.08;

        vec3 baseGround =

          mix(
            terrainGrass,
            frozenGround,
            smoothstep(
              8.0,
              20.0,
              altitude
            )
          );

        vec3 terrainColor =

          mix(
            baseGround,
            rock,
            rockAmount
          );

        terrainColor.rgb *= 0.92;

        terrainColor =

          mix(
            terrainColor,
            snow,
            snowAmount * 1.15
          );

        terrainColor =
          clamp(
            terrainColor,
            0.0,
            1.0
          );

        float cliffDarkening =
          smoothstep(
            0.15,
            0.55,
            rockAmount
          );

        terrainColor =
          mix(
            terrainColor,
            darkRock,
            cliffDarkening * 0.34
          );

        // =========================
        // VALLEY DARKENING
        // =========================

        // =========================
        // FINAL OUTPUT
        // =========================

        diffuseColor.rgb =
          terrainColor;

        `
      );

    };

    return mat;

  }, []);

  // =========================
  // RENDER
  // =========================

  return (

    <mesh
      geometry={geometry}
      material={material}
      receiveShadow
      castShadow
    />

  );
}
