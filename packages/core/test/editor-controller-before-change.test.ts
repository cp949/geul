/**
 * onBeforeChange 배선(spec §3.3, DOC-010, RD-004-DELTA-02) 계약 테스트 —
 * 기존 revision overflow 가드와의 AND 결합·fail-fast·평가 순서를 포함한다.
 */
import { describe, expect, it } from "vitest";
import { createEditor, type DocumentChangeEvent } from "../src/index.js";
import {
  mountTiptapEditor,
  nestedParagraphDocument,
  paragraphDocument,
} from "./editor-controller-support.js";

describe("에디터 컨트롤러 onBeforeChange", () => {
  it("문서를 바꾸는 transaction에 대해 onChange와 동일한 모양의 context를 미리 전달한다", () => {
    const previews: { changes: DocumentChangeEvent }[] = [];
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("before"),
      onBeforeChange: (context) => {
        previews.push(context);
      },
      onChange: (event) => changes.push(event),
    });

    expect(editor.commands.setText("block-1", "after")).toEqual({
      ok: true,
      value: undefined,
    });

    expect(previews).toEqual([
      {
        changes: { revision: 1, changedBlockIds: ["block-1"], reason: "local" },
      },
    ]);
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["block-1"], reason: "local" },
    ]);
  });

  it("false를 반환하면 transaction을 거절한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("before"),
      onBeforeChange: () => false,
      onChange: (event) => changes.push(event),
    });

    expect(editor.commands.setText("block-1", "after")).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "setText" },
    });
    expect(editor.getDocument()).toEqual(paragraphDocument("before"));
    expect(changes).toEqual([]);
  });

  it("undefined(void)를 반환하면 허용한다", () => {
    let calls = 0;
    const editor = createEditor({
      initialDocument: paragraphDocument("before"),
      onBeforeChange: () => {
        calls += 1;
        return undefined;
      },
    });

    expect(editor.commands.setText("block-1", "after")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(calls).toBe(1);
    expect(editor.getDocument()).toMatchObject({
      blocks: [{ content: [{ text: "after" }] }],
    });
  });

  it("문서를 바꾸지 않는 selection-only 명령에는 호출되지 않는다", () => {
    let calls = 0;
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      onBeforeChange: () => {
        calls += 1;
      },
    });

    expect(editor.setTextCursorPosition("block-1", "end")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(calls).toBe(0);
  });

  it("최대 revision에서는 onBeforeChange를 호출하지 않고 그대로 거절한다", () => {
    let calls = 0;
    const editor = createEditor({
      initialDocument: paragraphDocument("before", Number.MAX_SAFE_INTEGER),
      onBeforeChange: () => {
        calls += 1;
        return true;
      },
    });

    expect(editor.commands.setText("block-1", "after")).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "setText" },
    });
    expect(calls).toBe(0);
  });

  // 위 테스트는 runDocumentCommand 자신의 독립된 revision 상한 검사
  // (production-editor-session.ts::runDocumentCommand)에서 이미 걸러져
  // evaluateBeforeChange 내부 평가 순서 자체는 실행되지 않는다. DOM에서
  // 직접 dispatch되는 transaction(editor-controller-revision.test.ts의
  // "최대 revision에서 DOM 트랜잭션을..." 선례와 동일 경로)으로
  // evaluateBeforeChange 자신의 "revision guard가 onBeforeChange보다
  // 먼저"라는 순서를 직접 검증한다.
  it("최대 revision에서는 DOM 트랜잭션에도 onBeforeChange를 호출하지 않는다", () => {
    let calls = 0;
    const editor = createEditor({
      initialDocument: paragraphDocument("before", Number.MAX_SAFE_INTEGER),
      onBeforeChange: () => {
        calls += 1;
        return true;
      },
    });
    const { tiptap } = mountTiptapEditor(editor);
    const transaction = tiptap.state.tr.insertText("X", 2);

    expect(() => tiptap.view.dispatch(transaction)).not.toThrow();
    expect(tiptap.state.doc.textContent).toBe("before");
    expect(calls).toBe(0);
  });

  it("생성 시점 load-normalizing 정규화 transaction에는 호출되지 않는다", () => {
    let calls = 0;
    createEditor({
      initialDocument: nestedParagraphDocument(),
      onBeforeChange: () => {
        calls += 1;
      },
    });

    expect(calls).toBe(0);
  });

  it("한 논리적 편집(새 블록 생성)에 정확히 1회만 호출된다", () => {
    let calls = 0;
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      onBeforeChange: () => {
        calls += 1;
      },
    });

    expect(editor.commands.insertParagraphAfter("block-1")).toMatchObject({
      ok: true,
    });
    expect(calls).toBe(1);
  });
});
