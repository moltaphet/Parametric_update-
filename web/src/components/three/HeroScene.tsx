"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import { ShieldCore } from "./ShieldCore";
import { OrbitRings } from "./OrbitRings";
import { ParticleField } from "./ParticleField";

/**
 * The hero's WebGL scene.
 *
 * Responsibilities kept in this one component so the primitives stay dumb:
 *   - pointer tracking, normalized to -1..1 and read from a ref (a state update
 *     per mousemove would re-render the tree ~120 times a second);
 *   - reduced-motion and viewport-size adaptation;
 *   - graceful degradation when WebGL is unavailable.
 *
 * The whole scene is decorative, so the container is aria-hidden: the headline
 * beside it carries the meaning for assistive technology.
 */
export function HeroScene() {
  const pointer = useRef({ x: 0, y: 0 });
  const [still, setStill] = useState(false);
  const [particleCount, setParticleCount] = useState(700);
  const [supported, setSupported] = useState<boolean | null>(null);

  // Probe WebGL once before mounting the Canvas. R3F has no error prop to hook,
  // and a failed context inside Canvas throws during render, so the check has to
  // happen first. null means "not yet probed" and renders nothing.
  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const context =
        canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      setSupported(Boolean(context));
    } catch {
      setSupported(false);
    }
  }, []);

  // Reduced motion: freeze animation but still render the object, so the
  // composition is intact for users who simply do not want movement.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setStill(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  // Scale particle density to the viewport. Mobile GPUs are the constraint
  // here, not the CPU, so the count drops sharply rather than gradually.
  useEffect(() => {
    const apply = () => {
      const width = window.innerWidth;
      setParticleCount(width < 640 ? 260 : width < 1024 ? 450 : 700);
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  // Pointer tracking on the window, so the object responds even while the
  // cursor is over the headline text rather than the canvas itself.
  useEffect(() => {
    if (still) return;
    const onMove = (event: PointerEvent) => {
      pointer.current = {
        x: (event.clientX / window.innerWidth) * 2 - 1,
        y: -((event.clientY / window.innerHeight) * 2 - 1),
      };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [still]);

  // No WebGL (or not probed yet): render nothing. The parent's CSS bloom and
  // grid still draw, so the hero keeps its composition without the canvas.
  if (!supported) return null;

  return (
    <div className="absolute inset-0" aria-hidden="true">
      <Canvas
        // dpr is capped at 2: beyond that the fill cost rises with no visible
        // gain on this composition.
        dpr={[1, 2]}
        camera={{ position: [0, 0, 7.5], fov: 45 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.35} />
          <pointLight position={[6, 6, 6]} intensity={90} color="#22d3ee" />
          <pointLight position={[-7, -4, -4]} intensity={55} color="#38bdf8" />

          <ShieldCore pointer={pointer} still={still} />
          <OrbitRings still={still} />
          <ParticleField count={particleCount} still={still} />
        </Suspense>
      </Canvas>
    </div>
  );
}
