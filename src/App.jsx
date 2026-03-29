import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import Scene from './components/Scene';

export default function App() {
  return (
    <Canvas camera={{ position: [18, 14, 18], fov: 50 }} shadows>
      <color attach="background" args={['#c8e6ff']} />
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
      <OrbitControls enableDamping dampingFactor={0.08} target={[0, 0, 0]} />
    </Canvas>
  );
}
