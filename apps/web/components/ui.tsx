'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
  loading?: boolean;
};

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-sage text-white hover:bg-sage-dark active:bg-sage-dark shadow-sm',
  secondary: 'bg-sage-soft text-sage-dark hover:bg-[#dae7dd]',
  ghost: 'bg-transparent text-muted hover:bg-black/5',
  danger: 'bg-clay-soft text-clay hover:bg-[#f6e0d5]',
};

export function Button({
  variant = 'primary', size = 'md', loading, className = '', children, disabled, ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold',
        'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
        'focus-visible:outline-sage disabled:cursor-not-allowed disabled:opacity-50',
        size === 'md' ? 'min-h-12 px-6 text-[15px]' : 'min-h-9 px-4 text-sm',
        VARIANTS[variant],
        className,
      ].join(' ')}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-surface p-5 ${className}`}>{children}</div>
  );
}

export function PageHeader({ title, subtitle, action }: {
  title: string; subtitle?: string; action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="font-serif text-[26px] font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function Banner({ tone = 'info', children }: {
  tone?: 'info' | 'warn' | 'error' | 'success'; children: ReactNode;
}) {
  const tones = {
    info: 'bg-sage-soft text-sage-dark',
    warn: 'bg-sun-soft text-[#8a6414]',
    error: 'bg-clay-soft text-clay',
    success: 'bg-sage-soft text-sage-dark',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function EmptyState({ title, body, action }: {
  title: string; body?: string; action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <p className="font-semibold text-ink">{title}</p>
      {body && <p className="mx-auto mt-2 max-w-xs text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Field({ label, hint, children }: {
  label: string; hint?: string; children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-xl border border-line bg-surface px-4 py-3 text-ink '
  + 'placeholder:text-muted/60 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-line/60 ${className}`} />;
}
