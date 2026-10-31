import { NextRequest, NextResponse } from 'next/server';
import { db, ensureSchema } from '@/lib/db';

export const dynamic = 'force-dynamic';

const ALLOWED_COLORS = ['green', 'yellow', 'red'];
const MAX_PER_PERSON = 3;
const MAX_TOTAL = 300;

/** GET — все звёзды-мечты (публичное небо сайта). */
export async function GET() {
  try {
    await ensureSchema();
    const total = await db.dreamStar.count();
    // держим небо лёгким: если мечт стало очень много — показываем последние
    const rows = await db.dreamStar.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(200, MAX_TOTAL),
    });
    return NextResponse.json({
      dreams: rows.map((d) => ({
        id: d.id,
        text: d.text,
        color: d.color,
        x: d.x,
        y: d.y,
        createdAt: d.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[dreams GET] error:', error);
    return NextResponse.json({ dreams: [] });
  }
}

/** POST — зажечь свою звезду-мечту. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const text = String(body?.text || '').trim();
    const color = String(body?.color || '').trim();
    const sessionId = String(body?.sessionId || '').trim();

    if (text.length < 2) {
      return NextResponse.json({ error: 'Опиши мечту хоть парой слов' }, { status: 400 });
    }
    if (text.length > 200) {
      return NextResponse.json({ error: 'Максимум 200 символов' }, { status: 400 });
    }
    if (!ALLOWED_COLORS.includes(color)) {
      return NextResponse.json({ error: 'Выбери цвет звезды' }, { status: 400 });
    }
    if (sessionId.length < 8 || sessionId.length > 64) {
      return NextResponse.json({ error: 'Некорректная сессия — обнови страницу' }, { status: 400 });
    }

    await ensureSchema();

    const mine = await db.dreamStar.count({ where: { sessionId } });
    if (mine >= MAX_PER_PERSON) {
      return NextResponse.json(
        { error: `Максимум ${MAX_PER_PERSON} звезды с одного браузера — место в небе дороже` },
        { status: 429 },
      );
    }

    // позиция: избегаем самой верхушки (хедер) и самых низов
    const star = await db.dreamStar.create({
      data: {
        sessionId,
        text,
        color,
        x: Math.round((3 + Math.random() * 92) * 10) / 10,
        y: Math.round((9 + Math.random() * 62) * 10) / 10,
      },
    });

    return NextResponse.json({
      dream: {
        id: star.id,
        text: star.text,
        color: star.color,
        x: star.x,
        y: star.y,
        createdAt: star.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[dreams POST] error:', error);
    return NextResponse.json({ error: 'Не удалось зажечь звезду' }, { status: 500 });
  }
}

/** DELETE — убрать свою звезду (id + sessionId из query). */
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id') || '';
    const sessionId = req.nextUrl.searchParams.get('sessionId') || '';
    if (!id || !sessionId) {
      return NextResponse.json({ error: 'Не указана звезда' }, { status: 400 });
    }
    await ensureSchema();
    const deleted = await db.dreamStar.deleteMany({ where: { id, sessionId } });
    if (deleted.count === 0) {
      return NextResponse.json({ error: 'Звезда не найдена' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[dreams DELETE] error:', error);
    return NextResponse.json({ error: 'Не удалось удалить звезду' }, { status: 500 });
  }
}
