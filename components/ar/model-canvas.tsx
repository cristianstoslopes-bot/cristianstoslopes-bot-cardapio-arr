"use client";

/**
 * Visualizador 3D "tela plana" (fallback sem AR) com React Three Fiber.
 * - Carrega GLB/GLTF real do Supabase Storage (GLTFLoader via drei/useGLTF, com Draco).
 * - Normaliza a escala para o tamanho real do prato (real_size_m).
 * - OrbitControls: arrastar = girar, pinça/scroll = zoom.
 * - Iluminação 100% local (Lightformers) — sem baixar HDRI externo.
 */
import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Bounds,
  Center,
  ContactShadows,
  Environment,
  Lightformer,
  OrbitControls,
  useGLTF,
  useProgress,
} from "@react-three/drei";
import { Box3, Vector3 } from "three";

/**
 * Indicador de carregamento como overlay DOM FORA do <Canvas>.
 * (drei <Html> como fallback de Suspense gera erro de removeChild no React 19 ao desmontar.)
 */
function LoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div
      role="status"
      className="pointer-events-none absolute inset-0 grid place-items-center"
    >
      <span className="rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white">
        Carregando 3D… {Math.round(progress)}%
      </span>
    </div>
  );
}

function Model({ url, realSizeM }: { url: string; realSizeM: number }) {
  const { scene } = useGLTF(url, true); // true = decoder Draco
  const object = useMemo(() => scene.clone(true), [scene]);

  // Escala real: maior dimensão do modelo = real_size_m (metros)
  const scale = useMemo(() => {
    const size = new Box3().setFromObject(object).getSize(new Vector3());
    const max = Math.max(size.x, size.y, size.z) || 1;
    return realSizeM / max;
  }, [object, realSizeM]);

  return (
    <Center top>
      <primitive object={object} scale={scale} />
    </Center>
  );
}

export default function ModelCanvas({
  url,
  realSizeM,
  autoRotate = true,
}: {
  url: string;
  realSizeM: number;
  autoRotate?: boolean;
}) {
  return (
    <div className="relative size-full">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0.35, 0.25, 0.45], fov: 35, near: 0.01, far: 50 }}
        gl={{ antialias: true, preserveDrawingBuffer: false }}
        aria-label="Visualizador 3D do produto. Arraste para girar, use pinça ou scroll para zoom."
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[2, 4, 2]} intensity={1.6} />
        <Environment resolution={256}>
          <Lightformer
            form="rect"
            intensity={3}
            position={[0, 3, 2]}
            scale={[4, 2, 1]}
          />
          <Lightformer
            form="rect"
            intensity={1.5}
            position={[-3, 1, -1]}
            scale={[2, 2, 1]}
            rotation-y={Math.PI / 2}
          />
          <Lightformer
            form="ring"
            intensity={1}
            color="#ffd9b0"
            position={[3, 1, 1]}
            scale={1.5}
          />
        </Environment>

        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.3}>
            <Model url={url} realSizeM={realSizeM} />
          </Bounds>
          <ContactShadows
            position={[0, 0, 0]}
            opacity={0.45}
            scale={realSizeM * 4}
            blur={2.4}
            far={realSizeM * 2}
          />
        </Suspense>

        <OrbitControls
          makeDefault
          enablePan={false}
          autoRotate={autoRotate}
          autoRotateSpeed={1.2}
          minPolarAngle={0.2}
          maxPolarAngle={Math.PI / 2.05}
          minDistance={realSizeM * 1.2}
          maxDistance={realSizeM * 8}
        />
      </Canvas>
      <LoadingOverlay />
    </div>
  );
}
