'use client';

/**
 * The LLM field group for the worker form.
 *
 * Moved out of worker-form.tsx unchanged (structure pass, phase 1): the
 * components were already standalone and took plain props, they were just
 * living in a 2,507-line file. No signatures changed.
 */
import { HUGGINGFACE_ROUTING_POLICIES } from '@mantle/voice-client';
import { Input } from '@mantle/web-ui/ui/input';
import { Checkbox } from '@mantle/web-ui/ui/checkbox';
import { Textarea } from '@mantle/web-ui/ui/textarea';
import { Field, FieldLabel } from '@mantle/web-ui/ui/field';
import { SelectItem } from '@mantle/web-ui/ui/select';
import { FieldHint, hintId } from '@mantle/web-ui/ui/field-hint';
import { FormSelect } from './worker-form-select';

export function LlmWorkerFields({
  params,
  systemPrompt,
  kind,
  provider,
}: {
  params: Record<string, unknown>;
  systemPrompt: string | null | undefined;
  kind: 'reflector' | 'extractor' | 'summarizer' | 'narrator' | 'suggester';
  provider: string;
}) {
  return (
    <div className="space-y-4">
      {kind === 'suggester' && (
        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          The suggester proposes <strong>one follow-up question</strong> after each reply, shown as
          an accept-with-Enter chip above the composer. The{' '}
          <strong>system prompt below is the tuning knob</strong>: steer the tone or focus of the
          question it proposes. It only runs for agents with “Suggest follow-ups” switched on, off
          the turn’s critical path; if it’s slow or fails, no chip appears.
        </p>
      )}
      {kind === 'narrator' && (
        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          The narrator restyles the live “thought trail” into your assistant’s voice. The{' '}
          <strong>system prompt below is the verbosity dial</strong> — tell it to reply with a terse
          phrase, a full sentence, or a short paragraph, and it follows. Raise{' '}
          <strong>Max tokens</strong> if you ask for more words. It runs once per tool step, off the
          turn’s critical path; if it’s slow or fails, the plain grounded line stays.
        </p>
      )}
      <Field>
        <FieldLabel htmlFor="systemPrompt">System prompt</FieldLabel>
        <Textarea
          id="systemPrompt"
          name="systemPrompt"
          defaultValue={systemPrompt ?? ''}
          rows={8}
          placeholder={
            kind === 'narrator'
              ? 'e.g. "Rewrite this status as ONE warm first-person sentence, present tense, ending with an ellipsis…" — blank uses the built-in concise default.'
              : '(default prompt is used if blank)'
          }
          className="min-h-[120px] font-mono"
        />
        <p className="text-xs text-muted-foreground">
          {kind === 'narrator'
            ? 'Leave blank for the built-in concise voice (a short phrase). Write your own to control how much it says.'
            : 'Leave blank to use the built-in default for this worker kind.'}
        </p>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="temperature">Temperature</FieldLabel>
          <Input
            id="temperature"
            name="temperature"
            type="number"
            step="0.05"
            min="0"
            max="2"
            defaultValue={(params.temperature as number) ?? 0.2}
            aria-describedby={hintId('temperature')}
          />
          <FieldHint
            id="temperature"
            warn="Background workers want low — high invites invented detail."
          >
            How much the model improvises. 0.2 keeps it factual.
          </FieldHint>
        </Field>
        <Field>
          <FieldLabel htmlFor="max_tokens">Max tokens</FieldLabel>
          <Input
            id="max_tokens"
            name="max_tokens"
            type="number"
            defaultValue={(params.max_tokens as number) ?? 1500}
            aria-describedby={hintId('max_tokens')}
          />
          <FieldHint id="max_tokens" warn="Too low truncates the output mid-way.">
            Ceiling on each run&apos;s output. 1500 suits a summary or a note.
          </FieldHint>
        </Field>
      </div>
      {kind === 'reflector' && (
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="window_size">Window size (turns)</FieldLabel>
            <Input
              id="window_size"
              name="window_size"
              type="number"
              defaultValue={(params.window_size as number) ?? 50}
              aria-describedby={hintId('window_size')}
            />
            <FieldHint
              id="window_size"
              warn="A wide window makes every run a bigger, pricier prompt."
            >
              How many recent turns the reflector reviews per run.
            </FieldHint>
          </Field>
          <Field>
            <FieldLabel htmlFor="max_notes_per_run">Max notes per run</FieldLabel>
            <Input
              id="max_notes_per_run"
              name="max_notes_per_run"
              type="number"
              defaultValue={(params.max_notes_per_run as number) ?? 10}
              aria-describedby={hintId('max_notes_per_run')}
            />
            <FieldHint id="max_notes_per_run" warn="Raise it and the persona fills with trivia.">
              Ceiling on persona notes written per run. Default 10.
            </FieldHint>
          </Field>
        </div>
      )}
      {kind === 'extractor' && (
        <>
          <Field>
            <FieldLabel htmlFor="target_types">Target node types (comma-separated)</FieldLabel>
            <Input
              id="target_types"
              name="target_types"
              defaultValue={
                Array.isArray(params.target_types)
                  ? (params.target_types as string[]).join(', ')
                  : ''
              }
              placeholder="note, * (* = all non-skip types)"
              aria-describedby={hintId('target_types')}
            />
            <FieldHint id="target_types" warn="`*` means every ingested node gets an LLM pass.">
              Which node types this extractor runs on.
            </FieldHint>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field orientation="horizontal">
              <Checkbox
                id="extract_facts"
                name="extract_facts"
                defaultChecked={params.extract_facts !== false}
              />
              <FieldLabel htmlFor="extract_facts" className="cursor-pointer font-normal">
                Extract facts (vs. summary only)
              </FieldLabel>
            </Field>
            <Field>
              <FieldLabel htmlFor="extract_cost_cap_micro_usd">Cost cap (µUSD per node)</FieldLabel>
              <Input
                id="extract_cost_cap_micro_usd"
                name="extract_cost_cap_micro_usd"
                type="number"
                defaultValue={(params.extract_cost_cap_micro_usd as number | undefined) ?? ''}
                placeholder="blank = no cap"
                aria-describedby={hintId('extract_cost_cap_micro_usd')}
              />
              <FieldHint
                id="extract_cost_cap_micro_usd"
                warn="Blank means a bulk import extracts with no ceiling."
              >
                Spend allowed on a single node before extraction gives up.
              </FieldHint>
            </Field>
            <Field>
              <FieldLabel htmlFor="max_embedded_images_per_doc">
                Embedded images per document
              </FieldLabel>
              <Input
                id="max_embedded_images_per_doc"
                name="max_embedded_images_per_doc"
                type="number"
                min={0}
                defaultValue={(params.max_embedded_images_per_doc as number | undefined) ?? ''}
                placeholder="blank = 30"
                aria-describedby={hintId('max_embedded_images_per_doc')}
              />
              <FieldHint
                id="max_embedded_images_per_doc"
                warn="Every image kept costs one vision call, so a big number across a big corpus is real money."
              >
                Diagrams and screenshots kept per document, in reading order. The default 30 suits a
                mixed corpus; a screenshot-heavy manual needs more or its later figures are dropped.
              </FieldHint>
            </Field>
          </div>
        </>
      )}
      {kind === 'summarizer' && (
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="summarize_threshold">Threshold (turns)</FieldLabel>
            <Input
              id="summarize_threshold"
              name="summarize_threshold"
              type="number"
              defaultValue={(params.summarize_threshold as number) ?? 30}
              aria-describedby={hintId('summarize_threshold')}
            />
            <FieldHint
              id="summarize_threshold"
              warn="Set it low and the summarizer fires constantly."
            >
              Min undigested turns before we attempt a rollup.
            </FieldHint>
          </Field>
          <Field>
            <FieldLabel htmlFor="summarize_batch">Batch (turns)</FieldLabel>
            <Input
              id="summarize_batch"
              name="summarize_batch"
              type="number"
              defaultValue={(params.summarize_batch as number) ?? 20}
              aria-describedby={hintId('summarize_batch')}
            />
            <FieldHint
              id="summarize_batch"
              warn="Fold in too many at once and the digest turns vague."
            >
              Max turns folded per digest.
            </FieldHint>
          </Field>
        </div>
      )}
      {provider === 'huggingface' && (
        <Field>
          <FieldLabel htmlFor="huggingface_routing">HF routing policy</FieldLabel>
          <FormSelect
            id="huggingface_routing"
            name="huggingface_routing"
            defaultValue={(params.huggingface_routing as string) ?? 'fastest'}
          >
            {HUGGINGFACE_ROUTING_POLICIES.map((policy) => (
              <SelectItem key={policy} value={policy}>
                {policy}
                {policy === 'fastest' && ' — lowest latency provider (default)'}
                {policy === 'cheapest' && ' — lowest cost per output token'}
                {policy === 'preferred' && ' — your saved provider preference order'}
              </SelectItem>
            ))}
          </FormSelect>
          <p className="text-xs text-muted-foreground">
            HF's router picks which sub-provider (Cerebras, Groq, Together…) actually serves this
            call. Appended as a suffix to the model id at request time.
          </p>
        </Field>
      )}
    </div>
  );
}
