import type { KeyboardDefinition } from '../model/types';
import { chocoKey } from './choco-key';

/** 対応キーボード一覧。別のキーボードを追加する場合はここに定義を追加します。 */
export const KEYBOARDS: KeyboardDefinition[] = [chocoKey];

export const getKeyboard = (id: string) => KEYBOARDS.find((k) => k.id === id) ?? KEYBOARDS[0];

export function findKeyboardByDeviceName(name: string): KeyboardDefinition | undefined {
  return KEYBOARDS.find((k) => k.deviceNames.includes(name));
}
