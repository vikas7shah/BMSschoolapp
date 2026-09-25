'use client';

import { useEffect, useState } from 'react';
import { useInstall } from '@/lib/install';
import { Button } from './ui';

const SEEN_KEY = 'bms.install.prompt.seen';

/**
 * The first time a parent lands on Home on a phone, a sheet explains how to
 * put BMS Families on the home screen. Closing it (or installing) means it
 * never comes back on that phone; the card on the You screen stays for anyone
 * who changes their mind. Never shown once the app is already installed.
 */
export function InstallPrompt() {
  const { installed, canPrompt, needsManualIOS, needsManualAndroid, prompt } = useInstall();
  const [seen, setSeen] = useState(true); // hidden until storage is read

  useEffect(() => {
    try { setSeen(localStorage.getItem(SEEN_KEY) === '1'); } catch { setSeen(true); }
  }, []);

  const close = () => {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode */ }
    setSeen(true);
  };

  if (seen || installed || (!canPrompt && !needsManualIOS && !needsManualAndroid)) return null;

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
              <Button size="sm" className="mt-3" onClick={async () => { await prompt(); close(); }}>Add to home screen</Button>
            </>
          ) : needsManualIOS ? (
            <p className="mt-1 text-sm leading-relaxed text-ink/80">
              Tap the Share button <Glyph d="M12 3v12 M8 7l4-4 4 4 M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /> at the
              bottom of Safari, then <strong className="font-semibold">Add to Home Screen</strong>{' '}
              <Glyph d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M12 8v8 M8 12h8" />.
            </p>
          ) : (
            <p className="mt-1 text-sm leading-relaxed text-ink/80">
              Tap the menu <Glyph d="M12 5h.01 M12 12h.01 M12 19h.01" wide /> at the top of Chrome, then{' '}
              <strong className="font-semibold">Add to Home screen</strong>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** A browser icon drawn inline, so the instruction matches what the parent sees. */
function Glyph({ d, wide }: { d: string; wide?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="mx-0.5 inline size-[18px] align-text-bottom text-[#2f5ea8]" fill="none" stroke="currentColor"
      strokeWidth={wide ? 3 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d.split(' M').map((p, i) => <path key={i} d={i ? `M${p}` : p} />)}
    </svg>
  );
}
