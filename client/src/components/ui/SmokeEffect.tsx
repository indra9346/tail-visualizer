import { useEffect, useRef } from "react";

interface SmokeParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  maxAlpha: number;
  life: number;
  maxLife: number;
  wobble: number;
  wobbleSpeed: number;
  curlRadius: number;
}

export function SmokeEffect() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Decorative only: skip entirely for people who ask for less motion.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let animationFrameId = 0;
    let lastFrame = 0;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = 360);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = 360;
    };
    window.addEventListener("resize", handleResize);

    const particles: SmokeParticle[] = [];
    // Fewer particles on small screens keeps scrolling and typing smooth on phones.
    const PARTICLE_COUNT = window.innerWidth < 768 ? 16 : 40;
    const FRAME_MS = window.innerWidth < 768 ? 33 : 16;

    function createParticle(initialY?: number): SmokeParticle {
      const maxLife = 260 + Math.random() * 180;
      return {
        x: Math.random() * (width + 100) - 50,
        y: initialY !== undefined ? initialY : height + Math.random() * 40,
        vx: (Math.random() - 0.5) * 0.25,
        vy: -(0.28 + Math.random() * 0.42),
        radius: 18 + Math.random() * 24,
        maxRadius: 85 + Math.random() * 75,
        alpha: 0,
        maxAlpha: 0.08 + Math.random() * 0.07,
        life: 0,
        maxLife,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.008 + Math.random() * 0.015,
        curlRadius: 0.3 + Math.random() * 0.5,
      };
    }

    // Seed initial particles staggered across the height
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(createParticle(Math.random() * height));
    }

    const render = (now = 0) => {
      animationFrameId = requestAnimationFrame(render);
      if (now - lastFrame < FRAME_MS) return;
      lastFrame = now;
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.life++;

        // Upward thermal buoyancy with soft horizontal atmospheric wave
        p.wobble += p.wobbleSpeed;
        p.x += p.vx + Math.sin(p.wobble) * p.curlRadius;
        p.y += p.vy;

        // Progressive expansion as warm smoke rises
        const progress = p.life / p.maxLife;
        const currentRadius = p.radius + (p.maxRadius - p.radius) * Math.pow(progress, 0.85);

        // Realistic atmospheric dissipation curve
        if (progress < 0.2) {
          p.alpha = (progress / 0.2) * p.maxAlpha;
        } else if (progress > 0.6) {
          p.alpha = p.maxAlpha * (1 - (progress - 0.6) / 0.4);
        } else {
          p.alpha = p.maxAlpha;
        }

        // Draw soft, organic billowy smoke plume with luminous champagne undertones
        if (p.alpha > 0.003) {
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, currentRadius);
          grad.addColorStop(0, `rgba(255, 252, 245, ${p.alpha * 1.1})`);
          grad.addColorStop(0.35, `rgba(248, 238, 222, ${p.alpha * 0.75})`);
          grad.addColorStop(0.7, `rgba(238, 222, 200, ${p.alpha * 0.25})`);
          grad.addColorStop(1, "rgba(230, 212, 185, 0)");

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, currentRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        // Recycle particle once it reaches top of mist zone or exceeds its lifespan
        if (p.life >= p.maxLife || p.y < -p.maxRadius) {
          particles[i] = createParticle();
        }
      }

    };

    // Stop drawing while the tab is in the background.
    const handleVisibility = () => {
      cancelAnimationFrame(animationFrameId);
      if (!document.hidden) animationFrameId = requestAnimationFrame(render);
    };
    document.addEventListener("visibilitychange", handleVisibility);

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-0 h-40 select-none overflow-hidden sm:h-80">
      {/* Soft ground warm-air boundary gradient */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-stone-900/8 via-stone-800/3 to-transparent" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
