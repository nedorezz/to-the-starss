import { NextRequest } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { ensureAiConfig } from '@/lib/ai-config';

export const maxDuration = 120;

interface IncomingMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SearchHit {
  url?: string;
  name?: string;
  snippet?: string;
  host_name?: string;
  date?: string;
}

const SYSTEM_PROMPT = `Ты — ИИ приложения To the stars. Если спрашивают, кто ты, представляйся именно так: «ИИ приложения To the stars». Никогда не называй себя GLM, Z.ai или другой моделью. Твоя специализация: ближайшие хакатоны, розыгрыши призов, конкурсы, стажировки и способы усилить портфолио разработчика/студента.

Правила:
- Отвечай ВСЕГДА на русском языке, живо и по делу.
- Сегодняшняя дата передана в системном контексте — учитывай её, говоря «ближайшие».
- Когда даны результаты веб-поиска — опирайся на них, указывай конкретные названия, даты, призы и ССЫЛКИ в markdown-формате [название](url). Не выдумывай ссылки: используй только те, что есть в результатах поиска.
- Если пользователь спрашивает что-то общее (советы по портфолио, как готовиться к хакатону) — давай структурированный полезный ответ: списки, шаги, конкретику.
- Оформляй ответы markdown: заголовки ###, жирный **текст**, списки. Не пиши простыни текста — максимум ~250 слов, если не попросили подробнее.
- В конце ответа, если уместно, предложи 1 короткий follow-up вопрос.`;

function planSearchPrompt(userMessage: string, today: string): string {
  return `Сегодня: ${today}. Сообщение пользователя: "${userMessage}"

Нужно ли искать актуальную информацию в интернете (дедлайны, актуальные события, призы, ссылки)?
Если ДА — сформулируй ОДНУ оптимальную поисковую строку на русском или английском (что именно искать, чтобы найти свежие возможности для пользователя).
Если НЕТ (общий вопрос, совет, объяснение) — верни пустую строку.

Верни СТРОГО JSON без обёрток: {"needSearch": true|false, "query": "строка поиска или пустая"}`;
}

function extractJson<T>(text: string): T | null {
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = (await req.json()) as { messages: IncomingMessage[] };
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages required' }), { status: 400 });
    }

    if (!ensureAiConfig()) {
      const msg =
        'ИИ-чат пока не подключён: на сервере нет API-ключа z-ai. Добавь переменную ZAI_CONFIG_JSON в настройках хостинга (см. README), и чат оживёт.';
      return new Response(msg, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    const zai = await ZAI.create();
    const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');

    // Шаг 1: планирование поиска (нужен ли веб-поиск и какой запрос)
    let searchContext = '';
    if (lastUser) {
      try {
        const planRaw = await zai.chat.completions.create({
          messages: [{ role: 'user', content: planSearchPrompt(lastUser.content.slice(0, 500), today) }],
          thinking: { type: 'disabled' },
          temperature: 0,
        });
        const plan = extractJson<{ needSearch: boolean; query: string }>(
          planRaw.choices[0]?.message?.content || '',
        );
        if (plan?.needSearch && plan.query?.trim()) {
          const hits = (await zai.functions.invoke('web_search', {
            query: plan.query.trim().slice(0, 200),
            num: 6,
            recency_days: 60,
          })) as unknown as SearchHit[];
          const list = Array.isArray(hits) ? hits : [];
          if (list.length > 0) {
            const formatted = list
              .filter((h) => h.url && h.name)
              .map((h) => `- ${h.name} | ${h.url} | ${h.host_name || ''} | ${h.snippet || ''}`.slice(0, 400))
              .join('\n');
            searchContext = `\n\nРезультаты веб-поиска по запросу «${plan.query}»:\n${formatted}`;
          }
        }
      } catch (e) {
        console.error('[chat] search planning failed:', e);
      }
    }

    // Шаг 2: стриминговый ответ
    const trimmed = messages.slice(-10);
    const lastIdx = trimmed.length - 1;
    const chatMessages = [
      { role: 'assistant' as const, content: `${SYSTEM_PROMPT}\n\nСегодняшняя дата: ${today}.` },
      ...trimmed.map((m, i) =>
        i === lastIdx && searchContext
          ? { role: m.role, content: `${m.content}\n\n[Актуальные результаты веб-поиска для ответа]:${searchContext}` }
          : { role: m.role, content: m.content },
      ),
    ];

    const stream = await zai.chat.completions.create({
      messages: chatMessages,
      thinking: { type: 'disabled' },
      temperature: 0.6,
      stream: true,
    });

    // SDK при stream:true возвращает сырой ReadableStream с SSE-строками `data: {...}`
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const readable = new ReadableStream({
      async start(controller) {
        const reader = (stream as unknown as ReadableStream<Uint8Array>).getReader();
        let buffer = '';
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const payload = trimmed.slice(5).trim();
              if (!payload || payload === '[DONE]') continue;
              try {
                const json = JSON.parse(payload);
                const delta =
                  json?.choices?.[0]?.delta?.content ??
                  json?.choices?.[0]?.message?.content ??
                  '';
                if (delta) controller.enqueue(encoder.encode(String(delta)));
              } catch {
                // неполный/некорректный JSON-чанк — пропускаем
              }
            }
          }
          // хвост буфера
          const tail = buffer.trim();
          if (tail.startsWith('data:')) {
            const payload = tail.slice(5).trim();
            if (payload && payload !== '[DONE]') {
              try {
                const json = JSON.parse(payload);
                const delta =
                  json?.choices?.[0]?.delta?.content ??
                  json?.choices?.[0]?.message?.content ??
                  '';
                if (delta) controller.enqueue(encoder.encode(String(delta)));
              } catch {
                // ignore
              }
            }
          }
        } catch (e) {
          console.error('[chat] stream error:', e);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[chat] error:', error);
    return new Response(JSON.stringify({ error: 'chat failed' }), { status: 500 });
  }
}
