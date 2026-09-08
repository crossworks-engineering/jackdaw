'use client';

/**
 * A `Select` that still submits with the form.
 *
 * Moved out of worker-form.tsx unchanged (structure pass, phase 1) so the
 * extracted field groups can share it rather than each growing their own.
 */
import { useState } from 'react';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@mantle/web-ui/ui/select';

/**
 * A `Select` that still submits with the form.
 *
 * This form is uncontrolled — it reads `new FormData(formEl)` on submit — and
 * Radix's Select is a button plus a portal, not a form control, so on its own it
 * puts NOTHING in that FormData. Pairing it with a hidden input under the same
 * `name` restores exactly what the raw `<select name=… defaultValue=…>` did by
 * itself, and keeps the swap invisible to the submit handler and the server.
 */
export function FormSelect({
  id,
  name,
  defaultValue,
  describedBy,
  children,
}: {
  id: string;
  name: string;
  defaultValue: string;
  describedBy?: string;
  children: React.ReactNode;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger id={id} aria-describedby={describedBy}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </>
  );
}
