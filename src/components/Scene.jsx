import { Suspense, useState, useCallback } from 'react';
import { AdaptiveDpr, AdaptiveEvents, PerformanceMonitor, Preload } from '@react-three/drei';
import { useClickToSource, useOverlayStore, SelectionHighlight } from '@click-to-source/overlay';
import Terrain from './Terrain';
import Trees from './Trees';
import GroundCover from './GroundCover';
import Water from './Water';
import DynamicSkyAndLight from './DynamicSkyAndLight';
import { ALPINE_TERRAIN } from '../utils/terrainMath';

// ─────────────────────────────────────────────────────────────────────────────
// LOADING FALLBACK
// Renders nothing visible — the sky/terrain still load instantly,
// this only covers the async GLB tree model.
// ─────────────────────────────────────────────────────────────────────────────
function TreeLoadingFallback() {
  return null; // Trees pop in once loaded; scene stays visible in the meantime
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENE
// ─────────────────────────────────────────────────────────────────────────────
export default function Scene({ seed, timeOfDay = 12 }) {
  const terrainSize = ALPINE_TERRAIN.worldSize;

  // PerformanceMonitor tracks FPS and fires onIncline/onDecline.
  // On your Ryzen 3 3250U this matters — if FPS drops below threshold
  // AdaptiveDpr automatically lowers the pixel ratio to keep it smooth.
  const [perfTier, setPerfTier] = useState(1); // 0 = low, 1 = mid, 2 = high
  const onDecline = useCallback(() => setPerfTier(t => Math.max(0, t - 1)), []);
  const onIncline = useCallback(() => setPerfTier(t => Math.min(2, t + 1)), []);

  // Scale tree count to performance tier so low-end stays smooth
  const treeCount = [140, 200, 260][perfTier];
  const grassCount = [500, 750, 950][perfTier];
  const bushCount = [35, 55, 75][perfTier];

  const resolveClick = useClickToSource();

  const handlePointerUp = (e) => {
    e.stopPropagation();
    const resolved = resolveClick(e);
    if (resolved) {
      useOverlayStore.getState().select(resolved);
    } else {
      useOverlayStore.getState().clearSelection();
    }
  };

  return (
    <>
      <SelectionHighlight />
      {/* Adaptive pixel ratio — lowers DPR when FPS drops, huge win on 2GB VRAM */}
      <AdaptiveDpr pixelated />

      {/* Pause pointer events when camera is moving to save CPU */}
      <AdaptiveEvents />

      {/* FPS monitor — samples over 1s, fires after 5 stable frames */}
      <PerformanceMonitor
        ms={1000}
        iterations={5}
        threshold={0.75}
        onDecline={onDecline}
        onIncline={onIncline}
      />

      {/* Preload all pending async assets (GLB, textures) */}
      <Preload all />

      {/* ── Sky, lighting, fog ─────────────────────────────────────── */}
      <DynamicSkyAndLight timeOfDay={timeOfDay} />

      <group onPointerUp={handlePointerUp}>
        {/* ── Terrain ────────────────────────────────────────────────── */}
        <Terrain size={terrainSize} seed={seed} />

        <GroundCover
          terrainSize={terrainSize}
          grassCount={grassCount}
          bushCount={bushCount}
          seed={seed}
        />

        {/* ── Trees (async GLB — wrapped in Suspense) ────────────────── */}
        <Suspense fallback={<TreeLoadingFallback />}>
          <Trees
            terrainSize={terrainSize}
            count={treeCount}
            modelPath="/Assets/Models/pine_tree.glb"
            seed={seed}
          />
        </Suspense>

        {/* ── Water (disabled until basin logic is implemented) ──────── */}
        <Water terrainSize={terrainSize} />
      </group>
    </>
  );
}
