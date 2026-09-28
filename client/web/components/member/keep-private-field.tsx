'use client';

import { useId } from 'react';
import { Lock } from 'lucide-react';
import { Label } from '@mantle/web-ui/ui/label';
import { Switch } from '@mantle/web-ui/ui/switch';
import { KEEP_PRIVATE_HELP } from '@/lib/admin-private';

/**
 * "Keep private" in an owner create flow (member logins Phase 7). On, the
 * new item goes into the admin's own private space instead of the brain.
 * Off by default; the flow reads `checked` when it creates.
 */
export function KeepPrivateField({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2">
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={id} className="flex items-center gap-1.5">
          <Lock className="size-3.5" aria-hidden /> Keep private
        </Label>
        <p className="text-xs text-muted-foreground">{KEEP_PRIVATE_HELP}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}
