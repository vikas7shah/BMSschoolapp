'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Newsletter } from '@bms/shared';

const SECONDS_PER_POINT = 5;

/** Sections that are a footer, not news — a phone number to call — stay off the deck. */
const skip = (heading: string) => /^questions/i.test(heading.trim());

const ICONS: [RegExp, string][] = [
  [/welcome/i, '👋'], [/snack/i, '🍎'], [/bag/i, '🎒'], [/pickup|pick-up/i, '⏰'], [/car line/i, '🚗'],
  [/show and tell/i, '🎨'], [/birthday/i, '🎂'], [/this month|month/i, '📅'], [/holiday|closure|days off/i, '🏖️'],
];
const iconFor = (heading: string) => ICONS.find(([re]) => re.test(heading))?.[1] ?? '•';

/**
 * The month's newsletter one point at a time: a single line in large type on
 * a dark panel, moving on by itself, with a timer bar and a dot per section.
 * Tap to move on, hold to pause, tap a dot to jump. With "reduce motion" on
 * it moves only when tapped.
 */
export function NewsletterDeck({ newsletter }: { newsletter: Newsletter }) {
  const sections = newsletter.sections.filter((s) => !skip(s.heading));
  const points = sections.flatMap((s, si) => s.points.map((p, k) => ({
    heading: s.heading, icon: iconFor(s.heading), text: p, section: si, k: k + 1, n: s.points.length,
  })));
  const [i, setI] = useState(0);
  const [tick, setTick] = useState(0); // restarts the timer bar
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  const start = () => {
    stop();
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    timer.current = setInterval(() => { setI((n) => (n + 1) % points.length); setTick((t) => t + 1); }, SECONDS_PER_POINT * 1000);
  };

  useEffect(() => {
    start();
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length]);

  const go = (n: number) => { setI((n + points.length) % points.length); setTick((t) => t + 1); start(); };
  if (!points.length) return null;
  const cur = points[i]!;
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="This month's newsletter"
      className="relative flex h-[200px] flex-col overflow-hidden rounded-2xl bg-sage-dark p-5 pb-3 text-white"
      onPointerDown={stop}
      onPointerUp={start}
      onPointerCancel={start}
    >
      <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-white/65">
        <span aria-hidden className="text-[15px]">{cur.icon}</span>
        {cur.heading} · {cur.k} of {cur.n}
      </p>

      <div
        className="relative mt-1.5 flex-1 cursor-pointer border-t border-white/10 pt-3"
        onClick={() => go(i + 1)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === ' ') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); }}
        aria-live="polite"
      >
        {points.map((p, j) => (
          <p
            key={`${p.section}-${p.k}`}
            aria-hidden={j !== i}
            className={`absolute inset-x-0 top-3 font-serif text-[18px] leading-[1.4] [text-wrap:balance]
                        transition-[opacity,transform] duration-500 motion-reduce:transition-none
                        ${j === i ? 'opacity-100 translate-x-0' : 'pointer-events-none opacity-0 translate-x-6'}`}
          >
            {p.text}
          </p>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="flex gap-1.5" role="tablist" aria-label="Sections">
          {sections.map((s, si) => (
            <button
              key={s.heading}
              type="button"
              role="tab"
              aria-selected={si === cur.section}
              aria-label={s.heading}
              onClick={(e) => { e.stopPropagation(); go(points.findIndex((p) => p.section === si)); }}
              className={`h-1.5 rounded-full transition-all ${si === cur.section ? 'w-4 bg-white' : 'w-1.5 bg-white/30'}`}
            />
          ))}
        </div>
        <Link href={`/news/?month=${newsletter.month}`} className="text-xs font-semibold text-white underline underline-offset-2">
          Read all
        </Link>
      </div>

      {/* Timer bar: restarts on every change of point. */}
      {!reduced && (
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-white/15">
          <div
            key={tick}
            className="h-full bg-white motion-safe:animate-[deck-bar_linear_forwards]"
            style={{ animationDuration: `${SECONDS_PER_POINT}s` }}
          />
        </div>
      )}
    </section>
  );
}
