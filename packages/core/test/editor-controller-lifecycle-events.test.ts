/**
 * onMount/onUnmount/onSelectionChange 배선(spec §3.3, DOC-009/010,
 * RD-004-DELTA-01) 계약 테스트. mount()된 editor의 정리는 mountTiptapEditor가
 * 등록하는 module scope afterEach(G-TST-003, editor-controller-support.ts
 * 재수출 경유)에 위임한다.
 */
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import {
  mountTiptapEditor,
  paragraphDocument,
} from "./editor-controller-support.js";

describe("에디터 컨트롤러 lifecycle·selection 이벤트", () => {
  it("onMount은 생성 시점에는 미발화하고 mount() 호출 시 정확히 1회 발화한다", () => {
    let mountCount = 0;
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      onMount: () => {
        mountCount += 1;
      },
    });

    expect(mountCount).toBe(0);

    mountTiptapEditor(editor);
    expect(mountCount).toBe(1);
  });

  it("onUnmount은 마운트되지 않은 상태에서는 미발화하고 unmount() 호출 시 발화한다", () => {
    let unmountCount = 0;
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      onUnmount: () => {
        unmountCount += 1;
      },
    });

    editor.unmount();
    expect(unmountCount).toBe(0);

    mountTiptapEditor(editor);
    editor.unmount();
    expect(unmountCount).toBe(1);
  });

  it("onSelectionChange가 PM selection 변경 시 발화한다", () => {
    let selectionChangeCount = 0;
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      onSelectionChange: () => {
        selectionChangeCount += 1;
      },
    });
    mountTiptapEditor(editor);
    expect(selectionChangeCount).toBe(0);

    expect(editor.setTextCursorPosition("block-1", "end")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(selectionChangeCount).toBe(1);
  });

  it("onSelectionChange가 selection이 바뀌지 않는 재호출에는 발화하지 않는다", () => {
    let selectionChangeCount = 0;
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      onSelectionChange: () => {
        selectionChangeCount += 1;
      },
    });
    mountTiptapEditor(editor);

    expect(editor.setTextCursorPosition("block-1", "end")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(selectionChangeCount).toBe(1);

    expect(editor.setTextCursorPosition("block-1", "end")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(selectionChangeCount).toBe(1);
  });
});
