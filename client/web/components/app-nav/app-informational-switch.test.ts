/**
 * The admin's Informational switch on an app (W5b2, contract 36): a flip
 * sends PATCH /api/apps/:id { dataReadOnly } with no confirm (it changes no
 * grant) and loads the app's Access panel again (grantsKey), since whether
 * its Write switches apply changed. The hint says what the state means.
 *
 * No DOM here: the kit's Switch is replaced by one that keeps its
 * onCheckedChange, the switch renders once on the server, and the test
 * flips it by calling that handler.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@mantle/web-ui/ui/toast';
import type { AppDetail } from '@mantle/client-types';
import { APP_INFORMATIONAL_HINT_OFF, APP_INFORMATIONAL_HINT_ON } from '@/lib/app-informational';
import { grantsKey } from '@/lib/grants';

const h = vi.hoisted(() => ({
  flip: null as null | ((v: boolean) => void),
  send: vi.fn(async (..._args: unknown[]) => ({ ok: true })),
}));

vi.mock('@mantle/web-ui/ui/switch', () => ({
  Switch: (props: { checked: boolean; onCheckedChange: (v: boolean) => void }) => {
    h.flip = props.onCheckedChange;
    return createElement('button', { role: 'switch', 'aria-checked': props.checked });
  },
}));

vi.mock('@mantle/web-ui/api-fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mantle/web-ui/api-fetch')>()),
  apiSend: (...args: unknown[]) => h.send(...args),
}));

const { AppInformationalSwitch } = await import('./app-informational-switch');

const app = (dataReadOnly: boolean | undefined) =>
  ({ id: 'app-1', name: 'Orders', dataReadOnly }) as unknown as AppDetail;

function render(a: AppDetail, qc = new QueryClient()) {
  const html = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(ToastProvider, null, createElement(AppInformationalSwitch, { app: a })),
    ),
  );
  return { html, qc };
}

describe('the Informational switch (contract 36)', () => {
  beforeEach(() => {
    h.flip = null;
    h.send.mockClear();
  });

  it('says what each state means', () => {
    expect(render(app(true)).html).toContain(APP_INFORMATIONAL_HINT_ON);
    expect(render(app(false)).html).toContain(APP_INFORMATIONAL_HINT_OFF);
  });

  it('is not shown by a brain that does not know the flag', () => {
    const { html } = render(app(undefined));
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain('Informational');
  });

  it('sends PATCH /api/apps/:id { dataReadOnly } and loads the Access panel again', async () => {
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    render(app(false), qc);
    expect(h.flip).toBeTypeOf('function');
    h.flip!(true);
    await vi.waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: grantsKey('app-1') }),
    );
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send).toHaveBeenCalledWith('/api/apps/app-1', 'PATCH', { dataReadOnly: true });
  });

  it('turning it off sends false, with no confirm first', async () => {
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    render(app(true), qc);
    h.flip!(false);
    await vi.waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: grantsKey('app-1') }),
    );
    expect(h.send).toHaveBeenCalledWith('/api/apps/app-1', 'PATCH', { dataReadOnly: false });
  });
});
