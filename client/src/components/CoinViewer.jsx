import React, { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  ContactShadows,
  Html,
  Center,
  useGLTF
} from "@react-three/drei";

/* Loads model from a passed URL (bundler or public path) */
function CoinModel({ url }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

export default function CoinViewer({
  src,
  autoRotate = true,
  rotateSpeed = 0.6,     // ← new: control rotation speed (turns/sec-ish)
  className = ""
}) {
  if (!src) return null;

  return (
    <div className={className}>
      <Canvas camera={{ position: [0, 0.5, 3], fov: 35 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[2, 3, 5]} intensity={1.2} />

        <Suspense fallback={<Html center style={{ color: "#ccc" }}>loading…</Html>}>
          <Center>
            <group rotation={[0, Math.PI / 2, 0]} scale={1.0}>
              <CoinModel url={src} />
            </group>
            <Environment preset="studio" />
            <ContactShadows opacity={0.35} position={[0, -0.8, 0]} blur={2.2} far={4} />
          </Center>
        </Suspense>

        <OrbitControls
          enableZoom={false}
          autoRotate={autoRotate}
          autoRotateSpeed={rotateSpeed}   // ← use the new prop here
          minPolarAngle={Math.PI / 2.3}
          maxPolarAngle={Math.PI / 2.3}
        />
      </Canvas>
    </div>
  );
}
