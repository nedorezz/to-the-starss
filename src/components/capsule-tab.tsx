'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Hourglass,
  Lock,
  LogOut,
  MailCheck,
  Trash2,
  Chrome,
  LoaderCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import type { AuthUser, CapsuleInfo } from '@/lib/types';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Завтрашняя дата в формате YYYY-MM-DD (локальная). */
function tomorrowLocal(): string {
  const d = new Date(Date.now() + 86400000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function prettyDate(ymd: string): string {
  try {
    return new Date(`${ymd}T00:00:00`).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return ymd;
  }
}

function daysLeft(ymd: string, now: number): number {
  const target = new Date(`${ymd}T00:00:00`).getTime();
  if (Number.isNaN(target)) return 0;
  return Math.max(0, Math.ceil((target - now) / 86400000));
}

/**
 * Капсула времени: записка себе из будущего.
 * Чтобы записку мог открыть только автор — нужен аккаунт
 * (вход через Google, если он настроен, или e-mail + пароль).
 */
export function CapsuleTab() {
  const { toast } = useToast();

  // Auth
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // Capsules
  const [capsules, setCapsules] = useState<CapsuleInfo[]>([]);
  const [loadingCaps, setLoadingCaps] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [deliverAt, setDeliverAt] = useState('');
  const [sealing, setSealing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Тик каждые 30 секунд — отсчёт «через N дней» всегда свежий
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const loadCapsules = useCallback(async () => {
    setLoadingCaps(true);
    try {
      const res = await fetch('/api/capsule', { cache: 'no-store' });
      const json = await res.json();
      if (Array.isArray(json.capsules)) setCapsules(json.capsules);
    } catch {
      // подхватим при следующем открытии
    } finally {
      setLoadingCaps(false);
    }
  }, []);

  useEffect(() => {
    // ошибка возврата с Google OAuth
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth_error')) {
      setAuthError(
        'Вход через Google пока не настроен на сервере (нужны GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET — инструкция в README). Пока пользуйся входом по e-mail.',
      );
      window.history.replaceState(null, '', window.location.pathname);
    }
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        const json = await res.json();
        if (json.user) {
          setUser(json.user);
          loadCapsules();
        }
      } catch {
        // считаем, что не вошли
      } finally {
        setAuthLoading(false);
      }
    })();
  }, [loadCapsules]);

  const submitAuth = async () => {
    if (authBusy) return;
    setAuthError(null);
    setAuthBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Что-то пошло не так');
      setUser(json.user);
      setPassword('');
      toast({ title: mode === 'register' ? 'Аккаунт создан ✦' : 'С возвращением!' });
      loadCapsules();
    } catch (e) {
      setAuthError((e as Error).message);
    } finally {
      setAuthBusy(false);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // выходим в любом случае
    }
    setUser(null);
    setCapsules([]);
    toast({ title: 'Вы вышли из аккаунта' });
  };

  const seal = async () => {
    if (sealing) return;
    if (!message.trim() || !deliverAt) return;
    setSealing(true);
    try {
      const res = await fetch('/api/capsule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message: message.trim(), deliverAt }),
      });
      const json = await res.json();
      if (!res.ok || !json.capsule) throw new Error(json.error || 'Не удалось запечатать');
      setCapsules((prev) => [json.capsule, ...prev]);
      setTitle('');
      setMessage('');
      setDeliverAt('');
      toast({ title: 'Капсула запечатана ✉', description: `Откроется ${prettyDate(deliverAt)}` });
    } catch (e) {
      toast({ title: 'Не получилось', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSealing(false);
    }
  };

  const removeCapsule = async (id: string) => {
    if (!window.confirm('Удалить капсулу без открытия? Текст пропадёт навсегда.')) return;
    try {
      const res = await fetch(`/api/capsule?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setCapsules((prev) => prev.filter((c) => c.id !== id));
      toast({ title: 'Капсула удалена' });
    } catch {
      toast({ title: 'Ошибка', description: 'Не удалось удалить', variant: 'destructive' });
    }
  };

  /* ---------------- Не вошёл: карточка входа ---------------- */
  if (authLoading) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-8">
        <Skeleton className="h-8 w-56 border-line bg-line" />
        <Skeleton className="h-48 w-full rounded-2xl border-line bg-line" />
      </div>
    );
  }

  if (!user) {
    return (
      <section className="mx-auto max-w-xl space-y-6 py-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 shadow-lg ring-4 ring-white dark:ring-zinc-900">
            <Hourglass className="h-7 w-7 text-white" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Капсула времени
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-soft">
            Напиши записку себе из будущего и выбери дату, когда она «дойдёт». До этого дня текст
            спрятан наглухо — даже сервер его не покажет. Чтобы капсулы были только твоими, нужен
            аккаунт: войди через Google или по e-mail.
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
          <div className="mb-4 flex rounded-xl border border-line bg-surface p-1 text-sm font-medium">
            {(['register', 'login'] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setAuthError(null);
                }}
                aria-pressed={mode === m}
                className={`flex-1 rounded-lg px-3 py-1.5 transition-colors ${
                  mode === m ? 'bg-ink text-surface' : 'text-ink-soft hover:text-ink'
                }`}
              >
                {m === 'register' ? 'Регистрация' : 'Вход'}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {mode === 'register' && (
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Имя (необязательно)"
                maxLength={60}
                className="rounded-xl border-line bg-surface text-ink placeholder:text-ink-faint"
                aria-label="Имя"
              />
            )}
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="твой@gmail.com"
              autoComplete="email"
              className="rounded-xl border-line bg-surface text-ink placeholder:text-ink-faint"
              aria-label="E-mail"
            />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitAuth()}
              placeholder={mode === 'register' ? 'Придумай пароль (от 6 символов)' : 'Пароль'}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              className="rounded-xl border-line bg-surface text-ink placeholder:text-ink-faint"
              aria-label="Пароль"
            />

            {authError && (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs leading-relaxed text-red-700 dark:text-red-300">
                {authError}
              </p>
            )}

            <Button
              onClick={submitAuth}
              disabled={authBusy || !email.trim() || !password}
              className="w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300"
            >
              {authBusy ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : mode === 'register' ? (
                'Создать аккаунт'
              ) : (
                'Войти'
              )}
            </Button>

            <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-ink-faint">
              <span className="h-px flex-1 bg-line" />
              или
              <span className="h-px flex-1 bg-line" />
            </div>

            <Button
              onClick={() => {
                window.location.href = '/api/auth/google';
              }}
              variant="outline"
              className="w-full rounded-xl border-line bg-surface text-ink hover:bg-surface/70"
            >
              <Chrome className="h-4 w-4 text-sky-500" />
              Войти через Google / Gmail
            </Button>
            <p className="text-center text-[11px] leading-relaxed text-ink-faint">
              Кнопка Google заработает после бесплатной настройки OAuth-клиента — шаги в README
              (раздел «Вход через Google»). Регистрация по e-mail работает сразу.
            </p>
          </div>
        </div>
      </section>
    );
  }

  /* ---------------- Вошёл: форма + список капсул ---------------- */
  const locked = capsules.filter((c) => c.locked);
  const delivered = capsules.filter((c) => !c.locked);

  return (
    <section className="mx-auto max-w-xl space-y-6 py-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">Капсула времени</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Ты вошёл как <span className="font-medium text-ink">{user.email}</span>
          </p>
        </div>
        <Button
          onClick={logout}
          variant="outline"
          size="sm"
          className="rounded-xl border-line text-ink-soft hover:bg-panel hover:text-ink"
        >
          <LogOut className="h-4 w-4" />
          Выйти
        </Button>
      </div>

      {/* Форма запечатывания */}
      <div className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
        <h3 className="mb-4 flex items-center gap-2 font-semibold text-ink">
          <Hourglass className="h-4 w-4 text-sky-500" />
          Запечатать записку
        </h3>
        <div className="space-y-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 80))}
            placeholder="Подпись (необязательно): «мне через год»"
            maxLength={80}
            className="rounded-xl border-line bg-surface text-ink placeholder:text-ink-faint"
            aria-label="Подпись капсулы"
          />
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
            placeholder="Привет, будущий я! Сегодня я…"
            rows={5}
            maxLength={2000}
            className="resize-none rounded-xl border-line bg-surface text-sm text-ink placeholder:text-ink-faint focus-visible:ring-sky-500/40"
            aria-label="Текст записки"
          />
          <div className="flex items-center justify-between text-xs text-ink-faint">
            <span>Записка дойдёт:</span>
            <span>{message.length}/2000</span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              type="date"
              value={deliverAt}
              min={tomorrowLocal()}
              onChange={(e) => setDeliverAt(e.target.value)}
              className="rounded-xl border-line bg-surface text-ink"
              aria-label="Дата доставки"
            />
            <Button
              onClick={seal}
              disabled={!message.trim() || !deliverAt || sealing}
              className="rounded-xl bg-sky-600 text-white hover:bg-sky-500 dark:bg-sky-500 dark:hover:bg-sky-400"
            >
              {sealing ? 'Запечатываю…' : 'Запечатать ✉'}
            </Button>
          </div>
        </div>
      </div>

      {/* Список капсул */}
      {loadingCaps ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl border-line bg-line" />
          ))}
        </div>
      ) : capsules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center">
          <Hourglass className="mx-auto mb-3 h-8 w-8 text-ink-faint" />
          <p className="text-sm text-ink-faint">
            Пока пусто. Запечатай первую записку — себе через месяц или через десять лет.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {locked.length > 0 && (
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              В пути · {locked.length}
            </p>
          )}
          {locked.map((c) => {
            const d = daysLeft(c.deliverAt, now);
            return (
              <article
                key={c.id}
                className="flex items-start gap-3 rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 p-4"
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/20">
                  <Lock className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{c.title || 'Без подписи'}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    Откроется {prettyDate(c.deliverAt)}
                    {d > 0 && <> · через {d} {d === 1 ? 'день' : d < 5 ? 'дня' : 'дней'}</>}
                  </p>
                  <p className="mt-1 text-[11px] text-ink-faint">
                    Текст спрятан до этой даты — даже сервер его не покажет
                  </p>
                </div>
                <button
                  onClick={() => removeCapsule(c.id)}
                  aria-label="Удалить капсулу"
                  className="rounded-lg p-2 text-ink-faint transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </article>
            );
          })}

          {delivered.length > 0 && (
            <p className="pt-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
              Доставлено · {delivered.length}
            </p>
          )}
          {delivered.map((c) => (
            <article
              key={c.id}
              className="flex items-start gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4"
            >
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/20">
                <MailCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{c.title || 'Без подписи'}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-soft">
                  {c.message}
                </p>
                <p className="mt-1 text-[11px] text-ink-faint">
                  Доставлено {prettyDate(c.deliverAt)}
                </p>
              </div>
              <button
                onClick={() => removeCapsule(c.id)}
                aria-label="Удалить капсулу"
                className="rounded-lg p-2 text-ink-faint transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
