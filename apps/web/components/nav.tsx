'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useSession } from '@/lib/session';

const ITEMS = [
  { href: '/', label: 'Home', icon: HomeIcon },
  { href: '/snacks/', label: 'Snacks', icon: AppleIcon },
  { href: '/calendar/', label: 'Calendar', icon: CalendarIcon },
  { href: '/news/', label: 'News', icon: NewsIcon },
  { href: '/me/', label: 'You', icon: PersonIcon },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const { me } = useSession();
  const items = me?.role === 'ADMIN'
    ? [...ITEMS, { href: '/admin/', label: 'Admin', icon: GridIcon } as const]
    : me?.role === 'TEACHER'
      // A teacher's class list and curriculum sit next to Home; Snacks stays,
      // read-only. Six fit a phone, so the school calendar is reached from
      // its tile on Home rather than a tab.
      ? [
        ITEMS[0],
        { href: '/class/', label: 'Class', icon: ClassIcon } as const,
        { href: '/curriculum/', label: 'Curriculum', icon: BookIcon } as const,
        ITEMS[1], ITEMS[3], ITEMS[4],
      ]
      : ITEMS;

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href.replace(/\/$/, ''));

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur
                 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-lg">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px]
                            font-medium transition-colors
                            ${active ? 'text-sage' : 'text-muted hover:text-ink'}`}
              >
                <Icon filled={active} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* Inline icons keep the app dependency-free and instant to load. */
type IconProps = { filled?: boolean };
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function HomeIcon({ filled }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden {...(filled ? { fill: 'currentColor', stroke: 'currentColor', strokeWidth: 1.5 } : stroke)}>
      <path d="M3 10.5 12 3l9 7.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 9.5V20h13V9.5" />
    </svg>
  );
}

function NewsIcon({ filled }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden {...(filled ? { fill: 'currentColor', stroke: 'currentColor', strokeWidth: 1.2 } : stroke)}>
      <path d="M4 4.5h12.5a1 1 0 0 1 1 1V18a2 2 0 0 0 2 2H5a1 1 0 0 1-1-1z" />
      <path d="M17.5 8.5h1.5a1 1 0 0 1 1 1V18a2 2 0 0 1-2 2" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <path d="M7.5 8.5h6M7.5 12h6M7.5 15.5h6" fill="none" stroke={filled ? '#fff' : 'currentColor'} strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon({ filled }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden {...(filled ? { fill: 'currentColor', stroke: 'currentColor', strokeWidth: 1.2 } : stroke)}>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M8 3v4M16 3v4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <path d="M3.5 10h17" fill="none" stroke="currentColor" strokeWidth={1.8} />
    </svg>
  );
}

function PersonIcon({ filled }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden {...(filled ? { fill: 'currentColor', stroke: 'currentColor', strokeWidth: 1.2 } : stroke)}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </svg>
  );
}

/** An apple — the thing a family actually brings. */
function AppleIcon({ filled }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden {...(filled ? { fill: 'currentColor', stroke: 'currentColor', strokeWidth: 1.2 } : stroke)}>
      <path d="M12 8c-1.6-1.4-4.1-1.3-5.6.4C4.2 10.9 4.8 15.6 7.6 18.8c1.3 1.5 2.7 1.7 4.4.9 1.7.8 3.1.6 4.4-.9 2.8-3.2 3.4-7.9 1.2-10.4C16.1 6.7 13.6 6.6 12 8Z" />
      <path d="M12 8V5.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <path d="M12 5.5c.5-1.5 2-2.5 3.5-2.5 0 1.5-1 3-3.5 3" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** An open book. */
function BookIcon({ filled }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden {...(filled ? { fill: 'currentColor', stroke: 'currentColor', strokeWidth: 1.2 } : stroke)}>
      <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5z" />
      <path d="M12 6.5C14 5 17 4.5 20.5 5v13c-3.5-.5-6.5 0-8.5 1.5z" />
    </svg>
  );
}

/** Three heads — a class. */
function ClassIcon({ filled }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden {...(filled ? { fill: 'currentColor', stroke: 'currentColor', strokeWidth: 1.2 } : stroke)}>
      <circle cx="12" cy="7.5" r="2.8" />
      <circle cx="5.5" cy="10" r="2.2" />
      <circle cx="18.5" cy="10" r="2.2" />
      <path d="M7 19.5a5 5 0 0 1 10 0z" />
      <path d="M2 18.5a3.6 3.6 0 0 1 4.6-3.4M22 18.5a3.6 3.6 0 0 0-4.6-3.4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

function GridIcon({ filled }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden {...(filled ? { fill: 'currentColor', stroke: 'currentColor', strokeWidth: 1.2 } : stroke)}>
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <rect x="13" y="13" width="7" height="7" rx="2" />
    </svg>
  );
}
