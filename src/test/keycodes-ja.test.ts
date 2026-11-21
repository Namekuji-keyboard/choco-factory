import { describe, expect, it } from 'vitest';
import { KEYCODES, keycodeByName } from '../zmk/keycodes';
import { keycodeDescriptionJa } from '../zmk/keycodes.ja';

describe('キーコードの日本語説明', () => {
  it('すべてのキーコードに日本語の説明がある', () => {
    const missing = KEYCODES.filter((k) => !/[ぁ-んァ-ヶ一-龠]/.test(keycodeDescriptionJa(k))).map((k) => k.names[0]);
    expect(missing).toEqual([]);
  });
  it('代表的なキー', () => {
    const d = (n: string) => keycodeDescriptionJa(keycodeByName(n)!);
    expect(d('LCTRL')).toBe('左 Ctrl キー');
    expect(d('RSHFT')).toBe('右 Shift キー');
    expect(d('LGUI')).toContain('Windows キー');
    expect(d('SPACE')).toBe('スペース');
    expect(d('ENTER')).toContain('Enter');
    expect(d('BSPC')).toContain('Backspace');
    expect(d('DEL')).toContain('Delete');
    expect(d('ESC')).toContain('Escape');
    expect(d('C_VOL_UP')).toBe('音量を上げる');
  });
});
