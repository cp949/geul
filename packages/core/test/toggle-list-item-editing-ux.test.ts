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
import { describe, expect, it, vi } from "vitest";

import { dispatchKeydown } from "./block-test-support.js";
import {
  caretAt,
  documentOf,
  editorState,
  mounted,
  paragraphBlock,
  restored,
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
      '[data-geul-block-id="empty-toggle"]',
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
      '[data-geul-block-id="filled-toggle"]',
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

// 2026-09-13 정정(사용자 결정): 빈 toggleListItem은 최선두가 아니어도 Enter
// (block-split-extension.ts splitAtCaret)와 대칭으로 병합 대신 종료한다.
describe("빈 toggleListItem 중간(최선두 아님) Backspace exit", () => {
  it("앞에 형제가 있어도 빈 toggleListItem은 병합 대신 같은 ID의 paragraph로 전환한다", () => {
    const source = toggleListItemBlock("toggle-1", "");
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("lead", "앞"), source, tailParagraph),
    );
    tiptap.commands.setTextSelection(caretAt(tiptap, source.id).anchor);

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        paragraphBlock("lead", "앞"),
        paragraphBlock("toggle-1", ""),
        tailParagraph,
      ),
      revision: 1,
    });
  });
});

// 2026-09-17 정정(사용자 결정) — toggleListItem 헤더는 문서 최선두가 아니고
// 내용이 있어도 앞 블록과 병합하지 않는다. bulletListItem·numberedListItem은
// 이 정정 대상이 아니다(list-item-join.test.ts "목록 선두 Backspace exit·join"이
// 그 병합+children 승격 동작을 계속 고정한다) — toggleListItem만 항상 종료로
// 예외 처리한다.
describe("토글 헤더 중간(최선두 아님, 내용 있음) Backspace exit", () => {
  it("앞에 병합 가능한 형제가 있어도 헤더는 병합 대신 같은 ID의 paragraph로 전환하고 children을 그 자리에 보존한다", () => {
    const children = [
      paragraphBlock("child-1", "자식1"),
      paragraphBlock("child-2", "자식2"),
    ];
    const source = toggleListItemBlock("toggle-1", "본문", children);
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("lead", "앞"), source, tailParagraph),
    );
    tiptap.commands.setTextSelection(caretAt(tiptap, source.id).anchor);

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        paragraphBlock("lead", "앞"),
        paragraphBlock("toggle-1", "본문", children),
        tailParagraph,
      ),
      revision: 1,
    });
  });
});

describe("토글 첫 자식 Backspace merge", () => {
  it("펼쳐진 영역 첫 자식 선두 Backspace는 헤더 텍스트에 병합하고 남은 자식은 그대로 유지한다", () => {
    const source = toggleListItemBlock("toggle-1", "헤더", [
      paragraphBlock("child-1", "자식1"),
      paragraphBlock("child-2", "자식2"),
    ]);
    const { editor, tiptap } = mounted(documentOf(source, tailParagraph));
    tiptap.commands.setTextSelection(caretAt(tiptap, "child-1").anchor);

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        toggleListItemBlock("toggle-1", "헤더자식1", [
          paragraphBlock("child-2", "자식2"),
        ]),
        tailParagraph,
      ),
      revision: 1,
    });
  });
});

// 2026-09-17 사용자 결정 — 펼쳐진 영역에서 첫 자식이 아닌 행의 선두
// Backspace는 이전 형제와 병합하지 않고 토글 밖으로 나가 토글과 같은
// 레벨의 형제 블록이 된다(indent-commands.ts의 outdentBlockCommand 재사용,
// "후행 형제는 입양하지 않고 원 부모의 blockGroup에 남는다" 아웃라이너
// 표준). 첫 자식(위 "토글 첫 자식 Backspace merge")만 예외로 헤더에 병합된다.
describe("토글 둘째 이후 자식 Backspace outdent", () => {
  it("펼쳐진 영역의 첫 자식이 아닌 행은 이전 형제와 병합하지 않고 토글 밖으로 나가 형제 블록이 되며, 그 뒤의 자식은 토글에 그대로 남는다", () => {
    const source = toggleListItemBlock("toggle-1", "헤더", [
      paragraphBlock("child-1", "자식1"),
      paragraphBlock("child-2", "자식2"),
      paragraphBlock("child-3", "자식3"),
    ]);
    const { editor, tiptap, changes } = mounted(
      documentOf(source, tailParagraph),
    );
    tiptap.commands.setTextSelection(caretAt(tiptap, "child-2").anchor);
    const before = editorState(editor, tiptap);
    const dispatch = vi.spyOn(tiptap.view, "dispatch");

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(editor.getDocument()).toEqual({
      ...documentOf(
        toggleListItemBlock("toggle-1", "헤더", [
          paragraphBlock("child-1", "자식1"),
          paragraphBlock("child-3", "자식3"),
        ]),
        paragraphBlock("child-2", "자식2"),
        tailParagraph,
      ),
      revision: 1,
    });
    expect(tiptap.state.selection.toJSON()).toEqual(caretAt(tiptap, "child-2"));
    expect(changes).toHaveLength(1);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });
});
