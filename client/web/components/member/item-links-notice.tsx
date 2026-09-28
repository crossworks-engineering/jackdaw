'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useQueries } from '@tanstack/react-query';
import { ApiError, apiFetch } from '@mantle/web-ui/api-fetch';
import { privateViewHref } from '@/lib/admin-private';
import { isAdminSpace, memberItemHref, type SpaceClient } from '@/lib/member-space';

/** One item a refusal names, as the notice shows it. */
export type NamedItem = { title: string; href: string | null };

/** How many named items the notice lists before "and N more". */
const SHOWN = 10;

/**
 * An own item, by id, from the space the view writes to: its title and where
 * it opens (Mine for a member, the Private view for an admin).
 */
export function ownItemResolver(api: SpaceClient): (id: string) => Promise<NamedItem> {
  const admin = isAdminSpace(api);
  return async (id) => {
    const { row } = await api.item(id);
    return {
      title: row.title,
      href: admin
        ? privateViewHref(row.type, id)
        : memberItemHref({ source: 'mine', kind: row.type }, id),
    };
  };
}

/**
 * An ADMIN's view of any id a refusal names: their own private item first,
 * else a brain item (which the permalink opens on its own screen).
 */
export function adminItemResolver(api: SpaceClient): (id: string) => Promise<NamedItem> {
  const own = ownItemResolver(api);
  return async (id) => {
    try {
      return await own(id);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) throw err;
      const { node } = await apiFetch<{ node: { title?: string | null } }>(
        `/api/nodes/${encodeURIComponent(id)}`,
      );
      return { title: node.title ?? '', href: `/n/${encodeURIComponent(id)}` };
    }
  };
}

/**
 * A notice that names items a refusal pointed at (the bundle items Submit
 * wants saved first, what a Give back must lose first), each a link to open
 * it. Titles are read one by one; an item that cannot be read still lists.
 */
export function ItemLinksNotice({
  message,
  ids,
  resolve,
  children,
}: {
  message: ReactNode;
  ids: readonly string[];
  resolve: (id: string) => Promise<NamedItem>;
  children?: ReactNode;
}) {
  const shown = ids.slice(0, SHOWN);
  const named = useQueries({
    queries: shown.map((id) => ({
      queryKey: ['named-item', id],
      queryFn: () => resolve(id),
      retry: false,
      staleTime: 30_000,
    })),
  });
  return (
    <div
      role="status"
      className="space-y-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
    >
      <p>{message}</p>
      {shown.length ? (
        <ul className="list-disc space-y-0.5 pl-5">
          {shown.map((id, i) => {
            const item = named[i]?.data;
            const title = item ? item.title || 'Untitled' : named[i]?.isError ? 'An item' : '…';
            return (
              <li key={id} className="truncate">
                {item?.href ? (
                  <Link href={item.href} className="underline underline-offset-4">
                    {title}
                  </Link>
                ) : (
                  title
                )}
              </li>
            );
          })}
          {ids.length > SHOWN ? <li>and {ids.length - SHOWN} more</li> : null}
        </ul>
      ) : null}
      {children}
    </div>
  );
}
