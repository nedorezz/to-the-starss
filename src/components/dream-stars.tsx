'use client';

import { useEffect, useState } from 'react';
import { DREAM_COLORS } from '@/components/feed-tab';
import type { DreamStarInfo } from '@/lib/types';

const STAR_STYLES: Record<string, { dot: string; glow: string }> = Object.fromEntries(
  DREAM_COLORS.map((c) => [c.id, { dot: c.dot, glow: c.glow }]),
);

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

/**
 * Звёзды-мечты поверх обычного неба: цветные (зелёная/жёлтая/красная),
 * при наведении (или тапе на телефоне) показывают, что в них написано.
 * Обычные звёзды рисует Starfield (canvas), они остаются белыми.
 */
export function DreamStars() {
  const [dreams, setDreams] = useState<DreamStarInfo[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // подгрузка мечт с сервера (setState — в колбэке внешнего ответа)
    fetch('/api/dreams', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json: { dreams?: DreamStarInfo[] }) => {
        if (!cancelled && json && Array.isArray(json.dreams)) {
          setDreams(json.dreams.filter((d) => d && d.id && typeof d.x === 'number'));
        }
      })
      .catch(() => {
        // небо без мечт — не критично
      });

    const onAdded = (e: Event) => {
      const dream = (e as CustomEvent<DreamStarInfo>).detail;
      if (dream?.id) setDreams((prev) => [dream, ...prev]);
    };
    window.addEventListener('tts:dream-added', onAdded);
    return () => {
      cancelled = true;
      window.removeEventListener('tts:dream-added', onAdded);
    };
  }, []);

  return (
    <div aria-label="Звёзды-мечты" className="pointer-events-none fixed inset-0 z-0">
      {dreams.map((d) => {
        const style = STAR_STYLES[d.color] || STAR_STYLES.green;
        const open = openId === d.id;
        return (
          <div
            key={d.id}
            className="group absolute"
            style={{ left: `${d.x}%`, top: `${d.y}%` }}
          >
            <button
              type="button"
              aria-label={`Мечта: ${d.text}`}
              className="pointer-events-auto flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
              onMouseEnter={() => setOpenId(d.id)}
              onMouseLeave={() => setOpenId((cur) => (cur === d.id ? null : cur))}
              onFocus={() => setOpenId(d.id)}
              onBlur={() => setOpenId((cur) => (cur === d.id ? null : cur))}
              onClick={() => setOpenId(open ? null : d.id)}
            >
              <span
                className={`block h-2.5 w-2.5 rounded-full ring-2 ring-white/15 ${style.dot} ${style.glow} animate-[tts-twinkle_2.6s_ease-in-out_infinite]`}
                style={{ animationDelay: `${(d.x % 10) * 0.31}s` }}
              />
            </button>
            {open && (
              <div
                role="tooltip"
                className="absolute bottom-full left-1/2 z-10 mb-1 w-max max-w-[230px] -translate-x-1/2 rounded-xl bg-ink px-3 py-2 text-left text-xs leading-relaxed text-surface shadow-xl"
              >
                <p className="break-words">{d.text}</p>
                {formatDate(d.createdAt) && (
                  <p className="mt-1 text-[10px] opacity-60">— {formatDate(d.createdAt)}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
