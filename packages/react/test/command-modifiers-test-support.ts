/**
 * 수식 키 keydown 테스트가 공용으로 쓰는 입력 목록(G-TST-002).
 */

/** Ctrl·Alt·Meta 수식 키를 KeyboardEvent init 필드와 짝지은 목록. Shift는 넣지 않는다. */
export const COMMAND_MODIFIERS = [
  { name: "Control", init: { ctrlKey: true } },
  { name: "Alt", init: { altKey: true } },
  { name: "Meta", init: { metaKey: true } },
] as const;
