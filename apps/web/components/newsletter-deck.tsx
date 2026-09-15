'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Newsletter } from '@bms/shared';

const SECONDS_PER_SLIDE = 8;

/**
 * The month's newsletter as a slide deck: one section at a time, advancing on
 * its own, the same height as the cards around it. Tap to move on, hold to
 * pause, dots to jump. With "reduce motion" on it only moves when tapped.
 */
export function NewsletterDeck({ newsletter }: { newsletter: Newsletter }) {
  const slides = newsletter.sections;
  const [i, setI] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  const start = () => {
    stop();
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    timer.current = setInterval(() => setI((n) => (n + 1) % slides.length), SECONDS_PER_SLIDE * 1000);
  };

  useEffect(() => {
    start();
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length]);

  const go = (n: number) => { setI((n + slides.length) % slides.length); start(); };
  if (!slides.length) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="This month's newsletter"
      className="flex h-[248px] flex-col rounded-2xl bg-sage-soft p-5"
      onPointerDown={stop}
      onPointerUp={start}
      onPointerCancel={start}
    >
      <div
        className="relative flex-1 cursor-pointer overflow-hidden"
        onClick={() => go(i + 1)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === ' ') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); }}
        aria-live="polite"
      >
        {slides.map((s, j) => (
          <div
            key={s.heading}
            aria-hidden={j !== i}
            className={`absolute inset-0 transition-[opacity,transform] duration-500 motion-reduce:transition-none
                        ${j === i ? 'opacity-100 translate-x-0' : 'pointer-events-none opacity-0 translate-x-6'}`}
          >
            <h3 className="text-base font-semibold text-sage-dark">{s.heading}</h3>
            <ul className="mt-1.5 space-y-1 text-[13.5px] leading-snug text-ink">
              {s.points.map((p, k) => (
                <li key={k} className="flex gap-2"><span aria-hidden className="text-sage">•</span><span>{p}</span></li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="flex gap-1.5" role="tablist" aria-label="Sections">
          {slides.map((s, j) => (
            <button
              key={s.heading}
              type="button"
              role="tab"
              aria-selected={j === i}
              aria-label={s.heading}
              onClick={(e) => { e.stopPropagation(); go(j); }}
              className={`h-1.5 rounded-full transition-all ${j === i ? 'w-4 bg-sage-dark' : 'w-1.5 bg-sage-dark/25'}`}
            />
          ))}
        </div>
        <Link href={`/news/?month=${newsletter.month}`} className="text-xs font-medium text-sage-dark underline underline-offset-2">
          Read all
        </Link>
      </div>
    </section>
  );
}
