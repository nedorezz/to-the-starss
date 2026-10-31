import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  return NextResponse.json({
    user: user ? { email: user.email, name: user.name, provider: user.provider } : null,
  });
}
