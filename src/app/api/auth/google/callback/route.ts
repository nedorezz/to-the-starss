import { NextRequest, NextResponse } from 'next/server';
import { db, ensureSchema } from '@/lib/db';
import {
  googleOAuthConfigured,
  siteOrigin,
  signSession,
  sessionCookieOptions,
  SESSION_COOKIE,
  OAUTH_STATE_COOKIE,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

function fail(req: NextRequest, code: string): NextResponse {
  return NextResponse.redirect(`${siteOrigin(req)}/?tab=capsule&auth_error=${code}`);
}

export async function GET(req: NextRequest) {
  try {
    if (!googleOAuthConfigured()) return fail(req, 'google');

    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const cookieState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;

    if (!code || !state || !cookieState || state !== cookieState) {
      return fail(req, 'state');
    }

    // Обмен кода на токен
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: `${siteOrigin(req)}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!tokenRes.ok) return fail(req, 'token');
    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) return fail(req, 'token');

    // Профиль пользователя
    const profRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!profRes.ok) return fail(req, 'profile');
    const profile = (await profRes.json()) as { id?: string; email?: string; name?: string };
    if (!profile.email) return fail(req, 'profile');

    await ensureSchema();
    const email = profile.email.toLowerCase();
    let user = await db.user.findUnique({ where: { email } });
    if (!user) {
      user = await db.user.create({
        data: { email, name: profile.name?.slice(0, 60) || null, provider: 'google' },
      });
    }

    const res = NextResponse.redirect(`${siteOrigin(req)}/?tab=capsule`);
    res.cookies.set(
      SESSION_COOKIE,
      signSession({
        uid: user.id,
        email: user.email,
        name: user.name || undefined,
        provider: 'google',
      }),
      sessionCookieOptions(),
    );
    res.cookies.set(OAUTH_STATE_COOKIE, '', sessionCookieOptions(0));
    return res;
  } catch (error) {
    console.error('[auth/google/callback] error:', error);
    return fail(req, 'unknown');
  }
}
