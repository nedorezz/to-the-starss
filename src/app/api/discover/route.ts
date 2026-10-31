import { NextRequest, NextResponse } from 'next/server';
import { domainToUnicode } from 'url';
import { webSearch, looksLikeHackathonQuery, devpostSearch, type SearchHit } from '@/lib/web-search';
import type { Opportunity, Category } from '@/lib/types';

export const maxDuration = 30;

/*
 * Подборка возможностей — БЫСТРАЯ и без ИИ-шага.
 *
 * Раньше здесь ИИ переписывал карточки, и каждый клик по категории занимал
 * 20-40 секунд (выглядело как «кнопка не работает»). Теперь карточки
 * собираются напрямую из бесплатных источников (Devpost, Google News,
 * Bing News, DuckDuckGo, Hacker News) за 3-8 секунд, а повторные клики
 * отвечаются мгновенно из кэша. Живой ИИ остался в чате (/api/chat).
 */

/* Кэш готовых ответов: повторный тот же запрос — мгновенный */
const RESP_TTL = 30 * 60 * 1000;
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
    'ближайшие хакатоны регистрация открыта',
    'хакатон 2026 онлайн для разработчиков',
    'upcoming hackathon registration open',
  ],
  giveaway: [
    'розыгрыш призов для айтишников разработчиков',
    'конкурс с призами техника гаджеты',
    'giveaway tech prizes developers',
  ],
  portfolio: [
    'конкурсы для разработчиков укрепить портфолио',
    'стажировки для программистов подача открыта',
    'студенческие олимпиады и конкурсы программирование',
  ],
};

/** Ключевые слова релевантности: отсеиваем новости, не про тему категории. */
const CATEGORY_FILTER: Record<'hackathon' | 'giveaway' | 'portfolio', RegExp> = {
  hackathon: /(хакатон|hackathon|гейм\s?джем|game\s?jam|джем|ctf|соревнован|чемпионат|олимпиад)/i,
  giveaway: /(розыгрыш|разыгрыва|giveaway|раздач|приз|подарк|конкурс)/i,
  portfolio: /(конкурс|стажировк|олимпиад|портфолио|стипенди|интенсив|хакатон|hackathon|проект|программ|internship|intern)/i,
};

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function summaryFor(category: Category, count: number, custom: boolean): string {
  const v = pluralRu(count, 'вариант', 'варианта', 'вариантов');
  if (custom) {
    return `Нашёл ${count} ${v} по твоему запросу — даты и условия смотри на карточках и сайтах организаторов.`;
  }
  if (category === 'hackathon') {
    return `Собрал ${count} актуальных ${pluralRu(count, 'хакатон', 'хакатона', 'хакатонов')} с открытой регистрацией — сроки, направления и призовой фонд прямо на карточках. Успей подать заявку!`;
  }
  if (category === 'giveaway') {
    return `Свежие розыгрыши и конкурсы с призами для айтишников — ${count} ${v}. Проверяй условия на страницах организаторов и удачи!`;
  }
  if (category === 'portfolio') {
    return `Конкурсы, стажировки и поводы прокачать портфолио — ${count} ${v}. Выбирай, что ближе, и подавайся.`;
  }
  return `Вот что нашлось: ${count} ${v}. Даты и условия уточняй на сайтах организаторов.`;
}

/** Карточка из сырого результата поиска (без ИИ): заголовок + сниппет. */
function hitToOpportunity(h: SearchHit, category: Category): Opportunity {
  const snippet = (h.snippet || '').replace(/\s+/g, ' ').trim();
  return {
    title: (h.name || 'Без названия').slice(0, 200),
    description: (snippet || 'Подробности, условия участия и дедлайны — на странице организатора.').slice(0, 600),
    url: h.url || '',
    source: prettyHost(h.host_name || ''),
    category,
  };
}

function dedupeHits(lists: SearchHit[][]): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const list of lists) {
    for (const hit of Array.isArray(list) ? list : []) {
      const url = (hit.url || '').replace(/\/$/, '');
      if (!url || !hit.name || seen.has(url)) continue;
      seen.add(url);
      out.push(hit);
    }
  }
  return out;
}

function buildItems(hits: SearchHit[], category: Category, structuredFirst = true): Opportunity[] {
  // 1) Структурные карточки Devpost (даты, призовой фонд, темы) — наверх
  const structured: Opportunity[] = [];
  const plain: SearchHit[] = [];
  for (const h of hits) {
    if (h.meta && h.url) {
      const m = h.meta;
      const bits: string[] = [];
      if (m.dates) bits.push(`Проведение: ${m.dates}`);
      if (m.prize) bits.push(`призовой фонд ${m.prize}`);
      if (m.themes) bits.push(`направления: ${m.themes}`);
      if (m.members) bits.push(`уже участвуют: ${m.members}`);
      const where = m.location && m.location.toLowerCase() !== 'online' ? ` (${m.location})` : '';
      structured.push({
        title: (h.name || 'Хакатон на Devpost').slice(0, 200),
        description:
          bits.length > 0
            ? `Регистрация открыта${where}. ${bits.join(', ')}.`
            : 'Регистрация открыта — детали, требования и состав команды на странице хакатона.',
        url: h.url,
        source: 'devpost.com',
        deadline: m.dates || 'Уточнить на сайте',
        prize: m.prize || '',
        format: where ? 'оффлайн+город' : 'онлайн',
        level: 'для всех',
        category: 'hackathon',
      });
    } else {
      plain.push(h);
    }
  }

  // 2) Остальное — фильтруем по ключевым словам категории
  const filter = CATEGORY_FILTER[category as 'hackathon' | 'giveaway' | 'portfolio'];
  let filtered = filter
    ? plain.filter((h) => filter.test(`${h.name || ''} ${h.snippet || ''}`))
    : plain;
  if (filtered.length < 2 && plain.length > 0) {
    // слишком строгий фильтр — показываем хотя бы первые попавшиеся
    filtered = plain;
  }

  const mapped = filtered.map((h) => hitToOpportunity(h, category)).filter((it) => it.url);
  const seen = new Set<string>();
  const ordered = structuredFirst ? [...structured, ...mapped] : [...mapped, ...structured];
  return ordered
    .filter((it) => {
      if (!it.url || seen.has(it.url)) return false;
      seen.add(it.url);
      return true;
    })
    .slice(0, 6);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const category: Category = (body.category || 'hackathon') as Category;
    const customQuery: string | undefined = body.query?.trim() || undefined;

    // мгновенный ответ из кэша, если этот же запрос искали недавно
    const respKey = `${category}|${customQuery || ''}`;
    const cachedResp = respCache.get(respKey);
    if (cachedResp && Date.now() - cachedResp.at < RESP_TTL) {
      return NextResponse.json(cachedResp.payload as Record<string, unknown>);
    }

    // Запросы категории летят ПАРАЛЛЕЛЬНО, общий потолок ~6-8 секунд на источники.
    const queries: string[] = customQuery
      ? [customQuery, `${customQuery} регистрация дедлайн`]
      : (CATEGORY_QUERIES[category] || CATEGORY_QUERIES.hackathon).slice(0, 2);

    const recency = category === 'giveaway' ? 'oneMonth' : 'oneYear';
    const wantHackathon = category === 'hackathon' || looksLikeHackathonQuery(customQuery || '');

    const jobs: Promise<SearchHit[]>[] = queries.map((q) =>
      // для кастомного запроса порог выше, чем отдаёт один источник (6),
      // чтобы тематические новости успели поучаствовать в выдаче
      webSearch(q, 6, recency, { hackathon: wantHackathon, minEnough: customQuery ? 8 : 4 }),
    );
    // Для хакатонов добавляем Devpost отдельной гонкой — его структурные карточки (даты/призы) лучше всех
    if (wantHackathon) jobs.push(devpostSearch(6).catch(() => []));

    const searchResults = await Promise.all(jobs.map((p) => p.catch(() => [] as SearchHit[])));
    const hits = dedupeHits(searchResults);
    // при кастомном запросе сначала тематические результаты, потом общий список Devpost
    const items = buildItems(hits, category, !customQuery);

    if (items.length === 0) {
      const emptyPayload = {
        items: [],
        summary: 'Сейчас ничего не нашлось — источники могли подтормозить. Нажми «Обновить» или попробуй ещё раз через минуту.',
        updatedAt: new Date().toISOString(),
      };
      respCache.set(respKey, { at: Date.now(), payload: emptyPayload });
      return NextResponse.json(emptyPayload);
    }

    const payload = {
      items,
      summary: summaryFor(category, items.length, Boolean(customQuery)),
      updatedAt: new Date().toISOString(),
    };
    if (respCache.size > 100) respCache.clear();
    respCache.set(respKey, { at: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (error) {
    console.error('[discover] error:', error);
    // мягкая деградация: 200 с понятным текстом вместо страшной ошибки соединения
    return NextResponse.json(
      {
        items: [],
        summary: 'Поиск подтормозил. Нажми «Обновить» — обычно второй заход отвечает мгновенно.',
        updatedAt: new Date().toISOString(),
      },
      { status: 200 },
    );
  }
}
