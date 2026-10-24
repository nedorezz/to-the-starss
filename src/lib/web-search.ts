import ZAI from 'z-ai-web-dev-sdk';
import { getAiConfig } from './ai-config';

/**
 * Веб-поиск для внешнего API z.ai.
 *
 * SDK из коробки зовёт {baseUrl}/functions/invoke — это внутренний путь
 * шлюза песочницы, у публичного API z.ai его нет (404). Поэтому:
 *  1) основной путь — официальный Web Search API: POST {baseUrl}/web_search
 *     (движок search-prime, см. docs.z.ai → Tools → Web Search);
 *  2) fallback — gateway-функция "web_search" через SDK (работает в песочнице).
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

/** Поиск через официальный Web Search API (search-prime). */
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

/** Поиск через gateway-функцию песочницы (старый путь, работает на платформе). */
async function gatewaySearch(query: string, num: number, recency: Recency): Promise<SearchHit[]> {
  const zai = await ZAI.create();
  const raw = (await zai.functions.invoke('web_search', {
    query,
    num,
    recency_days: RECENCY_DAYS[recency],
  })) as unknown;
  return Array.isArray(raw) ? (raw as SearchHit[]) : [];
}

/**
 * Веб-поиск: сначала официальный API, при 404 (шлюз без /web_search) — fallback.
 * Ошибки авторизации/баланса пробрасываются наверх с телом ответа (для логов).
 */
export async function webSearch(query: string, num = 8, recency: Recency = 'oneYear'): Promise<SearchHit[]> {
  const cfg = getAiConfig();
  if (!cfg) return [];

  try {
    return await primeSearch(cfg, query, num, recency);
  } catch (e) {
    const status = (e as Error & { status?: number }).status;
    if (status === 404) return gatewaySearch(query, num, recency); // песочница
    throw e;
  }
}
