import * as React from 'react';

import { cn } from '@/lib/utils';
import { Badge } from './badge';
import { Label } from './label';
import type { StatusMeta, Tone } from '@/lib/status';

// --- Field ----------------------------------------------------------------

export function Field({
  label,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {error ? (
        <span className="text-xs text-destructive">{error}</span>
      ) : hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}

// --- Status ---------------------------------------------------------------

const TONE_BADGE: Record<Tone, React.ComponentProps<typeof Badge>['variant']> = {
  ok: 'success',
  warn: 'warning',
  danger: 'destructive',
  brand: 'default',
  neutral: 'muted',
};

const TONE_DOT: Record<Tone, string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  danger: 'bg-destructive',
  brand: 'bg-primary',
  neutral: 'bg-muted-foreground/60',
};

export function StatusBadge({ meta, dot }: { meta: StatusMeta; dot?: boolean }) {
  return (
    <Badge variant={TONE_BADGE[meta.tone]} className="gap-1.5">
      {dot && (
        <span
          className={cn('size-1.5 shrink-0 rounded-full', TONE_DOT[meta.tone], meta.tone === 'brand' && 'animate-pulse')}
        />
      )}
      {meta.label}
    </Badge>
  );
}

// --- EmptyState -----------------------------------------------------------

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && (
        <div className="mb-4 grid size-13 place-items-center rounded-2xl bg-primary/10 text-primary">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && (
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
