'use client';

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  RecallMapDetailDTO,
  RecallWarningDTO,
  RecallWriteResultDTO,
} from '@mantle/web-ui/types/recall-v2';
import { useToast } from '@mantle/web-ui/ui/toast';
import { isStale, recallKeys, writeErrorText } from '@/lib/recall-v2';

/**
 * Every write to a native map goes through here, because every write has the
 * same three obligations:
 *
 * 1. Send the map's CURRENT version. It is read from the cache at call time,
 *    not captured at render, so two quick writes in a row do not send the
 *    same version twice and refuse each other.
 * 2. Carry the version the brain answers with into the cache straight away,
 *    for the same reason, then refresh the catalog, the map and its log.
 * 3. On a stale version (another tab, or an agent: v2 serves an agent's card
 *    edit at once), reload the map and say so. Never retry: the owner has to
 *    see what changed before re-applying.
 *
 * `warnings` holds the last write's advisory warnings (an orphan card, an
 * entry card with no options). They never block; the editor shows them.
 */
export function useMapWrite(mapId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [warnings, setWarnings] = useState<RecallWarningDTO[]>([]);

  const currentVersion = useCallback((): number | null => {
    return qc.getQueryData<RecallMapDetailDTO>(recallKeys.map(mapId))?.version ?? null;
  }, [qc, mapId]);

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: recallKeys.maps });
  }, [qc]);

  /** Run one write. Resolves to the result, or null when it was refused (the
   *  refusal has already been shown). `failText` is the fallback line when
   *  the brain sent no sentence of its own. */
  const run = useCallback(
    async <R extends Partial<RecallWriteResultDTO>>(
      write: (version: number) => Promise<R>,
      failText: string,
    ): Promise<R | null> => {
      const version = currentVersion();
      if (version === null) {
        toast.error('This map has not loaded yet.');
        return null;
      }
      setPending(true);
      try {
        const result = await write(version);
        if (typeof result.version === 'number') {
          const v = result.version;
          qc.setQueryData<RecallMapDetailDTO>(recallKeys.map(mapId), (m) =>
            m ? { ...m, version: v } : m,
          );
        }
        setWarnings(result.warnings ?? []);
        refresh();
        return result;
      } catch (err) {
        toast.error(writeErrorText(err, failText));
        if (isStale(err)) refresh();
        return null;
      } finally {
        setPending(false);
      }
    },
    [currentVersion, qc, mapId, refresh, toast],
  );

  return { run, pending, warnings, setWarnings, currentVersion };
}
