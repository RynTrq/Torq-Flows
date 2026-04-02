import { NextResponse } from 'next/server';
import { clearSessionCookie, destroyCurrentSession } from '@/lib/server/auth';

export const runtime = 'nodejs';

export async function POST() {
  await destroyCurrentSession();
  const response = NextResponse.json({ success: true });
  return clearSessionCookie(response);
}
