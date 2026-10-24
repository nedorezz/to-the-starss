'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, User, Loader2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { ChatMessage } from '@/lib/types';

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
  onSend: (text: string) => void;
}

const QUICK_PROMPTS = [
  'Какие хакатоны стартуют в ближайшие 2 недели?',
  'Найди актуальные розыгрыши призов для айтишников',
  'Что добавить в портфолио джуну-фронтендеру?',
  'Составь план подготовки к первому хакатону',
];

function AssistantAvatar({ size = 'h-8 w-8' }: { size?: string }) {
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-lg bg-zinc-900 ring-1 ring-white/10 ${size}`}>
      <img src="/logo.svg" alt="" className="h-5 w-5" aria-hidden />
    </div>
  );
}

export function ChatTab({ messages, streaming, onSend }: Props) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const isEmpty = messages.length === 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streaming]);

  const send = () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    onSend(text);
  };

  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-[420px] flex-col overflow-hidden rounded-3xl border border-line bg-panel">
      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6" aria-live="polite">
        {isEmpty && (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-900 shadow-lg ring-4 ring-white dark:ring-zinc-900">
                      <img src="/logo.svg" alt="" className="h-10 w-10" aria-hidden />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-ink">
              Привет! Я — ИИ приложения To the stars
            </h2>
            <p className="mb-6 max-w-md text-sm leading-relaxed text-ink-soft">
              Подскажу хакатоны с открытыми дедлайнами, найду розыгрыши призов,
              стажировки и объясню, как прокачать портфолио.
            </p>
            <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => onSend(p)}
                  className="rounded-xl border border-line bg-surface p-3 text-left text-xs leading-relaxed text-ink-soft transition-colors hover:border-emerald-500/40 hover:text-ink"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {m.role === 'user' ? (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink/10" aria-hidden>
                <User className="h-4 w-4 text-ink-soft" />
              </div>
            ) : (
              <AssistantAvatar />
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[75%] ${
                m.role === 'user'
                  ? 'rounded-tr-sm bg-emerald-600/10 text-ink ring-1 ring-emerald-600/20 dark:bg-emerald-400/10 dark:ring-emerald-400/20'
                  : 'rounded-tl-sm border border-line bg-surface text-ink'
              }`}
            >
              {m.role === 'assistant' ? (
                <div className="prose-chat">
                  <ReactMarkdown
                    components={{
                      a: (props) => (
                        <a
                          {...props}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-700 underline underline-offset-2 hover:text-sky-600 dark:text-sky-300 dark:hover:text-sky-200"
                        />
                      ),
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                  {streaming && i === messages.length - 1 && (
                    <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-emerald-500 align-middle dark:bg-emerald-400" />
                  )}
                </div>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}

        {streaming && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex gap-3">
            <AssistantAvatar />
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-line bg-surface px-4 py-3 text-sm text-ink-soft">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600 dark:text-emerald-400" />
              Ищу свежие возможности…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-line p-3 sm:p-4">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Например: «Найди хакатоны с призовым фондом на ноябрь»"
            rows={1}
            className="max-h-32 min-h-[44px] resize-none rounded-xl border-line bg-surface text-sm text-ink placeholder:text-ink-faint focus-visible:ring-emerald-500/40"
            aria-label="Сообщение для ИИ"
          />
          <Button
            onClick={send}
            disabled={streaming || !input.trim()}
            size="icon"
            aria-label="Отправить сообщение"
            className="h-[44px] w-[44px] shrink-0 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300"
          >
            {streaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="mt-2 flex items-center justify-center gap-1 text-center text-[11px] text-ink-faint">
          <Star className="h-3 w-3" />
          проверяй детали на сайте организатора
        </p>
      </div>
    </div>
  );
}
