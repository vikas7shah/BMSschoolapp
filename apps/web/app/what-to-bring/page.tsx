'use client';

import Link from 'next/link';
import { SNACK_NOTE, SNACK_POLICY, SNACK_SECTIONS } from '@bms/shared';
import { BottomNav } from '@/components/nav';
import { TopBar } from '@/components/top-bar';
import { useSession } from '@/lib/session';
import { Card } from '@/components/ui';

/**
 * Deliberately readable without signing in: it holds no personal data, and the
 * day-before reminder emails link straight here — bouncing a parent to a login
 * screen when they are standing in a shop would defeat the point.
 */
export default function WhatToBringPage() {
  const { me } = useSession();

  return (
    <>
      <TopBar />
      <main className={`mx-auto w-full max-w-lg px-5 pb-28 ${me ? 'pt-4' : 'pt-8'}`}>
        <header className="mb-6">
        <Link
          href="/snacks/"
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-sage"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
          Snack days
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-ink">What to bring</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{SNACK_NOTE}</p>
        </header>

        <div className="space-y-4">
        {SNACK_SECTIONS.map((section) => (
          <Card key={section.id}>
            <h2 className="font-semibold text-ink">{section.title}</h2>

            <ul className="mt-3 space-y-2">
              {section.items.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm text-ink">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sage" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            {section.guidance && (
              <ul className="mt-4 space-y-1.5 border-t border-line pt-3">
                {section.guidance.map((note) => (
                  <li key={note} className="text-sm leading-relaxed text-muted">{note}</li>
                ))}
              </ul>
            )}

            {section.avoid && (
              <div className="mt-4 rounded-xl bg-clay-soft px-3.5 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-clay">
                  Please don&apos;t bring
                </h3>
                <ul className="mt-1.5 space-y-1.5">
                  {section.avoid.map((note) => (
                    <li key={note} className="text-sm leading-relaxed text-clay">{note}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        ))}

        <Card>
          <h2 className="font-semibold text-ink">Good to know</h2>
          <ul className="mt-3 space-y-2">
            {SNACK_POLICY.map((note) => (
              <li key={note} className="flex gap-2.5 text-sm text-muted">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-line" />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </Card>
        </div>

        <p className="mt-6 px-1 text-xs text-muted">
          Questions about allergies or a specific product? Please ask the school office.
        </p>
      </main>
      {me && <BottomNav />}
    </>
  );
}
