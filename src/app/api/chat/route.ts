import { NextRequest } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { ensureAiConfig, resolveAiModel } from '@/lib/ai-config';
import { webSearch } from '@/lib/web-search';

export const maxDuration = 60;

interface IncomingMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `Ты — ИИ приложения To the stars. Если спрашивают, кто ты, представляйся именно так: «ИИ приложения To the stars». Никогда не называй себя GLM, Z.ai или другой моделью. Твоя специализация: ближайшие хакатоны, розыгрыши призов, конкурсы, стажировки и способы усилить портфолио разработчика/студента.

Правила:
- Отвечай ВСЕГДА на русском языке, живо и по делу.
- Сегодняшняя дата передана в системном контексте — учитывай её, говоря «ближайшие».
- Когда даны результаты веб-поиска — опирайся на них, указывай конкретные названия, даты, призы и ССЫЛКИ в markdown-формате [название](url). Не выдумывай ссылки: используй только те, что есть в результатах поиска.
- Если пользователь спрашивает что-то общее (советы по портфолио, как готовиться к хакатону) — давай структурированный полезный ответ: списки, шаги, конкретику.
- Оформляй ответы markdown: заголовки ###, жирный **текст**, списки. Не пиши простыни текста — максимум ~250 слов, если не попросили подробнее.
- В конце ответа, если уместно, предложи 1 короткий follow-up вопрос.`;

// Эвристика вместо LLM-планирования: экономит 1-3 секунды на каждом сообщении.
// Ищем свежак только когда в сообщении есть «свежие» ключевые слова.
const FRESH_HINT_RE =
  /(хакатон|конкурс|олимпиад|челлендж|challenge|hackathon|розыгры|гив|giveaway|стажир|ваканси|дедлайн|срок|когда|приз|подар|раздач|найди|ищу|где|каки[ей]|актуальн|свеж|новост|ближайш|сейчас|сегодня|цена|купить|2025|2026|2027)/i;
const GREETING_RE =
  /^(привет|здравствуй|здорово|хай|хеллоу|hello|hi|ок(?:ей)?|спасибо|благодарю|пока|как дела|что ты умеешь|кто ты|кто тебя сделал|помощь|help)[\s!.,?]*$/i;

function needsFreshSearch(text: string): boolean {
  const t = text.trim();
  if (t.length < 9 || GREETING_RE.test(t)) return false;
  return FRESH_HINT_RE.test(t);
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
    const aiModel = resolveAiModel();

    // Шаг 1: нужен ли веб-поиск — решает мгновенная эвристика (без лишнего вызова ИИ)
    let searchContext = '';
    if (lastUser && needsFreshSearch(lastUser.content)) {
      try {
        const hits = await webSearch(lastUser.content.slice(0, 200), 6, 'oneMonth');
        const list = (Array.isArray(hits) ? hits : []).filter((h) => h.url && h.name).slice(0, 6);
        if (list.length > 0) {
          const formatted = list
            .map((h) => `- ${h.name} | ${h.url} | ${h.host_name || ''} | ${h.snippet || ''}`.slice(0, 400))
            .join('\n');
          searchContext = `\n\nРезультаты веб-поиска по запросу «${lastUser.content.slice(0, 120)}»:\n${formatted}`;
        }
      } catch (e) {
        console.error('[chat] web search failed:', e);
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

    // стрим с ретраем: api.z.ai иногда отдаёт 502/сбой соединения на первом запросе
    let stream: unknown;
    let lastLlmError: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        stream = await zai.chat.completions.create({
          ...(aiModel ? { model: aiModel } : {}),
          messages: chatMessages,
          thinking: { type: 'disabled' },
          temperature: 0.6,
          stream: true,
        });
        break;
      } catch (e) {
        lastLlmError = e;
        console.error(`[chat] llm attempt ${attempt} failed:`, (e as Error).message);
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1200));
      }
    }

    // обе попытки упали ДО начала стрима — отвечаем понятным текстом вместо «ошибки соединения»
    if (!stream) {
      console.error('[chat] llm both attempts failed:', lastLlmError);
      return new Response('ИИ-сервис перегружен. Попробуй отправить сообщение ещё раз через минуту.', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
      });
    }

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
