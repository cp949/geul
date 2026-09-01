/**
 * 체크박스 클릭 UI(decoration widget, RD-001 DELTA-05)를 production
 * EditorController 경계에서 검증한다. marker DOM 렌더링·checked 상태 반영,
 * 클릭 → toggleCheckListItemChecked와 동일한 undo 1회 복원, 우클릭·비대상
 * 블록 무시, selection 불변, 형제·자식 무변경을 다룬다. Slash 메뉴·Turn
 * into는 이 DELTA의 범위 밖이다.
 */
import type { Block } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { contentTextStart } from "./block-test-support.js";
import {
  documentOf,
  editorState,
  mounted,
  okResult,
  paragraphBlock,
  restored,
} from "./editor-controller-support.js";

/** listItemBlock은 ListItemBlockType(bullet/numbered)만 받으므로 여기서 checkListItem 리터럴을 직접 만든다(G-TST-002, check-list-item-commands.test.ts와 동일). */
const checkListItemBlock = (
  id: string,
  text: string,
  checked: boolean,
  children?: Block[],
): Block => ({
  id,
  type: "checkListItem",
  checked,
  content: text === "" ? [] : [{ text }],
  ...(children === undefined ? {} : { children }),
});

/** blockId의 checkListItem marker 위젯 DOM을 찾는다. */
const marker = (editable: HTMLElement, blockId: string): HTMLElement => {
  const found = editable.querySelector<HTMLElement>(
    `[data-be-block-id="${blockId}"] [data-be-check-marker]`,
  );
  if (found === null) throw new Error(`${blockId} marker 조회 실패`);
  return found;
};

/** marker에 좌클릭 mousedown을 실 디스패치한다. */
const clickMarker = (element: HTMLElement, button = 0): void => {
  element.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, cancelable: true, button }),
  );
};

describe("체크박스 클릭 UI(checkListItemMarker)", () => {
  it("checked: false/true 각각 marker를 렌더링하고 data-be-checked·aria-checked가 실제 값과 일치한다", () => {
    const { editable } = mounted(
      documentOf(
        checkListItemBlock("unchecked", "할 일", false),
        checkListItemBlock("checked", "완료", true),
      ),
    );

    const uncheckedMarker = marker(editable, "unchecked");
    expect(uncheckedMarker.getAttribute("data-be-checked")).toBe("false");
    expect(uncheckedMarker.getAttribute("aria-checked")).toBe("false");
    expect(uncheckedMarker.getAttribute("role")).toBe("checkbox");

    const checkedMarker = marker(editable, "checked");
    expect(checkedMarker.getAttribute("data-be-checked")).toBe("true");
    expect(checkedMarker.getAttribute("aria-checked")).toBe("true");
  });

  it("checkListItem이 아닌 블록에는 marker가 없다", () => {
    const { editable } = mounted(documentOf(paragraphBlock("para", "본문")));

    expect(
      editable.querySelector(
        `[data-be-block-id="para"] [data-be-check-marker]`,
      ),
    ).toBeNull();
  });

  it("marker 클릭은 toggleCheckListItemChecked와 동일하게 checked를 반전하고 undo 1회로 복원한다", () => {
    const { editor, editable, tiptap } = mounted(
      documentOf(
        checkListItemBlock("check-1", "본문", false),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    const before = editorState(editor, tiptap);

    clickMarker(marker(editable, "check-1"));

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        checkListItemBlock("check-1", "본문", true),
        paragraphBlock("tail", "꼬리"),
      ),
      revision: 1,
    });

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("우클릭은 checked를 바꾸지 않는다", () => {
    const { editor, editable, tiptap } = mounted(
      documentOf(checkListItemBlock("check-1", "본문", false)),
    );
    const before = editorState(editor, tiptap);

    clickMarker(marker(editable, "check-1"), 2);

    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("클릭 이전 selection이 다른 블록에 있었다면 클릭 뒤에도 그대로 유지된다", () => {
    const { editor, editable, tiptap } = mounted(
      documentOf(
        checkListItemBlock("check-1", "본문", false),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "tail"));
    const selectionBefore = tiptap.state.selection.toJSON();

    clickMarker(marker(editable, "check-1"));

    expect(editor.getDocument().blocks[0]).toEqual({
      id: "check-1",
      type: "checkListItem",
      checked: true,
      content: [{ text: "본문" }],
    });
    expect(tiptap.state.selection.toJSON()).toEqual(selectionBefore);
  });

  it("형제·자식 checkListItem 중 클릭한 항목만 반전하고 나머지는 그대로 둔다", () => {
    const child = checkListItemBlock("child-1", "자식", false);
    const source = checkListItemBlock("check-1", "본문", false, [child]);
    const sibling = checkListItemBlock("sibling-1", "형제", true);
    const { editor, editable } = mounted(
      documentOf(source, sibling, paragraphBlock("tail", "꼬리")),
    );

    clickMarker(marker(editable, "sibling-1"));

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        checkListItemBlock("check-1", "본문", false, [child]),
        checkListItemBlock("sibling-1", "형제", false),
        paragraphBlock("tail", "꼬리"),
      ),
      revision: 1,
    });
  });
});
