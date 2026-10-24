'use client';

import { motion } from 'framer-motion';
import { Star, Trash2, ExternalLink, CalendarClock, Gift, Bot, Rocket, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CATEGORY_META } from '@/components/opportunity-card';

export interface FavoriteItem {
  id: string;
  title: string;
  category: string;
  url: string;
  source?: string | null;
  deadline?: string | null;
  prize?: string | null;
  summary?: string | null;
}

const FALLBACK_ICONS: Record<string, typeof Bot> = {
  hackathon: Bot,
  giveaway: Gift,
  portfolio: Rocket,
  other: Sparkles,
};

interface Props {
  favorites: FavoriteItem[];
  loading: boolean;
  onRemove: (id: string) => void;
}

export function FavoritesTab({ favorites, loading, onRemove }: Props) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl border border-line bg-panel" />
        ))}
      </div>
    );
  }

  if (favorites.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-line px-6 py-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 -rotate-6 items-center justify-center rounded-2xl bg-amber-400 shadow-md ring-4 ring-white dark:ring-zinc-900">
          <Star className="h-7 w-7 text-amber-950" />
        </div>
        <h2 className="mb-2 text-lg font-semibold text-ink">Пока пусто</h2>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-ink-soft">
          Нажимай на звёздочку в карточках — сохранённое появится здесь, чтобы ты не
          пропустил дедлайн.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {favorites.map((f, i) => {
        const meta = CATEGORY_META[f.category] || CATEGORY_META.other;
        const Icon = FALLBACK_ICONS[f.category] || Sparkles;
        return (
          <motion.article
            key={f.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(i * 0.05, 0.3) }}
            className="flex flex-col rounded-2xl border border-line bg-panel p-5"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <Badge
                variant="outline"
                className={`gap-1.5 rounded-full border px-2.5 font-medium ${meta.chip}`}
              >
                <Icon className="h-3 w-3" />
                {meta.label}
              </Badge>
              {f.source && <span className="truncate text-xs text-ink-faint">{f.source}</span>}
            </div>

            <h3 className="mb-2 line-clamp-2 font-semibold leading-snug text-ink">{f.title}</h3>
            {f.summary && (
              <p className="mb-3 line-clamp-2 flex-1 text-sm leading-relaxed text-ink-soft">
                {f.summary}
              </p>
            )}

            {(f.deadline || f.prize) && (
              <div className="mb-3 space-y-1 text-xs text-ink-soft">
                {f.deadline && (
                  <div className="flex items-center gap-2">
                    <CalendarClock className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
                    {f.deadline}
                  </div>
                )}
                {f.prize && (
                  <div className="flex items-center gap-2">
                    <Gift className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
                    {f.prize}
                  </div>
                )}
              </div>
            )}

            <div className="mt-auto flex items-center gap-2">
              <Button
                asChild
                size="sm"
                variant="outline"
                className="flex-1 rounded-xl border-line text-ink hover:bg-surface"
              >
                <a href={f.url} target="_blank" rel="noopener noreferrer">
                  Открыть
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </a>
              </Button>
              <Button
                size="sm"
                variant="outline"
                aria-label="Удалить из избранного"
                onClick={() => onRemove(f.id)}
                className="rounded-xl border-line px-3 text-ink-soft hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </motion.article>
        );
      })}
    </div>
  );
}
