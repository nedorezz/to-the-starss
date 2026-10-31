import crypto from 'crypto';

/**
 * Минималистичная аутентификация «To the stars» без внешних зависимостей.
 *
 * - Пароли: scrypt (node:crypto) с индивидуальной солью.
 * - Сессия: подписанная HMAC-SHA256 cookie tts_auth (HttpOnly, 30 дней).
 * - Google OAuth: включается переменными GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET
 *   (инструкция в README). Без них работает вход по e-mail.
 */

const SECRET = process.env.AUTH_SECRET || 'to-the-stars-dev-secret-change-me';
export const SESSION_COOKIE = 'tts_auth';
export const OAUTH_STATE_COOKIE = 'tts_oauth_state';
const SESSION_TTL_S = 60 * 60 * 24 * 30; // 30 дней

export interface SessionUser {
  uid: string;
  email: string;
  name?: string;
  provider?: string;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  try {
    const calc = crypto.scryptSync(password, salt, 64);
    const orig = Buffer.from(hash, 'hex');
    return calc.length === orig.length && crypto.timingSafeEqual(calc, orig);
  } catch {
    return false;
  }
}

export function signSession(user: SessionUser): string {
  const payload = b64url(
    Buffer.from(JSON.stringify({ ...user, exp: Date.now() + SESSION_TTL_S * 1000 })),
  );
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(payload).digest());
  return `${payload}.${sig}`;
}

export function readSessionToken(token: string | undefined | null): SessionUser | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  try {
    const calc = crypto.createHmac('sha256', SECRET).update(payload).digest();
    const orig = Buffer.from(sig, 'base64url');
    if (calc.length !== orig.length || !crypto.timingSafeEqual(calc, orig)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid?: string;
      email?: string;
      name?: string;
      provider?: string;
      exp?: number;
    };
    if (!data.uid || !data.email || typeof data.exp !== 'number' || Date.now() > data.exp) {
      return null;
    }
    return { uid: data.uid, email: data.email, name: data.name, provider: data.provider };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAge = SESSION_TTL_S) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // в dev-режике песочницы без Secure — иначе cookie не сохранится на http;
    // на Vercel (production) включаем Secure
    secure: process.env.NODE_ENV === 'production' && !!process.env.VERCEL,
    path: '/',
    maxAge,
  };
}

/** Достаёт пользователя сессии из запроса (или null, если не вошёл). */
export function getSessionUser(req: Request): SessionUser | null {
  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;
  return readSessionToken(decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)));
}

export function googleOAuthConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Строит URL Google OAuth consent screen. */
export function buildGoogleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Публичный адрес сайта (учитывает прокси Vercel). */
export function siteOrigin(req: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) return envUrl.replace(/\/+$/, '');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') || (process.env.VERCEL ? 'https' : 'http');
  return `${proto}://${host}`;
}
