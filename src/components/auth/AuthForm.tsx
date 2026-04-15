'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, LockKeyhole, Mail, User } from 'lucide-react';

type AuthMode = 'login' | 'register';

interface AuthFormProps {
  mode: AuthMode;
}

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === 'register';

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          password,
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Authentication failed.');
      }

      router.push('/workflow-management');
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isRegister && (
        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
            Full Name
          </span>
          <div className="relative">
            <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              required
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 pl-10 pr-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500 transition-colors"
              placeholder="Your full name"
            />
          </div>
        </label>
      )}

      <label className="block">
        <span className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
          Email
        </span>
        <div className="relative">
          <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 pl-10 pr-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500 transition-colors"
            placeholder="you@example.com"
          />
        </div>
      </label>

      <label className="block">
        <span className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
          Password
        </span>
        <div className="relative">
          <LockKeyhole
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600"
          />
          <input
            required
            minLength={8}
            type="password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 pl-10 pr-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500 transition-colors"
            placeholder="At least 8 characters"
          />
        </div>
      </label>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 text-sm font-semibold transition-all duration-150 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            {isRegister ? 'Creating account...' : 'Signing in...'}
          </>
        ) : isRegister ? (
          'Create Account'
        ) : (
          'Sign In'
        )}
      </button>

      <p className="text-sm text-zinc-500 text-center">
        {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
        <Link
          href={isRegister ? '/login' : '/register'}
          className="text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          {isRegister ? 'Sign in' : 'Create one'}
        </Link>
      </p>
    </form>
  );
}
