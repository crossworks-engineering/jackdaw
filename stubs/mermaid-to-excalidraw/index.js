// Jackdaw does not support Mermaid. The canvas is mounted with
// `aiEnabled={false}` (client/web/components/draw/excalidraw-canvas.tsx), which
// removes every entry point Excalidraw has to this package: the "Text to
// diagram" menu item, both command-palette commands, and the diagram-to-code
// plugin. Excalidraw still carries a dynamic `import()` of this module on that
// now-unreachable path, so a stub — rather than nothing — is what keeps the
// bundle graph resolvable while the real dependency stays out of the tree.
//
// If this ever throws, an entry point came back: re-check `aiEnabled` before
// reaching for the real package.
const gone = () => {
  throw new Error('Mermaid support was removed from Jackdaw (see stubs/mermaid-to-excalidraw).');
};

export const parseMermaidToExcalidraw = gone;
export default { parseMermaidToExcalidraw: gone };
