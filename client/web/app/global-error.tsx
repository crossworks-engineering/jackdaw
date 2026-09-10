'use client';

/**
 * The boundary of last resort: a throw in the ROOT LAYOUT itself.
 *
 * `app/error.tsx` catches everything inside the layout, which is nearly
 * everything — but it renders INSIDE that layout, so a layout that throws
 * takes the boundary meant to catch it. That case fell through to Next's own
 * blank 500, which is the one screen in the app with no brand, no reference to
 * quote in a report, and no way forward.
 *
 * It has to render its own <html> and <body>: it REPLACES the root layout
 * rather than nesting in it, so nothing the layout normally supplies exists
 * here. That is also why there is no theme, no font and no kit <Button> below
 * — every one of those comes from a provider in the layout that just failed.
 * Plain markup and inline colours are the point, not an oversight: this screen
 * has to render when the styling pipeline is what broke.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // The system stack, because the app's own font is loaded by the
          // layout that is not running.
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          // `color-scheme` lets the browser pick a sane default for form
          // controls and scrollbars in either theme; the two colours below are
          // legible on both of the grounds it produces.
          colorScheme: 'light dark',
        }}
      >
        <main style={{ maxWidth: '28rem', padding: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
            This brain could not start its interface.
          </h1>
          <p
            style={{ fontSize: '0.8125rem', lineHeight: 1.5, margin: '0 0 1.25rem', opacity: 0.7 }}
          >
            Something failed before the page could be built, so nothing on it loaded. Try again — if
            it keeps happening, the reference below matches a line in the server log.
          </p>
          {error.digest ? (
            <p
              style={{
                fontSize: '0.75rem',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                margin: '0 0 1.25rem',
                opacity: 0.6,
              }}
            >
              {error.digest}
            </p>
          ) : null}
          {/* eslint-disable-next-line house/no-raw-form-control -- the kit's
              <Button> is styled from theme tokens set by a provider in the root
              layout, which is precisely what has failed here. A raw button with
              inline styles is the only one that renders on this screen. */}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              font: 'inherit',
              fontSize: '0.8125rem',
              padding: '0.4rem 0.9rem',
              borderRadius: '0.375rem',
              border: '1px solid currentColor',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
              opacity: 0.85,
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
