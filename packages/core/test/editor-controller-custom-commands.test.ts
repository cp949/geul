/**
 * CreateEditorOptions.commands 등록과 EditorController.runCustomCommand
 * 호출 계약 테스트(spec §5, EXT-005, RD-001-DELTA-01) — 등록된 함수가
 * 그대로 실행되고, 기존 commands.*와 별도 조회 테이블이라 이름이 겹쳐도
 * 충돌하지 않는다.
 */
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import { paragraphDocument } from "./editor-controller-support.js";

describe("에디터 컨트롤러 runCustomCommand", () => {
  it("등록된 command를 호출하면 그 함수가 반환한 Result를 그대로 돌려준다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      commands: {
        succeed: () => ({ ok: true, value: undefined }),
        fail: () => ({
          ok: false,
          error: { code: "COMMAND_NOT_APPLICABLE", command: "fail" },
        }),
      },
    });

    expect(editor.runCustomCommand("succeed")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.runCustomCommand("fail")).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "fail" },
    });
  });

  it("등록 함수에 전달되는 editor 인자로 실제 문서를 바꿀 수 있다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("before"),
      commands: {
        setFirstBlockText: (ed, text) =>
          ed.commands.setText("block-1", text as string),
      },
    });

    expect(editor.runCustomCommand("setFirstBlockText", "after")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument()).toMatchObject({
      blocks: [{ content: [{ text: "after" }] }],
    });
  });

  it("runCustomCommand와 commands가 같은 이름을 써도 서로 독립적으로 동작한다", () => {
    let customCalled = false;
    const editor = createEditor({
      initialDocument: paragraphDocument("before"),
      commands: {
        setText: () => {
          customCalled = true;
          return { ok: true, value: undefined };
        },
      },
    });

    // runCustomCommand("setText")는 등록된 함수만 실행 — 문서를 바꾸지 않는다.
    expect(editor.runCustomCommand("setText")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(customCalled).toBe(true);
    expect(editor.getDocument()).toMatchObject({
      blocks: [{ content: [{ text: "before" }] }],
    });

    // commands.setText는 기존 내장 명령 그대로 동작 — 등록된 함수의 영향을
    // 받지 않는다.
    expect(editor.commands.setText("block-1", "after")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument()).toMatchObject({
      blocks: [{ content: [{ text: "after" }] }],
    });
  });

  it("등록 함수에 추가 인자가 그대로 전달된다", () => {
    const received: unknown[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      commands: {
        record: (_editor, ...args) => {
          received.push(...args);
          return { ok: true, value: undefined };
        },
      },
    });

    editor.runCustomCommand("record", "a", 1, true);
    expect(received).toEqual(["a", 1, true]);
  });

  it("등록되지 않은 이름으로 호출하면 COMMAND_NOT_APPLICABLE을 반환한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      commands: { known: () => ({ ok: true, value: undefined }) },
    });

    expect(editor.runCustomCommand("unknown")).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "unknown" },
    });
  });

  it("commands를 지정하지 않아도 임의 이름 호출이 COMMAND_NOT_APPLICABLE로 안전하게 거절된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });

    expect(editor.runCustomCommand("anything")).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "anything" },
    });
  });
});
