'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types';
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { ApiError } from '@mantle/web-ui/api-fetch';
import { useToast } from '@mantle/web-ui/ui/toast';
import { useFlushOnLeave } from '@mantle/web-ui/use-flush-on-leave';
import { ExcalidrawCanvas, type SceneChange } from '@/components/draw/excalidraw-canvas';
import { memberSpace } from '@/lib/member-space';
import type { MemberEditorProps } from './member-editor';
import { spaceErrorMessage } from './space-status';

type ExcalidrawModule = typeof import('@excalidraw/excalidraw');
type Scene = { elements?: OrderedExcalidrawElement[]; appState?: Record<string, unknown> };

// The owner editor's cadence: a sketch fires onChange per stroke.
const DRAFT_DEBOUNCE_MS = 1500;
const DRAFT_MAX_WAIT_MS = 8000;

/** The appState the brain keeps (mirror of the owner editor's pickAppState). */
function pickAppState(appState: AppState): Record<string, unknown> {
  return {
    viewBackgroundColor: appState.viewBackgroundColor,
    ...(appState.gridSize !== undefined ? { gridSize: appState.gridSize } : {}),
    ...(appState.gridModeEnabled !== undefined
      ? { gridModeEnabled: appState.gridModeEnabled }
      : {}),
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    zoom: appState.zoom,
  };
}

/** A personal drawing keeps no images (its routes store no scene files). */
function withoutImages(elements: readonly OrderedExcalidrawElement[]) {
  return elements.filter((el) => el.type !== 'image');
}

/**
 * A member's own drawing (member logins, Phase 2): the owner's Excalidraw
 * canvas on the member routes. The canvas autosaves into the item's draft;
 * Save version publishes the scene with its SVG snapshot (what teammates, the
 * Library views and a reviewer see). No image tool: personal drawings store
 * no scene images yet, and a pasted one is dropped on save with a notice.
 */
export function MemberDrawEditor({
  id,
  draw,
  handleRef,
  onUnsavedChange,
  onSaved,
}: MemberEditorProps & {
  draw: {
    scene: Record<string, unknown>;
    draft: Record<string, unknown> | null;
    draftRev?: number;
  } | null;
}) {
  const toast = useToast();
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const modRef = useRef<ExcalidrawModule | null>(null);
  const sceneRef = useRef<{
    elements: readonly OrderedExcalidrawElement[];
    appState: AppState | null;
    files: BinaryFiles;
  }>({ elements: [], appState: null, files: {} });
  const draftRevRef = useRef(draw?.draftRev ?? 0);
  const committedHashRef = useRef(0);
  const savedHashRef = useRef(0);
  const hasDraftRef = useRef(draw?.draft != null);
  const lastDraftAtRef = useRef(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const conflictRef = useRef(false);
  const imageNoticeRef = useRef(false);

  const report = useCallback(() => {
    const mod = modRef.current;
    if (!mod) return;
    const hash = mod.hashElementsVersion(sceneRef.current.elements);
    onUnsavedChange(hasDraftRef.current || hash !== committedHashRef.current);
  }, [onUnsavedChange]);

  // Load once: restore() the working scene (draft, else the saved version).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const mod = await import('@excalidraw/excalidraw');
      if (cancelled) return;
      modRef.current = mod;
      const working = (draw?.draft ?? draw?.scene ?? {}) as Scene;
      const committed = (draw?.scene ?? {}) as Scene;
      const restored = mod.restore(
        { elements: working.elements ?? [], appState: working.appState ?? {}, files: {} },
        null,
        null,
      );
      sceneRef.current = {
        elements: restored.elements as readonly OrderedExcalidrawElement[],
        appState: null,
        files: {},
      };
      committedHashRef.current = mod.hashElementsVersion(committed.elements ?? []);
      savedHashRef.current = mod.hashElementsVersion(restored.elements);
      setInitialData({
        elements: restored.elements,
        appState: restored.appState,
        scrollToContent: working.appState?.scrollX === undefined,
      });
      report();
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only: MineItem remounts this editor per item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sceneBody = (elements: readonly OrderedExcalidrawElement[]) => {
    const appState = sceneRef.current.appState;
    return { elements, ...(appState ? { appState: pickAppState(appState) } : {}) };
  };

  // Autosave the draft. Serialized: one write at a time holds the etag.
  const runDraft = useCallback(async (): Promise<boolean> => {
    const mod = modRef.current;
    if (!mod || conflictRef.current) return !conflictRef.current;
    const snapshot = sceneRef.current;
    const hash = mod.hashElementsVersion(snapshot.elements);
    if (hash === savedHashRef.current) return true;
    try {
      const res = await memberSpace.draft(id, {
        scene: sceneBody(withoutImages(snapshot.elements)),
        if_rev: draftRevRef.current,
      });
      draftRevRef.current = res.draft_rev;
      savedHashRef.current = hash;
      hasDraftRef.current = true;
      lastDraftAtRef.current = Date.now();
      report();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return false;
      if (
        err instanceof ApiError &&
        err.status === 409 &&
        !(err.body as { reason?: string })?.reason
      ) {
        conflictRef.current = true;
        toast.error('This drawing changed elsewhere. Reload it to keep working.');
      } else {
        toast.error(spaceErrorMessage(err, 'Could not autosave. Check your connection.'));
      }
      return false;
    }
  }, [id, report, toast]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    while (inFlight.current) await inFlight.current;
    const p = runDraft();
    inFlight.current = p;
    try {
      return await p;
    } finally {
      inFlight.current = null;
    }
  }, [runDraft]);

  const saveVersion = useCallback(async (): Promise<boolean> => {
    const mod = modRef.current;
    if (!mod || conflictRef.current) return false;
    if (timer.current) clearTimeout(timer.current);
    while (inFlight.current) await inFlight.current;
    const snapshot = sceneRef.current;
    const hash = mod.hashElementsVersion(snapshot.elements);
    // The saved scene drops deleted elements (they exist for undo only).
    const live = withoutImages(snapshot.elements.filter((el) => !el.isDeleted));
    let svg: string | undefined;
    try {
      const el = await mod.exportToSvg({
        elements: live,
        appState: {
          exportBackground: true,
          exportWithDarkMode: false,
          exportEmbedScene: false,
          ...(snapshot.appState
            ? { viewBackgroundColor: snapshot.appState.viewBackgroundColor }
            : {}),
        },
        files: {},
        // Required: an embeddable left to render becomes a <foreignObject>,
        // which the brain rejects, blanking the snapshot (see the owner editor).
        renderEmbeddables: false,
      });
      svg = el.outerHTML;
    } catch {
      svg = undefined;
    }
    try {
      const saved = await memberSpace.save(id, {
        scene: sceneBody(live),
        ...(svg ? { svg } : {}),
        if_rev: draftRevRef.current,
      });
      if (saved.body.type === 'draw' && saved.body.draw) {
        draftRevRef.current = saved.body.draw.draftRev ?? draftRevRef.current;
      }
      committedHashRef.current = hash;
      savedHashRef.current = hash;
      hasDraftRef.current = false;
      report();
      onSaved();
      if (svg) toast.success('Version saved.');
      else toast.error('Version saved, but the preview could not be made.');
      return true;
    } catch (err) {
      toast.error(spaceErrorMessage(err, 'Could not save the version.'));
      return false;
    }
  }, [id, onSaved, report, toast]);

  useEffect(() => {
    handleRef.current = { flush, saveVersion };
    return () => {
      handleRef.current = null;
    };
  }, [flush, saveVersion, handleRef]);

  const flushRef = useRef(flush);
  flushRef.current = flush;
  useFlushOnLeave(() => void flushRef.current());

  const onChange = useCallback(
    (change: SceneChange) => {
      sceneRef.current = {
        elements: change.elements,
        appState: change.appState,
        files: change.files,
      };
      const mod = modRef.current;
      if (!mod) return;
      if (
        !imageNoticeRef.current &&
        change.elements.some((el) => el.type === 'image' && !el.isDeleted)
      ) {
        imageNoticeRef.current = true;
        toast.error('Images are not kept in your drawings yet. They are left out when it saves.');
      }
      const hash = mod.hashElementsVersion(change.elements);
      report();
      if (hash === savedHashRef.current) return;
      if (timer.current) clearTimeout(timer.current);
      const wait = Date.now() - lastDraftAtRef.current >= DRAFT_MAX_WAIT_MS ? 0 : DRAFT_DEBOUNCE_MS;
      timer.current = setTimeout(() => void flushRef.current(), wait);
    },
    [report, toast],
  );

  return (
    <div className="h-[70vh] min-h-[420px] overflow-hidden rounded-md border border-border">
      {initialData ? (
        <ExcalidrawCanvas initialData={initialData} onChange={onChange} imageTool={false} />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Loading canvas…
        </div>
      )}
    </div>
  );
}
