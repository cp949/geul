/**
 * 접힌 캐럿 색상 명령 commands.toggleCaretTextColor와
 * commands.toggleCaretBackgroundColor의 계약 테스트(Issue #218, UI-017
 * spec §3). 두 명령이 같은 계약을 지키는지 describe.each로 함께 고정한다.
 *
 * 설정·재호출 해제·교체·null 해제, INVALID_COLOR, 거절 판정 순서, 텍스트 색과
 * 배경색의 독립, subscribe 통지를 다룬다. 성공·거절 케이스는 문서, revision,
 * onChange, selection, stored mark, listener 호출 수를 함께 단언한다
 * (G-EDT-001). mark 명령은 editor-controller-caret-marks.test.ts가 소유한다.
 */
import type { Block } from "@cp949/geul-model";
import { describe, expect, it, vi } from "vitest";
import { createEditor } from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  CARET_OFFSET,
  blockContent,
  mountedAtCaret,
  mountedInCodeBlock,
  stateSnapshot,
  typeAtCaret,
} from "./editor-controller-caret-marks-support.js";
import {
  documentOf,
  mountTiptapEditor,
  notApplicable,
  paragraphDocument,
} from "./editor-controller-support.js";

const RED = "#FF0000";
const BLUE = "#0000FF";

const COLOR_COMMANDS = [
  { command: "toggleCaretTextColor", markName: "textColor" },
  { command: "toggleCaretBackgroundColor", markName: "backgroundColor" },
] as const;

type MarkName = (typeof COLOR_COMMANDS)[number]["markName"];

const ok = { ok: true, value: undefined };

/**
 * Tiptap stored mark의 JSON 형태를 만든다. 저장 문서의
 * `{ type, color }`와 달리 attrs 아래에 color가 놓인다.
 */
const storedColorMark = (markName: MarkName, color: string) => ({
  type: markName,
  attrs: { color },
});

/**
 * 문단 전체에 색상 mark가 걸린 block-1 문서를 만든다.
 */
const coloredDocument = (markName: MarkName, color: string) => {
  const block: Block = {
    id: "block-1",
    type: "paragraph",
    content: [{ text: "content", marks: [{ type: markName, color }] }],
  };
  return documentOf(block);
};

describe.each(COLOR_COMMANDS)(
  "접힌 캐럿 색상 명령 $command",
  ({ command, markName }) => {
    describe("설정과 해제", () => {
      it("색을 stored mark로 설정하고 문서·revision·onChange를 바꾸지 않는다", () => {
        const fixture = mountedAtCaret();
        const before = stateSnapshot(fixture);

        expect(fixture.editor.commands[command](RED)).toEqual(ok);

        const after = stateSnapshot(fixture);
        expect(after.storedMarks).toEqual([storedColorMark(markName, RED)]);
        expect(after.document).toEqual(before.document);
        expect(after.tiptapDocument).toEqual(before.tiptapDocument);
        expect(after.selection).toEqual(before.selection);
        expect(after.changeCount).toBe(0);
      });

      it("앞선 문서 변경의 undo 단위를 늘리지 않는다", () => {
        const { editor, tiptap, changes } = mountedAtCaret();
        expect(editor.commands.setText("block-1", "changed")).toEqual(ok);
        tiptap.commands.setTextSelection(
          contentTextStart(tiptap, "block-1") + CARET_OFFSET,
        );

        expect(editor.commands[command](RED)).toEqual(ok);

        expect(changes).toHaveLength(1);
        expect(editor.getDocument().revision).toBe(1);
        expect(editor.commands.undo()).toEqual(ok);
        expect(editor.getDocument()).toMatchObject({
          revision: 2,
          blocks: paragraphDocument("content").blocks,
        });
      });

      it("설정 뒤 입력한 텍스트가 그 색을 가진다", () => {
        const { editor, tiptap } = mountedAtCaret();

        expect(editor.commands[command](RED)).toEqual(ok);
        typeAtCaret(tiptap, "X");

        expect(blockContent(editor)).toEqual([
          { text: "con" },
          { text: "X", marks: [{ type: markName, color: RED }] },
          { text: "tent" },
        ]);
      });

      it("같은 색을 다시 호출하면 해제되고 이어 입력한 텍스트에 색이 없다", () => {
        const { editor, tiptap } = mountedAtCaret();
        expect(editor.commands[command](RED)).toEqual(ok);

        expect(editor.commands[command](RED)).toEqual(ok);
        expect(tiptap.state.storedMarks).toEqual([]);
        typeAtCaret(tiptap, "X");

        expect(blockContent(editor)).toEqual([{ text: "conXtent" }]);
      });

      it("다른 색을 호출하면 교체되고 이어 입력한 텍스트가 새 색을 가진다", () => {
        const { editor, tiptap } = mountedAtCaret();
        expect(editor.commands[command](RED)).toEqual(ok);

        expect(editor.commands[command](BLUE)).toEqual(ok);
        typeAtCaret(tiptap, "X");

        expect(blockContent(editor)).toEqual([
          { text: "con" },
          { text: "X", marks: [{ type: markName, color: BLUE }] },
          { text: "tent" },
        ]);
      });

      it("null을 호출하면 설정한 색이 해제되고 이어 입력한 텍스트에 색이 없다", () => {
        const { editor, tiptap } = mountedAtCaret();
        expect(editor.commands[command](RED)).toEqual(ok);

        expect(editor.commands[command](null)).toEqual(ok);
        expect(tiptap.state.storedMarks).toEqual([]);
        typeAtCaret(tiptap, "X");

        expect(blockContent(editor)).toEqual([{ text: "conXtent" }]);
      });

      it("색이 걸린 텍스트 안 캐럿에서 같은 색을 호출하면 해제로 동작한다", () => {
        const { editor, tiptap } = mountedAtCaret(
          coloredDocument(markName, RED),
        );

        expect(editor.commands[command](RED)).toEqual(ok);
        typeAtCaret(tiptap, "X");

        expect(blockContent(editor)).toEqual([
          { text: "con", marks: [{ type: markName, color: RED }] },
          { text: "X" },
          { text: "tent", marks: [{ type: markName, color: RED }] },
        ]);
      });

      it("색이 걸린 텍스트 안 캐럿에서 null을 호출하면 해제로 동작한다", () => {
        const { editor, tiptap } = mountedAtCaret(
          coloredDocument(markName, RED),
        );

        expect(editor.commands[command](null)).toEqual(ok);
        typeAtCaret(tiptap, "X");

        expect(blockContent(editor)).toEqual([
          { text: "con", marks: [{ type: markName, color: RED }] },
          { text: "X" },
          { text: "tent", marks: [{ type: markName, color: RED }] },
        ]);
      });

      it("해제할 색이 캐럿 위치에 없으면 null이 COMMAND_NOT_APPLICABLE로 거절되고 상태를 바꾸지 않는다", () => {
        const fixture = mountedAtCaret();
        const before = stateSnapshot(fixture);

        expect(fixture.editor.commands[command](null)).toEqual(
          notApplicable(command),
        );

        expect(stateSnapshot(fixture)).toEqual(before);
        expect(fixture.listener).not.toHaveBeenCalled();
      });
    });

    describe("거절", () => {
      it.each(["red", "#ff0000", "#F00", "#FF00000", ""])(
        "canonical이 아닌 값 %j를 INVALID_COLOR로 거절하고 상태를 바꾸지 않는다",
        (color) => {
          const fixture = mountedAtCaret();
          expect(fixture.editor.commands[command](RED)).toEqual(ok);
          const before = stateSnapshot(fixture);

          expect(fixture.editor.commands[command](color)).toEqual({
            ok: false,
            error: { code: "INVALID_COLOR", color },
          });

          expect(stateSnapshot(fixture)).toEqual(before);
        },
      );

      it("범위 선택이면 색 검증보다 먼저 COMMAND_NOT_APPLICABLE로 거절한다", () => {
        const fixture = mountedAtCaret();
        const start = contentTextStart(fixture.tiptap, "block-1");
        fixture.tiptap.commands.setTextSelection({
          from: start,
          to: start + 4,
        });
        fixture.listener.mockClear();
        const before = stateSnapshot(fixture);

        expect(fixture.editor.commands[command](RED)).toEqual(
          notApplicable(command),
        );
        expect(fixture.editor.commands[command]("red")).toEqual(
          notApplicable(command),
        );

        expect(stateSnapshot(fixture)).toEqual(before);
        expect(fixture.listener).not.toHaveBeenCalled();
      });

      it.each([RED, null, "red"])(
        "codeBlock 안 캐럿에서 %j를 CODE_BLOCK_MARK_NOT_ALLOWED로 거절하고 기존 stored mark를 보존한다",
        (color) => {
          const fixture = mountedInCodeBlock();
          const before = stateSnapshot(fixture);
          const dispatchSpy = vi.spyOn(fixture.tiptap.view, "dispatch");

          expect(fixture.editor.commands[command](color)).toEqual({
            ok: false,
            error: { code: "CODE_BLOCK_MARK_NOT_ALLOWED" },
          });

          expect(dispatchSpy).not.toHaveBeenCalled();
          expect(stateSnapshot(fixture)).toEqual(before);
          expect(before.storedMarks).toEqual([{ type: "bold" }]);
          expect(fixture.listener).not.toHaveBeenCalled();
          dispatchSpy.mockRestore();
        },
      );

      it("범위 선택이 codeBlock과 겹치면 COMMAND_NOT_APPLICABLE이 우선한다", () => {
        const fixture = mountedInCodeBlock();
        fixture.tiptap.commands.setTextSelection({
          from: contentTextStart(fixture.tiptap, "before"),
          to: contentTextStart(fixture.tiptap, "code") + 1,
        });
        fixture.listener.mockClear();
        const before = stateSnapshot(fixture);

        expect(fixture.editor.commands[command](RED)).toEqual(
          notApplicable(command),
        );

        expect(stateSnapshot(fixture)).toEqual(before);
      });

      it("destroy() 뒤에는 COMMAND_NOT_APPLICABLE로 거절하고 문서를 바꾸지 않는다", () => {
        const { editor } = mountedAtCaret();
        const documentBefore = editor.getDocument();
        editor.destroy();

        expect(editor.commands[command](RED)).toEqual(notApplicable(command));

        expect(editor.getDocument()).toEqual(documentBefore);
      });
    });

    describe("통지", () => {
      it("설정·교체·해제가 각각 listener를 정확히 1회 호출하고 호출 시점에 새 stored mark를 조회한다", () => {
        const { editor, tiptap, listener } = mountedAtCaret();
        const observed: unknown[] = [];
        editor.subscribe(() => {
          observed.push(tiptap.state.storedMarks?.map((mark) => mark.toJSON()));
        });

        expect(editor.commands[command](RED)).toEqual(ok);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(editor.commands[command](BLUE)).toEqual(ok);
        expect(listener).toHaveBeenCalledTimes(2);
        expect(editor.commands[command](null)).toEqual(ok);
        expect(listener).toHaveBeenCalledTimes(3);

        expect(observed).toEqual([
          [storedColorMark(markName, RED)],
          [storedColorMark(markName, BLUE)],
          [],
        ]);
      });

      it("onBeforeChange를 호출하지 않는다", () => {
        const onBeforeChange = vi.fn();
        const editor = createEditor({
          initialDocument: paragraphDocument("content"),
          onBeforeChange,
        });
        const { tiptap } = mountTiptapEditor(editor);
        tiptap.commands.setTextSelection(
          contentTextStart(tiptap, "block-1") + CARET_OFFSET,
        );

        expect(editor.commands[command](RED)).toEqual(ok);
        expect(editor.commands[command](null)).toEqual(ok);

        expect(onBeforeChange).not.toHaveBeenCalled();

        // 문서를 바꾸는 입력은 onBeforeChange를 호출한다. 위 단언이 훅 배선이
        // 살아 있는 상태에서의 미호출임을 보인다.
        typeAtCaret(tiptap, "X");
        expect(onBeforeChange).toHaveBeenCalledTimes(1);
      });
    });
  },
);

describe("접힌 캐럿 텍스트 색과 배경색의 독립", () => {
  it("한쪽 색 변경이 다른 쪽 stored mark를 지우지 않는다", () => {
    const { editor, tiptap } = mountedAtCaret();
    expect(editor.commands.toggleCaretTextColor(RED)).toEqual(ok);
    expect(editor.commands.toggleCaretBackgroundColor(BLUE)).toEqual(ok);
    expect(tiptap.state.storedMarks?.map((mark) => mark.toJSON())).toEqual([
      storedColorMark("textColor", RED),
      storedColorMark("backgroundColor", BLUE),
    ]);

    expect(editor.commands.toggleCaretBackgroundColor(null)).toEqual(ok);
    expect(tiptap.state.storedMarks?.map((mark) => mark.toJSON())).toEqual([
      storedColorMark("textColor", RED),
    ]);

    expect(editor.commands.toggleCaretBackgroundColor(BLUE)).toEqual(ok);
    expect(editor.commands.toggleCaretTextColor(RED)).toEqual(ok);
    typeAtCaret(tiptap, "X");
    expect(blockContent(editor)).toEqual([
      { text: "con" },
      { text: "X", marks: [{ type: "backgroundColor", color: BLUE }] },
      { text: "tent" },
    ]);
  });
});
