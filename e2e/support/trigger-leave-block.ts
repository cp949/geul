/**
 * 트리거 popup(mention·slash·emoji)이 키보드로 트리거 블록을 떠난 직후의
 * Enter를 확정하지 않는 계약을 검증하는 e2e 공용 헬퍼(G-TST-002).
 */
import type { Page } from "@playwright/test";

/**
 * 트리거 블록을 키보드로 떠나는 키.
 * - `waits`: 이탈 뒤 Enter까지의 대기. 0ms는 이동 키 직후 곧바로 Enter를
 *   보낸다. ProseMirror는 selectionchange를 비동기로 반영해 이 구간의
 *   `state.selection`이 낡다. 150ms는 재읽기가 끝난 뒤다.
 * - `keepsTrigger`: Enter 뒤에도 트리거 블록이 남는지. 범위 선택은 popup이 먼저
 *   닫혔다면 Enter가 범위를 지운다.
 *
 * `Control+Shift+Home`은 캐럿이 아니라 범위를 만든다. anchor는 트리거 블록에
 * 남고 focus만 `alpha`로 간다. 150ms 뒤 Enter는 popup이 닫힌 뒤의 범위 삭제라
 * 이 계약의 대상이 아니다. 0ms만 본다. `Shift+ArrowUp`은 쓰지 않는다. popup이
 * ArrowUp을 하이라이트 이동으로 소비해 선택이 움직이지 않는다.
 *
 * `Home 뒤 ArrowLeft`는 ArrowLeft를 그리드 이동으로 소비하는 popup(emoji)에는
 * 이탈 시나리오가 아니다. 그 popup의 spec은 이 행을 뺀다.
 */
export const LEAVE_KEYS = [
  {
    name: "Control+Home",
    press: ["Control+Home"],
    waits: [0, 150],
    keepsTrigger: true,
  },
  {
    name: "PageUp",
    press: ["PageUp"],
    waits: [0, 150],
    keepsTrigger: true,
  },
  {
    name: "Home 뒤 ArrowLeft",
    press: ["Home", "ArrowLeft"],
    waits: [0, 150],
    keepsTrigger: true,
  },
  {
    name: "Control+Shift+Home",
    press: ["Control+Shift+Home"],
    waits: [0],
    keepsTrigger: false,
  },
] as const;

/** Enter keydown 시점의 상태를 담는 window 속성 이름. */
const ENTER_STATE = "__geulEnterState";

/** Enter keydown 시점의 selection focus 블록(`p`) 텍스트와 picker 열림 여부. */
export type EnterState = { caretBlock: string | null; pickerOpen: boolean };

/**
 * selection focus가 속한 블록(`p`)의 텍스트. 편집기 밖이면 `null`이다. DOM
 * selection을 읽으므로 ProseMirror state가 낡아도 실제 캐럿 위치를 준다.
 */
export const readCaretBlockText = (page: Page) =>
  page.evaluate(() => {
    const node = document.getSelection()?.focusNode;
    const element = node instanceof Element ? node : node?.parentElement;
    return element?.closest("p")?.textContent ?? null;
  });

/**
 * Enter keydown 시점의 상태를 `window`에 남긴다. 문서 capture 단계라 편집기와
 * picker의 핸들러보다 먼저 읽는다. `pickerSelector`는 picker 루트의 CSS
 * 선택자다.
 */
export const recordEnterState = (page: Page, pickerSelector: string) =>
  page.evaluate(
    ({ name, selector }) => {
      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key !== "Enter") return;
          const node = document.getSelection()?.focusNode;
          const element = node instanceof Element ? node : node?.parentElement;
          const state: EnterState = {
            caretBlock: element?.closest("p")?.textContent ?? null,
            pickerOpen: document.querySelector(selector) !== null,
          };
          (window as unknown as Record<string, unknown>)[name] = state;
        },
        true,
      );
    },
    { name: ENTER_STATE, selector: pickerSelector },
  );

/** `recordEnterState`가 남긴 마지막 Enter 상태. Enter가 없었으면 `null`이다. */
export const readEnterState = (page: Page) =>
  page.evaluate(
    (name) =>
      ((window as unknown as Record<string, unknown>)[name] ??
        null) as EnterState | null,
    ENTER_STATE,
  );

/**
 * 이동 키를 누른 직후 ProseMirror가 DOM selection을 낡은 state로 되돌리는
 * 경합이 약 1%에서 난다(실측: Home keyup 때 `alpha`였던 selection이 Enter keydown
 * 전에 트리거 블록으로 돌아온다). 그때 캐럿은 실제로 트리거 블록에 있어 popup이
 * 막을 수 없다. 이동이 유지된 시도만 판정하고 되돌려졌으면 장면을 다시 만든다.
 */
export const MAX_LEAVE_ATTEMPTS = 5;
