import { NextResponse } from 'next/server';
import {
  applySessionCookie,
  AuthValidationError,
  createSession,
  isAuthConflict,
  isAuthInfrastructureError,
  registerUser,
} from '@/lib/server/auth';

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
    if (error instanceof AuthValidationError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }

    if (isAuthConflict(error)) {
      return NextResponse.json(
        { error: 'An account with that email already exists.' },
        { status: 409 }
      );
    }

    if (isAuthInfrastructureError(error)) {
      console.error(
        'Registration failed because the authentication database is unavailable.',
        error
      );
      return NextResponse.json(
        { error: 'Authentication service is temporarily unavailable. Please try again shortly.' },
        { status: 503 }
      );
    }

    console.error('Registration failed.', error);
    return NextResponse.json({ error: 'Registration failed.' }, { status: 500 });
  }
}
