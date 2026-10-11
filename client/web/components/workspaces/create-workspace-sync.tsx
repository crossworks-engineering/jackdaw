'use client';

import { useEffect } from 'react';
import { setPathRewrite } from '@mantle/web-ui/api-fetch';
import { createWsRewrite, setCreateWorkspace } from '@/lib/create-workspace';
import { useListWorkspace } from './use-list-workspace';

/** Holds the switcher's workspace for the create routes (lib/create-workspace.ts)
 *  and has apiFetch name it on every create. Mounted once in the shell;
 *  renders nothing. */
export function CreateWorkspaceSync() {
  const ws = useListWorkspace();
  useEffect(() => {
    setCreateWorkspace(ws);
  }, [ws]);
  useEffect(() => {
    setPathRewrite(createWsRewrite);
    return () => setPathRewrite(null);
  }, []);
  return null;
}
