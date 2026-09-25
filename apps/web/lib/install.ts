'use client';

import { useEffect, useState } from 'react';

/**
 * Installability differs by platform, and the app has to bridge the gap:
 *
 *  - Android Chrome (and Samsung Internet, Edge) fire `beforeinstallprompt`
 *    and expect the *site* to show a button. That gives a one-tap install.
 *  - Desktop Chrome does the same, and also installs from the address bar.
 *  - iOS has no install API in any browser. The only route is Share → Add to
 *    Home Screen, so the best we can do is say exactly where to tap.
 *
 * Chrome fires `beforeinstallprompt` once, often before React hydrates, so a
 * listener added in an effect can miss it. INSTALL_CAPTURE_SCRIPT runs inline
 * in <head> and parks the event on `window` for the hook to pick up.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

declare global {
  interface Window {
    __bmsInstall?: BeforeInstallPromptEvent | null;
  }
}

const READY_EVENT = 'bms:installable';

export const INSTALL_CAPTURE_SCRIPT = `
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  window.__bmsInstall = e;
  window.dispatchEvent(new Event('${READY_EVENT}'));
});
window.addEventListener('appinstalled', function () { window.__bmsInstall = null; });
`;

/**
 * Where to send a parent when the browser can't install for us, named for
 * the browser they're actually in.
 */
export type ManualRoute =
  | 'ios-safari'        // Share button in the toolbar (before iOS 26)
  | 'ios-safari-26'     // Share moved into the ⋯ menu in iOS 26's compact bar
  | 'ios-chrome'        // Share icon in Chrome's address bar
  | 'ios-other'         // Firefox, Edge… each has a Share button somewhere
  | 'android-samsung'   // ≡ menu at the bottom → Add page to → Home screen
  | 'android';          // ⋮ menu at the top (Chrome, Firefox, Edge)

export interface InstallState {
  /** Already running from the home screen — nothing to offer. */
  installed: boolean;
  /** The browser will show its native install dialog if we ask. */
  canPrompt: boolean;
  /** On a phone or tablet (the only place the Home popup appears). */
  mobile: boolean;
  /** Steps to show when there's no prompt; null when none apply. */
  manual: ManualRoute | null;
  prompt: () => Promise<void>;
}

export function manualRoute(ua: string, maxTouchPoints: number): ManualRoute | null {
  // iPadOS reports as Macintosh but has touch.
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && maxTouchPoints > 1);
  if (ios) {
    if (/CriOS/.test(ua)) return 'ios-chrome';
    if (/FxiOS|EdgiOS|OPiOS/.test(ua)) return 'ios-other';
    // iOS 26 froze the OS version in the UA; Safari's own version still moves.
    const safari = Number(ua.match(/Version\/(\d+)/)?.[1] ?? 0);
    return safari >= 26 ? 'ios-safari-26' : 'ios-safari';
  }
  if (/Android/i.test(ua)) return /SamsungBrowser/.test(ua) ? 'android-samsung' : 'android';
  return null;
}

export function useInstall(): InstallState {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [route, setRoute] = useState<ManualRoute | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setRoute(manualRoute(navigator.userAgent, navigator.maxTouchPoints));

    // Picks up an event the inline script caught before hydration, or one
    // that arrives later.
    const sync = () => setEvent(window.__bmsInstall ?? null);
    const onInstalled = () => { setInstalled(true); setEvent(null); };
    sync();
    window.addEventListener(READY_EVENT, sync);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener(READY_EVENT, sync);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return {
    installed,
    canPrompt: !!event && !installed,
    mobile: route !== null,
    manual: !event && !installed ? route : null,
    prompt: async () => {
      if (!event) return;
      // The event is single-use; clear it so no other card offers it again.
      window.__bmsInstall = null;
      setEvent(null);
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === 'accepted') setInstalled(true);
    },
  };
}
