'use client';

/**
 * One sample typed decision through the saved decider worker. Goes straight
 * to the adapter on the server (not through the use switches), so it works
 * while the worker and every use are still off: it checks the key, the model
 * id and the endpoint. The sample carries nothing of the owner's; the text
 * box lets the operator try their own line.
 */
import { useState, useTransition } from 'react';
import { Loader2, Scale } from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
import { Field, FieldLabel } from '@mantle/web-ui/ui/field';
import { Textarea } from '@mantle/web-ui/ui/textarea';
import { useToast } from '@mantle/web-ui/ui/toast';
import { apiSend } from '@mantle/web-ui/api-fetch';

type Answer =
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: 'score'; score: number; confidence: number; probabilities: Record<string, number> }
  | { type: 'noul'; probability: number };

export function DecisionTestButton({ workerId }: { workerId: string }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(
    'My checkout page shows a blank screen after I click Pay. I have tried two browsers.',
  );
  const [result, setResult] = useState<{
    model: string;
    adapter: string;
    ms: number;
    tokensIn: number | null;
    costUsd: number | null;
    answers: Record<string, Answer>;
  } | null>(null);

  const run = () => {
    startTransition(async () => {
      try {
        const r = await apiSend<{
          ok: true;
          model: string;
          adapter: string;
          ms: number;
          tokensIn: number | null;
          costUsd: number | null;
          answers: Record<string, Answer>;
        }>(`/api/ai-workers/${workerId}/test/decision`, 'POST', { text: text.trim() });
        setResult(r);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const fmt = (a: Answer | undefined): string => {
    if (!a) return 'no answer';
    if (a.type === 'noul') return `yes with probability ${a.probability.toFixed(2)}`;
    if (a.type === 'choice') return `${a.choice} (confidence ${a.confidence.toFixed(2)})`;
    return `score ${a.score.toFixed(2)} (confidence ${a.confidence.toFixed(2)})`;
  };

  return (
    <div className="space-y-3">
      <Field>
        <FieldLabel htmlFor="decision-test-text">Sample message</FieldLabel>
        <Textarea
          id="decision-test-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="min-h-[80px]"
        />
      </Field>
      <div>
        <Button type="button" onClick={run} disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="animate-spin" />
              Deciding…
            </>
          ) : (
            <>
              <Scale />
              Decide
            </>
          )}
        </Button>
      </div>
      {result && (
        <div className="space-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
          <p>
            <span className="font-medium">team:</span> {fmt(result.answers.team)} ·{' '}
            <span className="font-medium">urgency:</span> {fmt(result.answers.urgency)} ·{' '}
            <span className="font-medium">is a bug:</span> {fmt(result.answers.is_bug)}
          </p>
          <p className="text-muted-foreground">
            adapter: {result.adapter} · model: {result.model} · {result.ms} ms
            {result.tokensIn != null && ` · ${result.tokensIn} input tokens`}
            {result.costUsd != null && ` · $${result.costUsd.toFixed(6)}`}
          </p>
        </div>
      )}
    </div>
  );
}
