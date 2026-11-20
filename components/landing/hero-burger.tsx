"use client";

/**
 * Hambúrguer 3D procedural (geometria Three.js real, sem arquivo externo) para a landing.
 * Demonstra a proposta de valor sem depender de upload: gire com o dedo/mouse.
 */
import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Float, OrbitControls } from "@react-three/drei";
import type { Group } from "three";

function Burger() {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.35;
  });
  return (
    <group ref={ref} position={[0, -0.35, 0]}>
      {/* pão de baixo */}
      <mesh position={[0, 0.08, 0]} castShadow>
        <cylinderGeometry args={[1, 0.95, 0.22, 64]} />
        <meshStandardMaterial color="#d9963f" roughness={0.6} />
      </mesh>
      {/* carne */}
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[1.05, 1.05, 0.26, 64]} />
        <meshStandardMaterial color="#4a2a1a" roughness={0.9} />
      </mesh>
      {/* queijo derretido (quadrado rotacionado) */}
      <mesh position={[0, 0.46, 0]} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[1.6, 0.05, 1.6]} />
        <meshStandardMaterial color="#f5b82e" roughness={0.35} />
      </mesh>
      {/* tomate */}
      <mesh position={[0, 0.53, 0]}>
        <cylinderGeometry args={[0.9, 0.9, 0.08, 48]} />
        <meshStandardMaterial color="#c8382b" roughness={0.4} />
      </mesh>
      {/* alface */}
      <mesh position={[0, 0.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.95, 0.07, 12, 64]} />
        <meshStandardMaterial color="#5c9e3c" roughness={0.7} />
      </mesh>
      {/* pão de cima (semi-esfera) */}
      <mesh position={[0, 0.64, 0]} scale={[1, 0.62, 1]} castShadow>
        <sphereGeometry args={[1, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#e0a24a" roughness={0.55} />
      </mesh>
      {/* gergelim */}
      {Array.from({ length: 26 }).map((_, i) => {
        const a = i * 2.39996;
        const r = 0.25 + (i % 5) * 0.13;
        const y = 0.64 + Math.sqrt(Math.max(0, 1 - r * r)) * 0.62;
        return (
          <mesh key={i} position={[Math.cos(a) * r, y, Math.sin(a) * r]} rotation={[0, a, Math.PI / 2]}>
            <capsuleGeometry args={[0.018, 0.05, 4, 8]} />
            <meshStandardMaterial color="#fff6df" />
          </mesh>
        );
      })}
    </group>
  );
}

export default function HeroBurger() {
  return (
    <Canvas camera={{ position: [3.3, 2.3, 3.3], fov: 35 }} dpr={[1, 2]} aria-label="Hambúrguer em 3D interativo" shadows>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 2]} intensity={2} castShadow />
      <directionalLight position={[-3, 2, -2]} intensity={0.6} color="#ffd9b0" />
      <Float speed={1.5} rotationIntensity={0.15} floatIntensity={0.3}>
        <Burger />
      </Float>
      <ContactShadows position={[0, -0.4, 0]} opacity={0.5} scale={5} blur={2.5} />
      <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={0.6} maxPolarAngle={1.5} />
    </Canvas>
  );
}
