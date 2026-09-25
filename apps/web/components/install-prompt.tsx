'use client';

import { useEffect, useState } from 'react';
import { useInstall } from '@/lib/install';
import { Button } from './ui';
import { InstallSteps } from './install-steps';

const SEEN_KEY = 'bms.install.prompt.seen';

/**
 * The first time a parent lands on Home on a phone, a sheet offers to put
 * BMS Families on the home screen: a one-tap Install where the browser allows
 * it (Android), otherwise the steps for their browser (always so on iPhone). Closing it (or installing) means it
 * never comes back on that phone; the card on the You screen stays for anyone
 * who changes their mind. Never shown once the app is already installed.
 */
export function InstallPrompt() {
  const { installed, canPrompt, mobile, manual, prompt } = useInstall();
  const [seen, setSeen] = useState(true); // hidden until storage is read

  useEffect(() => {
    try { setSeen(localStorage.getItem(SEEN_KEY) === '1'); } catch { setSeen(true); }
  }, []);

  const close = () => {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode */ }
    setSeen(true);
  };

  if (seen || installed || !mobile || (!canPrompt && !manual)) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-3 pb-24" onClick={close}>
      <div
        role="dialog"
        aria-labelledby="install-title"
        className="relative flex w-full max-w-md gap-4 rounded-2xl bg-surface p-5 pr-10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          className="absolute right-3 top-2 text-2xl leading-none text-muted hover:text-ink"
        >
          ×
        </button>
        <img src="/icon-192.png" alt="" className="size-14 shrink-0 rounded-2xl" />
        <div className="min-w-0">
          <p id="install-title" className="font-semibold text-ink">Add BMS Families to your home screen</p>
          {canPrompt ? (
            <>
              <p className="mt-1 text-sm leading-relaxed text-ink/80">It opens like an app, and you&apos;ll always have the latest.</p>
              <Button size="sm" className="mt-3" onClick={async () => { close(); await prompt(); }}>Install</Button>
            </>
          ) : manual && (
            <p className="mt-1 text-sm leading-relaxed text-ink/80">
              <InstallSteps route={manual} glyphClass="text-[#2f5ea8]" />
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
