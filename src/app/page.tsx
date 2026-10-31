'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useTheme } from 'next-themes';
import { Compass, MessageSquareText, Star, Sun, Moon, Hourglass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FeedTab } from '@/components/feed-tab';
import { ChatTab } from '@/components/chat-tab';
import { FavoritesTab, type FavoriteItem } from '@/components/favorites-tab';
import { CapsuleTab } from '@/components/capsule-tab';
import { Starfield } from '@/components/starfield';
import { DreamStars } from '@/components/dream-stars';
import { SkyMoon } from '@/components/moon';
import { useToast } from '@/hooks/use-toast';
import type { Category, ChatMessage, DiscoverResponse, Opportunity } from '@/lib/types';

type Tab = 'feed' | 'chat' | 'favorites' | 'capsule';

const TABS: { id: Tab; label: string; icon: typeof Compass }[] = [
  { id: 'feed', label: 'Лента', icon: Compass },
  { id: 'chat', label: 'Чат', icon: MessageSquareText },
  { id: 'capsule', label: 'Капсула', icon: Hourglass },
  { id: 'favorites', label: 'Избранное', icon: Star },
];

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Переключить тему"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="h-9 w-9 rounded-xl border-line text-ink-soft hover:bg-surface hover:text-ink"
    >
      <Sun className="hidden h-4 w-4 dark:block" />
      <Moon className="h-4 w-4 dark:hidden" />
    </Button>
  );
}

export default function Home() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('feed');
  const [sessionId, setSessionId] = useState<string>('');

  // Открытие по прямой ссылке с вкладкой: /?tab=capsule (после Google OAuth и из шапки)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'chat' || t === 'favorites' || t === 'capsule') setTab(t);
  }, []);

  // Лента
  const [discover, setDiscover] = useState<DiscoverResponse | null>(null);
  const [loadingDiscover, setLoadingDiscover] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [customQuery, setCustomQuery] = useState<string | undefined>(undefined);
  const requestSeq = useRef(0);

  // Чат
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);

  // Избранное
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const savedUrls = useRef(new Set<string>());
  const [savedTick, setSavedTick] = useState(0);

  // Инициализация sessionId
  useEffect(() => {
    let sid = localStorage.getItem('tts_session');
    if (!sid) {
      sid = uuidv4();
      localStorage.setItem('tts_session', sid);
    }
    setSessionId(sid);
  }, []);

  const loadFavorites = useCallback(async (sid: string) => {
    if (!sid) return;
    setLoadingFavorites(true);
    try {
      const res = await fetch(`/api/favorites?sessionId=${encodeURIComponent(sid)}`);
      const json = await res.json();
      if (Array.isArray(json.favorites)) {
        setFavorites(json.favorites);
        savedUrls.current = new Set(json.favorites.map((f: FavoriteItem) => f.url));
        setSavedTick((t) => t + 1);
      }
    } catch {
      // тихо игнорируем — избранное загрузится при следующем открытии
    } finally {
      setLoadingFavorites(false);
    }
  }, []);

  useEffect(() => {
    if (sessionId) loadFavorites(sessionId);
  }, [sessionId, loadFavorites]);

  const runDiscover = useCallback(
    async (category: Category | null, query?: string) => {
      const seq = ++requestSeq.current;
      setLoadingDiscover(true);
      setDiscoverError(null);
      setActiveCategory(category);
      setCustomQuery(query);
      try {
        const res = await fetch('/api/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: category || 'other', query }),
        });
        if (!res.ok) throw new Error('bad response');
        const json = (await res.json()) as DiscoverResponse;
        if (seq !== requestSeq.current) return;
        setDiscover(json);
      } catch {
        if (seq === requestSeq.current) {
          setDiscoverError('Не удалось выполнить поиск. Проверь соединение и попробуй ещё раз.');
        }
      } finally {
        if (seq === requestSeq.current) setLoadingDiscover(false);
      }
    },
    [],
  );

  // Автозагрузка ленты при открытии сайта: контент виден сразу,
  // а повторные клики по категориям попадают в серверный кэш (мгновенно)
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    runDiscover('hackathon');
  }, [runDiscover]);

  const handleSelectCategory = (c: Category) => {
    // без блокировки: повторный клик перекрывает прошлый запрос (requestSeq отбрасывает старый ответ)
    runDiscover(c);
  };

  const handleCustomSearch = (q: string) => {
    if (!q.trim()) return;
    runDiscover(null, q);
  };

  const handleRefresh = () => {
    runDiscover(activeCategory, customQuery);
  };

  const removeFavorite = async (id: string) => {
    if (!sessionId) return;
    const fav = favorites.find((f) => f.id === id);
    try {
      await fetch(
        `/api/favorites?id=${encodeURIComponent(id)}&sessionId=${encodeURIComponent(sessionId)}`,
        { method: 'DELETE' },
      );
      if (fav) savedUrls.current.delete(fav.url);
      setFavorites((prev) => prev.filter((f) => f.id !== id));
      setSavedTick((t) => t + 1);
      toast({ title: 'Удалено' });
    } catch {
      toast({ title: 'Ошибка', description: 'Не удалось удалить', variant: 'destructive' });
    }
  };

  const handleSave = async (item: Opportunity) => {
    if (!sessionId) return;
    const already = savedUrls.current.has(item.url);
    if (already) {
      const fav = favorites.find((f) => f.url === item.url);
      if (!fav) return;
      await removeFavorite(fav.id);
      return;
    }
    try {
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, ...item }),
      });
      const json = await res.json();
      if (json.favorite) {
        setFavorites((prev) => [json.favorite, ...prev]);
        savedUrls.current.add(item.url);
        setSavedTick((t) => t + 1);
        toast({ title: 'Сохранено в избранное ⭐' });
      } else {
        toast({ title: 'Уже в избранном' });
      }
    } catch {
      toast({ title: 'Ошибка', description: 'Не удалось сохранить', variant: 'destructive' });
    }
  };

  const handleChatSend = async (text: string) => {
    if (streaming) return;
    const userMsg: ChatMessage = { role: 'user', content: text };
    const nextMessages = [...messages, userMsg];
    setMessages([...nextMessages, { role: 'assistant', content: '' }]);
    setStreaming(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });
      if (!res.ok || !res.body) throw new Error('bad response');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages([...nextMessages, { role: 'assistant', content: acc }]);
      }
      if (!acc.trim()) {
        setMessages([
          ...nextMessages,
          {
            role: 'assistant',
            content: 'Не удалось получить ответ. Попробуй перформулировать вопрос.',
          },
        ]);
      }
    } catch {
      setMessages([
        ...nextMessages,
        {
          role: 'assistant',
          content: 'Произошла ошибка соединения. Попробуй отправить сообщение ещё раз.',
        },
      ]);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div data-saved-tick={savedTick} className="relative flex min-h-screen flex-col bg-surface text-ink">
      {/* Фоновая анимация: звёздное небо + мечты-звёзды + луна */}
      <Starfield />
      <DreamStars />
      <SkyMoon />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            onClick={() => setTab('feed')}
            className="flex items-center gap-3 text-left"
            aria-label="To the stars — на главную"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 shadow-md ring-2 ring-sky-300/40">
              <img src="/logo.svg" alt="Логотип To the stars" className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight tracking-tight text-ink sm:text-lg">
                To the stars
              </h1>
              <p className="hidden text-[11px] text-ink-faint sm:block">
                хакатоны · розыгрыши · портфолио
              </p>
            </div>
          </button>

          <div className="flex items-center gap-2">
            <nav aria-label="Основная навигация">
              <div className="flex items-center gap-1 rounded-xl border border-line bg-panel p-1">
                {TABS.map((t) => {
                  const Icon = t.icon;
                  const active = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3.5 sm:text-sm ${
                        active
                          ? 'bg-ink text-surface'
                          : 'text-ink-soft hover:text-ink'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{t.label}</span>
                      {t.id === 'favorites' && favorites.length > 0 && (
                        <span className="ml-0.5 rounded-full bg-amber-400 px-1.5 text-[10px] font-semibold text-amber-950">
                          {favorites.length}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </nav>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {tab === 'feed' && (
          <FeedTab
            data={discover}
            loading={loadingDiscover}
            error={discoverError}
            activeCategory={activeCategory}
            savedUrls={savedUrls.current}
            onSelectCategory={handleSelectCategory}
            onCustomSearch={handleCustomSearch}
            onRefresh={handleRefresh}
            onSave={handleSave}
          />
        )}
        {tab === 'chat' && (
          <ChatTab messages={messages} streaming={streaming} onSend={handleChatSend} />
        )}
        {tab === 'favorites' && (
          <FavoritesTab favorites={favorites} loading={loadingFavorites} onRemove={removeFavorite} />
        )}
        {tab === 'capsule' && <CapsuleTab />}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-line py-4">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-1 px-4 text-xs text-ink-faint sm:flex-row sm:px-6">
          <p>To the stars © 2026</p>
          <p>
            сделал{' '}
            <span className="font-semibold text-sky-600 dark:text-sky-300">dorezz</span> ✦
          </p>
        </div>
      </footer>
    </div>
  );
}
