'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { Banner, Button, Field, inputClass } from '@/components/ui';

type Step = 'PHONE' | 'CODE';

export default function LoginPage() {
  const [step, setStep] = useState<Step>('PHONE');
  const [identifier, setIdentifier] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [session, setSession] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'CODE') codeRef.current?.focus();
  }, [step]);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ message: string; session: string | null; sentTo?: string }>(
        '/api/auth/start', { identifier },
      );
      setSession(r.session);
      setSentTo(r.sentTo ?? null);
      setNotice(r.message);
      setStep('CODE');
      setCode('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send a code. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!session) {
      // No session means the number isn't on the roster; say so only here, after
      // a code was "sent", so the first step can't be used to enumerate numbers.
      setError('We could not sign you in. Please check the details with the school office.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/verify', { identifier, code, session });
      window.location.href = '/';
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        // A wrong code returns a fresh challenge session so the parent keeps
        // their remaining attempts; an expired one sends them back a step.
        const next = err.body.session as string | undefined;
        if (next) setSession(next);
        if (err.body.expired) {
          setStep('PHONE');
          setSession(null);
        }
        setCode('');
      } else {
        setError('Could not sign you in. Please try again.');
      }
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-10 text-center">
        <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-3xl bg-sage-soft">
          <svg viewBox="0 0 24 24" className="size-8 text-sage" aria-hidden>
            <path d="M6 10h12l-1 9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2l-1-9Z" fill="currentColor" opacity=".9" />
            <path d="M9 10a3 3 0 0 1 6 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Snack Days</h1>
        <p className="mt-2 text-sm text-muted">
          Sign in with your email address, or the mobile number the school has on
          file. Either way we&apos;ll email you a code.
        </p>
      </div>

      {step === 'PHONE' ? (
        <form onSubmit={requestCode} className="space-y-5">
          <Field
            label="Mobile number or email"
            hint="We'll email you a 6-digit code."
          >
            <input
              className={inputClass}
              type="text"
              inputMode="email"
              autoComplete="username"
              autoFocus
              placeholder="(617) 555-0123  or  you@example.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </Field>
          {error && <Banner tone="error">{error}</Banner>}
          <Button type="submit" loading={busy} className="w-full">Send my code</Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-5">
          {notice && <Banner tone="info">{notice}</Banner>}
          <Field label="6-digit code" hint={sentTo ? `Sent to ${sentTo}` : `Sent to ${identifier}`}>
            <input
              ref={codeRef}
              className={`${inputClass} text-center text-2xl tracking-[0.4em]`}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
            />
          </Field>
          {error && <Banner tone="error">{error}</Banner>}
          <Button type="submit" loading={busy} disabled={code.length !== 6} className="w-full">
            Sign in
          </Button>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => { setStep('PHONE'); setError(null); }}
              className="text-muted underline underline-offset-4"
            >
              Use something else
            </button>
            <button
              type="button"
              onClick={() => void requestCode()}
              disabled={busy}
              className="text-sage font-medium underline underline-offset-4 disabled:opacity-50"
            >
              Resend code
            </button>
          </div>
        </form>
      )}

      <p className="mt-10 text-center text-xs text-muted">
        Not on the list? Ask the school office to add you.
      </p>

      <TestSignIn />
    </main>
  );
}

/**
 * While the app is being built: a fixed code signs in as "Admin". The
 * link only renders when the backend says the feature is deployed, so once
 * devLogin is switched off nothing is left on the page.
 */
function TestSignIn() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ enabled: boolean }>('/api/auth/test')
      .then((r) => setEnabled(r.enabled))
      .catch(() => setEnabled(false));
  }, []);

  if (!enabled) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/test', { code });
      window.location.href = '/admin/';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign you in.');
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 text-center">
      {open ? (
        <form onSubmit={submit} className="mx-auto max-w-xs space-y-3 rounded-2xl bg-black/5 p-4 text-left">
          <Field label="Admin code">
            <input
              className={`${inputClass} text-center tracking-[0.3em]`}
              type="password"
              inputMode="numeric"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </Field>
          {error && <Banner tone="error">{error}</Banner>}
          <Button type="submit" loading={busy} className="w-full">Sign in as admin</Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[11px] text-muted/70 underline underline-offset-4"
        >
          Admin sign in
        </button>
      )}
    </div>
  );
}
