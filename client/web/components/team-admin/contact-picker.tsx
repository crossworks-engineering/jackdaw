'use client';

/**
 * Pick a contact in a dialog (Add client, Invite): a search box with up to six
 * matches, or the picked contact with Change. Used by both so a login made
 * for a contact takes its email and name, and keeps the link to it (a member
 * invited from a contact shows the contact's old portal chat in its Chat).
 */
import { useQuery } from '@tanstack/react-query';
import type { ContactRow } from '@mantle/content-core/contacts-format';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { Input } from '@mantle/web-ui/ui/input';
import { RowButton } from '@mantle/web-ui/ui/row-button';
import { useState } from 'react';

import type { PickedContact } from '../../lib/member-invites';

export type { PickedContact };

type ContactsPage = { contacts: ContactRow[] };

export function contactLabel(c: ContactRow): string {
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.company || c.email || 'Contact';
}

export function ContactPicker({
  id,
  hintId,
  enabled,
  contact,
  onChange,
}: {
  /** The search input's id (the field's label points at it). */
  id: string;
  hintId: string;
  /** Search only while the dialog is open. */
  enabled: boolean;
  contact: PickedContact | null;
  onChange: (contact: PickedContact | null) => void;
}) {
  const [query, setQuery] = useState('');
  const term = query.trim();
  const contacts = useQuery({
    queryKey: ['contacts', { q: term, page: 1 }],
    queryFn: () => apiFetch<ContactsPage>(`/api/contacts?q=${encodeURIComponent(term)}`),
    enabled: enabled && !contact && term.length >= 2,
  });

  if (contact) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-input px-3 py-2 text-sm">
        <span className="min-w-0 truncate">
          {contact.name}
          {contact.email ? <span className="text-muted-foreground"> · {contact.email}</span> : null}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
          Change
        </Button>
      </div>
    );
  }
  const matches = contacts.data?.contacts.slice(0, 6) ?? [];
  return (
    <>
      <Input
        id={id}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search contacts"
        autoComplete="off"
        aria-describedby={hintId}
      />
      {matches.length ? (
        <ul className="max-h-48 overflow-y-auto rounded-md border border-border scrollbar-thin">
          {matches.map((c) => (
            <li key={c.id}>
              <RowButton
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
                onClick={() => {
                  onChange({ id: c.id, name: contactLabel(c), email: c.email || null });
                  setQuery('');
                }}
              >
                <span className="min-w-0 truncate">{contactLabel(c)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {c.email || 'no email'}
                </span>
              </RowButton>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
