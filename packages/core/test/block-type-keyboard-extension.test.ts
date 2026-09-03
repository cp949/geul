/**
 * BlockTypeKeyboardExtension이 캐럿이 속한 blockContainer를 12개 단축키로
 * 즉시 해당 블록 타입으로 변환하는지 검증한다. heading isToggleable/
 * collapsed 캐리포워드, 하위 blockGroup 보존, table/codeBlock/divider
 * no-op, 동일 타입 재적용 no-op(dispatch 0회), undo 원자성, 실제 keymap
 * 등록(Mod-Alt-N/Mod-Alt-q/Mod-Shift-6~9)까지 고정한다.
 *
 * 대부분의 it은 exported 순수 함수(setBlockTypeShortcut)를 직접 호출해
 * Tiptap의 keymap 플러그인 체인을 우회한다 — indent-keyboard-extension.test.ts와
 * 같은 방식이다. 마지막 describe만 실제 keydown(view.someProp
 * "handleKeyDown")을 흘려보내 12개 키 문자열이 정확한 descriptor로
 * 등록됐는지 고정한다.
 */
import type { Editor } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";

import type { Block } from "@cp949/geul-model";

import {
  BlockTypeKeyboardExtension,
  setBlockTypeShortcut,
} from "../src/block-type-keyboard-extension.js";
import { contentTextStart } from "./block-test-support.js";
import {
  dividerBlock,
  documentOf,
  editorState,
  headingBlock,
  listItemBlock,
  mounted,
  notApplicable,
  paragraphBlock,
  quoteBlock,
  restored,
  tailParagraphBlock,
} from "./editor-controller-support.js";
import {
  createTableFixtureEditor,
  docWithTwoRowTable,
  placeCaretInCell,
} from "./table-test-support.js";

/** checkListItem 리터럴. */
const checkListItemBlock = (
  id: string,
  text: string,
  checked: boolean,
): Block => ({
  id,
  type: "checkListItem",
  checked,
  content: text === "" ? [] : [{ text }],
});

/** codeBlock 리터럴. */
const codeBlock = (id: string, text: string): Block => ({
  id,
  type: "codeBlock",
  language: "text",
  content: text === "" ? [] : [{ text }],
});

// TrailingBlockExtension이 마지막 블록이 빈 paragraph가 아니면 문서 끝에
// 빈 paragraph를 자동 삽입한다(production 편집기 배치 계약) — 모든 fixture를
// tailParagraphBlock으로 닫아 그 자동 삽입이 assertion에 섞이지 않게 한다
// (indent-keyboard-extension.test.ts와 동일 관례).
describe("변환 라우팅", () => {
  it("Mod-Alt-0(paragraph)이 heading/quote/목록 캐럿 블록을 paragraph로 바꾼다", () => {
    const { editor, tiptap } = mounted(
      documentOf(headingBlock("target", 2, "제목"), tailParagraphBlock),
    );

    const consumed = setBlockTypeShortcut(tiptap, { type: "paragraph" });

    expect(consumed).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("target", "제목"),
      tailParagraphBlock,
    ]);
  });

  it("Mod-Alt-1~6이 각각 정확한 level의 heading으로 바꾼다", () => {
    ([1, 2, 3, 4, 5, 6] as const).forEach((level) => {
      const { editor, tiptap } = mounted(
        documentOf(paragraphBlock("target", "본문"), tailParagraphBlock),
      );

      const consumed = setBlockTypeShortcut(tiptap, {
        type: "heading",
        level,
      });

      expect(consumed).toBe(true);
      expect(editor.getDocument().blocks).toEqual([
        headingBlock("target", level, "본문"),
        tailParagraphBlock,
      ]);
    });
  });

  it("heading→heading level 변경은 isToggleable/collapsed를 그대로 유지한다(캐리포워드)", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        headingBlock("target", 1, "제목", {
          isToggleable: true,
          collapsed: true,
        }),
        tailParagraphBlock,
      ),
    );

    const consumed = setBlockTypeShortcut(tiptap, {
      type: "heading",
      level: 3,
    });

    expect(consumed).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      headingBlock("target", 3, "제목", {
        isToggleable: true,
        collapsed: true,
      }),
      tailParagraphBlock,
    ]);
  });

  it("일반 heading(isToggleable 없음)의 level 변경은 isToggleable/collapsed를 null로 유지한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(headingBlock("target", 1, "제목"), tailParagraphBlock),
    );

    setBlockTypeShortcut(tiptap, { type: "heading", level: 2 });

    expect(editor.getDocument().blocks).toEqual([
      headingBlock("target", 2, "제목"),
      tailParagraphBlock,
    ]);
  });

  it("Mod-Alt-q(quote)가 문단을 quote로 바꾼다", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("target", "본문"), tailParagraphBlock),
    );

    const consumed = setBlockTypeShortcut(tiptap, { type: "quote" });

    expect(consumed).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      quoteBlock("target", "본문"),
      tailParagraphBlock,
    ]);
  });

  it.each([
    ["Mod-Shift-6", "toggleListItem"],
    ["Mod-Shift-7", "numberedListItem"],
    ["Mod-Shift-8", "bulletListItem"],
  ] as const)("%s이 문단을 %s(schema default attrs)로 바꾼다", (_key, type) => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("target", "본문"), tailParagraphBlock),
    );

    const consumed = setBlockTypeShortcut(tiptap, { type });

    expect(consumed).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      listItemBlock("target", type, "본문"),
      tailParagraphBlock,
    ]);
  });

  it("Mod-Shift-9(checkListItem)이 문단을 checked:false checkListItem으로 바꾼다", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("target", "본문"), tailParagraphBlock),
    );

    const consumed = setBlockTypeShortcut(tiptap, { type: "checkListItem" });

    expect(consumed).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      checkListItemBlock("target", "본문", false),
      tailParagraphBlock,
    ]);
  });

  it("변환 후에도 캐럿 블록의 기존 하위 블록(children)이 그대로 보존된다", () => {
    const child = paragraphBlock("child", "하위");
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("target", "본문", [child]), tailParagraphBlock),
    );

    const consumed = setBlockTypeShortcut(tiptap, { type: "quote" });

    expect(consumed).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      quoteBlock("target", "본문", [child]),
      tailParagraphBlock,
    ]);
  });
});

describe("no-op 경로", () => {
  it("codeBlock 캐럿에서는 12개 변환 모두 소비하지 않고 문서를 바꾸지 않는다", () => {
    const { editor, tiptap } = mounted(
      documentOf(codeBlock("code", "source"), paragraphBlock("tail", "")),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "code"));
    const before = editor.getDocument();

    const consumed = setBlockTypeShortcut(tiptap, { type: "paragraph" });

    expect(consumed).toBe(false);
    expect(editor.getDocument()).toEqual(before);
  });

  it("divider·NodeSelection처럼 blockContainer 조상이 없는 선택에서는 소비하지 않는다(divider는 blockContainer로 감싸이지 않는 atom)", () => {
    const { editor, tiptap } = mounted(
      documentOf(dividerBlock("div"), paragraphBlock("tail", "")),
    );
    tiptap.commands.setNodeSelection(0);
    const before = editor.getDocument();

    const consumed = setBlockTypeShortcut(tiptap, { type: "quote" });

    expect(consumed).toBe(false);
    expect(editor.getDocument()).toEqual(before);
  });

  it("표 셀 안 캐럿에서는 12개 변환 모두 소비하지 않고 문서·selection을 바꾸지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable);
    placeCaretInCell(editor, "cell-1");
    const before = editor.getJSON();

    const consumed = setBlockTypeShortcut(editor, { type: "paragraph" });

    expect(consumed).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });

  it("이미 같은 타입(heading은 같은 level까지)이면 소비하지 않고 dispatch 0회다", () => {
    const { tiptap } = mounted(
      documentOf(headingBlock("target", 2, "제목"), tailParagraphBlock),
    );
    const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

    const consumed = setBlockTypeShortcut(tiptap, {
      type: "heading",
      level: 2,
    });

    expect(consumed).toBe(false);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});

describe("transaction 원자성과 revision", () => {
  it("단일 transaction·closeHistory로 undo 1회에 변환 전 상태로 복원된다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(paragraphBlock("target", "본문"), tailParagraphBlock),
    );
    const before = editorState(editor, tiptap);
    const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

    const consumed = setBlockTypeShortcut(tiptap, { type: "quote" });

    expect(consumed).toBe(true);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ revision: 1, reason: "local" });

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });
});

describe("실제 keymap 등록(Mod-Alt-N/Mod-Alt-q/Mod-Shift-6~9)", () => {
  const dispatchModAltKeydown = (
    editor: Pick<Editor, "view">,
    key: string,
  ): boolean =>
    editor.view.someProp(
      "handleKeyDown",
      (f) =>
        f(
          editor.view,
          new KeyboardEvent("keydown", {
            key,
            ctrlKey: true,
            altKey: true,
            bubbles: true,
            cancelable: true,
          }),
        ) === true,
    ) === true;

  const dispatchModShiftKeydown = (
    editor: Pick<Editor, "view">,
    key: string,
  ): boolean =>
    editor.view.someProp(
      "handleKeyDown",
      (f) =>
        f(
          editor.view,
          new KeyboardEvent("keydown", {
            key,
            ctrlKey: true,
            shiftKey: true,
            bubbles: true,
            cancelable: true,
          }),
        ) === true,
    ) === true;

  it.each(["0", "1", "2", "3", "4", "5", "6", "q"])(
    "Mod-Alt-%s keydown이 실제 keymap을 통해 소비된다",
    (key) => {
      // 시작 블록을 bulletListItem으로 둔다 — paragraph/heading 1-6/quote
      // 어느 것도 대상이 아니라서 isSameType no-op과 겹치지 않는다(Mod-Alt-0을
      // paragraph 시작 블록에서 테스트하면 그 자체가 no-op이 되는 함정 회피).
      const { editor, tiptap } = mounted(
        documentOf(
          listItemBlock("target", "bulletListItem", "본문"),
          tailParagraphBlock,
        ),
      );
      const before = editor.getDocument();

      const handled = dispatchModAltKeydown(tiptap, key);

      expect(handled).toBe(true);
      expect(editor.getDocument()).not.toEqual(before);
    },
  );

  it.each(["6", "7", "8", "9"])(
    "Mod-Shift-%s keydown이 실제 keymap을 통해 소비된다",
    (key) => {
      const { editor, tiptap } = mounted(
        documentOf(paragraphBlock("target", "본문"), tailParagraphBlock),
      );

      const handled = dispatchModShiftKeydown(tiptap, key);

      expect(handled).toBe(true);
      expect(editor.getDocument().blocks[0]?.type).not.toBe("paragraph");
    },
  );

  it("표 셀 안 keydown은 실제 keymap 디스패치에서도 소비되지 않는다", () => {
    const editor = createTableFixtureEditor(docWithTwoRowTable, [
      BlockTypeKeyboardExtension,
    ]);
    placeCaretInCell(editor, "cell-1");

    const handled = dispatchModAltKeydown(editor, "0");

    expect(handled).toBe(false);
  });
});
