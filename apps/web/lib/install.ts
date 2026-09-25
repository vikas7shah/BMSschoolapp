'use client';

import { useEffect, useState } from 'react';

/**
 * Installability differs by platform, and the app has to bridge the gap:
 *
 *  - Desktop Chrome installs from the address bar on its own.
 *  - Android Chrome fires `beforeinstallprompt` and expects the *site* to show
 *    a button; its own banner is no longer reliable.
 *  - iOS Safari never prompts. The only route is Share → Add to Home Screen,
 *    so the best we can do is say so.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export interface InstallState {
  /** Already running from the home screen — nothing to offer. */
  installed: boolean;
  /** The browser will show its native install dialog if we ask. */
  canPrompt: boolean;
  /** iPhone/iPad Safari: instructions are the only option. */
  needsManualIOS: boolean;
  /** Android where the browser offers no prompt: point at its menu instead. */
  needsManualAndroid: boolean;
  prompt: () => Promise<void>;
}

export function useInstall(): InstallState {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [android, setAndroid] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);

    const ua = navigator.userAgent;
    // iPadOS reports as Macintosh but has touch.
    const isIOS = /iPad|iPhone|iPod/.test(ua)
      || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
    setIos(isIOS);
    setAndroid(/Android/i.test(ua));

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => { setInstalled(true); setEvent(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return {
    installed,
    canPrompt: !!event && !installed,
    needsManualIOS: ios && !installed,
    needsManualAndroid: android && !event && !installed,
    prompt: async () => {
      if (!event) return;
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === 'accepted') setInstalled(true);
      setEvent(null);
    },
  };
}
