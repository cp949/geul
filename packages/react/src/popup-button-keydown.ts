/**
 * 팝업 루트에 달아 팝업 안 `<button>`의 Enter 반복을 막는다(Issue #248).
 * index.ts에서 내보내지 않는 내부 module이다.
 *
 * 문제는 이렇다.
 * - 버튼은 keydown Enter마다 click을 낸다.
 * - 첫 Enter의 click이 팝업을 닫고 포커스를 편집기로 돌려 보낸다.
 * - 키를 떼기 전의 반복 Enter가 편집기에 닿아 블록을 나눈다.
 *
 * 처리는 `handleMenuKeyDown(event, {})`에 맡긴다.
 * - 첫 Enter는 막지 않는다. 네이티브 click이 난다. 문서 capture 반복 억제를 건다.
 * - IME가 처리한 Enter(`keyCode` 229)는 막는다. click이 나지 않는다(Issue #270).
 * - 반복 Enter는 막는다.
 * - Escape·Tab·화살표는 `false`다. 위임 때문에 기존 처리가 바뀌지 않는다.
 *
 * 팝업 루트에 달면 새 버튼도 구조적으로 덮는다. 버튼마다 달지 않는다.
 * 입력창과 `<a>`는 버튼이 아니라 건드리지 않는다. 입력창은 자기 keydown이
 * `handleMenuKeyDown`을 부른다.
 *
 * 같은 keydown이 항목 핸들러(`MenuItemButton`)와 루트 핸들러에서 두 번 불려도
 * 안전하다. 반복 억제는 문서마다 하나만 걸린다.
 */
import { isElementNode } from "./dom-node.js";
import { type MenuKeyboardEvent, handleMenuKeyDown } from "./menu-keyboard.js";

/** 루트에서 받는 keydown. `target`은 keydown이 실제로 난 요소다. */
export type PopupKeyboardEvent = MenuKeyboardEvent & {
  target: EventTarget | null;
};

/** keydown 대상이 `<button>` 자신이거나 그 안의 자식 요소인지. */
const isInsideButton = (target: EventTarget | null): boolean =>
  isElementNode(target) && target.closest("button") !== null;

/**
 * 팝업 루트의 `onKeyDown`에 단다. 버튼에서 난 keydown을 소비했으면 `true`다.
 * 버튼이 아닌 대상은 `false`이고 아무것도 하지 않는다.
 */
export const handlePopupButtonKeyDown = (
  event: PopupKeyboardEvent,
): boolean => {
  if (!isInsideButton(event.target)) return false;
  return handleMenuKeyDown(event, {});
};
