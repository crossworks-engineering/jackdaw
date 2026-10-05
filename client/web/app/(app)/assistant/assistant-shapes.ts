/**
 * The panel shapes the assistant's "..." menu offers (Jason, 2026-10-05):
 * only the ones you can switch TO. In Side it offers Window and Full; in
 * Window, Side and Full; in Full, Side and Window. The current shape is not a
 * choice, so it is not shown.
 */
import type { AssistantDisplay } from '@/components/assistant/assistant-dock';

export type PanelShape = {
  value: AssistantDisplay;
  /** The menu word. */
  label: string;
  /** The tooltip and accessible name. */
  title: string;
};

/** In the order the menu lists them. */
export const PANEL_SHAPES: readonly PanelShape[] = [
  { value: 'docked', label: 'Side', title: 'Show as a side column' },
  { value: 'popout', label: 'Window', title: 'Show as a movable window' },
  { value: 'full', label: 'Full', title: 'Show as full display' },
];

/** Every shape except the current one. */
export function switchableShapes(current: AssistantDisplay): PanelShape[] {
  return PANEL_SHAPES.filter((s) => s.value !== current);
}
