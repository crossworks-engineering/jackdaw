'use client';

/**
 * Routing host fields and the API-key validity hint, shared by the worker form.
 *
 * Moved out of worker-form.tsx unchanged (structure pass, phase 1): the
 * components were already standalone and took plain props, they were just
 * living in a 2,507-line file. No signatures changed.
 */
import type { AiWorkerKind } from '@mantle/client-types';
import { type ProviderCapability } from '@mantle/voice-client';
import { Input } from '@mantle/web-ui/ui/input';
import { Field, FieldError, FieldLabel } from '@mantle/web-ui/ui/field';
import { Switch } from '@mantle/web-ui/ui/switch';

/** Per-route host controls for a `local` or `custom` chat route (migration
 *  0063). `local` overrides the localhost default (LAN/tailnet box) and may
 *  route through the bundled Tailscale proxy; `custom` (a cloud OpenAI-compatible
 *  endpoint) takes a REQUIRED Base URL with no localhost default or tailnet
 *  routing — so the peer autocomplete and Tailscale toggle are hidden for it.
 *  Mirrors the agents form's RouteHostFields. */
export function RouteHostFields({
  idPrefix,
  provider,
  baseUrl,
  viaTailnet,
  peers = [],
  onBaseUrl,
  onViaTailnet,
  error,
}: {
  idPrefix: string;
  provider: 'local' | 'custom';
  baseUrl: string;
  viaTailnet: boolean;
  /** Online tailnet peer MagicDNS names — surfaced as base-URL autocomplete. */
  peers?: string[];
  onBaseUrl: (v: string) => void;
  onViaTailnet: (v: boolean) => void;
  /** The base-URL rule lives with the parent form (it depends on the provider
   *  and the kind); only the MESSAGE comes down here. */
  error?: string;
}) {
  const isCustom = provider === 'custom';
  const listId = `${idPrefix}-worker-tailnet-peers`;
  return (
    <div className="space-y-3 rounded-md border border-dashed border-border p-3">
      <Field data-invalid={!!error || undefined}>
        <FieldLabel htmlFor={`${idPrefix}_base_url_input`}>
          Base URL{isCustom && <span className="text-muted-foreground"> (required)</span>}
        </FieldLabel>
        <Input
          id={`${idPrefix}_base_url_input`}
          value={baseUrl}
          onChange={(e) => onBaseUrl(e.target.value)}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${idPrefix}_base_url_input-error` : undefined}
          placeholder={
            isCustom
              ? 'https://api.your-provider.com/v1'
              : 'blank = http://localhost:11434/v1 (Ollama default)'
          }
          list={!isCustom && peers.length > 0 ? listId : undefined}
        />
        {!isCustom && peers.length > 0 && (
          <datalist id={listId}>
            {peers.map((p) => (
              <option key={p} value={`http://${p}:1234/v1`} />
            ))}
          </datalist>
        )}
        {isCustom ? (
          <p className="text-xs text-muted-foreground">
            The provider&apos;s OpenAI-compatible root — e.g.{' '}
            <code>https://api.z.ai/api/paas/v4</code> (Z.ai/GLM) or{' '}
            <code>https://api.deepinfra.com/v1/openai</code>. We append{' '}
            <code>/chat/completions</code>, so include any version segment.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Where this <code>local</code> route&apos;s server lives — e.g.{' '}
            <code>http://gemma-box:11434/v1</code> (Ollama) or{' '}
            <code>http://192.168.0.50:1234/v1</code> (LM Studio). Blank uses the{' '}
            <code>MANTLE_LOCAL_CHAT_URL</code> env / localhost default.
            {peers.length > 0 && ' Tailnet devices are suggested as you type.'}
          </p>
        )}
        <FieldError id={`${idPrefix}_base_url_input-error`}>{error}</FieldError>
      </Field>
      {!isCustom && (
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <FieldLabel htmlFor={`${idPrefix}_via_tailnet_switch`} className="cursor-pointer">
              Reach via Tailscale
            </FieldLabel>
            <p className="text-xs text-muted-foreground">
              Route through the bundled Tailscale proxy so the Base URL (a MagicDNS name) reaches a
              box behind NAT. Inert unless the <code>tailnet</code> compose profile is up.
            </p>
          </div>
          <Switch
            id={`${idPrefix}_via_tailnet_switch`}
            checked={viaTailnet}
            onCheckedChange={onViaTailnet}
          />
        </div>
      )}
    </div>
  );
}

export function KeyValidityHint({
  kind,
  capability,
  apiKeyId,
  supportsDiscovery,
  discovery,
  keysAvailable,
  eligibleKeysAvailable,
  eligibleProviderLabels,
}: {
  kind: AiWorkerKind;
  capability: ProviderCapability;
  apiKeyId: string;
  supportsDiscovery: boolean;
  discovery: {
    available: ReadonlyArray<unknown>;
    filtered: boolean;
    error: string | null;
    loading: boolean;
  };
  keysAvailable: boolean;
  eligibleKeysAvailable: boolean;
  eligibleProviderLabels: ReadonlyArray<string>;
}) {
  // Embedding's discovery is keyless — the key only matters at runtime.
  if (kind === 'embedding') {
    return (
      <p className="text-xs text-muted-foreground">
        Pick your OpenRouter key — embedding requests at runtime route through it. Discovery itself
        is keyless.
      </p>
    );
  }

  if (keysAvailable && !eligibleKeysAvailable) {
    return (
      <p className="text-xs text-warning-ink">
        None of your saved keys can do <code>{capability}</code>. Add one for:{' '}
        {eligibleProviderLabels.join(' · ')} at{' '}
        <a href="/settings/keys" className="underline">
          /settings/keys
        </a>
        .
      </p>
    );
  }

  if (!apiKeyId) {
    return (
      <p className="text-xs text-muted-foreground">
        {supportsDiscovery
          ? 'Picking a key auto-selects its provider and queries it to show only models this key can use.'
          : 'Picking a key auto-selects its provider.'}
      </p>
    );
  }

  if (!supportsDiscovery) {
    return (
      <p className="text-xs text-muted-foreground">
        Provider doesn't expose a model-list endpoint — type the model id by hand below.
      </p>
    );
  }

  if (discovery.loading) {
    return <p className="text-xs text-muted-foreground">Validating key against provider…</p>;
  }

  if (discovery.filtered && discovery.available.length === 0) {
    return (
      <p className="text-xs text-destructive-ink">
        ⚠ This key has no access to any <code>{capability}</code> models. Check the key's
        scope/project at the provider.
      </p>
    );
  }

  if (discovery.error) {
    return (
      <p className="text-xs text-warning-ink">
        ⚠ Couldn't verify key with provider ({discovery.error}). Showing the provider's full static
        catalogue — model calls may still fail if the key doesn't have access.
      </p>
    );
  }

  return (
    <p className="text-xs text-success-ink">
      ✓ Key valid · {discovery.available.length} model
      {discovery.available.length === 1 ? '' : 's'} discovered for <code>{capability}</code>.
    </p>
  );
}

// ─── Kind-specific field sets ─────────────────────────────────────────
