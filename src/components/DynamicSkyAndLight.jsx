import { useMemo } from 'react';
import * as THREE from 'three';

const STOPS = [
  { time: 0,  sky: '#02040f', fog: '#050a1f', sunColor: '#000000', sunIntensity: 0,   moonColor: '#8a99cc', moonIntensity: 0.8, ambient: '#10152a', ambientIntensity: 0.15 },
  { time: 5,  sky: '#060e29', fog: '#0b1633', sunColor: '#ff8a5c', sunIntensity: 0.1, moonColor: '#8a99cc', moonIntensity: 0.3, ambient: '#1a223a', ambientIntensity: 0.18 },
  { time: 6,  sky: '#ffb28c', fog: '#e69073', sunColor: '#ffa87a', sunIntensity: 0.9, moonColor: '#000000', moonIntensity: 0,   ambient: '#4a3d46', ambientIntensity: 0.3  },
  { time: 8,  sky: '#a2d2ff', fog: '#b8cde0', sunColor: '#fff5d6', sunIntensity: 1.4, moonColor: '#000000', moonIntensity: 0,   ambient: '#dbefff', ambientIntensity: 0.4  },
  { time: 12, sky: '#7db9e8', fog: '#92c5eb', sunColor: '#ffffff', sunIntensity: 1.8, moonColor: '#000000', moonIntensity: 0,   ambient: '#e6f2ff', ambientIntensity: 0.45 },
  { time: 16, sky: '#a2d2ff', fog: '#b8cde0', sunColor: '#fff5d6', sunIntensity: 1.4, moonColor: '#000000', moonIntensity: 0,   ambient: '#dbefff', ambientIntensity: 0.4  },
  { time: 18, sky: '#ffa384', fog: '#e88974', sunColor: '#ff7b54', sunIntensity: 1.0, moonColor: '#000000', moonIntensity: 0,   ambient: '#4a363b', ambientIntensity: 0.3  },
  { time: 19, sky: '#422a4c', fog: '#351a3d', sunColor: '#a15b6d', sunIntensity: 0.2, moonColor: '#5c6da6', moonIntensity: 0.1, ambient: '#241b2a', ambientIntensity: 0.2  },
  { time: 20, sky: '#050b1a', fog: '#0a1024', sunColor: '#000000', sunIntensity: 0,   moonColor: '#8a99cc', moonIntensity: 0.5, ambient: '#121524', ambientIntensity: 0.15 },
  { time: 24, sky: '#02040f', fog: '#050a1f', sunColor: '#000000', sunIntensity: 0,   moonColor: '#8a99cc', moonIntensity: 0.8, ambient: '#10152a', ambientIntensity: 0.15 }
];

function lerpColor(c1, c2, t) {
  return new THREE.Color(c1).lerp(new THREE.Color(c2), t);
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function getInterpolatedValues(timeOfDay) {
  let lower = STOPS[0];
  let upper = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (timeOfDay >= STOPS[i].time && timeOfDay <= STOPS[i+1].time) {
      lower = STOPS[i];
      upper = STOPS[i+1];
      break;
    }
  }
  
  const span = upper.time - lower.time;
  const t = span === 0 ? 0 : (timeOfDay - lower.time) / span;

  return {
    sky: lerpColor(lower.sky, upper.sky, t),
    fog: lerpColor(lower.fog, upper.fog, t),
    sunColor: lerpColor(lower.sunColor, upper.sunColor, t),
    sunIntensity: lerp(lower.sunIntensity, upper.sunIntensity, t),
    moonColor: lerpColor(lower.moonColor, upper.moonColor, t),
    moonIntensity: lerp(lower.moonIntensity, upper.moonIntensity, t),
    ambient: lerpColor(lower.ambient, upper.ambient, t),
    ambientIntensity: lerp(lower.ambientIntensity, upper.ambientIntensity, t),
  };
}

function CustomStars({ opacity }) {
  const [positions] = useMemo(() => {
    const pos = [];
    for(let i = 0; i < 1500; i++){
      const r = 250 + Math.random() * 100;
      const theta = 2 * Math.PI * Math.random();
      const phi = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = Math.abs(r * Math.sin(phi) * Math.sin(theta)) + 10; // keep above horizon
      const z = r * Math.cos(phi);
      pos.push(x, y, z);
    }
    return [new Float32Array(pos)];
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach={"attributes-position"} args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={1.8} color="#ffffff" transparent opacity={opacity} fog={false} sizeAttenuation={true} />
    </points>
  );
}

export default function DynamicSkyAndLight({ timeOfDay }) {
  // Smoothly interpolate all environment variables based on time
  const values = useMemo(() => getInterpolatedValues(timeOfDay), [timeOfDay]);

  // Map 0-24 time to an angle representation (6:00 is sunrise/east, 18:00 is sunset/west)
  const sunAngle = (timeOfDay - 6) * (Math.PI / 12);
  const distance = 260; // How far the sun/moon are from center
  
  const sunX = Math.cos(sunAngle) * -distance;
  const sunY = Math.sin(sunAngle) * distance; 
  const sunZ = -70; // Offset on Z to provide deeper shadows

  const moonAngle = sunAngle + Math.PI; // Moon is directly opposite
  const moonX = Math.cos(moonAngle) * -distance;
  const moonY = Math.sin(moonAngle) * distance;
  const moonZ = 70;

  // Star visibility: visible evening through early morning
  let starOpacity = 0;
  if (timeOfDay < 5 || timeOfDay > 20) starOpacity = 1;
  else if (timeOfDay >= 18 && timeOfDay <= 20) starOpacity = (timeOfDay - 18) / 2;
  else if (timeOfDay >= 5 && timeOfDay <= 6) starOpacity = 1 - (timeOfDay - 5);

  return (
    <>
      <color attach="background" args={[values.sky]} />
      <fog attach="fog" args={[values.fog, 100, 380]} />
      
      {/* Base environmental light */}
      <ambientLight intensity={values.ambientIntensity} color={values.ambient} />
      
      {/* Sunlight */}
      <directionalLight
        castShadow
        color={values.sunColor}
        intensity={values.sunIntensity}
        position={[sunX, sunY, sunZ]}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={600}
        shadow-camera-left={-220}
        shadow-camera-right={220}
        shadow-camera-top={220}
        shadow-camera-bottom={-220}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />
      {values.sunIntensity > 0 && sunY > -30 && (
         <mesh position={[sunX, sunY, sunZ]}>
            <sphereGeometry args={[12, 16, 16]} />
            <meshBasicMaterial color={values.sunColor} fog={false} />
         </mesh>
      )}

      {/* Moonlight */}
      <directionalLight
        castShadow
        color={values.moonColor}
        intensity={values.moonIntensity}
        position={[moonX, moonY, moonZ]}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={600}
        shadow-camera-left={-220}
        shadow-camera-right={220}
        shadow-camera-top={220}
        shadow-camera-bottom={-220}
        shadow-bias={-0.001}
        shadow-normalBias={0.02}
      />
      {values.moonIntensity > 0 && moonY > -30 && (
         <mesh position={[moonX, moonY, moonZ]}>
            <sphereGeometry args={[9, 16, 16]} />
            <meshBasicMaterial color="#ffffff" fog={false} />
         </mesh>
      )}

      {/* Night Sky Stars */}
      {starOpacity > 0 && <CustomStars opacity={starOpacity} />}
    </>
  );
}
