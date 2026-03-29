export default function Terrain({ size = 100 }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color="#5a9b4f" />
    </mesh>
  );
}
