'use client';

/**
 * Vision, document and image-generation field groups for the worker form.
 *
 * Moved out of worker-form.tsx unchanged (structure pass, phase 1): the
 * components were already standalone and took plain props, they were just
 * living in a 2,507-line file. No signatures changed.
 */
import { Input } from '@mantle/web-ui/ui/input';
import { Checkbox } from '@mantle/web-ui/ui/checkbox';
import { Textarea } from '@mantle/web-ui/ui/textarea';
import { Field, FieldLabel } from '@mantle/web-ui/ui/field';
import { SelectItem } from '@mantle/web-ui/ui/select';
import { FieldHint, hintId } from '@mantle/web-ui/ui/field-hint';
import { FormSelect } from './worker-form-select';

export function VisionFields({
  params,
  systemPrompt,
}: {
  params: Record<string, unknown>;
  systemPrompt: string | null | undefined;
}) {
  // Default extraction prompt — verbatim transcription. Picked
  // deliberately for the "photo of handwritten notes" use case: the
  // pipeline does its own structuring downstream (extractor agents),
  // so the vision worker should just be a faithful OCR. Operators
  // who want markdown can override; the placeholder shows the shape.
  const defaultPrompt =
    'Transcribe everything visible in this image verbatim, preserving line breaks and structure. If something is unclear, mark it [unclear]. Output plain text only — do not summarise or comment.';
  return (
    <div className="space-y-4">
      <Field>
        <FieldLabel htmlFor="systemPrompt">System prompt</FieldLabel>
        <Textarea
          id="systemPrompt"
          name="systemPrompt"
          defaultValue={systemPrompt ?? ''}
          rows={3}
          placeholder="You are an OCR engine. Output exactly what's on the page — no commentary."
          className="min-h-[80px]"
        />
        <p className="text-xs text-muted-foreground">
          Optional. Use to nudge the model's behaviour across all calls (e.g. &quot;preserve
          mathematical notation as LaTeX&quot;). Leave blank for plain transcription.
        </p>
      </Field>
      <Field>
        <FieldLabel htmlFor="extraction_prompt">Per-image prompt</FieldLabel>
        <Textarea
          id="extraction_prompt"
          name="extraction_prompt"
          defaultValue={(params.extraction_prompt as string) ?? defaultPrompt}
          rows={3}
          placeholder={defaultPrompt}
          className="min-h-[80px]"
        />
        <p className="text-xs text-muted-foreground">
          Sent alongside each image. The default is verbatim transcription — change it for
          structured-markdown output, summarisation, action-item extraction, etc.
        </p>
      </Field>
      <Field>
        <FieldLabel htmlFor="max_tokens">Max output tokens</FieldLabel>
        <Input
          id="max_tokens"
          name="max_tokens"
          type="number"
          defaultValue={(params.max_tokens as number) ?? 2000}
          className="w-32"
          aria-describedby={hintId('max_tokens')}
        />
        <FieldHint id="max_tokens" warn="Set it short and a dense page stops half-read.">
          Caps cost on long transcripts. 2000 covers ~3 pages of dense handwriting.
        </FieldHint>
      </Field>
    </div>
  );
}

export function DocumentFields({
  params,
  systemPrompt,
}: {
  params: Record<string, unknown>;
  systemPrompt: string | null | undefined;
}) {
  // Default prompt is document/table-aware — the whole PDF is sent natively to
  // the model in one call (Anthropic today, Google next), so it should faithfully
  // transcribe every row, not summarise.
  const defaultPrompt =
    'Transcribe this document in full, verbatim and complete — never summarize, condense, or skip anything. Preserve reading order and line breaks; mark anything illegible as [unclear]. If the content is tabular (an invoice, statement, receipt, or table), reproduce it row by row with columns aligned so every label stays with its value: list every line item, description, quantity, rate, and amount, and include all subtotals, taxes, and totals. A simple aligned-column layout or a basic markdown table is fine.';
  return (
    <div className="space-y-4">
      <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        PDFs are sent <strong>natively</strong> to the model (whole document, real tables) on
        providers that support it — <strong>Anthropic (Claude)</strong> today, Google next. Other
        providers fall back to page-by-page image OCR. If no document worker is set, PDFs use the
        Vision worker.
      </p>
      <Field>
        <FieldLabel htmlFor="systemPrompt">System prompt</FieldLabel>
        <Textarea
          id="systemPrompt"
          name="systemPrompt"
          defaultValue={systemPrompt ?? ''}
          rows={3}
          placeholder="You are a precise document transcriber. Output exactly what's on the page — no commentary."
          className="min-h-[80px]"
        />
        <p className="text-xs text-muted-foreground">
          Optional. Steers behaviour across all calls. Leave blank for plain transcription.
        </p>
      </Field>
      <Field>
        <FieldLabel htmlFor="extraction_prompt">Per-document prompt</FieldLabel>
        <Textarea
          id="extraction_prompt"
          name="extraction_prompt"
          defaultValue={(params.extraction_prompt as string) ?? defaultPrompt}
          rows={5}
          placeholder={defaultPrompt}
          className="min-h-[80px]"
        />
        <p className="text-xs text-muted-foreground">
          Sent alongside the PDF. The default is a faithful, table-aware transcription — ideal for
          invoices and statements.
        </p>
      </Field>
      <Field>
        <FieldLabel htmlFor="max_tokens">Max output tokens</FieldLabel>
        <Input
          id="max_tokens"
          name="max_tokens"
          type="number"
          defaultValue={(params.max_tokens as number) ?? 8000}
          className="w-32"
          aria-describedby={hintId('max_tokens')}
        />
        <FieldHint id="max_tokens">
          The whole document transcribes in one call, so keep this generous — 8000 covers a
          multi-page invoice. Long docs need more than the per-image vision default.
        </FieldHint>
      </Field>
      {/* Was a raw `<input type="checkbox">`: no focus ring and none of the
          theme's states. Radix's own hidden bubble input keeps it submitting
          under the same name (§6d). */}
      <Field orientation="horizontal" className="items-start">
        <Checkbox
          id="prefer_native"
          name="prefer_native"
          defaultChecked={Boolean(params.prefer_native)}
          className="mt-0.5"
        />
        <FieldLabel htmlFor="prefer_native" className="cursor-pointer flex-col items-start gap-0">
          <span className="font-medium">Always read PDFs natively</span>
          <span className="block text-xs font-normal text-muted-foreground">
            Send every PDF to the model, even when it has a text layer — best for tabular docs
            (invoices/statements) whose text layer scrambles columns. Off by default: PDFs with
            clean text use the cheap text path and skip the model.
          </span>
        </FieldLabel>
      </Field>
    </div>
  );
}

export function ImageGenFields({ params }: { params: Record<string, unknown> }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="size">Size</FieldLabel>
          <Input
            id="size"
            name="size"
            defaultValue={(params.size as string) ?? '1024x1024'}
            placeholder="1024x1024"
            aria-describedby={hintId('size')}
          />
          <FieldHint id="size" warn="Larger sizes cost more per image and take longer.">
            Output dimensions. Must be a size the chosen model accepts.
          </FieldHint>
        </Field>
        <Field>
          <FieldLabel htmlFor="quality">Quality</FieldLabel>
          <FormSelect
            id="quality"
            name="quality"
            defaultValue={(params.quality as string) ?? 'standard'}
            describedBy={hintId('quality')}
          >
            <SelectItem value="standard">standard</SelectItem>
            <SelectItem value="hd">hd</SelectItem>
          </FormSelect>
          <FieldHint id="quality" warn="`hd` roughly doubles the per-image price.">
            Detail level the model renders at.
          </FieldHint>
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="style">Style (DALL-E only)</FieldLabel>
        <FormSelect
          id="style"
          name="style"
          defaultValue={(params.style as string) ?? 'natural'}
          describedBy={hintId('style')}
        >
          <SelectItem value="natural">natural</SelectItem>
          <SelectItem value="vivid">vivid</SelectItem>
        </FormSelect>
        <FieldHint id="style">
          <code className="font-mono">vivid</code> pushes for dramatic, saturated images;{' '}
          <code className="font-mono">natural</code> stays closer to the prompt. Ignored by
          non-DALL-E models.
        </FieldHint>
      </Field>
    </div>
  );
}
