# Weather System v2 — Rebuild Notes

> Weather removed from project scope as of 2026-08-16 after v2 rebuild introduced a new mount-transition bug; deprioritized in favor of Click-to-Source dogfooding on normals ordering and lake bed clamp regressions. Revisit only if time permits after Stage 4 core goals are met.

> This document preserves findings from the v1 weather implementation and two
> prior diagnosis passes. Reference this when rebuilding the weather system to
> avoid repeating the same mistakes.

**Date removed:** 2026-08-16
**Reason:** Performance freeze (camera unresponsive) traced to cumulative cost
of the weather particle system, fog overrides, and related per-frame work on
low-end hardware (Ryzen 3 3250U / 2 GB VRAM).

---

## 1. SnowfallSystem — Per-Particle Euler→Quaternion Redundancy

**File (deleted):** `src/components/weather/SnowfallSystem.jsx`

The particle loop ran up to 350–500 iterations per frame (based on
`qualityTier`). Originally, `dummy.rotation.copy(camera.rotation)` was
**inside** the loop — computing the identical billboard Euler→Quaternion
conversion for every single particle.

A fix was applied to hoist it before the loop (line 99:
`dummy.rotation.copy(state.camera.rotation)` once), but the fundamental cost
remained: each particle still called `dummy.updateMatrix()` which internally
recomputes the full TRS matrix including decomposition. For 350 particles at
60 fps, that's **21,000 matrix compositions per second**.

### Rebuild guidance

- Use a **single shared rotation quaternion** computed once per frame.
- Build matrices manually via `Matrix4.compose(position, sharedQuat, scale)`
  or use a custom shader with `gl_PointSize` + point sprites instead of
  InstancedMesh planes.
- Consider frame-skipping (the v1 code already skipped every other frame via
  `frameCount % 2 !== 0`) — but a proper instanced shader approach would make
  this unnecessary.

---

## 2. `<AdaptiveEvents />` — Pointer Event Gating Under Low FPS

**File:** `src/components/Scene.jsx` (still present — this is a drei feature,
not weather-specific)

`<AdaptiveEvents />` pauses pointer/raycaster events when FPS drops below the
`PerformanceMonitor` threshold. This is meant to help, but it **compounds**
with the weather particle cost:

1. Weather particles tank FPS.
2. `AdaptiveEvents` detects the drop and disables pointer events.
3. User perceives "frozen camera" because OrbitControls stops receiving
   pointer input.
4. Actual render loop is still running (just slowly) but the camera won't move.

### Rebuild guidance

- If the rebuilt weather system is lightweight enough, `AdaptiveEvents` should
  work fine as-is.
- If the system is still heavy, consider excluding OrbitControls from the
  event gating, or using a manual performance budget that throttles weather
  quality rather than disabling user input.

---

## 3. DynamicSkyAndLight — Fog/Light Object Recreation Per Slider Tick

**File (still present):** `src/components/DynamicSkyAndLight.jsx`

`getValues(timeOfDay)` is called inside `useMemo([timeOfDay])` — so it runs
on every time-of-day slider change, **not** in `useFrame`. However:

- Each call creates **12 new `THREE.Color` objects** via `lerpColor()`:
  ```js
  function lerpColor(c1, c2, t) {
    return new THREE.Color(c1).lerp(new THREE.Color(c2), t);
  }
  ```
  That's `new THREE.Color()` × 2 × 12 fields = **24 Color allocations per
  slider drag frame**.

- The returned values object is a new object each time, which causes React to
  re-render the entire `<DynamicSkyAndLight>` subtree (sky dome, fog, all
  lights, stars) on every tick.

- The `<fog>` and light JSX elements are re-created by React on each render
  because the color/intensity props change. Three.js should mutate existing
  objects instead.

### Rebuild guidance (even though this file isn't weather-specific)

- Pre-allocate reusable `THREE.Color` instances and `.copy().lerp()` in place.
- Move time-interpolation into `useFrame` and update light uniforms
  imperatively (the SkyDome already does this correctly).
- Use `useRef` for lights and mutate `.color`, `.intensity` directly instead
  of passing new props.

---

## 4. `lerpColor` — Per-Call `THREE.Color` Allocation

**File (still present):** `src/components/DynamicSkyAndLight.jsx`, line 146–148

```js
function lerpColor(c1, c2, t) {
  return new THREE.Color(c1).lerp(new THREE.Color(c2), t);
}
```

**Confirmed location:** Called in `getValues()` which runs inside
`useMemo([timeOfDay])`, NOT inside `useFrame`. So it runs on slider change,
not every animation frame. Still wasteful during slider drag (many rapid
changes) but not a per-frame leak.

### Rebuild guidance

- Replace with a pre-allocated scratch color:
  ```js
  const _scratch = new THREE.Color();
  function lerpColorInPlace(out, c1, c2, t) {
    _scratch.set(c1);
    out.copy(_scratch).lerp(_scratch.set(c2), t);
  }
  ```

---

## 5. Default Weather State Was `'Snow'` — Not `'Clear'`

**Files (deleted/modified):** `App.jsx`, `Scene.jsx`

Both files defaulted to `'Snow'`:

```js
// App.jsx
const [weatherState, setWeatherState] = useState('Snow');

// Scene.jsx
export default function Scene({ seed, timeOfDay = 12, weatherState = 'Snow' }) {
```

This meant the full particle system (350 particles + accumulation worker +
cloud shader + ice overlay + fog overrides) was **always active on first
load**. The `weatherPresets.js` correctly defined `DEFAULT_WEATHER_STATE =
'Clear'` but it was never used as the React-level default.

### Rebuild guidance

- **Default to `'Clear'`** in both the React state and the component prop
  default.
- Consider not mounting weather sub-components at all when state is Clear
  (conditional rendering) rather than relying on intensity checks to hide them.

---

## 6. Additional Findings

### WebGL Context Loss Handler

`ProceduralCloudLayer.jsx` registered `webglcontextlost` /
`webglcontextrestored` event listeners on the canvas. If the cloud system is
rebuilt, ensure these are re-added — WebGL context loss is common on low-VRAM
hardware.

### `fog: false` Workaround

Multiple weather shaders (`ProceduralCloudLayer`, `IceOverlay`,
`BlizzardVeil`) explicitly set `fog: false` to prevent a
`refreshFogUniforms` crash in Three.js when ShaderMaterial doesn't define fog
uniforms. This is a Three.js quirk — keep `fog: false` on any custom
ShaderMaterial that doesn't implement fog.

### Weather Debug Logs

`vite-weather-debug.log` and `vite-weather-debug.err.log` were left in the
project root from debugging sessions. These have been cleaned up as part of
the removal.

### `snowTerrainWorker.js`

The Web Worker for snow accumulation geometry was the **only file** in
`src/workers/`. It imports `TerrainGenerator` from `terrainMath.js` and does
full FBM noise sampling per vertex — heavy work that was correctly offloaded
to a worker. If snow accumulation is rebuilt, keep this pattern.

### `terrainMath.js` — `snowAmount` Field

The `snowAmount` field in `TerrainGenerator.sample()` is **terrain biome
data**, not weather data. It's used by `getForestSuitability()` to prevent
tree placement on snowy peaks. It was NOT removed as part of this cleanup.
