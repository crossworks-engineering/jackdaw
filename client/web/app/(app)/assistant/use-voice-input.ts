'use client';

import { useCallback, useRef, useState } from 'react';
import { apiFetch } from '@mantle/web-ui/api-fetch';

/**
 * Mic capture → transcript, for the composer.
 *
 * Lifted whole out of `assistant-client.tsx` (structure pass, phase 2). It was
 * two `useState`, two `useRef` and three functions scattered across 900 lines
 * of a component that does a dozen other things, and none of it touches the
 * turn stream — so it is the cluster with the clearest seam in that file.
 *
 * The caller owns what happens to the words: `onTranscript` receives the text
 * and decides where it lands, `onError` receives a message to show. Nothing is
 * auto-sent — see the note on `transcribe`.
 */

/** The four states this can be in, and they are mutually exclusive: the button
 *  is either offering to record, recording, waiting on the transcript, or
 *  unavailable. Two independent booleans could spell "recording AND
 *  transcribing", which the UI has no rendering for. */
export type VoiceStatus = 'idle' | 'recording' | 'transcribing';

/**
 * Which container/codec to ask `MediaRecorder` for.
 *
 * Browsers disagree, and the wrong answer here is not an exception — it is a
 * recording the STT adapter cannot read. webm/opus is the most portable
 * target; plain webm is the fallback; and an empty string means "let the
 * browser choose", which is what Safari needs (it lands on mp4/aac, which the
 * adapters also accept).
 *
 * `isSupported` is injected so this is testable without a browser.
 */
export function pickRecorderMimeType(isSupported: (type: string) => boolean): string {
  if (isSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (isSupported('audio/webm')) return 'audio/webm';
  return '';
}

/** Whether the mic can be reached at all. Browsers hard-block `getUserMedia`
 *  on insecure origins with no fallback, so this is worth saying out loud
 *  rather than letting it surface as a TypeError. */
export function micUnavailableReason(
  mediaDevices: { getUserMedia?: unknown } | undefined,
): string | null {
  if (!mediaDevices?.getUserMedia) return 'Voice input needs a secure (HTTPS) connection.';
  return null;
}

export function useVoiceInput({
  onTranscript,
  onError,
}: {
  onTranscript: (text: string) => void;
  onError: (message: string | undefined) => void;
}) {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const transcribe = useCallback(
    async (blob: Blob) => {
      setStatus('transcribing');
      try {
        const formData = new FormData();
        // The filename hint is consumed by some STT adapters (Whisper sniffs
        // the extension); .webm matches what MediaRecorder emits in most
        // browsers.
        formData.set('audio', blob, 'recording.webm');
        // FormData body: apiFetch (NOT apiSend) so the multipart boundary
        // survives; it still carries the base-URL + bearer and bounces on an
        // auth failure.
        const data = await apiFetch<{ text: string }>('/api/assistant/transcribe', {
          method: 'POST',
          body: formData,
        });
        // The caller drops this into the composer. Deliberately NOT auto-sent:
        // auto-sending would punish mishearings, and MediaRecorder webm is
        // finicky enough that a human should verify before we pay for an LLM
        // round-trip.
        onTranscript(data.text);
      } catch (err) {
        onError(err instanceof Error ? err.message : String(err));
      } finally {
        setStatus('idle');
      }
    },
    [onTranscript, onError],
  );

  const start = useCallback(async () => {
    onError(undefined);
    const unavailable = micUnavailableReason(navigator.mediaDevices);
    if (unavailable) {
      onError(unavailable);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecorderMimeType((t) => MediaRecorder.isTypeSupported(t));
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        // Close the mic immediately so the browser's tab indicator clears the
        // moment recording stops, rather than whenever GC gets to the stream.
        stream.getTracks().forEach((t) => t.stop());
        void transcribe(new Blob(chunksRef.current, { type: mr.mimeType }));
      };
      recorderRef.current = mr;
      mr.start();
      setStatus('recording');
    } catch (err) {
      onError(
        err instanceof Error
          ? `Couldn't access microphone: ${err.message}`
          : 'Microphone access denied',
      );
    }
  }, [onError, transcribe]);

  const stop = useCallback(() => {
    // `onstop` moves us to 'transcribing'; this only closes the recording.
    recorderRef.current?.stop();
    setStatus((s) => (s === 'recording' ? 'idle' : s));
  }, []);

  return {
    status,
    recording: status === 'recording',
    transcribing: status === 'transcribing',
    start,
    stop,
  };
}
