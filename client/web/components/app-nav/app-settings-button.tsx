'use client';

import { Settings2 } from 'lucide-react';
import type { AppDetail } from '@mantle/client-types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@mantle/web-ui/ui/dialog';
import { hasAppSettings } from '@/lib/app-settings';
import { HeaderIconButton } from './app-item-header';
import { AppInformationalSwitch } from './app-informational-switch';
import { AppTrustToolsSwitch } from './app-trust-tools-switch';

/**
 * The admin's switches on an app (Informational, Trust its tools), behind
 * one icon-only button in the app header, so the header stays one row. MCP
 * access and each workspace's Write are in the Access panel (W5b2). A dialog, not a popover: Trust its tools asks to confirm
 * in a dialog of its own, which a popover would close under it. Nothing
 * when the app has none of them to show.
 */
export function AppSettingsButton({ app }: { app: AppDetail }) {
  if (!hasAppSettings(app)) return null;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <HeaderIconButton label="App settings" tooltip="App settings: its data and tools">
          <Settings2 />
        </HeaderIconButton>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>App settings</DialogTitle>
          <DialogDescription>Who changes its data, and how far its tools go.</DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-border">
          <AppInformationalSwitch app={app} />
          <AppTrustToolsSwitch app={app} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
