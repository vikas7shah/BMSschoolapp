'use client';

import { useEffect, useState } from 'react';
import { useInstall } from '@/lib/install';
import { Button } from './ui';

const DISMISS_KEY = 'bms.install.dismissed';

/**
 * Offers to put the app on the home screen. Shown once on Home until
 * dismissed, and always on the You screen. Says nothing when already installed
 * or on a browser where neither route applies.
 */
export function InstallCard({ dismissible = false }: { dismissible?: boolean }) {
  const { installed, canPrompt, needsManualIOS, prompt } = useInstall();
  const [dismissed, setDismissed] = useState(true); // assume hidden until read

  useEffect(() => {
    try { setDismissed(dismissible && localStorage.getItem(DISMISS_KEY) === '1'); }
    catch { setDismissed(false); }
  }, [dismissible]);

  if (installed || dismissed || (!canPrompt && !needsManualIOS)) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ }
    setDismissed(true);
  };

  return (
    <section className="rounded-2xl bg-sage-soft p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sage text-white">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-sage-dark">Add to your home screen</h2>
          {canPrompt ? (
            <p className="mt-0.5 text-sm text-sage-dark/80">
              Opens like an app, one tap from your phone.
            </p>
          ) : (
            <p className="mt-0.5 text-sm leading-relaxed text-sage-dark/80">
              On iPhone, tap the <strong className="font-semibold">Share</strong> button
              <ShareGlyph /> at the bottom of Safari, then
              <strong className="font-semibold"> Add to Home Screen</strong>.
            </p>
          )}
          <div className="mt-3 flex items-center gap-3">
            {canPrompt && <Button size="sm" onClick={() => void prompt()}>Install</Button>}
            {dismissible && (
              <button type="button" onClick={dismiss} className="text-sm text-sage-dark/70 underline underline-offset-4">
                Not now
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Safari's share icon, so the instruction matches what the parent sees. */
function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="mx-1 inline size-4 align-text-bottom" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" /><path d="m8 7 4-4 4 4" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}
