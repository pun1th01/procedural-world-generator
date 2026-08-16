import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { GenerationTrace, useOverlayStore } from '@click-to-source/overlay';
import Scene from './components/Scene';

export default function App() {
  const [seed, setSeed] = useState(42);
  const [seedInput, setSeedInput] = useState('42');
  const [panelState, setPanelState] = useState('open');
  const [timeOfDay, setTimeOfDay] = useState(12); // Default to noon
  const applySeedFromInput = () => {
    const parsed = Number.parseInt(seedInput, 10);
    if (!Number.isNaN(parsed)) {
      setSeed(parsed);
    }
  };

  const setRandomSeed = () => {
    const nextSeed = Math.floor(Math.random() * 100000);
    setSeed(nextSeed);
    setSeedInput(String(nextSeed));
  };

  const handlePointerMissed = () => {
    useOverlayStore.getState().clearSelection();
  };

  return (
    <>
      <Canvas camera={{ position: [130, 95, 135], fov: 48 }} shadows onPointerMissed={handlePointerMissed}>
        <Suspense fallback={null}>
          <Scene seed={seed} timeOfDay={timeOfDay} />
        </Suspense>
        <OrbitControls enableDamping dampingFactor={0.08} target={[0, 22, 0]} />
      </Canvas>
      <GenerationTrace />


      {panelState === 'open' && (
        <div
          style={{
            position: 'fixed',
            top: 12,
            left: 12,
            padding: '10px 12px',
            background: 'rgba(255, 255, 255, 0.9)',
            border: '1px solid #d4d4d4',
            borderRadius: 8,
            fontFamily: 'sans-serif',
            fontSize: 14,
            color: '#1f2937',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            zIndex: 9999,
          }}
        >
          <span>Seed</span>
          <input
            value={seedInput}
            onChange={(event) => setSeedInput(event.target.value)}
            onBlur={applySeedFromInput}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                applySeedFromInput();
              }
            }}
            style={{ width: 110, padding: '4px 6px' }}
          />
          <button type="button" onClick={setRandomSeed} style={{ padding: '4px 8px', cursor: 'pointer' }}>
            Random Seed
          </button>
          <button
            type="button"
            onClick={() => setPanelState('minimized')}
            style={{ padding: '4px 8px', cursor: 'pointer' }}
            aria-label="Minimize seed panel"
          >
            _
          </button>
          <button
            type="button"
            onClick={() => setPanelState('closed')}
            style={{ padding: '4px 8px', cursor: 'pointer' }}
            aria-label="Close seed panel"
          >
            X
          </button>
        </div>
      )}

      {/* Time of Day Control Panel */}
      {panelState !== 'closed' && (
         <div
           style={{
             position: 'fixed',
             bottom: 24,
             left: '50%',
             transform: 'translateX(-50%)',
             padding: '12px 24px',
             background: 'rgba(255, 255, 255, 0.9)',
             border: '1px solid #d4d4d4',
             borderRadius: 8,
             fontFamily: 'sans-serif',
             fontSize: 14,
             color: '#1f2937',
             display: 'flex',
             flexDirection: 'column',
             alignItems: 'center',
             gap: 8,
             zIndex: 9999,
             width: 300
           }}
         >
           <label style={{ fontWeight: 'bold' }}>Time of Day: {timeOfDay.toFixed(1)}h</label>
           <input
             type="range"
             min="0"
             max="24"
             step="0.1"
             value={timeOfDay}
             onChange={(e) => setTimeOfDay(Number.parseFloat(e.target.value))}
             style={{ width: '100%', cursor: 'pointer' }}
           />
           <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '11px', color: '#666' }}>
             <span>Midnight</span>
             <span>Noon</span>
             <span>Midnight</span>
           </div>
         </div>
      )}

      {panelState === 'minimized' && (
        <button
          type="button"
          onClick={() => setPanelState('open')}
          style={{
            position: 'fixed',
            left: 12,
            bottom: 12,
            width: 74,
            height: 34,
            padding: '6px 10px',
            border: '1px solid #d4d4d4',
            borderRadius: 6,
            background: 'rgba(255, 255, 255, 0.95)',
            fontFamily: 'sans-serif',
            fontSize: 14,
            lineHeight: '20px',
            color: '#1f2937',
            cursor: 'pointer',
            margin: 0,
            zIndex: 9999,
          }}
        >
          Seed
        </button>
      )}

      {panelState === 'closed' && (
        <button
          type="button"
          onClick={() => setPanelState('open')}
          style={{
            position: 'fixed',
            left: 12,
            bottom: 12,
            padding: '8px 12px',
            border: '1px solid #d4d4d4',
            borderRadius: 8,
            background: 'rgba(255, 255, 255, 0.95)',
            fontFamily: 'sans-serif',
            fontSize: 14,
            color: '#1f2937',
            cursor: 'pointer',
            zIndex: 9999,
          }}
        >
          Open Seed
        </button>
      )}
    </>
  );
}
