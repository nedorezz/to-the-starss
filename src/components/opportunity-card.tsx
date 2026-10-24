'use client';

import { motion } from 'framer-motion';
import {
  CalendarClock,
  ExternalLink,
  Gift,
  Globe,
  BarChart3,
  Star,
  Bot,
  Rocket,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Opportunity } from '@/lib/types';

interface CategoryStyle {
  label: string;
  icon: typeof Bot;
  /** стикер-иконка: цвет фона + цвет значка (light / dark) */
  sticker: string;
  iconColor: string;
  /** чип в карточке */
  chip: string;
}

export const CATEGORY_META: Record<string, CategoryStyle> = {
  hackathon: {
    label: 'Хакатон',
    icon: Bot,
    sticker: 'bg-emerald-500 dark:bg-emerald-400 ring-emerald-600/20 dark:ring-black/40',
    iconColor: 'text-white dark:text-emerald-950',
    chip: 'border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  giveaway: {
    label: 'Розыгрыш',
    icon: Gift,
    sticker:
      'bg-gradient-to-br from-red-500 via-orange-500 to-amber-400 ring-orange-600/20 dark:ring-black/40',
    iconColor: 'text-white',
    chip: 'border-orange-600/30 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  },
  portfolio: {
    label: 'Портфолио',
    icon: Rocket,
    sticker: 'bg-violet-500 dark:bg-violet-400 ring-violet-600/20 dark:ring-black/40',
    iconColor: 'text-white dark:text-violet-950',
    chip: 'border-violet-600/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  },
  other: {
    label: 'Возможность',
    icon: Sparkles,
    sticker: 'bg-zinc-400 dark:bg-zinc-600 ring-zinc-500/20 dark:ring-black/40',
    iconColor: 'text-white dark:text-zinc-100',
    chip: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
  },
};

interface Props {
  item: Opportunity;
  saved: boolean;
  onSave: (item: Opportunity) => void;
  index?: number;
}

export function OpportunityCard({ item, saved, onSave, index = 0 }: Props) {
  const meta = CATEGORY_META[item.category] || CATEGORY_META.other;
  const Icon = meta.icon;

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.06, 0.4) }}
      className="group relative flex h-full flex-col rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-ink-faint/60"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <Badge
          variant="outline"
          className={`gap-1.5 rounded-full border px-2.5 font-medium ${meta.chip}`}
        >
          <Icon className="h-3 w-3" />
          {meta.label}
        </Badge>
        {item.source && (
          <span className="truncate text-xs text-ink-faint" title={item.source}>
            {item.source}
          </span>
        )}
      </div>

      <h3 className="mb-2 line-clamp-2 text-base font-semibold leading-snug text-ink">
        {item.title}
      </h3>

      <p className="mb-4 line-clamp-3 flex-1 text-sm leading-relaxed text-ink-soft">
        {item.description}
      </p>

      <div className="mb-4 space-y-1.5">
        {item.deadline && (
          <div className="flex items-center gap-2 text-xs text-ink-soft">
            <CalendarClock className="h-3.5 w-3.5 shrink-0 text-red-500 dark:text-red-400" />
            <span className="truncate">
              <span className="text-ink-faint">Дедлайн:</span> {item.deadline}
            </span>
          </div>
        )}
        {item.prize && (
          <div className="flex items-center gap-2 text-xs text-ink-soft">
            <Gift className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400" />
            <span className="truncate">
              <span className="text-ink-faint">Призы:</span> {item.prize}
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
          {item.format && (
            <span className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
              {item.format}
            </span>
          )}
          {item.level && (
            <span className="flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              {item.level}
            </span>
          )}
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2">
        <Button
          asChild
          size="sm"
          className="flex-1 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300"
        >
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            Открыть
            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </a>
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-label={saved ? 'Убрать из избранного' : 'Сохранить в избранное'}
          className="rounded-xl border-line px-3 text-ink-soft hover:bg-panel hover:text-ink"
          onClick={() => onSave(item)}
        >
          <Star className={`h-4 w-4 ${saved ? 'fill-amber-400 text-amber-500' : ''}`} />
        </Button>
      </div>
    </motion.article>
  );
}
