'use client';

import { BottomNav } from './nav';
import { TopBar } from './top-bar';
import { Spinner } from './ui';
import { useRequireAuth } from '@/lib/session';

/** Standard authenticated page frame: centred column plus bottom navigation. */
export function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  const { me, loading } = useRequireAuth();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted">
        <Spinner className="size-6" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }
  if (!me) return null; // useRequireAuth is redirecting

  return (
    <>
      <TopBar />
      <main className={`mx-auto w-full px-5 pt-4 pb-28 ${wide ? 'max-w-5xl' : 'max-w-lg'}`}>{children}</main>
      <BottomNav />
    </>
  );
}
