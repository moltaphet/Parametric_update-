"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, CanvasTexture, type Points } from "three";

interface ParticleFieldProps {
  /** Particle count. Lowered on small screens by the parent scene. */
  count: number;
  still: boolean;
}

/**
 * Ambient point cloud surrounding the node.
 *
 * Positions are generated once into a typed array and uploaded as a static
 * buffer attribute; only the parent transform is animated. Animating the buffer
 * itself would re-upload the whole array every frame for no visual gain.
 */
export function ParticleField({ count, still }: ParticleFieldProps) {
  const points = useRef<Points>(null);

  const positions = useMemo(() => {
    const array = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      // Rejection-free spherical shell sampling: a uniform direction scaled to
      // a radius in [3.4, 7.4]. Sampling z uniformly in [-1, 1] and deriving
      // the polar angle from it is what keeps the distribution even rather than
      // clustered at the poles.
      const z = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const scale = Math.sqrt(1 - z * z);
      const radius = 3.4 + Math.random() * 4;

      array[i * 3] = Math.cos(theta) * scale * radius;
      array[i * 3 + 1] = Math.sin(theta) * scale * radius;
      array[i * 3 + 2] = z * radius;
    }
    return array;
  }, [count]);

  /**
   * Circular sprite for the points.
   *
   * `pointsMaterial` renders each point as a square quad by default, which at
   * this size shows up as visible boxes rather than stars. Mapping a radial
   * alpha gradient masks each quad into a soft disc. Generated in-memory so the
   * component stays self-contained with no asset to ship.
   */
  const sprite = useMemo(() => {
    if (typeof document === "undefined") return null;
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2
    );
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.35, "rgba(255,255,255,0.75)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    return new CanvasTexture(canvas);
  }, []);

  // Textures hold GPU memory; release it when the scene unmounts.
  useEffect(() => () => sprite?.dispose(), [sprite]);

  useFrame((state, delta) => {
    if (!points.current || still) return;
    points.current.rotation.y += delta * 0.014;
    // Very slight nod, so the field is not a rigid rotating sphere.
    points.current.rotation.x =
      Math.sin(state.clock.elapsedTime * 0.12) * 0.06;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        {/* Constructor args only. Passing count/itemSize alongside `args` sets
            them twice and can desync the attribute from its buffer. */}
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.055}
        color="#67e8f9"
        map={sprite}
        // alphaTest discards the fully transparent corners so overlapping
        // sprites do not build up square edges against each other.
        alphaTest={0.01}
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}
