# Mermaid removed

Jackdaw does not support Mermaid. Our own Mermaid engine was retired in
2026-08 (the `diagram` node in `client/web/components/page-editor/` is a
read-only legacy stub kept so old pages still open), and this stub removes the
last of it: the Mermaid-to-drawing feature that `@excalidraw/excalidraw`
bundles.

Two halves, both needed:

- **The UI is gone** — the canvas passes `aiEnabled={false}`
  (`client/web/components/draw/excalidraw-canvas.tsx`), which is Excalidraw's
  own prop for it. That removes the "Text to diagram" menu item, the two
  command-palette commands including "Mermaid to Excalidraw", and the
  diagram-to-code plugin.
- **The package is gone** — an override in `pnpm-workspace.yaml` points
  `@excalidraw/mermaid-to-excalidraw` at this directory. Excalidraw reaches it
  through a dynamic `import()`, so hiding the UI alone would still have left
  the real package installed and its ~640 KB lazy chunk emitted.

That subtree was also the repo's largest source of advisories: `mermaid`,
`lodash-es` and `nanoid@4` came in through it and nowhere else, which is why
their overrides could come out when this landed.

To bring Mermaid back, drop the override and the `aiEnabled` prop together.
