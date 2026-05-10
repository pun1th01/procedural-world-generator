import Terrain from './Terrain';
import Trees from './Trees';
import { ALPINE_TERRAIN } from '../utils/terrainMath';

export default function Scene({ seed }) {
  const terrainSize = ALPINE_TERRAIN.worldSize;

  return (
    <>
      <fog
        attach="fog"
        args={["#b8cde0", 140, 360]}
      />
      <ambientLight intensity={0.32} />
      <hemisphereLight
        args={["#dbefff", "#b7d1b0", 0.18]}
      />
      <directionalLight
        castShadow
        intensity={1.55}
        position={[120, 180, 80]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={420}
        shadow-camera-left={-180}
        shadow-camera-right={180}
        shadow-camera-top={180}
        shadow-camera-bottom={-180}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />

      <Terrain size={terrainSize} seed={seed} />
      <Trees terrainSize={terrainSize} count={260} modelPath="/Assets/Models/pine_tree.glb" seed={seed} />
    </>
  );
}
