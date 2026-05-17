import Terrain from './Terrain';
import Trees from './Trees';
import { ALPINE_TERRAIN } from '../utils/terrainMath';
import DynamicSkyAndLight from './DynamicSkyAndLight';

export default function Scene({ seed, timeOfDay = 12 }) {
  const terrainSize = ALPINE_TERRAIN.worldSize;

  return (
    <>
      <DynamicSkyAndLight timeOfDay={timeOfDay} />

      <Terrain size={terrainSize} seed={seed} />
      <Trees terrainSize={terrainSize} count={260} modelPath="/Assets/Models/pine_tree.glb" seed={seed} />
    </>
  );
}
