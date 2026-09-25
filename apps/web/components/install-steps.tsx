import type { ManualRoute } from '@/lib/install';

const SHARE = 'M12 3v12 M8 7l4-4 4 4 M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7';
const ADD = 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M12 8v8 M8 12h8';
const MORE = 'M5 12h.01 M12 12h.01 M19 12h.01';
const KEBAB = 'M12 5h.01 M12 12h.01 M12 19h.01';
const BURGER = 'M4 6h16 M4 12h16 M4 18h16';

/**
 * The manual route to the home screen, worded for the browser the parent is
 * in and with its icons drawn inline so the words match what they see.
 */
export function InstallSteps({ route, glyphClass = '' }: { route: ManualRoute; glyphClass?: string }) {
  const g = (d: string, wide?: boolean) => <Glyph d={d} wide={wide} className={glyphClass} />;
  const b = (text: string) => <strong className="font-semibold">{text}</strong>;

  switch (route) {
    case 'ios-safari-26':
      return <>Tap {g(MORE, true)} next to the address bar, then {b('Share')} {g(SHARE)}, then {b('Add to Home Screen')} {g(ADD)}.</>;
    case 'ios-safari':
      return <>Tap the Share button {g(SHARE)} in Safari&apos;s toolbar, then {b('Add to Home Screen')} {g(ADD)}.</>;
    case 'ios-chrome':
      return <>Tap the Share button {g(SHARE)} in Chrome&apos;s address bar, then {b('Add to Home Screen')} {g(ADD)}.</>;
    case 'ios-other':
      return <>Tap your browser&apos;s Share button {g(SHARE)}, then {b('Add to Home Screen')} {g(ADD)}.</>;
    case 'android-samsung':
      return <>Tap the menu {g(BURGER)} at the bottom, then {b('Add page to')}, then {b('Home screen')}.</>;
    case 'android':
      return <>Tap the menu {g(KEBAB, true)} at the top, then {b('Install app')} or {b('Add to Home screen')}.</>;
  }
}

function Glyph({ d, wide, className }: { d: string; wide?: boolean; className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`mx-0.5 inline size-[18px] align-text-bottom ${className}`} fill="none" stroke="currentColor"
      strokeWidth={wide ? 3 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d.split(' M').map((p, i) => <path key={i} d={i ? `M${p}` : p} />)}
    </svg>
  );
}
