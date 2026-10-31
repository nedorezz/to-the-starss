import { NextRequest, NextResponse } from 'next/server';
import { db, ensureSchema } from '@/lib/db';
import { verifyPassword, signSession, sessionCookieOptions, SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');

    if (!email || !password) {
      return NextResponse.json({ error: 'Введи e-mail и пароль' }, { status: 400 });
    }

    await ensureSchema();

    const user = await db.user.findUnique({ where: { email } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: 'Неверный e-mail или пароль' }, { status: 401 });
    }

    const res = NextResponse.json({
      user: { email: user.email, name: user.name, provider: user.provider },
    });
    res.cookies.set(
      SESSION_COOKIE,
      signSession({ uid: user.id, email: user.email, name: user.name || undefined }),
      sessionCookieOptions(),
    );
    return res;
  } catch (error) {
    console.error('[auth/login] error:', error);
    return NextResponse.json({ error: 'Не удалось войти. Попробуй ещё раз.' }, { status: 500 });
  }
}
