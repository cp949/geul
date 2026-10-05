/**
 * StaticToolbar e2e가 공용으로 쓰는 캐럿·범위 선택 헬퍼(G-TST-002, G-EDT-002).
 *
 * 클릭이나 선택 직후 바로 키를 보내면 편집기가 이전 selection으로 처리한다.
 * 이 모듈이 그 경합을 피하는 기법과 이유를 단독 소유한다.
 */
import { expect, type Locator, type Page } from "@playwright/test";

import { placeCaretIn } from "./static-toolbar-sample.js";
import { yieldFrame } from "./yield-frame.js";

/** showcase `/examples/static-toolbar`의 3번 문단 초기 텍스트. */
export const BLOCK_TEXT = "문단 3. 아래로 스크롤해도 위 툴바는 그대로 보인다.";
/** `selectRange`가 잡는 3번 문단 앞 3글자. */
export const RANGE_TEXT = BLOCK_TEXT.slice(0, 3);

/** DOM selection의 텍스트를 읽는다. selection이 편집기 밖이면 null이다. */
export const editorSelectionText = (editorInput: Locator) =>
  editorInput.evaluate((element) => {
    const selection = element.ownerDocument.getSelection();
    const anchor = selection?.anchorNode ?? null;
    if (selection === null || anchor === null || !element.contains(anchor)) {
      return null;
    }
    return selection.toString();
  });

/**
 * DOM 캐럿 앞쪽의 문단 텍스트를 읽는다. selection이 범위이거나 문단 밖이면
 * null이다.
 */
export const textBeforeCaret = (block: Locator) =>
  block.evaluate((element) => {
    const selection = element.ownerDocument.getSelection();
    if (selection === null || selection.rangeCount === 0) return null;
    const caret = selection.getRangeAt(0);
    if (!caret.collapsed || !element.contains(caret.startContainer)) {
      return null;
    }
    const before = element.ownerDocument.createRange();
    before.selectNodeContents(element);
    before.setEnd(caret.startContainer, caret.startOffset);
    return before.toString();
  });

/**
 * 문단을 클릭하고 캐럿을 문단 끝에 둔다. `blockText`는 문단 전체 텍스트다.
 *
 * 클릭 직후 바로 키를 보내지 않는다(G-EDT-002). 프레임 양보만으로는
 * 부족하다.
 * - 병렬 부하(`--repeat-each=10 --workers=5`)에서 Home·End 이동이 사라지고
 *   캐럿이 클릭 위치에 남는 실행이 있었다(120회 중 4회).
 * - 가설: ProseMirror의 focus 핸들러가 원인이다. 첫 포커스 20ms 뒤 DOM
 *   selection이 자기 기록과 다르면 편집기 상태의 selection을 DOM에 다시
 *   쓴다(prosemirror-view 1.42.3). 키가 옮긴 selection을 편집기가 읽기
 *   전에 그 타이머가 돌면 이동이 사라진다.
 * - 고정 대기 대신 캐럿 위치를 확인하고 다시 시도한다. 양보 뒤 확인이라
 *   통과 시점에는 편집기 상태도 같은 selection이다.
 */
export const placeCaretAtEnd = async (
  page: Page,
  block: Locator,
  blockText: string,
) => {
  await block.click();
  await yieldFrame(page);
  await expect(async () => {
    await page.keyboard.press("End");
    await yieldFrame(page);
    expect(await textBeforeCaret(block)).toBe(blockText);
  }).toPass();
};

/**
 * target을 클릭해 캐럿을 두고 DOM selection이 target 안일 때까지 다시 시도한다.
 *
 * - firefox·webkit에서 첫 클릭 캐럿이 문서 시작에 남는 실행이 있었다(16회 중
 *   4회, Issue #261).
 * - `placeCaretAtEnd`의 End 재시도로는 못 잡는다. 캐럿이 대상 밖이면 End가
 *   다른 블록 끝으로 간다. 그래서 클릭부터 다시 한다.
 */
export const placeCaretInsideOf = async (page: Page, target: Locator) => {
  await expect(async () => {
    await placeCaretIn(page, target);
    expect(
      await target.evaluate((element) =>
        element.contains(getSelection()?.anchorNode ?? null),
      ),
    ).toBe(true);
  }).toPass();
};

/**
 * 문단 앞 `rangeText.length`글자를 범위로 잡는다. `rangeText`는 문단 앞부분
 * 텍스트다. `placeCaretAtEnd`와 같은 이유로 DOM selection을 확인하고 다시
 * 시도한다. Home이 범위를 접어 재시도가 안전하다.
 */
export const selectRange = async (
  page: Page,
  block: Locator,
  editorInput: Locator,
  rangeText: string,
) => {
  await block.click();
  await yieldFrame(page);
  await expect(async () => {
    await page.keyboard.press("Home");
    await yieldFrame(page);
    for (let i = 0; i < rangeText.length; i += 1) {
      await page.keyboard.press("Shift+ArrowRight");
    }
    await yieldFrame(page);
    expect(await editorSelectionText(editorInput)).toBe(rangeText);
  }).toPass();
};

/**
 * 샘플의 첫 구분선을 클릭해 NodeSelection을 만든다. 구분선 선택은 블록
 * 컨트롤의 대상 블록이 없는 상태다(`getSelectionBlocks()`가 `[]`라
 * blockSelection·multiBlockSelection이 모두 null). 클릭이 툴바 상태에
 * 반영돼 블록 타입 트리거가 비활성이 될 때까지 기다린다. 여러 블록 선택은
 * 블록 타입 대상이라 이 상태를 대신 만들지 못한다.
 */
export const selectFirstDivider = async (page: Page, editable: Locator) => {
  await editable.locator("hr").first().click();
  await expect(
    page.getByRole("button", { name: "Block type" }),
  ).toHaveAttribute("aria-disabled", "true");
};
