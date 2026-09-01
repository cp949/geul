/**
 * toggleListItem이 bulletListItem/numberedListItem과 같은 "목록 항목류"
 * 편집 UX(빈 블록 placeholder, 빈 항목 Enter 종료, 선두 Backspace 종료)를
 * 받는지 검증한다(Issue #38 슬라이스 6 RD-003 트랙-3 결함 탐지 F2).
 * isListItemBlockType(io <ul>/<ol> 직렬화 대상)과 isListEntryBlockType(이
 * 편집 UX 대상)은 의도적으로 다른 집합이다 — placeholder-extension.ts·
 * block-split-extension.ts·block-join-extension.ts 세 곳이 후자를 쓴다.
 * 각 메커니즘(dispatch 원자성, undo, ID·children 보존)의 전면 재검증은
 * bulletListItem/numberedListItem을 다루는 list-item-presentation.test.ts·
 * list-item-keyboard.test.ts·list-item-join.test.ts가 이미 소유한다 — 이
 * 파일은 toggleListItem이 같은 공유 경로를 실제로 타는지만 고정한다.
 */
import type { Block, Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { dispatchKeydown } from "./block-test-support.js";
import {
  caretAt,
  documentOf,
  mounted,
  paragraphBlock,
} from "./editor-controller-support.js";

/** listItemBlock은 ListItemBlockType(bullet/numbered)만 받으므로 여기서 toggleListItem 리터럴을 직접 만든다. */
const toggleListItemBlock = (
  id: string,
  text: string,
  children?: Block[],
): Block => ({
  id,
  type: "toggleListItem",
  content: text === "" ? [] : [{ text }],
  ...(children === undefined ? {} : { children }),
});

const tailParagraph = paragraphBlock("tail", "꼬리");

describe("toggleListItem 빈 블록 placeholder", () => {
  it("빈 toggleListItem은 caret 위치와 무관하게 List item placeholder를 상시 받는다", () => {
    const document: Document = documentOf(
      toggleListItemBlock("empty-toggle", ""),
      tailParagraph,
    );
    const { editable } = mounted(document);

    const container = editable.querySelector<HTMLElement>(
      '[data-be-block-id="empty-toggle"]',
    );
    if (container === null) throw new Error("empty-toggle 조회 실패");
    expect(container.firstElementChild?.getAttribute("data-placeholder")).toBe(
      "List item",
    );
  });

  it("내용 있는 toggleListItem은 placeholder를 받지 않는다", () => {
    const document: Document = documentOf(
      toggleListItemBlock("filled-toggle", "내용"),
      tailParagraph,
    );
    const { editable } = mounted(document);

    const container = editable.querySelector<HTMLElement>(
      '[data-be-block-id="filled-toggle"]',
    );
    if (container === null) throw new Error("filled-toggle 조회 실패");
    expect(container.firstElementChild?.hasAttribute("data-placeholder")).toBe(
      false,
    );
  });
});

describe("빈 toggleListItem Enter exit", () => {
  it("빈 toggleListItem에서 Enter는 같은 ID의 paragraph로 전환한다", () => {
    const source = toggleListItemBlock("toggle-1", "");
    const { editor, tiptap } = mounted(documentOf(source, tailParagraph));
    tiptap.commands.setTextSelection(caretAt(tiptap, source.id).anchor);

    expect(dispatchKeydown(tiptap, "Enter")).toBe(true);

    expect(editor.getDocument()).toEqual({
      ...documentOf(paragraphBlock("toggle-1", ""), tailParagraph),
      revision: 1,
    });
  });
});

describe("문서 최선두 toggleListItem Backspace exit", () => {
  it("문서 최선두 toggleListItem 선두 Backspace는 같은 ID의 paragraph로 전환하고 인라인 콘텐츠를 보존한다", () => {
    const source = toggleListItemBlock("toggle-1", "본문");
    const { editor, tiptap } = mounted(documentOf(source, tailParagraph));
    tiptap.commands.setTextSelection(caretAt(tiptap, source.id).anchor);

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

    expect(editor.getDocument()).toEqual({
      ...documentOf(paragraphBlock("toggle-1", "본문"), tailParagraph),
      revision: 1,
    });
  });
});
