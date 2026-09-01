/**
 * checkListItem이 bulletListItem/numberedListItem/toggleListItem과 같은
 * "목록 항목류" 편집 UX(빈 블록 placeholder, 빈 항목 Enter 종료, 선두
 * Backspace 종료)를 받는지 검증한다(Issue #38 슬라이스 6 RD-001 DELTA-02).
 * isListItemBlockType(io <ul>/<ol> 직렬화 대상)과 isListEntryBlockType(이
 * 편집 UX 대상)은 의도적으로 다른 집합이지만 checkListItem은 둘 다에
 * 속한다 — placeholder-extension.ts·block-split-extension.ts·
 * block-join-extension.ts 세 곳이 후자를 쓴다. 각 메커니즘(dispatch 원자성,
 * undo, ID·children 보존)의 전면 재검증은 bulletListItem/numberedListItem을
 * 다루는 list-item-presentation.test.ts·list-item-keyboard.test.ts·
 * list-item-join.test.ts가 이미 소유한다 — 이 파일은 checkListItem이 같은
 * 공유 경로를 실제로 타는지, 그리고 checked 고유 동작(중간 split 시 새
 * 항목 checked 리셋)만 다룬다.
 */
import type { Block, Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { dispatchKeydown } from "./block-test-support.js";
import {
  caretAt,
  documentOf,
  editorState,
  mounted,
  paragraphBlock,
  restored,
} from "./editor-controller-support.js";

/** listItemBlock은 ListItemBlockType(bullet/numbered)만 받으므로 여기서 checkListItem 리터럴을 직접 만든다. */
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

const tailParagraph = paragraphBlock("tail", "꼬리");

describe("checkListItem 빈 블록 placeholder", () => {
  it("빈 checkListItem은 caret 위치와 무관하게 List item placeholder를 상시 받는다", () => {
    const document: Document = documentOf(
      checkListItemBlock("empty-check", "", false),
      tailParagraph,
    );
    const { editable } = mounted(document);

    const container = editable.querySelector<HTMLElement>(
      '[data-be-block-id="empty-check"]',
    );
    if (container === null) throw new Error("empty-check 조회 실패");
    expect(
      container.firstElementChild?.getAttribute("data-placeholder"),
    ).toBe("List item");
  });

  it("내용 있는 checkListItem은 placeholder를 받지 않는다", () => {
    const document: Document = documentOf(
      checkListItemBlock("filled-check", "내용", false),
      tailParagraph,
    );
    const { editable } = mounted(document);

    const container = editable.querySelector<HTMLElement>(
      '[data-be-block-id="filled-check"]',
    );
    if (container === null) throw new Error("filled-check 조회 실패");
    expect(
      container.firstElementChild?.hasAttribute("data-placeholder"),
    ).toBe(false);
  });
});

describe("빈 checkListItem Enter exit", () => {
  it("빈 checkListItem에서 Enter는 같은 ID의 paragraph로 전환한다", () => {
    const source = checkListItemBlock("check-1", "", false);
    const { editor, tiptap } = mounted(documentOf(source, tailParagraph));
    tiptap.commands.setTextSelection(caretAt(tiptap, source.id).anchor);

    expect(dispatchKeydown(tiptap, "Enter")).toBe(true);

    expect(editor.getDocument()).toEqual({
      ...documentOf(paragraphBlock("check-1", ""), tailParagraph),
      revision: 1,
    });
  });
});

describe("문서 최선두 checkListItem Backspace exit", () => {
  it("문서 최선두 checkListItem 선두 Backspace는 같은 ID의 paragraph로 전환하고 인라인 콘텐츠를 보존한다", () => {
    const source = checkListItemBlock("check-1", "본문", true);
    const { editor, tiptap } = mounted(documentOf(source, tailParagraph));
    tiptap.commands.setTextSelection(caretAt(tiptap, source.id).anchor);

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

    expect(editor.getDocument()).toEqual({
      ...documentOf(paragraphBlock("check-1", "본문"), tailParagraph),
      revision: 1,
    });
  });
});

describe("비어있지 않은 checkListItem 중간 Enter split", () => {
  it("checked: true인 항목을 split해도 새로 생긴 뒤쪽 항목은 checked: false로 리셋된다", () => {
    const source = checkListItemBlock("check-1", "앞뒤", true);
    const { editor, tiptap } = mounted(documentOf(source, tailParagraph));
    tiptap.commands.setTextSelection(caretAt(tiptap, source.id).anchor + 1);
    const before = editorState(editor, tiptap);

    expect(dispatchKeydown(tiptap, "Enter")).toBe(true);

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        checkListItemBlock("check-1", "앞", true),
        checkListItemBlock("id-1", "뒤", false),
        tailParagraph,
      ),
      revision: 1,
    });
    expect(tiptap.state.doc.child(1).firstChild?.attrs.checked).toBe(false);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });
});
