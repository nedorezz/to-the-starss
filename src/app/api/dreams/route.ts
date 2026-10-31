import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { db, ensureSchema } from '@/lib/db';

export const dynamic = 'force-dynamic';

/*
 * Звёзды-мечты. ВАЖНО: работаем через сырой SQL ($queryRawUnsafe), а не через
 * сгенерированный Prisma-клиент (db.dreamStar). Если на хостинге при сборке
 * использовалась старая prisma/schema.prisma без модели DreamStar, сгенерированный
 * клиент не умеет db.dreamStar и все запросы падали с 500 — из-за этого звёзды
 * «не работали». Сырой SQL не зависит от схемы и чинит это раз и навсегда.
 */

const ALLOWED_COLORS = ['green', 'yellow', 'red'];
const MAX_PER_PERSON = 3;
const MAX_TOTAL = 300;

interface DreamRow {
  id: string;
  text: string;
  color: string;
  x: number;
  y: number;
  createdAt: string | Date;
}

function toDream(r: DreamRow) {
  let createdAt = '';
  try {
    const d = r.createdAt instanceof Date ? r.createdAt : new Date(String(r.createdAt).replace(' ', 'T'));
    createdAt = d.toISOString();
  } catch {
    createdAt = new Date().toISOString();
  }
  return {
    id: String(r.id),
    text: String(r.text),
    color: String(r.color),
    x: Number(r.x),
    y: Number(r.y),
    createdAt,
  };
}

async function countStars(where?: string, ...params: unknown[]): Promise<number> {
  const sql = where
    ? `SELECT COUNT(*) AS c FROM "DreamStar" WHERE ${where}`
    : 'SELECT COUNT(*) AS c FROM "DreamStar"';
  const rows = (await db.$queryRawUnsafe<{ c: number | bigint }[]>(sql, ...params)) as {
    c: number | bigint;
  }[];
  return Number(rows?.[0]?.c ?? 0);
}

/** GET — все звёзды-мечты (публичное небо сайта). */
export async function GET() {
  try {
    await ensureSchema();
    const rows = (await db.$queryRawUnsafe<DreamRow[]>(
      `SELECT "id", "text", "color", "x", "y", "createdAt" FROM "DreamStar" ORDER BY "createdAt" DESC LIMIT 200`,
    )) as DreamRow[];
    return NextResponse.json({ dreams: (rows || []).map(toDream) });
  } catch (error) {
    console.error('[dreams GET] error:', (error as Error)?.message);
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

    const mine = await countStars('"sessionId" = ?', sessionId);
    if (mine >= MAX_PER_PERSON) {
      return NextResponse.json(
        { error: `Максимум ${MAX_PER_PERSON} звезды с одного браузера — место в небе дороже` },
        { status: 429 },
      );
    }

    // позиция: избегаем самой верхушки (хедер) и самых низов
    const id = randomUUID();
    const x = Math.round((3 + Math.random() * 92) * 10) / 10;
    const y = Math.round((9 + Math.random() * 62) * 10) / 10;
    const createdAt = new Date().toISOString();

    await db.$executeRawUnsafe(
      `INSERT INTO "DreamStar" ("id", "sessionId", "text", "color", "x", "y", "createdAt")
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      sessionId,
      text,
      color,
      x,
      y,
      createdAt,
    );

    // держим небо лёгким: если мечт стало совсем много — подчищаем самые старые
    const total = await countStars();
    if (total > MAX_TOTAL) {
      await db.$executeRawUnsafe(
        `DELETE FROM "DreamStar" WHERE "id" NOT IN (
           SELECT "id" FROM "DreamStar" ORDER BY "createdAt" DESC LIMIT ?
         )`,
        MAX_TOTAL,
      );
    }

    return NextResponse.json({ dream: { id, text, color, x, y, createdAt } });
  } catch (error) {
    console.error('[dreams POST] error:', (error as Error)?.message);
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
    const deleted = await db.$executeRawUnsafe(
      `DELETE FROM "DreamStar" WHERE "id" = ? AND "sessionId" = ?`,
      id,
      sessionId,
    );
    if (!deleted) {
      return NextResponse.json({ error: 'Звезда не найдена' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[dreams DELETE] error:', (error as Error)?.message);
    return NextResponse.json({ error: 'Не удалось удалить звезду' }, { status: 500 });
  }
}
