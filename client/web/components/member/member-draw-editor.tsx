'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types';
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { useToast } from '@mantle/web-ui/ui/toast';
import { ExcalidrawCanvas, type SceneChange } from '@/components/draw/excalidraw-canvas';
import { memberSpace } from '@/lib/member-space';
import type { MemberEditorProps } from './member-editor';
import { useMemberAutosave } from './use-member-autosave';

type ExcalidrawModule = typeof import('@excalidraw/excalidraw');
type Scene = { elements?: OrderedExcalidrawElement[]; appState?: Record<string, unknown> };
/** The working scene the editor holds (what the queue snapshots). */
type Working = {
  elements: readonly OrderedExcalidrawElement[];
  appState: AppState | null;
  files: BinaryFiles;
};
const EMPTY: Working = { elements: [], appState: null, files: {} };

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
  onStatus,
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
  const sceneRef = useRef<Working>(EMPTY);
  const committedHashRef = useRef(0);
  const hasDraftRef = useRef(draw?.draft != null);
  const imageNoticeRef = useRef(false);

  // Snapshot identity: the elements' version hash (appState alone, a pan or a
  // zoom, is not an edit). Before the module loads, every scene is the same.
  const hashOf = useCallback(
    (scene: Working) => String(modRef.current?.hashElementsVersion(scene.elements) ?? 0),
    [],
  );

  const report = useCallback(() => {
    const mod = modRef.current;
    if (!mod) return;
    const hash = mod.hashElementsVersion(sceneRef.current.elements);
    onUnsavedChange(hasDraftRef.current || hash !== committedHashRef.current);
  }, [onUnsavedChange]);

  const sceneBody = (scene: Working, elements: readonly OrderedExcalidrawElement[]) => ({
    elements,
    ...(scene.appState ? { appState: pickAppState(scene.appState) } : {}),
  });

  // Autosave the draft through the shared queue: one write at a time holds
  // the etag, dirty by snapshot, flushed on every way out.
  const queue = useMemberAutosave<Working>({
    id,
    read: () => sceneRef.current,
    saved: EMPTY,
    rev: draw?.draftRev ?? 0,
    send: async (scene, rev) => {
      const res = await memberSpace.draft(id, {
        scene: sceneBody(scene, withoutImages(scene.elements)),
        if_rev: rev,
      });
      return { rev: res.draft_rev };
    },
    debounceMs: DRAFT_DEBOUNCE_MS,
    maxWaitMs: DRAFT_MAX_WAIT_MS,
    keyOf: hashOf,
    onSaved: () => {
      hasDraftRef.current = true;
      report();
    },
    onState: onStatus,
  });

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
      const loaded: Working = {
        elements: restored.elements as readonly OrderedExcalidrawElement[],
        appState: null,
        files: {},
      };
      sceneRef.current = loaded;
      committedHashRef.current = mod.hashElementsVersion(committed.elements ?? []);
      // What the brain holds is what just loaded (the etag is unchanged).
      queue.reset(loaded, queue.rev());
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

  const saveVersion = useCallback(async (): Promise<boolean> => {
    const mod = modRef.current;
    if (!mod) return false;
    let svgMissing = false;
    const res = await queue.commit(async (scene, rev) => {
      // The saved scene drops deleted elements (they exist for undo only).
      const live = withoutImages(scene.elements.filter((el) => !el.isDeleted));
      let svg: string | undefined;
      try {
        const el = await mod.exportToSvg({
          elements: live,
          appState: {
            exportBackground: true,
            exportWithDarkMode: false,
            exportEmbedScene: false,
            ...(scene.appState ? { viewBackgroundColor: scene.appState.viewBackgroundColor } : {}),
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
      svgMissing = !svg;
      const saved = await memberSpace.save(id, {
        scene: sceneBody(scene, live),
        ...(svg ? { svg } : {}),
        if_rev: rev,
      });
      const next =
        saved.body.type === 'draw' && saved.body.draw ? saved.body.draw.draftRev : undefined;
      committedHashRef.current = mod.hashElementsVersion(scene.elements);
      return { rev: next ?? rev };
    });
    if (!res.ok) {
      // A refusal already said its piece through the queue's state.
      if (res.failure.kind === 'network') {
        toast.error('Could not save the version. Check your connection.');
      }
      return false;
    }
    hasDraftRef.current = false;
    report();
    onSaved();
    if (svgMissing) toast.error('Version saved, but the preview could not be made.');
    else toast.success('Version saved.');
    return true;
  }, [id, onSaved, queue, report, toast]);

  useEffect(() => {
    handleRef.current = { flush: () => queue.flush(), saveVersion };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef, queue, saveVersion]);

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
      report();
      // Excalidraw fires onChange for a pan or a selection too: only a new
      // element version is an edit worth a save.
      if (queue.isDirty()) queue.changed();
    },
    [queue, report, toast],
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
