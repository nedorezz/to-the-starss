import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Конфиг ИИ для z-ai-web-dev-sdk.
 *
 * SDK читает конфиг ТОЛЬКО из файла .z-ai-config (env-переменные не поддерживает),
 * поэтому на серверless-хостингах (Vercel и т.п.) ключ передаётся переменной
 * окружения ZAI_CONFIG_JSON = {"baseUrl":"https://...","apiKey":"..."},
 * а ensureAiConfig() записывает её в /tmp/.z-ai-config перед первым запросом.
 */

const CONFIG_FILENAME = '.z-ai-config';

export type AiConfig = { baseUrl: string; apiKey: string };

/** Модель по умолчанию для внешнего API z.ai (бесплатная GLM-4.5-Flash). */
const DEFAULT_MODEL = 'glm-4.5-flash';

/**
 * Какую модель передавать в chat.completions.create.
 * - AI_MODEL из env имеет приоритет (см. README);
 * - на Vercel/внешнем API модель обязательна — подставляем бесплатную по умолчанию;
 * - в песочнице платформа сама знает модель по умолчанию — не мешаем.
 */
export function resolveAiModel(): string | undefined {
  if (process.env.AI_MODEL && process.env.AI_MODEL.trim()) return process.env.AI_MODEL.trim();
  if (process.env.VERCEL) return DEFAULT_MODEL;
  return undefined;
}

function readConfigFile(p: string): AiConfig | null {
  try {
    if (!fs.existsSync(p)) return null;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (typeof raw?.apiKey === 'string' && raw.apiKey.length > 0) {
      return { baseUrl: String(raw.baseUrl || ''), apiKey: raw.apiKey };
    }
    return null;
  } catch {
    return null;
  }
}

function candidatePaths(): string[] {
  const home = process.env.HOME || os.homedir();
  return [
    path.join(process.cwd(), CONFIG_FILENAME),
    path.join(home, CONFIG_FILENAME),
    path.join('/etc', CONFIG_FILENAME),
  ];
}

/** Проверяет, есть ли на сервере валидный конфиг ИИ. */
export function hasAiConfig(): boolean {
  if (candidatePaths().some((p) => readConfigFile(p) !== null)) return true;
  return parseEnvConfig() !== null;
}

function parseEnvConfig(): AiConfig | null {
  const raw = process.env.ZAI_CONFIG_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.apiKey === 'string' && parsed.apiKey.length > 0) {
      return { baseUrl: String(parsed.baseUrl || ''), apiKey: parsed.apiKey };
    }
  } catch {
    // невалидный JSON — считаем, что конфига нет
  }
  return null;
}

/** Возвращает конфиг ИИ (из файла или env), ничего не создавая. */
export function getAiConfig(): AiConfig | null {
  for (const p of candidatePaths()) {
    const fromFile = readConfigFile(p);
    if (fromFile) return fromFile;
  }
  return parseEnvConfig();
}

/**
 * Готовит конфиг ИИ: если задана ZAI_CONFIG_JSON — пишет её в файл,
 * который прочитает SDK. Возвращает true, если конфиг есть и ИИ доступен.
 */
export function ensureAiConfig(): boolean {
  if (candidatePaths().some((p) => readConfigFile(p) !== null)) return true;

  const cfg = parseEnvConfig();
  if (!cfg) return false;

  try {
    // SDK ищет конфиг в homedir пользователя — переносим HOME в /tmp,
    // чтобы гарантированно иметь права на запись (Vercel/lambda)
    const tmpHome = '/tmp';
    process.env.HOME = tmpHome;
    fs.writeFileSync(
      path.join(tmpHome, CONFIG_FILENAME),
      JSON.stringify({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey }),
      { mode: 0o600 },
    );
    return true;
  } catch (error) {
    console.error('[ai-config] failed to write config:', error);
    return false;
  }
}
