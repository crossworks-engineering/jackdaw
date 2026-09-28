'use client';

/**
 * The profile menu's opt-in for browser notifications about work waiting
 * for an admin (Review, Requests). Off until turned on here; only this click
 * makes the browser ask, never an unasked prompt. Per browser. Hidden where
 * it cannot work: the desktop app (it notifies natively) and a browser with
 * no notifications.
 */
import { useEffect, useState } from 'react';
import { Bell, BellOff, Check } from 'lucide-react';
import { DropdownMenuItem } from '@mantle/web-ui/ui/dropdown-menu';
import { useToast } from '@mantle/web-ui/ui/toast';
import {
  browserPermission,
  enableBrowserNotify,
  setBrowserNotify,
  useBrowserNotifyOptIn,
  type NotifyPermission,
} from '@/lib/needs-you-browser-notify';

export function BrowserNotifyItem() {
  const optedIn = useBrowserNotifyOptIn();
  const toast = useToast();
  // Read after mount: the server has no Notification to ask.
  const [permission, setPermission] = useState<NotifyPermission>('unsupported');
  useEffect(() => setPermission(browserPermission()), [optedIn]);

  if (permission === 'unsupported') return null;
  if (permission === 'denied') {
    return (
      <DropdownMenuItem disabled className="text-xs">
        <BellOff className="size-4" /> Notifications blocked by this browser
      </DropdownMenuItem>
    );
  }
  const on = optedIn && permission === 'granted';
  return (
    <DropdownMenuItem
      className="cursor-pointer"
      onSelect={() => {
        if (on) {
          setBrowserNotify(false);
          return;
        }
        void enableBrowserNotify().then((answer) => {
          setPermission(answer);
          if (answer === 'granted') {
            toast.success('This browser will tell you when something waits for review.');
          } else if (answer === 'denied') {
            toast.error('The browser blocked notifications. Allow them in its site settings.');
          }
        });
      }}
    >
      <Bell className="size-4" />
      <span className="flex-1">Notify me in this browser</span>
      {on ? <Check className="size-4" aria-label="On" /> : null}
    </DropdownMenuItem>
  );
}
