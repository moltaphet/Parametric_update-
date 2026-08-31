"use client";

import { useFrame } from "@react-three/fiber";
import { Icosahedron } from "@react-three/drei";
import { useRef, type RefObject } from "react";
import type { Group, Mesh } from "three";

interface ShieldCoreProps {
  /**
   * Normalized pointer position, -1..1 on both axes.
   *
   * Passed as a ref rather than a value on purpose. The parent writes a fresh
   * object into `.current` on every pointermove; handing over `.current` itself
   * would freeze this component on whatever snapshot existed at render time,
   * because nothing re-renders between moves.
   */
  pointer: RefObject<{ x: number; y: number }>;
  /** When true the scene is frozen for reduced-motion users. */
  still: boolean;
}

/**
 * The parametric data node at the centre of the hero.
 *
 * Three nested icosahedra read as one object: a solid dark core, an emissive
 * inner shell, and a wireframe cage. The cage counter-rotates against the shell,
 * which is what makes the silhouette feel like a mechanism rather than a
 * spinning ball.
 */
export function ShieldCore({ pointer, still }: ShieldCoreProps) {
  const group = useRef<Group>(null);
  const cage = useRef<Mesh>(null);
  const shell = useRef<Mesh>(null);

  useFrame((state, delta) => {
    if (!group.current || still) return;

    // Damped tilt toward the pointer. Lerping the target rather than assigning
    // it is what removes the jitter that raw pointer tracking produces; the
    // 0.06 factor is the "weight" of the object.
    const targetX = pointer.current.y * 0.28;
    const targetY = pointer.current.x * 0.42;
    group.current.rotation.x += (targetX - group.current.rotation.x) * 0.06;
    group.current.rotation.y += (targetY - group.current.rotation.y) * 0.06;

    // Constant drift so the node never looks frozen when the pointer is still.
    if (cage.current) cage.current.rotation.y += delta * 0.18;
    if (shell.current) shell.current.rotation.y -= delta * 0.1;

    // Slow vertical float, decoupled from rotation.
    group.current.position.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.08;
  });

  return (
    <group ref={group}>
      {/* Opaque core; occludes the far side of the cage for real depth. */}
      <Icosahedron args={[1.05, 1]}>
        <meshStandardMaterial
          color="#04060c"
          roughness={0.35}
          metalness={0.9}
          flatShading
        />
      </Icosahedron>

      {/* Emissive shell just above the core, providing the internal glow. */}
      <Icosahedron ref={shell} args={[1.22, 1]}>
        <meshStandardMaterial
          color="#0e7490"
          emissive="#22d3ee"
          emissiveIntensity={0.55}
          transparent
          opacity={0.24}
          flatShading
        />
      </Icosahedron>

      {/* Outer wireframe cage - the strongest read at small sizes. */}
      <Icosahedron ref={cage} args={[1.55, 1]}>
        <meshBasicMaterial color="#22d3ee" wireframe transparent opacity={0.42} />
      </Icosahedron>
    </group>
  );
}
