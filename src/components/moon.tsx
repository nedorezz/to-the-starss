'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useTheme } from 'next-themes';

/**
 * Анимированная луна «To the stars» — светит в правой части неба.
 * Плавно парит вверх-вниз, ореол мягко пульсирует.
 * Адаптируется под тёмную/светлую тему, уважает prefers-reduced-motion.
 */
export function SkyMoon() {
  const reduce = useReducedMotion();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== 'light';

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed right-[4vw] top-20 z-0 sm:top-24 md:right-[5vw] md:top-28"
    >
      <motion.div
        className="relative h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24"
        animate={reduce ? undefined : { y: [0, -12, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* Ореол */}
        <div
          className={`moon-glow absolute -inset-10 rounded-full ${
            dark ? 'moon-glow--dark' : 'moon-glow--light'
          }`}
        />

        {/* Сама луна (полумесяц со кратерами) */}
        <motion.svg
          viewBox="0 0 120 120"
          fill="none"
          className={`relative h-full w-full drop-shadow-[0_0_18px_rgba(140,200,255,0.35)] ${
            dark ? 'opacity-95' : 'opacity-80'
          }`}
          animate={reduce ? undefined : { rotate: [0, 2, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        >
          <defs>
            <radialGradient id="ttsMoon" cx="30%" cy="72%" r="85%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="45%" stopColor="#eaf5ff" />
              <stop offset="100%" stopColor="#6cb9ef" />
            </radialGradient>
            <mask id="ttsCrescent">
              <rect width="120" height="120" fill="white" />
              <circle cx="86" cy="38" r="42" fill="black" />
            </mask>
          </defs>
          <g mask="url(#ttsCrescent)">
            <circle cx="56" cy="64" r="44" fill="url(#ttsMoon)" />
            {/* Кратеры на освещённой части */}
            <circle cx="36" cy="76" r="7" fill="rgba(140,190,235,0.55)" />
            <circle cx="52" cy="92" r="4.5" fill="rgba(140,190,235,0.45)" />
            <circle cx="24" cy="58" r="3.5" fill="rgba(140,190,235,0.4)" />
            <circle cx="46" cy="60" r="2.8" fill="rgba(140,190,235,0.35)" />
          </g>
        </motion.svg>
      </motion.div>
    </div>
  );
}
