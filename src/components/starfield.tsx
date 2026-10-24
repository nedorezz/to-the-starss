'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';

type Star = {
  x: number;
  y: number;
  r: number;
  base: number;
  amp: number;
  speed: number;
  phase: number;
  vx: number;
  vy: number;
  glow: boolean;
};

type Meteor = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
};

/**
 * Фоновая анимация «To the stars»: мерцающие звёзды + редкие падающие звёзды.
 * Рисуется на canvas позади контента, уважает prefers-reduced-motion
 * и адаптируется под тёмную/светлую тему.
 */
export function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dark = resolvedTheme !== 'light';
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let stars: Star[] = [];
    let meteors: Meteor[] = [];
    let raf = 0;
    let running = true;
    let last = performance.now();
    let nextMeteor = reduce ? Infinity : performance.now() + 2500 + Math.random() * 4000;

    const makeStar = (): Star => {
      const big = Math.random() < 0.06;
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        r: big ? 1.6 + Math.random() * 1.2 : 0.4 + Math.random() * 1.1,
        base: big ? 0.5 : 0.25 + Math.random() * 0.4,
        amp: 0.15 + Math.random() * 0.35,
        speed: 0.4 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
        vx: -3 - Math.random() * 4,
        vy: big ? 0 : (Math.random() - 0.5) * 1.2,
        glow: big,
      };
    };

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(70, Math.min(170, Math.round((w * h) / 11000)));
      stars = Array.from({ length: count }, makeStar);
    };

    const starColor = (a: number) =>
      dark ? `rgba(226, 238, 255, ${a})` : `rgba(70, 96, 148, ${a * 0.5})`;

    const draw = (now: number) => {
      if (!running) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx.clearRect(0, 0, w, h);

      for (const s of stars) {
        s.phase += s.speed * dt;
        if (!reduce) {
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          if (s.x < -4) s.x = w + 4;
          if (s.y < -4) s.y = h + 4;
          if (s.y > h + 4) s.y = -4;
        }
        const a = Math.max(0.05, s.base + Math.sin(s.phase) * s.amp);
        if (s.glow) {
          ctx.save();
          ctx.shadowBlur = 8;
          ctx.shadowColor = starColor(a);
          ctx.fillStyle = starColor(a);
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = starColor(a);
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Падающие звёзды
      if (!reduce) {
        if (now > nextMeteor) {
          const fromLeft = Math.random() < 0.5;
          meteors.push({
            x: fromLeft ? -20 : w * (0.3 + Math.random() * 0.6),
            y: fromLeft ? Math.random() * h * 0.35 : -20,
            vx: 340 + Math.random() * 260,
            vy: 170 + Math.random() * 130,
            life: 0,
            max: 0.9 + Math.random() * 0.5,
          });
          nextMeteor = now + 5000 + Math.random() * 8000;
        }
        meteors = meteors.filter((m) => m.life < m.max);
        for (const m of meteors) {
          m.life += dt;
          m.x += m.vx * dt;
          m.y += m.vy * dt;
          const fade = Math.sin((m.life / m.max) * Math.PI);
          const grad = ctx.createLinearGradient(
            m.x,
            m.y,
            m.x - m.vx * 0.16,
            m.y - m.vy * 0.16,
          );
          const head = dark ? `rgba(235, 244, 255, ${0.85 * fade})` : `rgba(70, 96, 148, ${0.6 * fade})`;
          const tail = dark ? 'rgba(235, 244, 255, 0)' : 'rgba(70, 96, 148, 0)';
          grad.addColorStop(0, head);
          grad.addColorStop(1, tail);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.6;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(m.x, m.y);
          ctx.lineTo(m.x - m.vx * 0.16, m.y - m.vy * 0.16);
          ctx.stroke();
        }
      }

      raf = requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(draw);
      }
    };

    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [resolvedTheme]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 opacity-90"
    />
  );
}
