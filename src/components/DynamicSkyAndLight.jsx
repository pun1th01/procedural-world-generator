import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// ─────────────────────────────────────────────────────────────────────────────
// COLOR STOPS
// Palette philosophy: cinematic, slightly desaturated, never cheerful.
// Think: early autumn, 4am drives, fog over still water.
// ─────────────────────────────────────────────────────────────────────────────
const STOPS = [
  // 00:00 – deep night. indigo-black sky, cold moon.
  {
    time: 0,
    skyZenith:  '#010209', skyHorizon: '#080d1e',
    fog: '#05080f',
    sunColor: '#000000',  sunIntensity: 0,
    moonColor: '#a8b8d8', moonIntensity: 0.55,
    ambient: '#0c1020',   ambientIntensity: 0.10,
    hemiSky: '#0c1020',   hemiGround: '#040608', hemiIntensity: 0.08,
  },
  // 04:00 – dead of night, just before anything shifts.
  {
    time: 4,
    skyZenith:  '#010210', skyHorizon: '#0b1128',
    fog: '#07090f',
    sunColor: '#000000',  sunIntensity: 0,
    moonColor: '#a8b8d8', moonIntensity: 0.45,
    ambient: '#0e1228',   ambientIntensity: 0.10,
    hemiSky: '#0e1228',   hemiGround: '#040608', hemiIntensity: 0.08,
  },
  // 05:15 – civil twilight. that cold, lonely blue before dawn.
  {
    time: 5.25,
    skyZenith:  '#0c1230', skyHorizon: '#6b3d38',
    fog: '#2a1510',
    sunColor: '#c05030',  sunIntensity: 0.04,
    moonColor: '#7888b8', moonIntensity: 0.10,
    ambient: '#1a1520',   ambientIntensity: 0.15,
    hemiSky: '#1a1520',   hemiGround: '#100808', hemiIntensity: 0.10,
  },
  // 06:00 – sunrise. rose-gold but muted, not cheerful. fleeting.
  {
    time: 6,
    skyZenith:  '#18244e', skyHorizon: '#c86844',
    fog: '#9e5030',
    sunColor: '#ff8850',  sunIntensity: 0.65,
    moonColor: '#000000', moonIntensity: 0,
    ambient: '#38282e',   ambientIntensity: 0.24,
    hemiSky: '#38282e',   hemiGround: '#180c08', hemiIntensity: 0.18,
  },
  // 07:30 – golden hour. warm but still quiet. the world hasn't started yet.
  {
    time: 7.5,
    skyZenith:  '#284e88', skyHorizon: '#c89060',
    fog: '#a87848',
    sunColor: '#ffc878',  sunIntensity: 1.05,
    moonColor: '#000000', moonIntensity: 0,
    ambient: '#b89878',   ambientIntensity: 0.30,
    hemiSky: '#b89878',   hemiGround: '#302010', hemiIntensity: 0.22,
  },
  // 10:00 – mid-morning. cool, slightly overcast. not bright.
  {
    time: 10,
    skyZenith:  '#3a6498', skyHorizon: '#8aaec8',
    fog: '#90aac0',
    sunColor: '#f0e8d8',  sunIntensity: 1.35,
    moonColor: '#000000', moonIntensity: 0,
    ambient: '#c8d8e8',   ambientIntensity: 0.34,
    hemiSky: '#c8d8e8',   hemiGround: '#283020', hemiIntensity: 0.26,
  },
  // 12:00 – midday. cooler than you'd expect. thin cloud feeling.
  {
    time: 12,
    skyZenith:  '#2e5888', skyHorizon: '#7ca0c0',
    fog: '#88a0b8',
    sunColor: '#ece4d8',  sunIntensity: 1.5,
    moonColor: '#000000', moonIntensity: 0,
    ambient: '#ccd8e8',   ambientIntensity: 0.36,
    hemiSky: '#ccd8e8',   hemiGround: '#243020', hemiIntensity: 0.28,
  },
  // 15:00 – late afternoon. you start to feel the day slipping.
  {
    time: 15,
    skyZenith:  '#3a6498', skyHorizon: '#8aaec8',
    fog: '#90aac0',
    sunColor: '#f0e8d8',  sunIntensity: 1.3,
    moonColor: '#000000', moonIntensity: 0,
    ambient: '#c8d8e8',   ambientIntensity: 0.33,
    hemiSky: '#c8d8e8',   hemiGround: '#283020', hemiIntensity: 0.25,
  },
  // 17:00 – golden evening. amber. warmth that's about to leave.
  {
    time: 17,
    skyZenith:  '#284880', skyHorizon: '#c07838',
    fog: '#9e6030',
    sunColor: '#ffb850',  sunIntensity: 1.05,
    moonColor: '#000000', moonIntensity: 0,
    ambient: '#b88860',   ambientIntensity: 0.28,
    hemiSky: '#b88860',   hemiGround: '#281408', hemiIntensity: 0.20,
  },
  // 18:30 – sunset. deep amber-red. slow and heavy.
  {
    time: 18.5,
    skyZenith:  '#14143a', skyHorizon: '#b84020',
    fog: '#7a2c10',
    sunColor: '#ff4e18',  sunIntensity: 0.55,
    moonColor: '#000000', moonIntensity: 0,
    ambient: '#301820',   ambientIntensity: 0.20,
    hemiSky: '#301820',   hemiGround: '#0e0606', hemiIntensity: 0.13,
  },
  // 19:30 – dusk. mauve-purple bruise across the sky. silence.
  {
    time: 19.5,
    skyZenith:  '#0c0c28', skyHorizon: '#341828',
    fog: '#180a14',
    sunColor: '#000000',  sunIntensity: 0,
    moonColor: '#6070a8', moonIntensity: 0.15,
    ambient: '#181020',   ambientIntensity: 0.14,
    hemiSky: '#181020',   hemiGround: '#070410', hemiIntensity: 0.10,
  },
  // 20:30 – full night settling. stars come.
  {
    time: 20.5,
    skyZenith:  '#030714', skyHorizon: '#0c1020',
    fog: '#050810',
    sunColor: '#000000',  sunIntensity: 0,
    moonColor: '#a0b0d0', moonIntensity: 0.48,
    ambient: '#0e1020',   ambientIntensity: 0.11,
    hemiSky: '#0e1020',   hemiGround: '#040608', hemiIntensity: 0.08,
  },
  // 24:00 – wraps back to 00:00.
  {
    time: 24,
    skyZenith:  '#010209', skyHorizon: '#080d1e',
    fog: '#05080f',
    sunColor: '#000000',  sunIntensity: 0,
    moonColor: '#a8b8d8', moonIntensity: 0.55,
    ambient: '#0c1020',   ambientIntensity: 0.10,
    hemiSky: '#0c1020',   hemiGround: '#040608', hemiIntensity: 0.08,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function lerpColor(c1, c2, t) {
  return new THREE.Color(c1).lerp(new THREE.Color(c2), t);
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function getValues(timeOfDay) {
  let lower = STOPS[0];
  let upper = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (timeOfDay >= STOPS[i].time && timeOfDay <= STOPS[i + 1].time) {
      lower = STOPS[i];
      upper = STOPS[i + 1];
      break;
    }
  }
  const span = upper.time - lower.time;
  const t    = span === 0 ? 0 : (timeOfDay - lower.time) / span;
  return {
    skyZenith:        lerpColor(lower.skyZenith,  upper.skyZenith,  t),
    skyHorizon:       lerpColor(lower.skyHorizon, upper.skyHorizon, t),
    fog:              lerpColor(lower.fog,         upper.fog,        t),
    sunColor:         lerpColor(lower.sunColor,    upper.sunColor,   t),
    sunIntensity:     lerp(lower.sunIntensity,     upper.sunIntensity,  t),
    moonColor:        lerpColor(lower.moonColor,   upper.moonColor,  t),
    moonIntensity:    lerp(lower.moonIntensity,    upper.moonIntensity, t),
    ambient:          lerpColor(lower.ambient,     upper.ambient,    t),
    ambientIntensity: lerp(lower.ambientIntensity, upper.ambientIntensity, t),
    hemiSky:          lerpColor(lower.hemiSky,     upper.hemiSky,    t),
    hemiGround:       lerpColor(lower.hemiGround,  upper.hemiGround, t),
    hemiIntensity:    lerp(lower.hemiIntensity,    upper.hemiIntensity, t),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SKY DOME – gradient from horizon to zenith via fragment shader
// ─────────────────────────────────────────────────────────────────────────────
function SkyDome({ zenithColor, horizonColor }) {
  const matRef = useRef();

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uZenith:  { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      varying vec3 vPos;
      void main() {
        // 0 at horizon, 1 at zenith — power curve keeps horizon band wide
        float t = clamp(vPos.y / 450.0, 0.0, 1.0);
        float blend = pow(t, 0.55);
        gl_FragColor = vec4(mix(uHorizon, uZenith, blend), 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  }), []);

  // Live-update uniforms every frame — cheap, avoids React re-renders
  useFrame(() => {
    if (!matRef.current) return;
    matRef.current.uniforms.uZenith.value.copy(zenithColor);
    matRef.current.uniforms.uHorizon.value.copy(horizonColor);
  });

  return (
    <mesh>
      <sphereGeometry args={[450, 32, 16]} />
      <primitive object={material} ref={matRef} attach="material" />
    </mesh>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HORIZON GLOW – soft oval at the horizon during golden hours
// ─────────────────────────────────────────────────────────────────────────────
function HorizonGlow({ sunX, sunZ, color, intensity }) {
  const matRef = useRef();
  useFrame(() => {
    if (matRef.current) matRef.current.opacity = intensity * 0.45;
  });
  if (intensity <= 0.01) return null;
  return (
    <mesh position={[sunX * 0.5, -10, sunZ * 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[320, 80]} />
      <meshBasicMaterial
        ref={matRef}
        color={color}
        transparent
        opacity={intensity * 0.45}
        depthWrite={false}
        fog={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STARS – two layers: dense fine field + sparse bright points
// Slight blue tint to feel cold and distant
// ─────────────────────────────────────────────────────────────────────────────
function Stars({ opacity }) {
  const [fine, bright] = useMemo(() => {
    const fineArr = [];
    const brightArr = [];
    for (let i = 0; i < 2200; i++) {
      const r     = 340 + Math.random() * 80;
      const theta = Math.PI * 2 * Math.random();
      const phi   = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = Math.abs(r * Math.cos(phi)) + 15;
      const z = r * Math.sin(phi) * Math.sin(theta);
      fineArr.push(x, y, z);
    }
    for (let i = 0; i < 280; i++) {
      const r     = 300 + Math.random() * 60;
      const theta = Math.PI * 2 * Math.random();
      const phi   = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = Math.abs(r * Math.cos(phi)) + 15;
      const z = r * Math.sin(phi) * Math.sin(theta);
      brightArr.push(x, y, z);
    }
    return [new Float32Array(fineArr), new Float32Array(brightArr)];
  }, []);

  return (
    <>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[fine, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={1.1} color="#c8d4f0"
          transparent opacity={opacity * 0.80}
          fog={false} sizeAttenuation
          depthWrite={false}
        />
      </points>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[bright, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={2.8} color="#ffffff"
          transparent opacity={opacity * 0.55}
          fog={false} sizeAttenuation
          depthWrite={false}
        />
      </points>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export default function DynamicSkyAndLight({ timeOfDay }) {
  const v = useMemo(() => getValues(timeOfDay), [timeOfDay]);

  // Sun arc: rises east (6h), sets west (18h)
  const DIST = 270;
  const sunAngle = (timeOfDay - 6) * (Math.PI / 12);
  const sunX =  Math.cos(sunAngle) * -DIST;
  const sunY =  Math.sin(sunAngle) *  DIST;
  const sunZ = -80;

  // Moon is opposite the sun
  const moonAngle = sunAngle + Math.PI;
  const moonX =  Math.cos(moonAngle) * -DIST;
  const moonY =  Math.sin(moonAngle) *  DIST;
  const moonZ =  80;

  // Star opacity windows
  let starOpacity = 0;
  if      (timeOfDay < 5   || timeOfDay > 20.5) starOpacity = 1;
  else if (timeOfDay >= 19.5 && timeOfDay <= 20.5) starOpacity = (timeOfDay - 19.5);
  else if (timeOfDay >=  5   && timeOfDay <=  6  ) starOpacity = 1 - (timeOfDay - 5);

  // Horizon glow intensity: peaks at sunrise and sunset
  const glowHours = [
    { center: 6,    spread: 1.5 },
    { center: 18.5, spread: 1.5 },
  ];
  const glowIntensity = glowHours.reduce((acc, g) => {
    const d = Math.abs(timeOfDay - g.center);
    return Math.max(acc, Math.max(0, 1 - d / g.spread));
  }, 0);

  const sunVisible  = v.sunIntensity  > 0.01 && sunY  > -30;
  const moonVisible = v.moonIntensity > 0.01 && moonY > -30;

  return (
    <>
      {/* Sky gradient dome */}
      <SkyDome zenithColor={v.skyZenith} horizonColor={v.skyHorizon} />

      {/* Fog — pulls distant terrain into atmosphere */}
      <fog attach="fog" args={[v.fog, 90, 360]} />

      {/* Soft hemisphere: sky light from above, reflected ground light from below */}
      <hemisphereLight
        color={v.hemiSky}
        groundColor={v.hemiGround}
        intensity={v.hemiIntensity}
      />

      {/* Ambient fill — keeps shadows from going pure black */}
      <ambientLight color={v.ambient} intensity={v.ambientIntensity} />

      {/* Sun directional light */}
      <directionalLight
        castShadow
        color={v.sunColor}
        intensity={v.sunIntensity}
        position={[sunX, sunY, sunZ]}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={600}
        shadow-camera-left={-240}
        shadow-camera-right={240}
        shadow-camera-top={240}
        shadow-camera-bottom={-240}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />

      {/* Sun disc */}
      {sunVisible && (
        <mesh position={[sunX, sunY, sunZ]}>
          <sphereGeometry args={[10, 16, 16]} />
          <meshBasicMaterial color={v.sunColor} fog={false} />
        </mesh>
      )}

      {/* Soft glow bloom around sun/horizon at golden hours */}
      <HorizonGlow
        sunX={sunX} sunZ={sunZ}
        color={v.sunColor}
        intensity={sunVisible ? glowIntensity * v.sunIntensity * 0.7 : 0}
      />

      {/* Moon light — cooler, dimmer, fills shadow side with blue-grey */}
      <directionalLight
        color={v.moonColor}
        intensity={v.moonIntensity}
        position={[moonX, moonY, moonZ]}
      />

      {/* Moon disc */}
      {moonVisible && (
        <mesh position={[moonX, moonY, moonZ]}>
          <sphereGeometry args={[8, 16, 16]} />
          <meshBasicMaterial color="#dce8ff" fog={false} />
        </mesh>
      )}

      {/* Stars */}
      {starOpacity > 0.01 && <Stars opacity={starOpacity} />}
    </>
  );
}