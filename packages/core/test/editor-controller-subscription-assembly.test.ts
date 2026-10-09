/**
 * createProductionEditor 수준에서 `onStateChange` 통지 판정을 검증한다.
 * 정규화 구간 제외, 상태가 같은 transaction 미통지, 문서·selection·
 * stored mark 변경 통지, appendTransaction 되돌림 경로를 다룬다.
 *
 * 되돌림은 문서와 selection을 되돌림 전 상태로 복원한다(Issue #317). 이전에는
 * selection을 문서 끝으로 옮겨 통지했다. 지금은 상태가 모두 같아 통지하지
 * 않는다. 되돌림 케이스는 validateDocumentStructure를 생성 뒤에 false로
 * 바꿔 만든다.
 * 컨트롤러 계약(구독 해제·listener 의미·시점)은
 * editor-controller-subscription.test.ts가 소유한다.
 */
import type { Block, Document } from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import { Selection, TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProductionEditor } from "../src/production-editor-assembly.js";
import { paragraphBlock, sequentialIds } from "./editor-controller-support.js";
import { productionDocumentOf } from "./production-editor-test-support.js";

/** 테스트가 만든 Editor 목록. afterEach에서 일괄 destroy한다(G-TST-003). */
const createdEditors: Editor[] = [];

afterEach(() => {
  for (const editor of createdEditors.splice(0)) editor.destroy();
});

/**
 * 통지 횟수를 세는 production Editor를 만든다.
 * `valid`를 false로 바꾸면 이후 문서 변경을 appendTransaction이 되돌린다.
 * 반환한 Editor는 afterEach가 destroy한다.
 */
function createCountingEditor(document: Document) {
  const state = { valid: true, notifications: 0, transactionEvents: 0 };
  const editor = createProductionEditor({
    document,
    createId: sequentialIds("generated"),
    onUpdate: () => {},
    canApplyDocumentChange: () => true,
    validateDocumentStructure: () => state.valid,
    onStateChange: () => {
      state.notifications += 1;
    },
  });
  createdEditors.push(editor);
  return { editor, state };
}

/**
 * Editor를 DOM에 마운트하고 transaction 이벤트 횟수를 세기 시작한다.
 * 이 횟수는 통지 판정과 독립인 원시 발화 횟수라 판정 규칙의 필요성을 보인다.
 */
function mountAndProbe(
  editor: Editor,
  state: { transactionEvents: number },
): void {
  editor.mount(globalThis.document.createElement("div"));
  editor.on("transaction", () => {
    state.transactionEvents += 1;
  });
}

/** 최상위 블록 수를 센다. 정규화로 trailing paragraph가 붙었는지 확인한다. */
function topLevelBlockCount(editor: Editor): number {
  return editor.state.doc.childCount;
}

const headingOnly: Block = {
  id: "heading-1",
  type: "heading",
  level: 1,
  content: [{ text: "title" }],
};

describe("production 편집기 상태 변경 통지", () => {
  it("load-normalizing 구간의 trailing paragraph transaction은 통지하지 않는다", () => {
    const { editor, state } = createCountingEditor({
      formatVersion: 1,
      revision: 0,
      blocks: [headingOnly],
    });

    expect(topLevelBlockCount(editor)).toBe(2);
    expect(state.notifications).toBe(0);
  });

  it("문서 변경 transaction은 통지한다", () => {
    const { editor, state } = createCountingEditor(
      productionDocumentOf(paragraphBlock("p1", "hello")),
    );
    mountAndProbe(editor, state);

    editor.view.dispatch(editor.state.tr.insertText("x"));

    expect(editor.state.doc.textContent).toBe("xhello");
    expect(state.notifications).toBe(1);
  });

  it("selection만 바뀌는 transaction은 통지한다", () => {
    const { editor, state } = createCountingEditor(
      productionDocumentOf(paragraphBlock("p1", "hello")),
    );
    mountAndProbe(editor, state);

    editor.commands.setTextSelection(3);

    expect(state.notifications).toBe(1);
  });

  it("stored mark만 바뀌는 transaction은 통지한다", () => {
    const { editor, state } = createCountingEditor(
      productionDocumentOf(paragraphBlock("p1", "hello")),
    );
    mountAndProbe(editor, state);
    const bold = editor.schema.marks.bold;
    if (bold === undefined) throw new Error("bold mark 조회 실패");

    editor.view.dispatch(editor.state.tr.setStoredMarks([bold.create()]));

    expect(state.notifications).toBe(1);
  });

  it("문서·selection·stored mark가 모두 같은 transaction은 통지하지 않는다", () => {
    const { editor, state } = createCountingEditor(
      productionDocumentOf(paragraphBlock("p1", "hello")),
    );
    mountAndProbe(editor, state);

    editor.view.dispatch(editor.state.tr.setMeta("probe", true));

    expect(state.transactionEvents).toBe(1);
    expect(state.notifications).toBe(0);
  });

  // Issue #317 — 되돌림이 selection도 복원한다. 이전에는 selection이 문서 끝으로
  // 이동해 통지했다.
  it("appendTransaction이 문서를 되돌리면 selection도 복원돼 상태가 같아 통지하지 않는다", () => {
    const { editor, state } = createCountingEditor(
      productionDocumentOf(paragraphBlock("p1", "hello")),
    );
    mountAndProbe(editor, state);
    state.valid = false;
    const docBefore = editor.state.doc;
    const selectionBefore = editor.state.selection;

    editor.view.dispatch(editor.state.tr.insertText("x"));

    expect(editor.state.doc.eq(docBefore)).toBe(true);
    expect(editor.state.selection.eq(selectionBefore)).toBe(true);
    expect(state.transactionEvents).toBe(1);
    expect(state.notifications).toBe(0);
  });

  it("appendTransaction이 문서를 되돌렸는데 selection 복원이 실패해 달라지면 통지한다", () => {
    const { editor, state } = createCountingEditor(
      productionDocumentOf(paragraphBlock("p1", "hello")),
    );
    mountAndProbe(editor, state);
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, 3, 5),
      ),
    );
    state.valid = false;
    state.notifications = 0;
    state.transactionEvents = 0;
    const restore = vi.spyOn(Selection, "fromJSON").mockImplementation(() => {
      throw new RangeError("복원 실패");
    });

    try {
      editor.view.dispatch(editor.state.tr.insertText("x"));
    } finally {
      restore.mockRestore();
    }

    // 폴백은 범위 시작의 캐럿이라 옛 범위 selection과 다르다.
    expect(editor.state.selection.empty).toBe(true);
    expect(state.transactionEvents).toBe(1);
    expect(state.notifications).toBe(1);
  });

  it("appendTransaction이 문서를 되돌려도 캐럿이 문서 끝이면 상태가 같아 통지하지 않는다", () => {
    const { editor, state } = createCountingEditor(
      productionDocumentOf(paragraphBlock("p1", "hello")),
    );
    mountAndProbe(editor, state);
    editor.view.dispatch(
      editor.state.tr.setSelection(Selection.atEnd(editor.state.doc)),
    );
    state.valid = false;
    state.notifications = 0;
    state.transactionEvents = 0;
    const docBefore = editor.state.doc;
    const selectionBefore = editor.state.selection;

    editor.view.dispatch(editor.state.tr.insertText("x"));

    expect(editor.state.doc.eq(docBefore)).toBe(true);
    expect(editor.state.selection.eq(selectionBefore)).toBe(true);
    expect(editor.state.storedMarks).toBeNull();
    expect(state.transactionEvents).toBe(1);
    expect(state.notifications).toBe(0);
  });

  it("되돌림이 활성인 편집기에서도 selection만 바꾸는 정상 transaction은 통지한다", () => {
    const { editor, state } = createCountingEditor(
      productionDocumentOf(paragraphBlock("p1", "hello")),
    );
    mountAndProbe(editor, state);
    state.valid = false;
    const docBefore = editor.state.doc;

    editor.commands.setTextSelection(3);

    expect(editor.state.doc.eq(docBefore)).toBe(true);
    expect(state.notifications).toBe(1);
  });

  it("stored mark가 null에서 빈 배열로 바뀌면 문서·selection이 같아도 통지한다", () => {
    const { editor, state } = createCountingEditor(
      productionDocumentOf(
        {
          id: "bold-1",
          type: "paragraph",
          content: [{ text: "hello", marks: [{ type: "bold" }] }],
        },
        paragraphBlock("tail-1", "tail"),
      ),
    );
    mountAndProbe(editor, state);
    editor.commands.setTextSelection(7);
    expect(editor.state.storedMarks).toBeNull();
    state.notifications = 0;
    const bold = editor.schema.marks.bold;
    if (bold === undefined) throw new Error("bold mark 조회 실패");

    editor.view.dispatch(editor.state.tr.removeStoredMark(bold));

    expect(editor.state.storedMarks).toEqual([]);
    expect(state.notifications).toBe(1);
  });
});
