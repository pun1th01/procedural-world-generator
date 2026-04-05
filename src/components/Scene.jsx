import Terrain from './Terrain';
import Trees from './Trees';

export default function Scene({ seed }) {
  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight
        castShadow
        intensity={1.2}
        position={[20, 30, 10]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
      />

      <Terrain size={100} />
      <Trees terrainSize={100} count={100} modelPath="/Assets/Models/pine_tree.glb" seed={seed} />
    </>
  );
}
