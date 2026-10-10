// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { shortcutAction } from '../src/shortcuts';

test('shortcuts recognize physical keys even when Option changes the character', () => {
  for (const [code, action] of [['KeyN', 'new-draft'], ['KeyD', 'toggle-drawing'], ['ArrowUp', 'previous-draft'], ['ArrowDown', 'next-draft']]) {
    expect(shortcutAction(new KeyboardEvent('keydown', { code, key: '˜', altKey: true, shiftKey: true }))).toBe(action);
  }
});
test('ordinary typing, other modifiers, and IME composition remain untouched', () => {
  for (const modifiers of [{}, { altKey: true }, { shiftKey: true }, { altKey: true, shiftKey: true, ctrlKey: true }, { altKey: true, shiftKey: true, metaKey: true }, { altKey: true, shiftKey: true, isComposing: true }]) {
    expect(shortcutAction(new KeyboardEvent('keydown', { code: 'KeyN', ...modifiers }))).toBeUndefined();
  }
  expect(shortcutAction(new KeyboardEvent('keydown', { code: 'KeyA', altKey: true, shiftKey: true }))).toBeUndefined();
});
