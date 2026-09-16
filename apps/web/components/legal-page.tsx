'use client';

import { BottomNav } from './nav';
import { TopBar } from './top-bar';
import { useSession } from '@/lib/session';

/** A public policy page: readable without signing in, in the app's own voice. */
export function LegalPage({ title, updated, children }: {
  title: string; updated: string; children: React.ReactNode;
}) {
  const { me } = useSession();
  return (
    <>
      <TopBar />
      <main className={`mx-auto w-full max-w-lg px-5 pb-28 ${me ? 'pt-4' : 'pt-8'}`}>
        <header className="mb-6">
          <h1 className="font-serif text-[26px] font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-sm text-muted">Last updated {updated}</p>
        </header>
        <div className="space-y-5 text-sm leading-relaxed text-ink [&_h2]:mt-6 [&_h2]:font-semibold [&_h2]:text-ink [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_a]:text-sage-dark [&_a]:underline [&_a]:underline-offset-2">
          {children}
        </div>
      </main>
      {me && <BottomNav />}
    </>
  );
}
