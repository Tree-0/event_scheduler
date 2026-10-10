export type ShortcutAction = 'new-draft' | 'toggle-drawing' | 'previous-draft' | 'next-draft';
export const SHORTCUTS: Record<string, ShortcutAction> = {
  KeyN: 'new-draft', KeyD: 'toggle-drawing', ArrowUp: 'previous-draft', ArrowDown: 'next-draft',
};
export function shortcutAction(event: KeyboardEvent): ShortcutAction | undefined {
  if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey || event.isComposing) return;
  // Use physical keys: Option on macOS can change event.key to a symbol.
  return SHORTCUTS[event.code];
}
