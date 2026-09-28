'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { memberSpace, type SpaceClient } from '@/lib/member-space';

/**
 * Which own space the item view and its editors write to (member logins).
 * A member's Mine is the default, so every member screen reads exactly the
 * routes it always did; the admin's private space (Phase 7) wraps its item
 * view in a provider holding `adminSpace`, and the same editors then save
 * under /api/admin instead.
 */
const SpaceApiContext = createContext<SpaceClient>(memberSpace);

export function SpaceApiProvider({
  client,
  children,
}: {
  client: SpaceClient;
  children: ReactNode;
}) {
  return <SpaceApiContext.Provider value={client}>{children}</SpaceApiContext.Provider>;
}

export function useSpaceApi(): SpaceClient {
  return useContext(SpaceApiContext);
}
