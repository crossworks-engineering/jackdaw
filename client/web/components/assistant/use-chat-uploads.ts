'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ensureChatUploadFolder,
  needsIndexWait,
  uploadChatFile,
  waitUntilIndexed,
} from '@/lib/chat-uploads';
import type { ContextRef } from './assistant-dock';

/** A linked attachment on its way to becoming a context chip. */
export type LinkedUpload = {
  key: string;
  name: string;
  stage: 'uploading' | 'indexing';
};

/**
 * Upload extra chat attachments and link each one to the next turn as context.
 * See lib/chat-uploads for why extra files take this road.
 *
 * `inFlight` drives the composer's progress rows and holds Send back: a turn
 * sent mid-upload would go without the file the user just added.
 */
export function useChatUploads(opts: {
  attachContext: (ref: ContextRef) => void;
  onError: (message: string) => void;
}) {
  const [inFlight, setInFlight] = useState<LinkedUpload[]>([]);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  // Unmount must stop the index wait; an upload already sent simply finishes.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const addLinked = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    const entries = files.map((file, i) => ({
      file,
      key: `${Date.now()}-${i}-${file.name}`,
    }));
    setInFlight((prev) => [
      ...prev,
      ...entries.map((e) => ({ key: e.key, name: e.file.name, stage: 'uploading' as const })),
    ]);
    const drop = (key: string) => setInFlight((prev) => prev.filter((u) => u.key !== key));

    let parentPath: string;
    try {
      parentPath = await ensureChatUploadFolder();
    } catch (err) {
      for (const e of entries) drop(e.key);
      optsRef.current.onError(
        `Could not prepare the chat uploads folder: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    await Promise.all(
      entries.map(async ({ file, key }) => {
        try {
          const row = await uploadChatFile(file, parentPath);
          if (needsIndexWait(file)) {
            setInFlight((prev) =>
              prev.map((u) => (u.key === key ? { ...u, stage: 'indexing' } : u)),
            );
            const indexed = await waitUntilIndexed(row.id, {
              isCancelled: () => !aliveRef.current,
            });
            if (!aliveRef.current) return;
            if (!indexed) {
              optsRef.current.onError(
                `${file.name} is attached, but it is still being indexed, so the assistant may not be able to read it yet.`,
              );
            }
          }
          if (!aliveRef.current) return;
          optsRef.current.attachContext({
            id: row.id,
            kind: 'file',
            label: row.filename || file.name,
          });
        } catch (err) {
          optsRef.current.onError(
            `${file.name} could not be uploaded: ${err instanceof Error ? err.message : String(err)}`,
          );
        } finally {
          drop(key);
        }
      }),
    );
  }, []);

  return { inFlight, addLinked };
}
