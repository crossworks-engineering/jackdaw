'use client';

import { useEffect, useState } from 'react';
import {
  Download,
  Eye,
  EyeOff,
  Loader2,
  PencilLine,
  Save,
  SplitSquareHorizontal,
  X,
} from 'lucide-react';
import { describeFile, fileTypeLabel, KIND_TINT } from '@mantle/web-ui/lib/mime-label';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiFetch, apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import { assetUrl } from '@mantle/web-ui/asset-url';
import { Button } from '@mantle/web-ui/ui/button';
import { SubmitButton } from '@mantle/web-ui/ui/submit-button';
import { Input } from '@mantle/web-ui/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@mantle/web-ui/ui/toggle-group';
import { useToast } from '@mantle/web-ui/ui/toast';
import { ShareControl } from '@/components/share-control';

type FileRow = {
  id: string;
  parentPath: string;
  filename: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  isText: boolean;
  summary: string | null;
  indexing: 'full' | 'metadata' | null;
  indexingApplied: 'full' | 'metadata' | null;
  createdAt: string;
  updatedAt: string;
};

type Mode = 'edit' | 'preview' | 'split';

export function FileEditor({
  fileId,
  onClose,
  onSaved,
}: {
  fileId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'loaded'; file: FileRow; content: string }
  >({ kind: 'loading' });
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<Mode>('split');
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const body = await apiFetch<{ file: FileRow; content?: string }>(
          `/api/files/files/${fileId}`,
        );
        if (cancelled) return;
        const content = body.content ?? '';
        setState({ kind: 'loaded', file: body.file, content });
        setDraft(content);
        setDirty(false);
      } catch (err) {
        if (cancelled) return;
        setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const save = async () => {
    if (state.kind !== 'loaded') return;
    setSaving(true);
    try {
      await apiSend(`/api/files/files/${fileId}`, 'PATCH', { content: draft });
      setDirty(false);
      toast.success('Saved');
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const submitRename = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (state.kind !== 'loaded' || !renameDraft.trim()) return;
    setSaving(true);
    try {
      const { file } = await apiSend<{ file: FileRow }>(`/api/files/files/${fileId}`, 'PATCH', {
        rename: renameDraft.trim(),
      });
      setState({ kind: 'loaded', file, content: draft });
      setRenaming(false);
      toast.success('Renamed');
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Rename failed');
    } finally {
      setSaving(false);
    }
  };

  if (state.kind === 'loading') {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-destructive-ink">{state.message}</p>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  const { file } = state;
  const isMarkdown = file.extension === 'md' || file.extension === 'markdown';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-border px-6 py-2">
        {(() => {
          const d = describeFile(file.mimeType, file.filename);
          const Icon = d.icon;
          return <Icon aria-hidden className={`size-4 shrink-0 ${KIND_TINT[d.kind]}`} />;
        })()}
        {renaming ? (
          <form onSubmit={submitRename} className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              className="h-8 w-56"
              placeholder="new-name"
            />
            <span className="text-xs text-muted-foreground">.{file.extension}</span>
            <SubmitButton pending={saving} disabled={!renameDraft.trim()} size="sm">
              Rename
            </SubmitButton>
            <Button type="button" size="sm" variant="outline" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <button
            onClick={() => {
              const stem =
                file.filename.lastIndexOf('.') > 0
                  ? file.filename.slice(0, file.filename.lastIndexOf('.'))
                  : file.filename;
              setRenameDraft(stem);
              setRenaming(true);
            }}
            className="text-sm font-medium hover:underline"
            title="Click to rename (basename only)"
          >
            {file.filename}
          </button>
        )}
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {file.parentPath} · {fileTypeLabel(file.mimeType, file.filename)}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {/* Per-file brain-indexing override. One click flips between
              content-indexed and name-only; the folder chain's mode is
              restored via the files screen ('inherit' lives there — this
              button is the quick per-file escape hatch). */}
          <Button
            variant="ghost"
            size="sm"
            title={
              file.indexing === 'metadata' || file.indexingApplied === 'metadata'
                ? 'Name-only: content not indexed into the brain. Click to index content.'
                : 'Content is indexed into the brain. Click for name-only (store & share without indexing content).'
            }
            onClick={async () => {
              const next =
                file.indexing === 'metadata' || file.indexingApplied === 'metadata'
                  ? 'full'
                  : 'metadata';
              try {
                const { file: updated } = await apiSend<{ file: FileRow }>(
                  `/api/files/files/${fileId}`,
                  'PATCH',
                  { indexing: next },
                );
                setState((prev) => (prev.kind === 'loaded' ? { ...prev, file: updated } : prev));
                toast.success(
                  next === 'metadata'
                    ? 'Name-only — content will be removed from the index'
                    : 'Content indexing queued',
                );
                onSaved();
              } catch (err) {
                toast.error(err instanceof ApiError ? err.message : 'Could not change indexing');
              }
            }}
          >
            {file.indexing === 'metadata' || file.indexingApplied === 'metadata' ? (
              <>
                <EyeOff /> Name-only
              </>
            ) : (
              <>
                <Eye /> Indexed
              </>
            )}
          </Button>
          {isMarkdown && (
            <ToggleGroup
              type="single"
              variant="outline"
              size="default"
              value={mode}
              onValueChange={(v) => v && setMode(v as Mode)}
            >
              <ToggleGroupItem value="edit" aria-label="Edit">
                <PencilLine /> Edit
              </ToggleGroupItem>
              <ToggleGroupItem value="split" aria-label="Split">
                <SplitSquareHorizontal /> Split
              </ToggleGroupItem>
              <ToggleGroupItem value="preview" aria-label="Preview">
                <Eye /> Preview
              </ToggleGroupItem>
            </ToggleGroup>
          )}
          <ShareControl nodeId={file.id} teamMode />
          {/* History link → /nodes/[id]/history: every trace that touched
              this file (ingest, extractor, summarizer, …). */}
          <Button asChild variant="outline" size="sm">
            <a href={`/nodes/${file.id}/history`} title="See what the system did with this file">
              History
            </a>
          </Button>
          <Button asChild variant="outline" size="icon" className="size-9">
            <a
              href={assetUrl(`/api/files/files/${file.id}?raw=1`)}
              download={file.filename}
              title="Download"
            >
              <Download aria-hidden />
            </a>
          </Button>
          {file.isText && (
            <Button size="sm" onClick={save} disabled={!dirty || saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {saving ? 'Saving…' : dirty ? 'Save •' : 'Save'}
            </Button>
          )}
          <Button variant="ghost" size="icon" className="size-9" onClick={onClose} title="Close">
            <X aria-hidden />
          </Button>
        </div>
      </header>

      {/* Body */}
      {file.isText ? (
        <div className="flex flex-1 overflow-hidden">
          {(mode === 'edit' || mode === 'split' || !isMarkdown) && (
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setDirty(e.target.value !== state.content);
              }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                  e.preventDefault();
                  void save();
                }
              }}
              className={
                'h-full resize-none border-0 bg-background p-4 font-mono text-sm focus:outline-none ' +
                (mode === 'split' && isMarkdown ? 'w-1/2 border-r border-border' : 'flex-1')
              }
              spellCheck={file.extension !== 'json'}
            />
          )}
          {isMarkdown && (mode === 'preview' || mode === 'split') && (
            <article
              className={
                'h-full overflow-y-auto p-6 prose prose-sm dark:prose-invert max-w-none ' +
                (mode === 'split' ? 'w-1/2' : 'flex-1')
              }
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft}</ReactMarkdown>
            </article>
          )}
        </div>
      ) : (
        <FilePreviewBody file={file} />
      )}
    </div>
  );
}

/**
 * Inline preview for non-text files. Images (incl. SVG logos), PDFs, video, and
 * audio render from the raw asset route (served `content-disposition: inline`);
 * everything else falls back to a download card. SVG renders via `<img>`, which
 * never executes embedded scripts, so it's safe to show.
 */
function FilePreviewBody({ file }: { file: FileRow }) {
  const src = assetUrl(`/api/files/files/${file.id}?raw=1`);
  const mime = file.mimeType || '';
  const isImage = mime.startsWith('image/');
  const isPdf = mime === 'application/pdf';
  const isVideo = mime.startsWith('video/');
  const isAudio = mime.startsWith('audio/');

  if (isImage) {
    return (
      // Muted backdrop so transparent logos (PNG/SVG) read clearly.
      <div className="flex flex-1 items-center justify-center overflow-auto bg-muted/20 p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={file.filename}
          className="max-h-full max-w-full rounded-md border border-border object-contain"
        />
      </div>
    );
  }
  if (isPdf) {
    return <iframe src={src} title={file.filename} className="w-full flex-1 border-0" />;
  }
  if (isVideo) {
    return (
      <div className="flex flex-1 items-center justify-center bg-black p-6">
        <video src={src} controls className="max-h-full max-w-full" />
      </div>
    );
  }
  if (isAudio) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <audio src={src} controls className="w-full max-w-xl" />
        {file.summary && (
          <p className="max-w-md text-center text-xs italic text-muted-foreground">
            {file.summary}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
      <p>Preview not available for this file type.</p>
      <Button asChild size="sm">
        <a href={src} download={file.filename}>
          <Download /> Download {file.filename}
        </a>
      </Button>
      {file.summary && <p className="max-w-md text-center text-xs italic">{file.summary}</p>}
    </div>
  );
}
