import { NextRequest, NextResponse } from 'next/server';
import { db, ensureSchema } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const sessionId = req.nextUrl.searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }
    const favorites = await db.favorite.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ favorites });
  } catch (error) {
    console.error('[favorites:GET] error:', error);
    return NextResponse.json({ error: 'failed to load favorites' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const body = await req.json();
    const { sessionId, title, category, url, source, deadline, prize, format, summary } = body;
    if (!sessionId || !title || !url) {
      return NextResponse.json({ error: 'sessionId, title, url required' }, { status: 400 });
    }

    const existing = await db.favorite.findFirst({
      where: { sessionId, url },
    });
    if (existing) {
      return NextResponse.json({ favorite: existing, duplicate: true });
    }

    const favorite = await db.favorite.create({
      data: {
        sessionId,
        title: String(title).slice(0, 200),
        category: String(category || 'other').slice(0, 20),
        url: String(url).slice(0, 500),
        source: source ? String(source).slice(0, 100) : null,
        deadline: deadline ? String(deadline).slice(0, 80) : null,
        prize: prize ? String(prize).slice(0, 120) : null,
        format: format ? String(format).slice(0, 60) : null,
        summary: summary ? String(summary).slice(0, 600) : null,
      },
    });
    return NextResponse.json({ favorite });
  } catch (error) {
    console.error('[favorites:POST] error:', error);
    return NextResponse.json({ error: 'failed to save favorite' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensureSchema();
    const id = req.nextUrl.searchParams.get('id');
    const sessionId = req.nextUrl.searchParams.get('sessionId');
    if (!id || !sessionId) {
      return NextResponse.json({ error: 'id and sessionId required' }, { status: 400 });
    }
    await db.favorite.deleteMany({ where: { id, sessionId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[favorites:DELETE] error:', error);
    return NextResponse.json({ error: 'failed to delete favorite' }, { status: 500 });
  }
}
