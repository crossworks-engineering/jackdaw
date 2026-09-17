# The guided tour

A tour is a scripted walk through the owner UI: a spotlight on one element at
a time and a card beside it saying what that element is, with Next, Back and
Skip. It is a product feature — any deployment can run one — and the public
demo is the first deployment that does.

## Running one

| How | What happens |
|---|---|
| `MANTLE_TOUR=<id>` on the client container | The tour opens by itself, once per browser. A browser that finished or skipped it is not shown it again (`localStorage` key `mantle_tour:<id>`, values `done` / `dismissed`). |
| `?tour=<id>` on any URL | Opens that tour now, finished or not. This is the link for a marketing page, and the way to see it again. |

An id that names no tour in this build opens nothing — never an empty
overlay. The env var is read per request through `/env.js`, like every other
runtime setting, so one client image serves a box with a tour and a box
without.

## Writing one

Tours live in `client/web/lib/tour/tours.ts`. A step names a **route**, an
optional **target**, and what to say:

```ts
{ route: '/pages', target: 'nav:/pages', title: 'Pages', body: '…', side: 'right' }
```

The provider navigates to the route, waits for the target to exist (up to
five seconds — screens arrive when they arrive), scrolls it into view and
spotlights it. A step with no target, or whose target never appears, centres
its card and still says its piece: a tour that stalls is worse than one that
points at nothing for a moment.

Targets are `data-tour` attributes. The shell provides:

| target | element |
|---|---|
| `brand` | the brand block at the top of the rail |
| `profile` | the account menu (appearance and search live under it) |
| `nav:<href>` | every rail item, e.g. `nav:/pages` |
| `help` | the "About this screen" launcher |
| `assistant` | the Assistant launcher |
| `main` | the content area |
| `activity` | the live-activity column |

Add an attribute to a screen's own element when a step needs to point inside
it. Keep values stable: a renamed target is a step that silently stops
pointing.

## Writing rules

Every sentence in a step has to be true of the deployment the tour runs on.
The demo tour says the demo is read-only and that assistant turns are
refused there, rather than inviting the visitor to try something that cannot
work. Two sentences per step; the card is 20rem wide and the visitor is
reading, not studying.

## How it is built

- `client/web/lib/tour/model.ts` — the pure half: types, the auto-start
  decision, what a stored value means, and `placeCard`, which keeps the card
  inside the viewport on whichever side fits. All of it is unit-tested; the
  placement invariant ("never off screen") is the one that matters.
- `client/web/components/tour/tour-provider.tsx` — state, navigation and the
  target search. Starting is decided in an effect after hydration, from the
  URL, the runtime env and this browser's memory, so the server and client
  first renders agree. Storage access is guarded; a browser that blocks site
  data just sees the tour again.
- `client/web/components/tour/tour-overlay.tsx` — the dim (an SVG mask in a
  theme tint, so it darkens a light theme and lightens a dark one), the
  spotlight stroke, and the card. The dim is `pointer-events-none`: the
  highlighted control stays clickable. Keyboard: → / Enter, ←, Esc.

The tour never writes to the API. It is safe behind a read-only edge and on
a brain anyone relies on.
