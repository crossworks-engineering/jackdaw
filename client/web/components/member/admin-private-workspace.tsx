'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Brain, Lock, Plus, Search, Upload } from 'lucide-react';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { Input } from '@mantle/web-ui/ui/input';
import { ListCard, ListCardMeta, ListCardTitle } from '@mantle/web-ui/ui/list-card';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { ToggleGroup, ToggleGroupItem } from '@mantle/web-ui/ui/toggle-group';
import { useToast } from '@mantle/web-ui/ui/toast';
import useMediaQuery from '@mantle/web-ui/hooks/use-media-query';
import { ListPager } from '@mantle/web-ui/layout/list-pager';
import { SetPageTitle } from '@/components/layout/page-title';
import {
  brainViewHref,
  createPrivateItem,
  isPrivateView,
  privateViewHref,
  uploadPrivateFile,
} from '@/lib/admin-private';
import { MEMBER_KIND } from '@/lib/member-kinds';
import { adminSpace, type AdminSpaceList, type SpaceKind } from '@/lib/member-space';
import { MineItem } from './mine-item';
import { SpaceApiProvider } from './space-api';
import { spaceErrorMessage } from './space-status';
import { useIsAdmin } from './viewer-role';

export const ADMIN_SPACE_LIST_KEY = 'admin-space-list';

/**
 * Brain or Private, beside an admin's list (member logins Phase 7): the
 * brain's items as they always were, or the admin's own private items. The
 * choice lives in the URL (`?space=private`), so a link opens either.
 */
export function SpaceSwitch({ kind, value }: { kind: SpaceKind; value: 'brain' | 'private' }) {
  const router = useRouter();
  // Only an admin has a private space: nobody else (a member, a client, a
  // role not known yet) sees the switch.
  if (!useIsAdmin()) return null;
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={1}
      value={value}
      onValueChange={(v) => {
        if (!v || v === value) return;
        router.push(v === 'private' ? privateViewHref(kind) : brainViewHref(kind));
      }}
      aria-label="Whose items"
      className="grid w-full grid-cols-2"
    >
      <ToggleGroupItem value="brain" className="gap-1 text-xs">
        <Brain className="size-3" aria-hidden /> Brain
      </ToggleGroupItem>
      <ToggleGroupItem value="private" className="gap-1 text-xs">
        <Lock className="size-3" aria-hidden /> Private
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

/**
 * An admin's screen for one kind: the owner screen (`children`), or the
 * Private view when the URL asks for it. Mounted inside RoleSwitch's admin
 * branch, so a member never reaches it.
 */
export function AdminSpaces({ kind, children }: { kind: SpaceKind; children: ReactNode }) {
  const params = useSearchParams();
  return isPrivateView(params) ? <AdminPrivateWorkspace kind={kind} /> : <>{children}</>;
}

/**
 * The admin's own private items of one kind (member logins Phase 7): the
 * member workspace's Mine, on the admin routes. Seen by this admin only, so
 * there is no sharing, review, discussion or live stream here; an item goes
 * into the brain by "Accept into brain" in its view. Items the admin took
 * over from the Review queue (audit F07) list here too, "From <member>",
 * and can also be given back.
 */
export function AdminPrivateWorkspace({ kind }: { kind: SpaceKind }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const params = useSearchParams();
  const toast = useToast();
  const qc = useQueryClient();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const selectedId = params.get('id');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const meta = MEMBER_KIND[kind];
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  // The item this screen pushed a history entry for, from no open item:
  // Close then goes Back to the list instead of stacking a second entry.
  const pushedFromList = useRef<string | null>(null);
  const open = useCallback(
    (id: string | null) => {
      const sp = new URLSearchParams(params.toString());
      if (id) sp.set('id', id);
      else sp.delete('id');
      const href = `${pathname}?${sp.toString()}`;
      if (id && id !== selectedId) {
        pushedFromList.current = selectedId ? null : id;
        router.push(href, { scroll: false });
      } else {
        router.replace(href, { scroll: false });
      }
    },
    [params, pathname, router, selectedId],
  );

  const list = useQuery({
    queryKey: [ADMIN_SPACE_LIST_KEY, kind, { q, page }],
    queryFn: () => apiFetch<AdminSpaceList>(adminSpace.listPath({ kind, q, page })),
    placeholderData: (prev) => prev,
  });

  const create = async () => {
    if (kind === 'file') return;
    setBusy(true);
    try {
      const href = await createPrivateItem(kind, { title: '' });
      void qc.invalidateQueries({ queryKey: [ADMIN_SPACE_LIST_KEY] });
      router.push(href, { scroll: false });
    } catch (err) {
      toast.error(spaceErrorMessage(err, `Could not create the ${meta.one}.`));
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const href = await uploadPrivateFile(file);
      void qc.invalidateQueries({ queryKey: [ADMIN_SPACE_LIST_KEY] });
      router.push(href, { scroll: false });
      toast.success('Uploaded to your private files.');
    } catch (err) {
      toast.error(
        spaceErrorMessage(
          err,
          err instanceof Error && err.message ? err.message : 'Could not upload the file.',
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const data = list.data;
  const listPane = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <SpaceSwitch kind={kind} value="private" />
          </div>
          {meta.create ? (
            <Button
              size="icon-sm"
              aria-label={`New private ${meta.one}`}
              title={`New private ${meta.one}`}
              disabled={busy}
              onClick={() => void create()}
            >
              <Plus />
            </Button>
          ) : null}
          {meta.upload ? (
            <>
              <Button
                size="icon-sm"
                aria-label="Upload a private file"
                title="Upload a private file"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                <Upload />
              </Button>
              <input
                ref={fileInput}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void upload(f);
                }}
              />
            </>
          ) : null}
        </div>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder={`Search private ${meta.many}…`}
            aria-label={`Search private ${meta.many}`}
            className="pl-8"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin">
        {!data ? (
          <p className="text-sm text-muted-foreground">
            {list.isError ? 'Could not load the list.' : 'Loading…'}
          </p>
        ) : data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {q.trim()
              ? 'Nothing matches that search.'
              : `You have no private ${meta.many}. Only you would see them, until you accept one into the brain.`}
          </p>
        ) : (
          <ul className="space-y-2">
            {data.items.map((row) => (
              <li key={row.id}>
                <ListCard selected={row.id === selectedId} onClick={() => open(row.id)}>
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-px size-4 shrink-0 text-center text-sm leading-5"
                      aria-hidden
                    >
                      {row.icon ?? meta.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <ListCardTitle className="min-w-0">{row.title || 'Untitled'}</ListCardTitle>
                      <ListCardMeta>
                        {row.takenFrom ? `From ${row.takenFrom.name} · ` : null}
                        Updated {new Date(row.updatedAt).toLocaleDateString()}
                      </ListCardMeta>
                    </div>
                  </div>
                </ListCard>
              </li>
            ))}
          </ul>
        )}
      </div>
      {data ? (
        <ListPager
          page={data.page}
          total={data.total}
          pageSize={data.pageSize}
          pending={list.isFetching}
          onGo={setPage}
        />
      ) : null}
    </div>
  );

  const close = () => {
    if (selectedId && pushedFromList.current === selectedId) {
      pushedFromList.current = null;
      router.back();
    } else {
      open(null);
    }
  };
  const detailPane = selectedId ? (
    <SpaceApiProvider client={adminSpace}>
      <MineItem id={selectedId} onClose={close} />
    </SpaceApiProvider>
  ) : (
    <div className="flex h-full items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">
        {meta.create
          ? `Pick a private ${meta.one}, or start a new one with +.`
          : `Pick a private ${meta.one}, or upload one.`}
      </p>
    </div>
  );

  return (
    <>
      <SetPageTitle title={meta.title} />
      {isDesktop === false ? (
        <div className="relative h-full min-h-0">{selectedId ? detailPane : listPane}</div>
      ) : (
        <MasterDetail id={`admin-private-${kind}`} list={listPane} detail={detailPane} />
      )}
    </>
  );
}
