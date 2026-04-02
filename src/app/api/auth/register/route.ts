import { NextResponse } from 'next/server';
import { applySessionCookie, createSession, registerUser } from '@/lib/server/auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name : '';
    const email = typeof body.email === 'string' ? body.email : '';
    const password = typeof body.password === 'string' ? body.password : '';

    const user = await registerUser({ name, email, password });
    const session = await createSession(user.id);
    const response = NextResponse.json({ user }, { status: 201 });

    return applySessionCookie(response, session.token, session.expiresAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
