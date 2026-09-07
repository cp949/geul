/**
 * CreateEditorOptions.keyboardShortcuts 등록 계약 테스트(spec §5, EXT-005,
 * RD-002-DELTA-01) — 등록된 shortcut이 내장 keyboard shortcut(9개 확장)과
 * 항상 우선순위로 공존하고, 겹치는 키는 console.warn으로만 알린다(등록을
 * 막지 않는다, roadmap.md "결정").
 */
import { describe, expect, it, vi } from "vitest";

import { createEditor } from "../src/index.js";
import { contentTextStart, dispatchKeydown } from "./block-test-support.js";
import { paragraphDocument } from "./editor-controller-support.js";
import {
  documentOf,
  mountTiptapEditor,
  paragraphBlock,
} from "./list-item-block-type-support.js";

describe("에디터 컨트롤러 keyboardShortcuts", () => {
  it("등록된 shortcut을 누르면 handler가 실행되고 반환값대로 키 이벤트가 소비된다", () => {
    let called = false;
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      keyboardShortcuts: {
        F13: () => {
          called = true;
          return true;
        },
      },
    });
    const { tiptap } = mountTiptapEditor(editor);

    const handled = dispatchKeydown(tiptap, "F13");

    expect(called).toBe(true);
    expect(handled).toBe(true);
  });

  it("등록한 키가 내장 shortcut과 같아도 소비자 handler가 먼저 실행되고 내장 handler는 호출되지 않는다", () => {
    let called = false;
    const editor = createEditor({
      initialDocument: documentOf(
        paragraphBlock("p1", "first"),
        paragraphBlock("p2", "second"),
      ),
      keyboardShortcuts: {
        Tab: () => {
          called = true;
          return true;
        },
      },
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "p2"));

    const handled = dispatchKeydown(tiptap, "Tab");

    expect(called).toBe(true);
    expect(handled).toBe(true);
    // 내장 IndentKeyboardExtension이 대신 실행됐다면 p2가 p1의 자식으로
    // 들여쓰기됐을 것이다 — 소비자가 우선했으니 문서는 평평한 그대로다.
    expect(editor.getDocument()).toMatchObject({
      blocks: [{ id: "p1" }, { id: "p2" }],
    });
  });

  it("소비자 handler가 false를 반환하면 내장 shortcut이 이어서 실행된다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        paragraphBlock("p1", "first"),
        paragraphBlock("p2", "second"),
      ),
      keyboardShortcuts: {
        Tab: () => false,
      },
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "p2"));

    const handled = dispatchKeydown(tiptap, "Tab");

    // TrailingBlockExtension이 최상위 목록 끝에 빈 문단을 자동 유지하므로
    // blocks[0](p1이 p2를 흡수한 결과)만 확인한다 — 전체 배열 길이는
    // 이 DELTA의 관심사가 아니다.
    expect(handled).toBe(true);
    expect(editor.getDocument().blocks[0]).toMatchObject({
      id: "p1",
      children: [{ id: "p2" }],
    });
  });

  it("내장 키와 겹치는 이름으로 등록하면 console.warn이 호출된다", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    createEditor({
      initialDocument: paragraphDocument("content"),
      keyboardShortcuts: { Tab: () => true },
    });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Tab"));
    warnSpy.mockRestore();
  });

  it("내장 키와 겹치지 않는 이름으로 등록하면 console.warn이 호출되지 않는다", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    createEditor({
      initialDocument: paragraphDocument("content"),
      keyboardShortcuts: { F13: () => true },
    });

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("keyboardShortcuts를 지정하지 않으면 기존 내장 shortcut 동작이 그대로 유지된다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        paragraphBlock("p1", "first"),
        paragraphBlock("p2", "second"),
      ),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "p2"));

    const handled = dispatchKeydown(tiptap, "Tab");

    expect(handled).toBe(true);
    expect(editor.getDocument().blocks[0]).toMatchObject({
      id: "p1",
      children: [{ id: "p2" }],
    });
  });
});
