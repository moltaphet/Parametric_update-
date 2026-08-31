"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, type Group } from "three";

interface OrbitRingsProps {
  still: boolean;
}

/**
 * Inclined orbital rings with a travelling marker on each.
 *
 * These are the "flight path" motif: each ring is a great circle at a different
 * inclination, and the small sphere riding it reads as a tracked flight. Three
 * rings at coprime speeds means the composition never visibly repeats.
 */
export function OrbitRings({ still }: OrbitRingsProps) {
  const group = useRef<Group>(null);

  // Ring configuration is static; building it once avoids reallocating
  // geometry descriptors on every render.
  const rings = useMemo(
    () => [
      { radius: 2.1, tilt: [1.15, 0.2, 0] as const, speed: 0.42, color: "#22d3ee" },
      { radius: 2.55, tilt: [0.5, 0.9, 0.3] as const, speed: -0.3, color: "#38bdf8" },
      { radius: 2.95, tilt: [1.5, -0.4, 0.7] as const, speed: 0.22, color: "#67e8f9" },
    ],
    []
  );

  const markers = useRef<(Group | null)[]>([]);

  useFrame((state) => {
    if (still) return;
    const t = state.clock.elapsedTime;

    // Drive each marker around its own ring in the ring's local space, so the
    // parent tilt carries it onto the correct inclined plane for free.
    rings.forEach((ring, index) => {
      const marker = markers.current[index];
      if (!marker) return;
      const angle = t * ring.speed;
      marker.position.set(
        Math.cos(angle) * ring.radius,
        Math.sin(angle) * ring.radius,
        0
      );
    });

    if (group.current) group.current.rotation.y = t * 0.05;
  });

  return (
    <group ref={group}>
      {rings.map((ring, index) => (
        <group key={ring.radius} rotation={ring.tilt}>
          {/* The orbit path itself. torusGeometry with a small tube reads as a
              clean line while still catching light, unlike a flat ring. */}
          <mesh>
            <torusGeometry args={[ring.radius, 0.007, 8, 160]} />
            <meshBasicMaterial
              color={ring.color}
              transparent
              opacity={0.32}
              blending={AdditiveBlending}
            />
          </mesh>

          {/* Travelling marker: a bright point with a soft halo behind it. */}
          <group
            ref={(node) => {
              markers.current[index] = node;
            }}
          >
            <mesh>
              <sphereGeometry args={[0.055, 16, 16]} />
              <meshBasicMaterial color="#a5f3fc" />
            </mesh>
            <mesh>
              <sphereGeometry args={[0.13, 16, 16]} />
              <meshBasicMaterial
                color={ring.color}
                transparent
                opacity={0.28}
                blending={AdditiveBlending}
              />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}
