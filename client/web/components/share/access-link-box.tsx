'use client';

import { Check, Copy, Link2Off } from 'lucide-react';
import type { AccessLevel, AccessLinkView } from '@mantle/client-types';
import { Button } from '@mantle/web-ui/ui/button';
import { Input } from '@mantle/web-ui/ui/input';
// Relative, not '@/': the node test runner renders this (access-link-box.test.ts).
import {
  LEVEL_ORDER,
  OLD_CLIENT_LINK,
  isOldClientLink,
  showsLink,
  takesLink,
} from '../../lib/access-levels';

/**
 * The link part of the Access control. Public is the only level with an open
 * link (client logins C1), so the link box and Copy show there and nowhere
 * else. A client item never gets one: clients sign in to read it. An old
 * link made on it before that (still live until a later phase retires it)
 * is named, never offered to copy, and can be revoked right here (the item
 * stays at Client). `open` is the levels this brain makes a link at: a brain
 * before C1 made one at client too, and there the box shows at Client as it
 * always did.
 */
export function AccessLinkBox({
  level,
  canLower,
  share,
  url,
  copied,
  onCopy,
  open = LEVEL_ORDER.filter(showsLink),
  onRevoke,
}: {
  level: AccessLevel;
  canLower: boolean;
  share: AccessLinkView | null;
  /** The link's absolute address (the server origin's `/s/…`). */
  url: string;
  copied: boolean;
  onCopy: () => void;
  /** The levels this brain makes an open link at (default: public only). */
  open?: readonly AccessLevel[];
  /** Revoke an old client link (it asks first). */
  onRevoke?: () => void;
}) {
  if (!canLower) return null;
  if (isOldClientLink(level) && !takesLink(level, open)) {
    return share ? (
      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">
          {OLD_CLIENT_LINK}. It still opens until it is revoked.
        </p>
        {onRevoke ? (
          <Button size="sm" variant="outline" onClick={onRevoke}>
            <Link2Off aria-hidden />
            Revoke link (stays at Client)
          </Button>
        ) : null}
      </div>
    ) : null;
  }
  if (!takesLink(level, open)) return null;
  return (
    <div className="border-t border-border pt-3">
      {share ? (
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={url}
            className="h-8 text-xs"
            aria-label="Link"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button size="icon-xs" variant="outline" onClick={onCopy} aria-label="Copy link">
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">This item has no link.</p>
      )}
    </div>
  );
}
