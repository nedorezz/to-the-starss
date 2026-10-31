import { NextRequest, NextResponse } from 'next/server';
import {
  buildGoogleAuthUrl,
  googleOAuthConfigured,
  siteOrigin,
  OAUTH_STATE_COOKIE,
  sessionCookieOptions,
} from '@/lib/auth';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!googleOAuthConfigured()) {
    // Google-вход не настроен — возвращаемся с подсказкой (капсула покажет инструкцию)
    return NextResponse.redirect(`${siteOrigin(req)}/?tab=capsule&auth_error=google`);
  }
  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = `${siteOrigin(req)}/api/auth/google/callback`;
  const res = NextResponse.redirect(buildGoogleAuthUrl(redirectUri, state));
  res.cookies.set(OAUTH_STATE_COOKIE, state, sessionCookieOptions(600));
  return res;
}
