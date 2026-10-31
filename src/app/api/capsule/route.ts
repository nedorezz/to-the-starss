import { NextRequest, NextResponse } from 'next/server';
import { db, ensureSchema } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface CapsuleDto {
  id: string;
  title: string | null;
  deliverAt: string;
  createdAt: string;
  locked: boolean;
  message?: string;
}

/** Капсула открыта, когда наступила дата доставки (сравнение по календарной дате UTC). */
function isUnlocked(deliverAt: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return deliverAt <= today;
}

/** GET — список МОИХ капсул. Текст запечатанных не отдаётся никогда. */
export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });

  try {
    await ensureSchema();
    const rows = await db.timeCapsule.findMany({
      where: { userId: user.uid },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const capsules: CapsuleDto[] = rows.map((c) => {
      const locked = !isUnlocked(c.deliverAt);
      return {
        id: c.id,
        title: c.title,
        deliverAt: c.deliverAt,
        createdAt: c.createdAt.toISOString(),
        locked,
        ...(locked ? {} : { message: c.message }),
      };
    });
    return NextResponse.json({ capsules });
  } catch (error) {
    console.error('[capsule GET] error:', error);
    return NextResponse.json({ error: 'Не удалось загрузить капсулы' }, { status: 500 });
  }
}

/** POST — запечатать новую капсулу. */
export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });

  try {
    const body = await req.json().catch(() => null);
    const message = String(body?.message || '').trim();
    const title = String(body?.title || '').trim().slice(0, 80) || null;
    const deliverAt = String(body?.deliverAt || '').trim();

    if (message.length < 1) {
      return NextResponse.json({ error: 'Напиши текст записки' }, { status: 400 });
    }
    if (message.length > 2000) {
      return NextResponse.json({ error: 'Максимум 2000 символов' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deliverAt)) {
      return NextResponse.json({ error: 'Выбери дату доставки' }, { status: 400 });
    }
    const today = new Date().toISOString().slice(0, 10);
    if (deliverAt <= today) {
      return NextResponse.json(
        { error: 'Дата должна быть в будущем — минимум завтра' },
        { status: 400 },
      );
    }
    // ограничение разумного горизонта — 10 лет
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 10);
    if (deliverAt > maxDate.toISOString().slice(0, 10)) {
      return NextResponse.json({ error: 'Максимум 10 лет вперёд' }, { status: 400 });
    }

    await ensureSchema();

    // не больше 20 активных капсул на человека
    const count = await db.timeCapsule.count({ where: { userId: user.uid } });
    if (count >= 20) {
      return NextResponse.json(
        { error: 'Максимум 20 капсул на аккаунт — открой или удали старые' },
        { status: 429 },
      );
    }

    const created = await db.timeCapsule.create({
      data: { userId: user.uid, title, message, deliverAt },
    });

    return NextResponse.json({
      capsule: {
        id: created.id,
        title: created.title,
        deliverAt: created.deliverAt,
        createdAt: created.createdAt.toISOString(),
        locked: true,
      } satisfies CapsuleDto,
    });
  } catch (error) {
    console.error('[capsule POST] error:', error);
    return NextResponse.json({ error: 'Не удалось запечатать капсулу' }, { status: 500 });
  }
}

/** DELETE — удалить свою капсулу (id из query). */
export async function DELETE(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });

  try {
    const id = req.nextUrl.searchParams.get('id') || '';
    if (!id) return NextResponse.json({ error: 'Не указана капсула' }, { status: 400 });
    await ensureSchema();
    const deleted = await db.timeCapsule.deleteMany({ where: { id, userId: user.uid } });
    if (deleted.count === 0) {
      return NextResponse.json({ error: 'Капсула не найдена' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[capsule DELETE] error:', error);
    return NextResponse.json({ error: 'Не удалось удалить капсулу' }, { status: 500 });
  }
}
