/**
 * 组合识别引擎——纯逻辑，不依赖 Tone/组件。
 * 输入：当前画布上的 blockId 列表。输出：命中的组合与 UI 显示所需的文字。
 */
import type { PlacedBlock } from "../types";
import { COMBINATIONS, COMBO_MAP, comboKeyForIds, type Combination } from "../data/combinations";

export interface ActiveCombo {
  combo: Combination;
  aName: string;
  bName: string;
}

export function presentBlockIds(placed: PlacedBlock[]): Set<string> {
  return new Set(placed.map((p) => p.blockId));
}

/** 找出当前画布上被激活的组合。 */
export function findActiveCombos(placed: PlacedBlock[]): ActiveCombo[] {
  const ids = presentBlockIds(placed);
  const found: ActiveCombo[] = [];
  for (const combo of COMBINATIONS) {
    if (ids.has(combo.a) && ids.has(combo.b)) {
      found.push({ combo, aName: combo.a, bName: combo.b });
    }
  }
  return found;
}

/** 所有「已有其一、加入另一块即可解锁」的提示对。用于「探索更多组合」面板。 */
export function findSuggestiveCombos(
  placed: PlacedBlock[],
  nameForId: (id: string) => string,
): { presentId: string; missingId: string; presentName: string; missingName: string; result: string }[] {
  const ids = presentBlockIds(placed);
  const out: { presentId: string; missingId: string; presentName: string; missingName: string; result: string }[] = [];
  for (const combo of COMBINATIONS) {
    const hasA = ids.has(combo.a);
    const hasB = ids.has(combo.b);
    if (hasA && hasB) continue;
    if (hasA) out.push({ presentId: combo.a, missingId: combo.b, presentName: nameForId(combo.a), missingName: nameForId(combo.b), result: combo.result });
    if (hasB) out.push({ presentId: combo.b, missingId: combo.a, presentName: nameForId(combo.b), missingName: nameForId(combo.a), result: combo.result });
  }
  return out;
}

export function comboKeyFor(aId: string, bId: string): string {
  return comboKeyForIds(aId, bId);
}

export function getComboByPair(aId: string, bId: string): Combination | undefined {
  return COMBO_MAP.get(comboKeyFor(aId, bId));
}
