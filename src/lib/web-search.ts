import ZAI from 'z-ai-web-dev-sdk';
import { getAiConfig } from './ai-config';

/**
 * Веб-поиск для сайта.
 *
 * Основной путь — БЕСПЛАТНЫЙ DuckDuckGo (HTML-версия, без API-ключей и оплаты).
 * Запасные пути:
 *  1) gateway-функция "web_search" через SDK — бесплатна в песочнице платформы;
 *  2) официальный Web Search API z.ai ({baseUrl}/web_search, движок search-prime)
 *     — ПЛАТНЫЙ, включается ТОЛЬКО переменной окружения SEARCH_PAID_FALLBACK=1.
 *
 * Результаты кэшируются в памяти на 30 минут — повторные одинаковые запросы
 * выполняются мгновенно и не создают нагрузку на поисковик.
 */

export interface SearchHit {
  url?: string;
  name?: string;
  snippet?: string;
  host_name?: string;
  date?: string;
}

export type Recency = 'oneDay' | 'oneWeek' | 'oneMonth' | 'oneYear' | 'noLimit';

/** Для gateway-функции recency задаётся в днях (старый формат). */
const RECENCY_DAYS: Record<Recency, number> = {
  oneDay: 1,
  oneWeek: 7,
  oneMonth: 30,
  oneYear: 90,
  noLimit: 90,
};

/** Фильтр свежести DuckDuckGo (параметр df). */
const DDG_DF: Partial<Record<Recency, string>> = {
  oneDay: 'd',
  oneWeek: 'w',
  oneMonth: 'm',
  oneYear: 'y',
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const DDG_TIMEOUT = 5000;

/* ------------------------------------------------------------------ */
/* Кэш в памяти процесса (переживает hot-reload через globalThis)      */
/* ------------------------------------------------------------------ */

type CacheEntry = { at: number; hits: SearchHit[] };
const CACHE_TTL = 60 * 60 * 1000; // 1 час для успешных результатов (категории не устают так быстро)
const NEG_TTL = 60 * 1000; // 1 минута для пустых (не штормим поисковик)
const CACHE_MAX = 300;

const g = globalThis as unknown as { __ttsSearchCache?: Map<string, CacheEntry> };
const cache: Map<string, CacheEntry> = (g.__ttsSearchCache ??= new Map());

function cacheKey(query: string, num: number, recency: Recency): string {
  return `${query.toLowerCase().trim()}|${num}|${recency}`;
}

function cacheGet(key: string): SearchHit[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  const ttl = entry.hits.length > 0 ? CACHE_TTL : NEG_TTL;
  if (Date.now() - entry.at > ttl) {
    cache.delete(key);
    return null;
  }
  return entry.hits;
}

function cacheSet(key: string, hits: SearchHit[]): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), hits });
}

/* ------------------------------------------------------------------ */
/* DuckDuckGo (бесплатно, без ключей)                                  */
/* ------------------------------------------------------------------ */

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)));
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ссылки DuckDuckGo приходят в виде редиректа /l/?uddg=<encoded> — разворачиваем. */
function mapDdgUrl(href: string): string {
  let h = href;
  if (h.startsWith('//')) h = `https:${h}`;
  const m = h.match(/[?&]uddg=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      // оставим как есть
    }
  }
  return h;
}

/** Универсальный парсер: все <a> с классом classToken → {title, href}. */
function parseAnchors(html: string, classToken: string): { title: string; href: string }[] {
  const re = new RegExp(`<a\\s[^>]*class=["'][^"']*${classToken}[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>`, 'g');
  const hrefRe = /href=["']([^"']+)["']/i;
  const out: { title: string; href: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const opening = m[0].slice(0, m[0].indexOf('>'));
    const href = opening.match(hrefRe)?.[1] || '';
    const title = stripTags(m[1]);
    if (title && href) out.push({ title, href });
    if (out.length >= 30) break;
  }
  return out;
}

/** Сниппеты: любой тег с классом classToken → текст. */
function parseBlocks(html: string, classToken: string): string[] {
  const re = new RegExp(`<([a-z]+)\\s[^>]*class=["'][^"']*${classToken}[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    out.push(stripTags(m[2]));
    if (out.length >= 30) break;
  }
  return out;
}

function toHits(items: { title: string; href: string }[], snippets: string[], num: number): SearchHit[] {
  const out: SearchHit[] = [];
  for (let i = 0; i < items.length; i++) {
    const url = mapDdgUrl(items[i].href);
    if (!/^https?:\/\//.test(url)) continue;
    let host = '';
    try {
      host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      host = '';
    }
    out.push({ url, name: items[i].title, snippet: snippets[i] || '', host_name: host });
    if (out.length >= num) break;
  }
  return out;
}

async function ddgFetch(params: URLSearchParams): Promise<string> {
  const res = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
      'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.7',
      Referer: 'https://duckduckgo.com/',
    },
    body: params.toString(),
    cache: 'no-store',
    signal: AbortSignal.timeout(DDG_TIMEOUT),
  });
  if (!res.ok) throw new Error(`ddg html ${res.status}`);
  const html = await res.text();
  if (html.length < 500) throw new Error('ddg html: suspiciously short page');
  return html;
}

/** Бесплатный поиск: html-версия DDG → при пустой разметке lite-версия. */
async function ddgSearch(query: string, num: number, recency: Recency): Promise<SearchHit[]> {
  const params = new URLSearchParams({ q: query, kl: 'ru-ru' });
  const df = DDG_DF[recency];
  if (df) params.set('df', df);

  let hits: SearchHit[] = [];
  try {
    const html = await ddgFetch(params);
    hits = toHits(parseAnchors(html, 'result__a'), parseBlocks(html, 'result__snippet'), num);
  } catch (e) {
    console.error('[web-search] ddg html failed:', (e as Error).message);
  }

  if (hits.length === 0) {
    // запасная лайт-версия с другой разметкой
    try {
      const res = await fetch(`https://lite.duckduckgo.com/lite/?${params.toString()}`, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.7' },
        cache: 'no-store',
        signal: AbortSignal.timeout(DDG_TIMEOUT),
      });
      if (res.ok) {
        const html = await res.text();
        hits = toHits(parseAnchors(html, 'result-link'), parseBlocks(html, 'result-snippet'), num);
      }
    } catch (e) {
      console.error('[web-search] ddg lite failed:', (e as Error).message);
    }
  }

  return hits;
}

/* ------------------------------------------------------------------ */
/* Бесплатные новостные RSS: Google News + Bing News                   */
/* (русский контент, свежак, работают из датацентров без ключей)        */
/* ------------------------------------------------------------------ */

/** Фильтр свежести для Google News (оператор when: в запросе). */
const GNEWS_WHEN: Partial<Record<Recency, string>> = {
  oneDay: ' when:1d',
  oneWeek: ' when:7d',
  oneMonth: ' when:30d',
  oneYear: ' when:1y',
};

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

/** Парсер RSS: <item> → SearchHit (общий для Google/Bing News). */
function parseRssItems(xml: string, num: number): SearchHit[] {
  const clean = stripCdata(xml);
  const out: SearchHit[] = [];
  for (const it of clean.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = it[1];
    const title = stripTags(b.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '');
    const link = stripTags(b.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '');
    if (!title || !link || !/^https?:\/\//.test(link)) continue;
    const source = stripTags(b.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || '');
    const date = stripTags(b.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '');
    const desc = stripTags(b.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '');
    out.push({ url: link, name: title, snippet: desc.slice(0, 300), host_name: source, date });
    if (out.length >= num) break;
  }
  return out;
}

/** Google News RSS — бесплатно, без ключа, свежие новости со всего рунета. */
async function gnewsSearch(query: string, num: number, recency: Recency): Promise<SearchHit[]> {
  const when = GNEWS_WHEN[recency] || '';
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query + when)}&hl=ru&gl=RU&ceid=RU:ru`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/rss+xml,application/xml,text/xml' },
    cache: 'no-store',
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(`gnews ${res.status}`);
  return parseRssItems(await res.text(), num);
}

/** Bing News RSS — запасной новостной источник. */
async function bingNewsSearch(query: string, num: number): Promise<SearchHit[]> {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=RSS`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/rss+xml,application/xml,text/xml' },
    cache: 'no-store',
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(`bingnews ${res.status}`);
  return parseRssItems(await res.text(), num);
}

/* ------------------------------------------------------------------ */
/* Бесплатные структурные API: Devpost и Hacker News                   */
/* (работают из датацентров, где поисковики блокируют скрейпинг)        */
/* ------------------------------------------------------------------ */

/** Похоже ли на запрос про хакатоны (включая геймджемы и CTF). */
export function looksLikeHackathonQuery(q: string): boolean {
  return /(хакатон|hackathon|game\s?jam|гейм\s?джем|джем|ctf|олимпиад)/i.test(q);
}

interface DevpostItem {
  title?: string;
  url?: string;
  displayed_location?: { location?: string };
  submission_period_dates?: string;
  themes?: { name?: string }[];
  prize_amount?: string;
  registrations_count?: number;
  organization_name?: string;
}

/** Devpost — публичный API актуальных хакатонов (бесплатно, без ключа). */
async function devpostSearch(num: number): Promise<SearchHit[]> {
  const res = await fetch(`https://devpost.com/api/hackathons?status=upcoming&limit=${Math.max(10, num)}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(`devpost ${res.status}`);
  const data = (await res.json()) as { hackathons?: DevpostItem[] };
  const out: SearchHit[] = [];
  for (const h of data.hackathons || []) {
    if (!h.title || !h.url) continue;
    const bits: string[] = [];
    if (h.displayed_location?.location) bits.push(h.displayed_location.location);
    if (h.submission_period_dates) bits.push(`Даты: ${h.submission_period_dates}`);
    const prize = h.prize_amount ? stripTags(h.prize_amount) : '';
    if (prize) bits.push(`Призовой фонд: ${prize}`);
    const themes = (h.themes || []).map((t) => t.name).filter(Boolean).slice(0, 3);
    if (themes.length) bits.push(`Темы: ${themes.join(', ')}`);
    if (h.registrations_count) bits.push(`Участников: ${h.registrations_count}`);
    out.push({
      url: h.url,
      name: h.title,
      snippet: bits.join(' | '),
      host_name: 'devpost.com',
      date: h.submission_period_dates || '',
    });
    if (out.length >= num) break;
  }
  return out;
}

interface HnHit {
  objectID?: string;
  title?: string;
  url?: string | null;
  points?: number;
  num_comments?: number;
  created_at?: string;
}

/** Hacker News через Algolia API — бесплатно, без ключа, стабилен из датацентров. */
async function hnSearch(query: string, num: number): Promise<SearchHit[]> {
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${Math.max(10, num)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(`hn ${res.status}`);
  const data = (await res.json()) as { hits?: HnHit[] };
  const out: SearchHit[] = [];
  for (const h of data.hits || []) {
    if (!h.title) continue;
    const link = h.url || (h.objectID ? `https://news.ycombinator.com/item?id=${h.objectID}` : '');
    if (!link || !/^https?:\/\//.test(link)) continue;
    let host = '';
    try {
      host = new URL(link).hostname.replace(/^www\./, '');
    } catch {
      host = '';
    }
    const bits: string[] = [];
    if (h.points) bits.push(`${h.points} поинтов на Hacker News`);
    if (h.num_comments) bits.push(`обсуждений: ${h.num_comments}`);
    out.push({ url: link, name: h.title, snippet: bits.join(' | '), host_name: host, date: h.created_at || '' });
    if (out.length >= num) break;
  }
  return out;
}

/** Дождаться бесплатные источники; не ждём медленные, если уже хватит результатов. */
function mergeSources(jobs: Promise<SearchHit[]>[], minEnough: number, hardDeadlineMs = 7500): Promise<SearchHit[]> {
  return new Promise((resolve) => {
    const results: SearchHit[][] = jobs.map(() => []);
    let done = 0;
    let settled = false;
    const merged = () => {
      const seen = new Set<string>();
      const out: SearchHit[] = [];
      for (const list of results) {
        for (const hit of list) {
          const key = (hit.url || '').replace(/\/$/, '');
          if (!hit.url || seen.has(key)) continue;
          seen.add(key);
          out.push(hit);
        }
      }
      return out;
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(merged());
    };
    jobs.forEach((job, i) => {
      job
        .then((hits) => {
          results[i] = Array.isArray(hits) ? hits : [];
          done++;
          if (merged().length >= minEnough || done === jobs.length) finish();
        })
        .catch(() => {
          done++;
          if (done === jobs.length) finish();
        });
    });
    setTimeout(finish, hardDeadlineMs);
  });
}

/* ------------------------------------------------------------------ */
/* Запасные пути: gateway (песочница) и платный API z.ai               */
/* ------------------------------------------------------------------ */

interface PrimeResult {
  title?: string;
  content?: string;
  link?: string;
  media?: string;
  publish_date?: string;
}

function mapPrimeResults(list: PrimeResult[] | undefined): SearchHit[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((r) => r && r.link && r.title)
    .map((r) => ({
      url: r.link,
      name: r.title,
      snippet: r.content,
      host_name: r.media,
      date: r.publish_date,
    }));
}

/** Платный официальный Web Search API z.ai (search-prime). Включается вручную. */
async function primeSearch(cfg: { baseUrl: string; apiKey: string }, query: string, num: number, recency: Recency): Promise<SearchHit[]> {
  const base = cfg.baseUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/web_search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      search_engine: 'search-prime',
      search_query: query,
      count: num,
      search_recency_filter: recency,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`web_search failed ${res.status}: ${body.slice(0, 300)}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }

  const data = (await res.json().catch(() => null)) as { search_result?: PrimeResult[] } | null;
  return mapPrimeResults(data?.search_result);
}

/** Бесплатный gateway-поиск песочницы платформы. */
async function gatewaySearch(query: string, num: number, recency: Recency): Promise<SearchHit[]> {
  const zai = await ZAI.create();
  const raw = (await zai.functions.invoke('web_search', {
    query,
    num,
    recency_days: RECENCY_DAYS[recency],
  })) as unknown;
  return Array.isArray(raw) ? (raw as SearchHit[]) : [];
}

/* ------------------------------------------------------------------ */
/* Публичная функция                                                   */
/* ------------------------------------------------------------------ */

/**
 * Веб-поиск. Порядок (всё бесплатное — вперёд):
 *  1) кэш в памяти (30 мин);
 *  2) параллельная гонка бесплатных источников: Devpost (для хакатонов),
 *     DuckDuckGo, Hacker News — без ключей и оплаты;
 *  3) gateway-функция песочницы (только вне Vercel, если результатов мало) — бесплатно;
 *  4) платный API z.ai — ТОЛЬКО при SEARCH_PAID_FALLBACK=1.
 * Никогда не бросает исключение: при полном фиаско вернёт [].
 */
export async function webSearch(
  query: string,
  num = 8,
  recency: Recency = 'oneYear',
  opts: { hackathon?: boolean } = {},
): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const key = cacheKey(q, num, recency);
  const cached = cacheGet(key);
  if (cached) return cached;

  const wantHackathon = opts.hackathon ?? looksLikeHackathonQuery(q);

  // 2) бесплатная гонка источников (порядок = приоритет при склейке)
  const jobs: Promise<SearchHit[]>[] = [];
  if (wantHackathon) jobs.push(devpostSearch(num));
  jobs.push(gnewsSearch(q, num, recency));
  jobs.push(bingNewsSearch(q, num));
  jobs.push(ddgSearch(q, num, recency));
  jobs.push(hnSearch(q, num));

  let hits: SearchHit[] = [];
  try {
    hits = (await mergeSources(jobs, Math.min(4, num))).slice(0, num);
  } catch {
    hits = [];
  }

  // 3) бесплатный gateway-поиск песочницы (на Vercel этот путь 404 — пропускаем)
  if (hits.length < 3 && !process.env.VERCEL) {
    try {
      const extra = (await gatewaySearch(q, num, recency)).filter(
        (h) => !hits.some((prev) => prev.url === h.url),
      );
      hits = [...hits, ...extra].slice(0, num);
    } catch (e) {
      console.error('[web-search] gateway error:', (e as Error).message);
    }
  }

  // 4) платный z.ai — только по явному флагу (юзер не хочет платить)
  if (hits.length < 3 && process.env.SEARCH_PAID_FALLBACK === '1') {
    const cfg = getAiConfig();
    if (cfg) {
      try {
        const extra = (await primeSearch(cfg, q, num, recency)).filter(
          (h) => !hits.some((prev) => prev.url === h.url),
        );
        hits = [...hits, ...extra].slice(0, num);
      } catch (e) {
        console.error('[web-search] z.ai paid search error:', (e as Error).message);
      }
    }
  }

  cacheSet(key, hits);
  return hits;
}
