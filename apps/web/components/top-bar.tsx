'use client';

import { useSession } from '@/lib/session';

/**
 * Slim bar above every signed-in page with the sign-out control top right.
 * Sits in the page flow rather than fixed, so it can never overlap a long
 * page title on a narrow screen.
 */
export function TopBar() {
  const { me, signOut } = useSession();
  if (!me) return null;

  return (
    <div className="mx-auto flex w-full max-w-lg items-center justify-end px-5 pt-3">
      <button
        type="button"
        onClick={() => void signOut()}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium
                   text-muted transition-colors hover:bg-black/5 hover:text-ink
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="m16 17 5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
        Sign out
      </button>
    </div>
  );
}
