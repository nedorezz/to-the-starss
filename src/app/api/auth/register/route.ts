import { NextRequest, NextResponse } from 'next/server';
import { db, ensureSchema } from '@/lib/db';
import { hashPassword, signSession, sessionCookieOptions, SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    const name = String(body?.name || '').trim().slice(0, 60) || null;

    if (!EMAIL_RE.test(email) || email.length > 120) {
      return NextResponse.json(
        { error: 'Введи корректный e-mail (например, ivan@gmail.com)' },
        { status: 400 },
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Пароль должен быть минимум 6 символов' },
        { status: 400 },
      );
    }

    await ensureSchema();

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: 'Такой e-mail уже зарегистрирован — попробуй войти' },
        { status: 409 },
      );
    }

    const user = await db.user.create({
      data: { email, name, passwordHash: hashPassword(password), provider: 'local' },
    });

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
    console.error('[auth/register] error:', error);
    return NextResponse.json(
      { error: 'Не удалось создать аккаунт. Попробуй ещё раз.' },
      { status: 500 },
    );
  }
}
