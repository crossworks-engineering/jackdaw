import { Input } from '@mantle/web-ui/ui/input';
import { Label } from '@mantle/web-ui/ui/label';
import { FieldDescription, FieldError } from '@mantle/web-ui/ui/field';

/**
 * The setup code a first-run signup asks for when the brain says so
 * (GET /api/auth/bootstrap-state `setupCodeRequired`). The installer printed
 * it; only someone who can reach the server can read it again, which is the
 * point: it stops a stranger who finds a fresh brain from claiming it.
 */
export function SetupCodeField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="setup-code">Setup code</Label>
      <Input
        id="setup-code"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
        className="font-mono"
        aria-invalid={!!error || undefined}
        aria-describedby={error ? 'setup-code-error setup-code-hint' : 'setup-code-hint'}
      />
      <FieldDescription id="setup-code-hint">
        Printed by the installer. To see it again, run{' '}
        <code className="font-mono">scripts/install.sh --setup-code</code> on the server.
      </FieldDescription>
      {error && <FieldError id="setup-code-error">{error}</FieldError>}
    </div>
  );
}

/** A refused signup the setup-code field should answer: the brain's 403
 *  with `reason: 'setup-code'` (wrong or missing code). */
export function isSetupCodeRefusal(status: number, body: { reason?: unknown }): boolean {
  return status === 403 && body.reason === 'setup-code';
}
