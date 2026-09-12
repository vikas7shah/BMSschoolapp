import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold text-sage">404</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">We couldn&apos;t find that page</h1>
      <p className="mt-2 text-sm text-muted">It may have moved, or the link may be out of date.</p>
      <Link
        href="/"
        className="mt-6 inline-flex min-h-12 items-center rounded-full bg-sage px-6 font-semibold text-white"
      >
        Go home
      </Link>
    </main>
  );
}
