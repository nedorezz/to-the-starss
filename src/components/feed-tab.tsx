'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Gift, Rocket, Search, RefreshCw, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { OpportunityCard } from '@/components/opportunity-card';
import type { Category, DiscoverResponse, Opportunity } from '@/lib/types';

interface Props {
  data: DiscoverResponse | null;
  loading: boolean;
  error: string | null;
  activeCategory: Category | null;
  savedUrls: Set<string>;
  onSelectCategory: (c: Category) => void;
  onCustomSearch: (q: string) => void;
  onRefresh: () => void;
  onSave: (item: Opportunity) => void;
}

const CATEGORY_CARDS = [
  {
    id: 'hackathon' as Category,
    title: 'Хакатоны',
    desc: 'Соревнования по коду, призовой фонд, команда и офферы',
    icon: Bot,
    sticker: 'bg-emerald-500 dark:bg-emerald-400 ring-emerald-600/20 dark:ring-black/50',
    iconColor: 'text-white dark:text-emerald-950',
    activeRing: 'ring-2 ring-emerald-500/60 dark:ring-emerald-400/50',
    rotate: '-rotate-3',
  },
  {
    id: 'giveaway' as Category,
    title: 'Розыгрыши',
    desc: 'Призовые конкурсы, техника, подписки и промокоды',
    icon: Gift,
    sticker:
      'bg-gradient-to-br from-red-500 via-orange-500 to-amber-400 ring-orange-600/20 dark:ring-black/50',
    iconColor: 'text-white',
    activeRing: 'ring-2 ring-orange-500/60',
    rotate: 'rotate-2',
  },
  {
    id: 'portfolio' as Category,
    title: 'Портфолио',
    desc: 'Конкурсы, стажировки и проекты, чтобы прокачаться',
    icon: Rocket,
    sticker: 'bg-violet-500 dark:bg-violet-400 ring-violet-600/20 dark:ring-black/50',
    iconColor: 'text-white dark:text-violet-950',
    activeRing: 'ring-2 ring-violet-500/60 dark:ring-violet-400/50',
    rotate: '-rotate-2',
  },
];

export function FeedTab({
  data,
  loading,
  error,
  activeCategory,
  savedUrls,
  onSelectCategory,
  onCustomSearch,
  onRefresh,
  onSave,
}: Props) {
  const [query, setQuery] = useState('');

  const submitSearch = () => {
    const q = query.trim();
    if (q) onCustomSearch(q);
  };

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="px-2 pb-2 pt-8 text-center sm:pt-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl font-black tracking-tight text-ink sm:text-6xl">
            To the stars
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-sm leading-relaxed text-ink-soft sm:text-base">
            Ближайшие хакатоны, розыгрыши и поводы усилить портфолио — собираем всё
            интересное в одном месте, пока об этом ещё не написали в чатах.
          </p>
          <div className="mt-5 flex items-center justify-center gap-1.5 text-amber-500 dark:text-amber-300">
            <Star className="h-3.5 w-3.5 fill-current" />
            <Star className="h-4 w-4 fill-current" />
            <Star className="h-3.5 w-3.5 fill-current" />
          </div>
        </motion.div>
      </section>

      {/* Category cards */}
      <section aria-label="Категории возможностей">
        <div className="grid gap-4 sm:grid-cols-3">
          {CATEGORY_CARDS.map((c) => {
            const Icon = c.icon;
            const active = activeCategory === c.id;
            return (
              <button
                key={c.id}
                onClick={() => onSelectCategory(c.id)}
                disabled={loading}
                className={`relative overflow-hidden rounded-2xl border p-5 text-left transition-all disabled:opacity-60 ${
                  active
                    ? `border-transparent bg-panel ${c.activeRing}`
                    : 'border-line bg-panel hover:border-ink-faint/50'
                }`}
              >
                <div
                  className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ring-4 ring-white shadow-md dark:ring-zinc-900 ${c.sticker} ${c.rotate}`}
                >
                  <Icon className={`h-6 w-6 ${c.iconColor}`} />
                </div>
                <h3 className="mb-1 font-semibold text-ink">{c.title}</h3>
                <p className="text-xs leading-relaxed text-ink-soft">{c.desc}</p>
                {active && (
                  <span className="absolute right-4 top-4 flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Custom search */}
      <section aria-label="Умный поиск">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
              placeholder="Свой запрос: «хакатоны по нейросетям», «розыгрыш видеокарты», «стажировка фронтенд»…"
              className="rounded-xl border-line bg-panel pl-9 text-sm text-ink placeholder:text-ink-faint focus-visible:ring-emerald-500/40"
              aria-label="Поисковый запрос"
            />
          </div>
          <Button
            onClick={submitSearch}
            disabled={loading || !query.trim()}
            className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300"
          >
            {loading ? 'Ищу…' : 'Найти'}
          </Button>
          {data && !loading && (
            <Button
              onClick={onRefresh}
              variant="outline"
              aria-label="Обновить результаты"
              className="rounded-xl border-line text-ink-soft hover:bg-panel hover:text-ink"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </section>

      {/* Results */}
      <section aria-label="Результаты" aria-live="polite">
        {loading && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-panel p-4">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              <p className="text-sm text-ink-soft">
                Собираю свежие варианты… обычно это 20–60 секунд
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-line bg-panel p-5">
                  <Skeleton className="mb-3 h-5 w-24 border-line bg-line" />
                  <Skeleton className="mb-2 h-5 w-3/4 border-line bg-line" />
                  <Skeleton className="mb-4 h-4 w-full border-line bg-line" />
                  <Skeleton className="mb-4 h-4 w-2/3 border-line bg-line" />
                  <Skeleton className="h-8 w-full border-line bg-line" />
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-center">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {!loading && !error && !data && (
          <div className="rounded-2xl border border-dashed border-line p-10 text-center">
            <Star className="mx-auto mb-3 h-8 w-8 text-ink-faint" />
            <p className="text-sm text-ink-faint">
              Выбери категорию выше или напиши свой запрос — соберём подборку
            </p>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {data.summary && (
              <div className="mb-4 rounded-2xl border border-line bg-panel p-4">
                <p className="text-sm leading-relaxed text-ink-soft">{data.summary}</p>
              </div>
            )}
            {data.items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line p-10 text-center">
                <p className="text-sm text-ink-faint">
                  Ничего не нашлось. Попробуй другой запрос или загляни позже.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {data.items.map((item, i) => (
                  <OpportunityCard
                    key={`${item.url}-${i}`}
                    item={item}
                    index={i}
                    saved={savedUrls.has(item.url)}
                    onSave={onSave}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
