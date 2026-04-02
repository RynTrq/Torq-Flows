import { NextResponse } from 'next/server';
import {
  applySessionCookie,
  authenticateUser,
  createSession,
  isAuthInfrastructureError,
} from '@/lib/server/auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email : '';
    const password = typeof body.password === 'string' ? body.password : '';

    const user = await authenticateUser(email, password);

    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    const session = await createSession(user.id);
    const response = NextResponse.json({ user });
    return applySessionCookie(response, session.token, session.expiresAt);
  } catch (error) {
    if (isAuthInfrastructureError(error)) {
      console.error('Login failed because the authentication database is unavailable.', error);
      return NextResponse.json(
        { error: 'Authentication service is temporarily unavailable. Please try again shortly.' },
        { status: 503 }
      );
    }

    console.error('Login failed.', error);
    return NextResponse.json({ error: 'Login failed.' }, { status: 500 });
  }
}
