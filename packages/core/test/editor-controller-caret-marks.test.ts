/**
 * 접힌 캐럿 mark 명령 commands.toggleCaretMark의 계약 테스트(Issue #218,
 * UI-017 spec §3). stored mark만 바꾸는 설정·해제, 거절 3종, subscribe 통지,
 * 기존 toggle* 명령의 접힌 캐럿 거절 유지를 고정한다.
 *
 * 성공·거절 케이스는 문서, revision, onChange, selection, stored mark,
 * listener 호출 수를 함께 단언한다(G-EDT-001). 색상 명령은
 * editor-controller-caret-marks-color.test.ts가 소유한다.
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

const MARK_TYPES = ["bold", "italic", "underline", "strike", "code"] as const;

const ok = { ok: true, value: undefined };

/**
 * 문단 전체에 mark 하나가 걸린 block-1 문서를 만든다.
 */
const markedDocument = (type: (typeof MARK_TYPES)[number]) => {
  const block: Block = {
    id: "block-1",
    type: "paragraph",
    content: [{ text: "content", marks: [{ type }] }],
  };
  return documentOf(block);
};

describe("접힌 캐럿 mark 설정과 해제", () => {
  it.each(MARK_TYPES)(
    "%s를 stored mark로 설정하고 문서·revision·onChange를 바꾸지 않는다",
    (type) => {
      const fixture = mountedAtCaret();
      const before = stateSnapshot(fixture);

      expect(fixture.editor.commands.toggleCaretMark(type)).toEqual(ok);

      const after = stateSnapshot(fixture);
      expect(fixture.editor.getSelectionMarks()).toEqual([type]);
      expect(
        fixture.tiptap.state.storedMarks?.map((mark) => mark.type.name),
      ).toEqual([type]);
      expect(after.document).toEqual(before.document);
      expect(after.tiptapDocument).toEqual(before.tiptapDocument);
      expect(after.selection).toEqual(before.selection);
      expect(after.changeCount).toBe(0);
    },
  );

  it("앞선 문서 변경의 undo 단위를 늘리지 않는다", () => {
    const { editor, tiptap, changes } = mountedAtCaret();
    expect(editor.commands.setText("block-1", "changed")).toEqual(ok);
    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, "block-1") + CARET_OFFSET,
    );

    expect(editor.commands.toggleCaretMark("bold")).toEqual(ok);

    expect(changes).toHaveLength(1);
    expect(editor.getDocument().revision).toBe(1);
    expect(editor.commands.undo()).toEqual(ok);
    expect(editor.getDocument()).toMatchObject({
      revision: 2,
      blocks: paragraphDocument("content").blocks,
    });
  });

  it.each(MARK_TYPES)("%s 설정 뒤 입력한 텍스트가 그 mark를 가진다", (type) => {
    const { editor, tiptap } = mountedAtCaret();

    expect(editor.commands.toggleCaretMark(type)).toEqual(ok);
    typeAtCaret(tiptap, "X");

    expect(blockContent(editor)).toEqual([
      { text: "con" },
      { text: "X", marks: [{ type }] },
      { text: "tent" },
    ]);
  });

  it.each(MARK_TYPES)(
    "%s를 한 번 더 호출하면 해제되고 이어 입력한 텍스트에 mark가 없다",
    (type) => {
      const { editor, tiptap } = mountedAtCaret();
      expect(editor.commands.toggleCaretMark(type)).toEqual(ok);

      expect(editor.commands.toggleCaretMark(type)).toEqual(ok);
      typeAtCaret(tiptap, "X");

      expect(editor.getSelectionMarks()).toEqual([]);
      expect(blockContent(editor)).toEqual([{ text: "conXtent" }]);
    },
  );

  it.each(MARK_TYPES)(
    "%s가 걸린 텍스트 안 캐럿에서 호출하면 해제로 동작한다",
    (type) => {
      const { editor, tiptap } = mountedAtCaret(markedDocument(type));
      expect(editor.getSelectionMarks()).toEqual([type]);

      expect(editor.commands.toggleCaretMark(type)).toEqual(ok);
      typeAtCaret(tiptap, "X");

      expect(editor.getSelectionMarks()).toEqual([]);
      expect(blockContent(editor)).toEqual([
        { text: "con", marks: [{ type }] },
        { text: "X" },
        { text: "tent", marks: [{ type }] },
      ]);
    },
  );
});

describe("접힌 캐럿 mark 거절", () => {
  it("범위 선택이면 COMMAND_NOT_APPLICABLE로 거절하고 상태를 바꾸지 않는다", () => {
    const fixture = mountedAtCaret();
    const start = contentTextStart(fixture.tiptap, "block-1");
    fixture.tiptap.commands.setTextSelection({ from: start, to: start + 4 });
    fixture.listener.mockClear();
    const before = stateSnapshot(fixture);

    expect(fixture.editor.commands.toggleCaretMark("bold")).toEqual(
      notApplicable("toggleCaretMark"),
    );

    expect(stateSnapshot(fixture)).toEqual(before);
    expect(fixture.listener).not.toHaveBeenCalled();
  });

  it.each(MARK_TYPES)(
    "codeBlock 안 캐럿에서 %s를 CODE_BLOCK_MARK_NOT_ALLOWED로 거절하고 기존 stored mark를 보존한다",
    (type) => {
      const fixture = mountedInCodeBlock();
      const before = stateSnapshot(fixture);
      const dispatchSpy = vi.spyOn(fixture.tiptap.view, "dispatch");

      expect(fixture.editor.commands.toggleCaretMark(type)).toEqual({
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

    expect(fixture.editor.commands.toggleCaretMark("bold")).toEqual(
      notApplicable("toggleCaretMark"),
    );

    expect(stateSnapshot(fixture)).toEqual(before);
  });

  it("destroy() 뒤에는 COMMAND_NOT_APPLICABLE로 거절하고 문서를 바꾸지 않는다", () => {
    const { editor } = mountedAtCaret();
    const documentBefore = editor.getDocument();
    editor.destroy();

    expect(editor.commands.toggleCaretMark("bold")).toEqual(
      notApplicable("toggleCaretMark"),
    );

    expect(editor.getDocument()).toEqual(documentBefore);
  });

  it("거절은 앞선 문서 변경의 undo 단위를 보존한다", () => {
    const fixture = mountedAtCaret();
    expect(fixture.editor.commands.setText("block-1", "changed")).toEqual(ok);
    const start = contentTextStart(fixture.tiptap, "block-1");
    fixture.tiptap.commands.setTextSelection({ from: start, to: start + 4 });
    fixture.listener.mockClear();
    const before = stateSnapshot(fixture);
    expect(before.canUndo).toBe(true);

    expect(fixture.editor.commands.toggleCaretMark("bold")).toEqual(
      notApplicable("toggleCaretMark"),
    );

    expect(stateSnapshot(fixture)).toEqual(before);
    expect(fixture.editor.commands.undo()).toEqual(ok);
    expect(fixture.editor.getDocument()).toMatchObject({
      blocks: paragraphDocument("content").blocks,
    });
  });

  it.each(["foo", "link", "textColor"])(
    "5종 밖의 type %s는 COMMAND_NOT_APPLICABLE로 거절하고 상태를 바꾸지 않는다",
    (type) => {
      const fixture = mountedAtCaret();
      const before = stateSnapshot(fixture);

      expect(fixture.editor.commands.toggleCaretMark(type as never)).toEqual(
        notApplicable("toggleCaretMark"),
      );

      expect(stateSnapshot(fixture)).toEqual(before);
      expect(fixture.listener).not.toHaveBeenCalled();
      typeAtCaret(fixture.tiptap, "X");
      expect(blockContent(fixture.editor)).toEqual([{ text: "conXtent" }]);
    },
  );
});

describe("접힌 캐럿 code mark와 다른 mark의 공존", () => {
  it("code를 설정하면 앞서 설정한 다른 stored mark를 지우지 않고 함께 둔다 (Issue #349)", () => {
    const { editor, tiptap, listener } = mountedAtCaret();
    expect(editor.commands.toggleCaretMark("bold")).toEqual(ok);

    expect(editor.commands.toggleCaretMark("code")).toEqual(ok);

    expect(tiptap.state.storedMarks?.map((mark) => mark.type.name)).toEqual([
      "bold",
      "code",
    ]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("code가 stored mark이면 다른 mark도 거절하지 않고 함께 둔다 (Issue #349)", () => {
    const fixture = mountedAtCaret();
    expect(fixture.editor.commands.toggleCaretMark("code")).toEqual(ok);
    fixture.listener.mockClear();

    for (const type of ["bold", "italic", "underline", "strike"] as const) {
      expect(fixture.editor.commands.toggleCaretMark(type)).toEqual(ok);
    }

    expect(
      fixture.tiptap.state.storedMarks?.map((mark) => mark.type.name).sort(),
    ).toEqual(["bold", "code", "italic", "strike", "underline"]);
    expect(fixture.listener).toHaveBeenCalledTimes(4);
  });

  it("code가 stored mark이어도 색상은 허용하고 두 mark를 함께 둔다 (Issue #347)", () => {
    const { editor, tiptap } = mountedAtCaret();
    expect(editor.commands.toggleCaretMark("code")).toEqual(ok);

    expect(editor.commands.toggleCaretTextColor("#FF0000")).toEqual(ok);

    expect(tiptap.state.storedMarks?.map((mark) => mark.type.name)).toEqual([
      "code",
      "textColor",
    ]);
  });
});

describe("접힌 캐럿 mark 통지", () => {
  it("설정과 해제가 각각 listener를 정확히 1회 호출하고 호출 시점에 새 상태를 조회한다", () => {
    const { editor, listener } = mountedAtCaret();
    const observed: string[][] = [];
    editor.subscribe(() => {
      observed.push(editor.getSelectionMarks());
    });

    expect(editor.commands.toggleCaretMark("bold")).toEqual(ok);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(observed).toEqual([["bold"]]);

    expect(editor.commands.toggleCaretMark("bold")).toEqual(ok);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(observed).toEqual([["bold"], []]);
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

    expect(editor.commands.toggleCaretMark("bold")).toEqual(ok);
    expect(editor.commands.toggleCaretMark("bold")).toEqual(ok);
    expect(onBeforeChange).not.toHaveBeenCalled();

    // 문서를 바꾸는 입력은 onBeforeChange를 호출한다. 위 단언이 훅 배선이
    // 살아 있는 상태에서의 미호출임을 보인다.
    typeAtCaret(tiptap, "X");
    expect(onBeforeChange).toHaveBeenCalledTimes(1);
  });
});

describe("기존 toggle* 명령과의 관계", () => {
  it("접힌 캐럿에서 toggleBold는 계속 COMMAND_NOT_APPLICABLE이다", () => {
    const fixture = mountedAtCaret();
    const before = stateSnapshot(fixture);

    expect(fixture.editor.commands.toggleBold()).toEqual(
      notApplicable("toggleBold"),
    );
    expect(fixture.editor.commands.toggleCaretMark("bold")).toEqual(ok);
    expect(fixture.editor.commands.toggleBold()).toEqual(
      notApplicable("toggleBold"),
    );

    expect(stateSnapshot(fixture).document).toEqual(before.document);
  });
});
