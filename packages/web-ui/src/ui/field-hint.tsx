import * as React from 'react';
import { FieldDescription } from './field';

/** Id convention shared with the field it describes, so the input can point at
 *  the hint with `aria-describedby={hintId('historyLimit')}`. */
export function hintId(fieldId: string) {
  return `${fieldId}-hint`;
}

export interface FieldHintProps {
  /** The `id` of the field this describes — becomes `<id>-hint`. Pair it with
   *  `aria-describedby={hintId(id)}` on the input. */
  id?: string;
  /** The cost of overdoing it: rendered after the description in `warning-ink`.
   *  Only for fields where excess actually bites — money, load, or answer
   *  quality. Most fields want a plain description and nothing here. */
  warn?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

/** The one-line dimmed description under a settings field. Says what the field
 *  does; `warn` adds the consequence of pushing it too far, in a second tone.
 *
 *  This is `FieldDescription` plus `warn` and the `id` convention. It renders
 *  through it rather than restating the styles, so the hint under a settings
 *  control and the hint under a `<Field>` cannot drift apart. New forms should
 *  reach for `FieldDescription` directly unless they need `warn`. */
export function FieldHint({ id, warn, className, children }: FieldHintProps) {
  return (
    <FieldDescription id={id ? hintId(id) : undefined} className={className}>
      {children}
      {warn ? (
        <>
          {children ? ' ' : null}
          <span className="text-warning-ink">{warn}</span>
        </>
      ) : null}
    </FieldDescription>
  );
}
