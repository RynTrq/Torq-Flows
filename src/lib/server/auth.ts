import 'server-only';

import { createHash, randomBytes, randomUUID } from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import type { AuthUser } from '@/lib/types';
import { query } from './database';
import { hashPassword, verifyPassword } from './passwords';

const SESSION_COOKIE_NAME = 'torq_flows_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

interface UserRow {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
}

interface SessionUserRow {
  sessionId: string;
  id: string;
  name: string;
  email: string;
}

function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function getSessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function assertValidCredentials(name: string, email: string, password: string) {
  if (!name.trim()) {
    throw new Error('Name is required.');
  }

  if (!validateEmail(email)) {
    throw new Error('Please enter a valid email address.');
  }

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }
}

export async function registerUser({
  name,
  email,
  password,
}: {
  name: string;
  email: string;
  password: string;
}) {
  const normalizedEmail = normalizeEmail(email);
  assertValidCredentials(name, normalizedEmail, password);

  const existingUser = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
    normalizedEmail,
  ]);

  if (existingUser.rowCount) {
    throw new Error('An account with that email already exists.');
  }

  const user: AuthUser = {
    id: randomUUID(),
    name: name.trim(),
    email: normalizedEmail,
  };

  await query(
    `
      INSERT INTO users (id, name, email, password_hash, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
    `,
    [user.id, user.name, user.email, await hashPassword(password)]
  );

  return user;
}

export async function authenticateUser(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);

  if (!validateEmail(normalizedEmail)) {
    return null;
  }

  const result = await query<UserRow>(
    `
      SELECT id, name, email, password_hash AS "passwordHash"
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [normalizedEmail]
  );

  const user = result.rows[0];

  if (!user) {
    return null;
  }

  const validPassword = await verifyPassword(password, user.passwordHash);

  if (!validPassword) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
  } satisfies AuthUser;
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await query('DELETE FROM sessions WHERE expires_at <= NOW()', []);
  await query(
    `
      INSERT INTO sessions (id, user_id, token_hash, expires_at, last_seen_at)
      VALUES ($1, $2, $3, $4, NOW())
    `,
    [randomUUID(), userId, hashSessionToken(token), expiresAt]
  );

  return { token, expiresAt };
}

export function applySessionCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions(expiresAt));
  return response;
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    ...getSessionCookieOptions(new Date(0)),
    maxAge: 0,
  });

  return response;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const result = await query<SessionUserRow>(
    `
      SELECT
        s.id AS "sessionId",
        u.id,
        u.name,
        u.email
      FROM sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.expires_at > NOW()
      LIMIT 1
    `,
    [hashSessionToken(token)]
  );

  const session = result.rows[0];

  if (!session) {
    return null;
  }

  void query('UPDATE sessions SET last_seen_at = NOW() WHERE id = $1', [session.sessionId]).catch(
    () => undefined
  );

  return {
    id: session.id,
    name: session.name,
    email: session.email,
  };
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return user;
}

export async function destroyCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return;
  }

  await query('DELETE FROM sessions WHERE token_hash = $1', [hashSessionToken(token)]);
}
