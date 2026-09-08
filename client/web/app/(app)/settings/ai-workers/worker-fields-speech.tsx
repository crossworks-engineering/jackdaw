'use client';

/**
 * Text-to-speech and speech-to-text field groups for the worker form.
 *
 * Moved out of worker-form.tsx unchanged (structure pass, phase 1): the
 * components were already standalone and took plain props, they were just
 * living in a 2,507-line file. No signatures changed.
 */
import { useEffect, useState } from 'react';
import {
  VOICE_DESCRIPTIONS,
  audioTagsForElevenLabsModel,
  audioTagsForGoogleTtsModel,
  audioTagsForXaiTtsModel,
  type AudioTag,
  type OpenAiVoice,
  type WrappingTag,
  voicesForModel,
  wrappingTagsForXaiTtsModel,
} from '@mantle/voice-client';
import { Input } from '@mantle/web-ui/ui/input';
import { Field, FieldLabel } from '@mantle/web-ui/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@mantle/web-ui/ui/select';
import { FieldHint, hintId } from '@mantle/web-ui/ui/field-hint';
import { apiSend } from '@mantle/web-ui/api-fetch';
import { FormSelect } from './worker-form-select';

export function TtsFields({
  params,
  model,
  provider,
  apiKeyId,
}: {
  params: Record<string, unknown>;
  model: string;
  provider: string;
  apiKeyId: string;
}) {
  // Voice list is provider-dependent.
  //   OpenAI:     static per-model catalog (9 or 13 voices).
  //   ElevenLabs: live /v1/voices query — includes the user's clones.
  //   xAI:        static 5-voice catalog (eve, ara, rex, sal, leo).
  //   Google:     static 30-voice catalog (Kore, Puck, Zephyr, ...).
  // OpenAI is resolved locally from the model catalog; everything
  // else goes through the adapter's voicesForModel via listVoicesAction
  // so the right adapter handles the discovery (live or static).
  const isElevenLabs = provider === 'elevenlabs';
  const providerWithLiveVoices =
    provider === 'elevenlabs' ||
    provider === 'xai' ||
    provider === 'google' ||
    provider === 'openrouter';
  const [liveVoices, setLiveVoices] = useState<Array<{ id: string; description: string }> | null>(
    null,
  );

  useEffect(() => {
    if (providerWithLiveVoices && apiKeyId) {
      // Lazy-fetch the voice list. ElevenLabs queries /v1/voices
      // live (includes clones); xAI/Google return their static
      // catalogs through the adapter's voicesForModel.
      apiSend<{ voices: Array<{ id: string; description: string }>; error: string | null }>(
        '/api/ai-workers/voices',
        'POST',
        { apiKeyId, providerId: provider, modelId: model },
      )
        .then((r) => setLiveVoices(r.voices))
        .catch(() => setLiveVoices(null));
    } else {
      setLiveVoices(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, apiKeyId, model]);

  const availableVoices = providerWithLiveVoices
    ? (liveVoices ?? [])
    : model
      ? voicesForModel(model)
      : (Object.entries(VOICE_DESCRIPTIONS) as Array<[OpenAiVoice, string]>).map(
          ([id, description]) => ({ id, description }),
        );

  // xAI and ElevenLabs both let operators use voice IDs that AREN'T in
  // the preset list — xAI's console generates opaque ids like
  // "69smp8rm" for custom-tuned voices; ElevenLabs returns user-cloned
  // voice ids alongside premades. Other providers (OpenAI, Google)
  // have closed rosters and reject arbitrary ids. We surface an extra
  // "Custom voice ID" input on the two that accept it.
  const supportsCustomVoiceId =
    provider === 'xai' || provider === 'elevenlabs' || provider === 'openrouter';

  // Pick a sensible default voice. Logic per provider:
  //   - If the stored voice matches a preset, use it.
  //   - Else, if the provider accepts custom ids, KEEP the stored
  //     value verbatim (operator typed a custom id; don't clobber it).
  //   - Else, fall back to nova (preferred) or the first available
  //     voice (existing OpenAI-style behaviour).
  const storedVoice = (params.voice as string | undefined) ?? 'nova';
  const presetIds = new Set(availableVoices.map((v) => v.id));
  const validVoice = presetIds.has(storedVoice)
    ? storedVoice
    : supportsCustomVoiceId && storedVoice.length > 0
      ? storedVoice
      : (availableVoices.find((v) => v.id === 'nova')?.id ?? availableVoices[0]?.id ?? storedVoice);

  // Controlled state for the voice field so the dropdown and the
  // custom-id input can stay in sync. Re-seeded when the worker model
  // changes (handled by the useEffect below) so switching to a model
  // with a disjoint voice list doesn't leave the form in a bad state.
  const [voiceValue, setVoiceValue] = useState<string>(validVoice);
  // When availableVoices loads asynchronously (ElevenLabs/xAI/Google
  // live discovery) the validVoice recomputes — sync it into state so
  // the dropdown reflects the freshly-discovered list. Only resync
  // when the chosen voice ISN'T already valid; otherwise typing into
  // the custom input would get stomped on each re-render.
  useEffect(() => {
    if (presetIds.has(voiceValue)) return;
    // For providers that accept custom ids, keep whatever the user
    // typed even if it's not in the preset list.
    if (supportsCustomVoiceId && voiceValue.length > 0) return;
    setVoiceValue(validVoice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, availableVoices.length]);
  const isCustomVoice = voiceValue.length > 0 && !presetIds.has(voiceValue);

  // Style instructions are honoured by gpt-4o-mini-tts; tts-1 and
  // tts-1-hd ignore the field. ElevenLabs has its own steering
  // (voice_settings) which we expose via speed only for now.
  const supportsInstructions = model === 'gpt-4o-mini-tts';

  // Audio-tag hint — the LLM gets these injected into its system
  // prompt at runtime, but the operator should see them here too so
  // they understand what their voice replies can do. Different
  // providers honour different tag sets; we dispatch on provider.
  const audioTags: readonly AudioTag[] =
    provider === 'elevenlabs'
      ? audioTagsForElevenLabsModel(model)
      : provider === 'xai'
        ? audioTagsForXaiTtsModel(model)
        : provider === 'google'
          ? audioTagsForGoogleTtsModel(model)
          : [];

  // Wrapping speech tags (<whisper>…</whisper>, <soft>, …). Only xAI
  // Grok voice exposes these today; other providers return [].
  const wrappingTags: readonly WrappingTag[] =
    provider === 'xai' ? wrappingTagsForXaiTtsModel(model) : [];

  return (
    <div className="space-y-4">
      <Field>
        <FieldLabel htmlFor="voice">Voice</FieldLabel>
        {/* Hidden input carries the canonical voice value on submit.
            The dropdown and custom-id input both write to `voiceValue`
            — this is what FormData picks up. */}
        <input type="hidden" name="voice" value={voiceValue} />
        <Select
          // No `name` — the hidden input above owns submission. This is just
          // the preset picker UI.
          value={isCustomVoice ? '__custom__' : voiceValue}
          onValueChange={(v) => {
            // The "Custom voice ID" sentinel is a no-op selection — the actual
            // custom value lives in the text input below.
            if (v === '__custom__') return;
            setVoiceValue(v);
          }}
        >
          <SelectTrigger id="voice">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableVoices.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.id} — {v.description}
              </SelectItem>
            ))}
            {supportsCustomVoiceId && (
              <SelectItem value="__custom__">
                {isCustomVoice ? `Custom: ${voiceValue}` : 'Custom voice ID…'}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        {supportsCustomVoiceId && (
          <div className="space-y-1">
            <Input
              id="voice-custom"
              value={isCustomVoice ? voiceValue : ''}
              onChange={(e) => {
                const next = e.target.value.trim();
                if (next.length === 0) {
                  // Cleared — snap back to the first preset so the
                  // dropdown has a meaningful selection again.
                  setVoiceValue(availableVoices[0]?.id ?? '');
                } else {
                  setVoiceValue(next);
                }
              }}
              placeholder={
                provider === 'xai'
                  ? 'Custom voice ID from console.x.ai (e.g. 69smp8rm) — overrides the preset'
                  : 'Custom voice ID from your ElevenLabs library — overrides the preset'
              }
            />
            <p className="text-xs text-muted-foreground">
              {provider === 'xai'
                ? "Use this for voices generated in xAI's voice studio. The console assigns each one an id like 69smp8rm — paste it here to use it from this worker."
                : "Use this for ElevenLabs voices that aren't auto-discovered (e.g. shared voices, IDs from your library)."}
            </p>
          </div>
        )}
        {model && availableVoices.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {availableVoices.length} voice{availableVoices.length === 1 ? '' : 's'}{' '}
            {isElevenLabs
              ? 'available on your ElevenLabs account (includes any clones)'
              : provider === 'xai'
                ? 'available for Grok TTS'
                : provider === 'google'
                  ? 'available for Gemini TTS'
                  : `available for ${model}`}
            {supportsCustomVoiceId ? '; custom ids accepted above.' : '.'}
          </p>
        )}
        {providerWithLiveVoices && !apiKeyId && (
          <p className="text-xs text-warning-ink">
            Pick your{' '}
            {provider === 'elevenlabs' ? 'ElevenLabs' : provider === 'xai' ? 'xAI' : 'Google'} API
            key first; the voice list loads from the adapter.
          </p>
        )}
        {audioTags.length > 0 && (
          <details className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium text-foreground">
              Inline audio tags ({audioTags.length}) — your model honours these
            </summary>
            <div className="mt-2 space-y-1">
              <p className="text-muted-foreground">
                The agent's prompt is auto-augmented with these so it can sprinkle them inline in
                voice replies. Text replies have them stripped automatically.
              </p>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-1 font-mono text-[11px]">
                {audioTags.map((t) => (
                  <li key={t.tag} title={t.description}>
                    {t.tag}{' '}
                    <span className="font-sans text-muted-foreground">— {t.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )}
        {wrappingTags.length > 0 && (
          <details className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium text-foreground">
              Wrapping speech tags ({wrappingTags.length}) — your model honours these
            </summary>
            <div className="mt-2 space-y-1">
              <p className="text-muted-foreground">
                Angle-bracket pairs that style a whole phrase, e.g.{' '}
                <code className="font-mono">&lt;whisper&gt;…&lt;/whisper&gt;</code>. The agent's
                prompt is auto-augmented with these for voice replies; text replies have them
                stripped (the inner words are kept).
              </p>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-1 font-mono text-[11px]">
                {wrappingTags.map((t) => (
                  <li key={t.name} title={t.description}>
                    &lt;{t.name}&gt;…&lt;/{t.name}&gt;{' '}
                    <span className="font-sans text-muted-foreground">— {t.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="instructions">
          Style instructions {supportsInstructions ? '' : '(unsupported on this model)'}
        </FieldLabel>
        <Input
          id="instructions"
          name="instructions"
          defaultValue={(params.instructions as string) ?? ''}
          placeholder={
            supportsInstructions
              ? 'e.g. "Speak warmly, like an old friend, with a touch of humour."'
              : 'gpt-4o-mini-tts only'
          }
          disabled={!supportsInstructions}
        />
        <p className="text-xs text-muted-foreground">
          {supportsInstructions
            ? 'Steers tone, accent, pacing, emotion. Only the gpt-4o-mini-tts model reads this — older models ignore it.'
            : 'Switch to gpt-4o-mini-tts to use style instructions.'}
        </p>
      </Field>

      {/* Language hint — only the xAI TTS endpoint has a structured
          `language` body field today. Critical for xAI custom voices:
          a clone trained on French audio needs language='fr' to keep
          its accent regardless of the text it's reading. OpenAI and
          ElevenLabs derive language from the text/voice; Google
          biases pronunciation via natural-language phrasing in the
          prompt rather than a structured code. */}
      {provider === 'xai' && (
        <Field>
          <FieldLabel htmlFor="language">Language hint</FieldLabel>
          <Input
            id="language"
            name="language"
            defaultValue={(params.language as string) ?? ''}
            placeholder="BCP-47 (e.g. 'en', 'fr', 'pt-BR') or 'auto' / blank to detect."
          />
          <p className="text-xs text-muted-foreground">
            Required when using a custom voice cloned in a non-English language — set this to the
            voice&apos;s native language (e.g. <code className="font-mono">fr</code> for a French
            clone) so the accent stays in character. Leave blank to let Grok auto-detect.
          </p>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="speed">Speed</FieldLabel>
          <Input
            id="speed"
            name="speed"
            type="number"
            step="0.05"
            min="0.25"
            max="4"
            defaultValue={(params.speed as number) ?? 1.0}
          />
          <p className="text-xs text-muted-foreground">0.25–4.0. Try 0.95 for a touch slower.</p>
        </Field>
        <Field>
          <FieldLabel htmlFor="format">Format</FieldLabel>
          <FormSelect
            id="format"
            name="format"
            defaultValue={(params.format as string) ?? 'opus'}
            describedBy={hintId('format')}
          >
            <SelectItem value="opus">opus (Telegram-native)</SelectItem>
            <SelectItem value="mp3">mp3</SelectItem>
            <SelectItem value="wav">wav</SelectItem>
            <SelectItem value="flac">flac</SelectItem>
          </FormSelect>
          <FieldHint id="format">
            Audio container for the reply. Keep <code className="font-mono">opus</code> for Telegram
            — anything else arrives as a file attachment, not a playable voice note.
          </FieldHint>
        </Field>
      </div>
    </div>
  );
}

export function SttFields({ params }: { params: Record<string, unknown> }) {
  return (
    <div className="space-y-4">
      <Field>
        <FieldLabel htmlFor="language">Language hint (optional)</FieldLabel>
        <Input
          id="language"
          name="language"
          defaultValue={(params.language as string) ?? ''}
          placeholder="e.g. en, af, fr — leave blank for auto-detect"
        />
        <p className="text-xs text-muted-foreground">
          ISO-639-1 code. Whisper auto-detects when blank; set this only if you speak one language
          exclusively and want faster results.
        </p>
      </Field>
      <Field>
        <FieldLabel htmlFor="max_duration_seconds">Max duration (seconds)</FieldLabel>
        <Input
          id="max_duration_seconds"
          name="max_duration_seconds"
          type="number"
          min="10"
          max="3600"
          defaultValue={(params.max_duration_seconds as number) ?? 180}
          className="w-32"
        />
        <p className="text-xs text-muted-foreground">
          Hard cap. Voice notes longer than this are rejected with a polite reply.
        </p>
      </Field>
    </div>
  );
}
