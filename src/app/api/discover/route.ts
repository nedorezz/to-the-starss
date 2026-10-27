import { NextRequest, NextResponse } from 'next/server';
import { domainToUnicode } from 'url';
import ZAI from 'z-ai-web-dev-sdk';
import { ensureAiConfig, resolveAiModel } from '@/lib/ai-config';
import { webSearch, looksLikeHackathonQuery, type SearchHit, type Recency } from '@/lib/web-search';
import type { Opportunity, Category } from '@/lib/types';

export const maxDuration = 60;

/* Кэш готовых ответов на 60 минут: повторный тот же запрос — мгновенный, ИИ не дёргается */
const RESP_TTL = 60 * 60 * 1000;
const g = globalThis as unknown as { __ttsDiscoverCache?: Map<string, { at: number; payload: unknown }> };
const respCache: Map<string, { at: number; payload: unknown }> = (g.__ttsDiscoverCache ??= new Map());

function prettyHost(host: string): string {
  if (!host) return '';
  try {
    return domainToUnicode(host.replace(/^www\./, '')) || host;
  } catch {
    return host;
  }
}

const CATEGORY_QUERIES: Record<'hackathon' | 'giveaway' | 'portfolio', string[]> = {
  hackathon: [
    'ближайшие хакатоны 2026 регистрация открыта',
    'хакатоны онлайн для разработчиков список',
    'hackathon 2026 upcoming registration',
  ],
  giveaway: [
    'розыгрыш призов для айтишников разработчиков',
    'конкурс с призами техника гаджеты раздача',
    'giveaway tech prizes developers 2026',
  ],
  portfolio: [
    'конкурсы для разработчиков укрепить портфолио',
    'стажировки и олимпиады для программистов портфолио',
    'открытые API пет-проекты идеи портфолио разработчика',
  ],
};

function buildSystemPrompt(today: string): string {
  return `Ты — ИИ приложения To the stars, который помогает находить реальные возможности для айтишников и студентов: хакатоны, розыгрыши призов, конкурсы, стажировки и способы усилить портфолио.

Сегодняшняя дата: ${today}.

Тебе даны сырые результаты веб-поиска. Извлеки из них ВСЕ конкретные возможности (мероприятия, конкурсы, розыгрыши, программы), которые реально полезны. Отфильтруй нерелевантное и устаревшее.

Верни СТРОГО валидный JSON без markdown-обёрток в формате:
{
  "summary": "1-2 предложения на русском: что нашлось и на что обратить внимание",
  "items": [
    {
      "title": "название возможности",
      "description": "2-3 предложения на русском: суть, кто может участвовать, почему стоит",
      "url": "точная ссылка из результатов поиска",
      "source": "домен сайта",
      "deadline": "дедлайн/даты проведения или 'Уточнить на сайте'",
      "prize": "призовой фонд/призы или пустая строка",
      "format": "онлайн / оффлайн+город / гибрид",
      "level": "для новичков / для опытных / для всех",
      "category": "hackathon | giveaway | portfolio | other"
    }
  ]
}

Правила:
- Только ссылки, реально присутствующие в результатах поиска. Не выдумывай URL.
- 3-5 самых качественных items. Если в выдаче мало конкретики — верни меньше.
- description — одно ёмкое предложение, без воды.
- Пиши по-русски, кроме имён собственных и названий.
- deadline указывай как в источнике (например «до 15 ноября 2026»).
- category выбирай по смыслу: хакатон/соревнование по коду = hackathon, розыгрыш/раздача призов = giveaway, конкурс/стажировка/идея для пет-проекта = portfolio.`;
}

function buildUserPrompt(category: Category, customQuery: string | undefined, raw: string): string {
  const catName =
    category === 'hackathon'
      ? 'хакатоны и соревнования по программированию'
      : category === 'giveaway'
        ? 'розыгрыши и раздачи призов для айтишников'
        : category === 'portfolio'
          ? 'конкурсы, стажировки и проекты для усиления портфолио разработчика'
          : 'возможности по запросу пользователя';
  return `Категория поиска: ${catName}
Пользовательский запрос: ${customQuery || 'стандартный подбор по категории'}

Результаты веб-поиска (JSON):
${raw}

Извлеки возможности и верни строго JSON по формату из инструкции.`;
}

function extractJson(text: string): { summary: string; items: Opportunity[] } | null {
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const body = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch {
    // JSON мог быть обрезан лимитом токенов — собираем из целых items
    const lastBrace = body.lastIndexOf('}');
    if (lastBrace <= 0) return null;
    let assembled = body.slice(0, lastBrace + 1).replace(/,\s*$/, '');
    if (/"items"\s*:\s*\[/.test(assembled) && !/\]\s*\}\s*$/.test(assembled)) assembled += ']}' ;
    try {
      return JSON.parse(assembled);
    } catch {
      return null;
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const category: Category = (body.category || 'hackathon') as Category;
    const customQuery: string | undefined = body.query?.trim() || undefined;

    // мгновенный ответ из кэша, если этот же запрос искали недавно
    const respKey = `${category}|${customQuery || ''}`;
    const cachedResp = respCache.get(respKey);
    if (cachedResp && Date.now() - cachedResp.at < RESP_TTL) {
      return NextResponse.json(cachedResp.payload as Record<string, unknown>);
    }

    if (!ensureAiConfig()) {
      return NextResponse.json(
        {
          items: [],
          summary:
            'ИИ-поиск не подключён: на сервере нет API-ключа z-ai. Добавь переменную ZAI_CONFIG_JSON в настройках хостинга (см. README), и поиск оживёт.',
          updatedAt: new Date().toISOString(),
        },
        { status: 200 },
      );
    }
    const zai = await ZAI.create();

    // 1. Веб-поиск: все запросы ПАРАЛЛЕЛЬНО (быстрее в 2-3 раза)
    let queries: string[];
    if (customQuery) {
      queries = [customQuery, `${customQuery} 2026 регистрация дедлайн`];
    } else if (category === 'hackathon' || category === 'giveaway' || category === 'portfolio') {
      queries = CATEGORY_QUERIES[category].slice(0, 2);
    } else {
      queries = ['актуальные айти события конкурсы хакатоны'];
    }

    const recency: Recency = category === 'giveaway' ? 'oneMonth' : 'oneYear';

    async function searchWithRetry(q: string, attempt = 1): Promise<SearchHit[]> {
      try {
        const hackathonMode = category === 'hackathon' || looksLikeHackathonQuery(q);
        return await webSearch(q, 6, recency, { hackathon: hackathonMode });
      } catch (e) {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 800));
          return searchWithRetry(q, attempt + 1);
        }
        console.error(`[discover] search failed for "${q}":`, e);
        return [];
      }
    }

    // Promise.all вместо цикла: оба запроса летят одновременно
    const searchResults: SearchHit[][] = await Promise.all(queries.map((q) => searchWithRetry(q)));

    const seen = new Set<string>();
    const hits: SearchHit[] = [];
    for (const list of searchResults) {
      for (const hit of Array.isArray(list) ? (list as SearchHit[]) : []) {
        const url = hit.url || '';
        if (!url || !hit.name || seen.has(url)) continue;
        seen.add(url);
        hits.push(hit);
      }
    }

    if (hits.length === 0) {
      return NextResponse.json({
        items: [],
        summary: 'Поиск не дал результатов. Попробуйте изменить запрос позже.',
        updatedAt: new Date().toISOString(),
      });
    }

    const aiModel = resolveAiModel();

    // 2. ИИ структурирует результаты в карточки (с ретраем — api.z.ai иногда моргает 502)
    const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    const raw = JSON.stringify(
      hits.map((h) => ({
        title: h.name,
        snippet: (h.snippet || '').slice(0, 220),
        url: h.url,
        host: h.host_name,
        date: h.date,
      })),
    );

    const messages: { role: 'assistant' | 'user'; content: string }[] = [
      { role: 'assistant', content: buildSystemPrompt(today) },
      { role: 'user', content: buildUserPrompt(category, customQuery, raw) },
    ];

    let text = '';
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const completion = await zai.chat.completions.create({
          ...(aiModel ? { model: aiModel } : {}),
          messages,
          thinking: { type: 'disabled' },
          temperature: 0.3,
          max_tokens: 2000,
        });
        text = completion.choices[0]?.message?.content || '';
        if (extractJson(text)) break; // распарсилось — хватит
      } catch (e) {
        console.error(`[discover] llm attempt ${attempt} failed:`, (e as Error).message);
      }
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1200));
    }

    const parsed = extractJson(text);

    if (!parsed || !Array.isArray(parsed.items)) {
      return NextResponse.json({
        items: [],
        summary: 'Не удалось структурировать результаты. Попробуйте ещё раз.',
        updatedAt: new Date().toISOString(),
      });
    }

    const items: Opportunity[] = parsed.items
      .filter((it) => it && it.title && it.url)
      .slice(0, 6)
      .map((it) => ({
        title: String(it.title).slice(0, 200),
        description: String(it.description || '').slice(0, 600),
        url: String(it.url),
        source: prettyHost(String(it.source || '')),
        deadline: it.deadline ? String(it.deadline).slice(0, 80) : undefined,
        prize: it.prize ? String(it.prize).slice(0, 120) : undefined,
        format: it.format ? String(it.format).slice(0, 60) : undefined,
        level: it.level ? String(it.level).slice(0, 40) : undefined,
        category: (['hackathon', 'giveaway', 'portfolio', 'other'].includes(it.category)
          ? it.category
          : category) as Category,
      }));

    const successPayload = {
      items,
      summary: String(parsed.summary || ''),
      updatedAt: new Date().toISOString(),
    };
    if (items.length > 0) {
      if (respCache.size > 100) respCache.clear();
      respCache.set(respKey, { at: Date.now(), payload: successPayload });
    }
    return NextResponse.json(successPayload);
  } catch (error) {
    console.error('[discover] error:', error);
    // мягкая деградация: 200 с понятным текстом вместо страшной ошибки соединения
    return NextResponse.json(
      {
        items: [],
        summary: 'ИИ-сервис перегружен. Попробуй ещё раз через минуту — обычно помогает.',
        updatedAt: new Date().toISOString(),
      },
      { status: 200 },
    );
  }
}
