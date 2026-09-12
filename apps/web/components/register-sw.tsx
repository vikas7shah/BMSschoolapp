'use client';

import { useEffect } from 'react';

/** Registers the service worker that makes the app installable and push-capable. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed', err);
    });
  }, []);
  return null;
}
