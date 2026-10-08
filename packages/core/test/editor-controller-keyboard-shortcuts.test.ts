/**
 * CreateEditorOptions.keyboardShortcuts 등록 계약 테스트(spec §5, EXT-005,
 * RD-002-DELTA-01, Issue #307).
 *
 * - 등록 handler는 내장 keymap보다 먼저 실행된다.
 * - handler가 true를 반환하면 내장 동작을 건너뛴다.
 * - handler가 false를 반환하면 내장 동작이 이어진다.
 * - 겹치는 키는 console.warn으로만 알린다(등록을 막지 않는다).
 * - 순서는 확장 priority가 정한다. 배열 위치가 아니다.
 */
import { getExtensionField, type Editor as TiptapEditor } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";

import { createEditor } from "../src/index.js";
import { CUSTOM_KEYBOARD_SHORTCUTS_PRIORITY } from "../src/custom-keyboard-shortcuts-extension.js";
import {
  contentTextStart,
  dispatchKeydown,
  dispatchModifiedKeydown,
} from "./block-test-support.js";
import { editorState, paragraphDocument } from "./editor-controller-support.js";
import {
  codeBlockBlock,
  documentOf,
  mountTiptapEditor,
  paragraphBlock,
} from "./list-item-block-type-support.js";
import {
  expectNoOpConsumed,
  inBlock,
  inCell,
  run,
  singleCellTable,
  TAIL,
} from "./table-boundary-test-support.js";

type CaretPlace = "p2Start" | "p1End" | "codeBlock";

/**
 * 키마다 내장 handler가 먼저 처리하던 대표 위치다.
 * - p2Start: 문단 둘 중 둘째 문단 시작.
 * - p1End: 첫째 문단 끝. 뒤에 둘째 문단이 있다.
 * - codeBlock: codeBlock 한가운데.
 *
 * 키를 전부 명시 열거한다. 기본값 규칙을 두면 새 내장 키가 조용히 통과한다.
 */
const CARET_PLACE_BY_KEY: Record<string, CaretPlace> = {
  Enter: "p2Start",
  "Shift-Enter": "codeBlock",
  "Mod-Enter": "p2Start",
  Backspace: "p2Start",
  "Mod-Backspace": "p2Start",
  "Shift-Backspace": "p2Start",
  Delete: "p1End",
  "Mod-Delete": "p1End",
  "Mod-a": "p2Start",
  "Mod-b": "codeBlock",
  "Mod-B": "codeBlock",
  "Mod-i": "codeBlock",
  "Mod-I": "codeBlock",
  "Mod-u": "codeBlock",
  "Mod-U": "codeBlock",
  "Mod-Shift-s": "codeBlock",
  "Mod-e": "codeBlock",
  "Mod-z": "p2Start",
  "Shift-Mod-z": "p2Start",
  "Mod-y": "p2Start",
  "Mod-я": "p2Start",
  "Shift-Mod-я": "p2Start",
  Tab: "p2Start",
  "Shift-Tab": "p2Start",
  ArrowLeft: "p2Start",
  ArrowRight: "p2Start",
  ArrowUp: "p2Start",
  ArrowDown: "p2Start",
  "Mod-Alt-0": "p2Start",
  "Mod-Alt-1": "p2Start",
  "Mod-Alt-2": "p2Start",
  "Mod-Alt-3": "p2Start",
  "Mod-Alt-4": "p2Start",
  "Mod-Alt-5": "p2Start",
  "Mod-Alt-6": "p2Start",
  "Mod-Alt-q": "p2Start",
  "Mod-Shift-6": "p2Start",
  "Mod-Shift-7": "p2Start",
  "Mod-Shift-8": "p2Start",
  "Mod-Shift-9": "p2Start",
  "Shift-Mod-ArrowUp": "p2Start",
  "Shift-Mod-ArrowDown": "p2Start",
};

/**
 * 키 집합에서 뺀 키와 이유다. 비어 있어야 한다.
 * 디스패치할 수 없는 키가 생기면 이유와 함께 여기에 적는다.
 */
const EXCLUDED_KEYS: Record<string, string> = {};

/**
 * 조립된 편집기의 내장 keymap 키를 런타임으로 모은다.
 * production 경고 로직(collectBuiltinKeyboardShortcutKeys)과 같은 순회다.
 */
const collectKeymapKeys = (tiptap: TiptapEditor, ownName: string): string[] => {
  const keys = new Set<string>();
  for (const extension of tiptap.extensionManager.extensions) {
    if (extension.name === ownName) continue;
    const context = {
      name: extension.name,
      options: extension.options,
      storage: (tiptap.extensionStorage as unknown as Record<string, unknown>)[
        extension.name
      ],
      editor: tiptap,
    };
    const addKeyboardShortcuts = getExtensionField<
      () => Record<string, unknown>
    >(extension, "addKeyboardShortcuts", context);
    if (addKeyboardShortcuts === undefined) continue;
    for (const key of Object.keys(addKeyboardShortcuts())) keys.add(key);
  }
  return [...keys].sort();
};

/** keymap 표기("Shift-Mod-z")를 KeyboardEvent 수식 키와 key로 푼다. */
const dispatchKeymapKey = (
  tiptap: TiptapEditor,
  keymapKey: string,
): boolean => {
  const parts = keymapKey.split("-");
  const key = parts[parts.length - 1] as string;
  const modifiers = {
    ctrlKey: parts.includes("Mod") || parts.includes("Ctrl"),
    shiftKey: parts.includes("Shift"),
    altKey: parts.includes("Alt"),
    metaKey: parts.includes("Meta"),
  };
  return dispatchModifiedKeydown(tiptap, key, modifiers);
};

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

  it("등록 확장 priority가 상수와 같고 다른 모든 확장 priority의 최댓값보다 크다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      keyboardShortcuts: { F13: () => true },
    });
    const { tiptap } = mountTiptapEditor(editor);

    const priorities = tiptap.extensionManager.extensions.map((extension) => ({
      name: extension.name,
      // Tiptap은 priority가 없는 확장을 100으로 정렬한다.
      priority: (extension.config.priority as number | undefined) ?? 100,
    }));
    const own = priorities.find(
      (entry) => entry.name === "customKeyboardShortcuts",
    );
    const others = priorities.filter(
      (entry) => entry.name !== "customKeyboardShortcuts",
    );

    expect(CUSTOM_KEYBOARD_SHORTCUTS_PRIORITY).toBe(10_000);
    expect(own?.priority).toBe(CUSTOM_KEYBOARD_SHORTCUTS_PRIORITY);
    expect(own?.priority).toBeGreaterThan(
      Math.max(...others.map((entry) => entry.priority)),
    );
  });

  describe("내장 keymap 키 전체", () => {
    it("위치 표의 키와 조립된 편집기의 내장 keymap 키 집합이 정확히 일치한다", () => {
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
        keyboardShortcuts: { F13: () => true },
      });
      const { tiptap } = mountTiptapEditor(editor);

      const runtimeKeys = collectKeymapKeys(tiptap, "customKeyboardShortcuts");
      const covered = [
        ...Object.keys(CARET_PLACE_BY_KEY),
        ...Object.keys(EXCLUDED_KEYS),
      ].sort();

      // 새 내장 키는 위치 표에 추가하거나 제외 목록에 이유와 함께 적는다.
      expect(runtimeKeys.filter((key) => !covered.includes(key))).toEqual([]);
      expect(covered.filter((key) => !runtimeKeys.includes(key))).toEqual([]);
    });

    it.each(Object.entries(CARET_PLACE_BY_KEY))(
      "%s: 등록 handler가 true를 반환하면 호출되고 문서와 selection이 그대로다 (%s)",
      (key, place) => {
        const handler = vi.fn(() => true);
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const editor = createEditor({
          initialDocument:
            place === "codeBlock"
              ? documentOf(
                  paragraphBlock("p1", "first"),
                  codeBlockBlock("c1", "code"),
                )
              : documentOf(
                  paragraphBlock("p1", "first"),
                  paragraphBlock("p2", "second"),
                ),
          keyboardShortcuts: { [key]: handler },
        });
        warnSpy.mockRestore();
        const { tiptap } = mountTiptapEditor(editor);
        const caret =
          place === "p2Start"
            ? contentTextStart(tiptap, "p2")
            : place === "p1End"
              ? contentTextStart(tiptap, "p1") + "first".length
              : contentTextStart(tiptap, "c1") + 2;
        tiptap.commands.setTextSelection(caret);
        const before = editorState(editor, tiptap);

        const handled = dispatchKeymapKey(tiptap, key);

        expect(handler).toHaveBeenCalled();
        expect(handled).toBe(true);
        expect(editorState(editor, tiptap)).toEqual(before);
      },
    );
  });

  describe("표 경계에 걸친 범위(TableBoundaryInput 보호)", () => {
    // 셀 안 2글자 뒤부터 뒤 문단 2글자 뒤까지 잡은 범위다. 내장 priority가 가장
    // 높은 보호 확장(1_200)이 먼저 처리하던 위치다.
    it.each([
      { label: "Enter", key: "Enter", shiftKey: false },
      { label: "Backspace", key: "Backspace", shiftKey: false },
      { label: "Delete", key: "Delete", shiftKey: false },
      { label: "Shift-Enter", key: "Enter", shiftKey: true },
    ])(
      "$label: 등록 handler가 true를 반환하면 호출되고 문서가 그대로다",
      ({ label, key, shiftKey }) => {
        const handler = vi.fn(() => true);
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const result = run(
          [singleCellTable("t", "cell"), paragraphBlock("w", "wxyz"), TAIL],
          inCell("t-r0c0", 2),
          inBlock("w", 2),
          (tiptap) => dispatchKeydown(tiptap, key, shiftKey),
          { keyboardShortcuts: { [label]: handler } },
        );
        warnSpy.mockRestore();

        expect(handler).toHaveBeenCalledTimes(1);
        expectNoOpConsumed(result);
      },
    );
  });

  it("Enter에 등록한 handler가 false를 반환하면 내장 BlockSplit이 이어져 블록이 늘어난다", () => {
    const handler = vi.fn(() => false);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const editor = createEditor({
      initialDocument: documentOf(
        paragraphBlock("p1", "first"),
        paragraphBlock("p2", "second"),
      ),
      keyboardShortcuts: { Enter: handler },
    });
    warnSpy.mockRestore();
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "p2"));
    const countBefore = editor.getDocument().blocks.length;

    const handled = dispatchKeydown(tiptap, "Enter");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handled).toBe(true);
    expect(editor.getDocument().blocks).toHaveLength(countBefore + 1);
  });

  it("겹침 경고가 true는 내장 동작을 건너뛰고 false는 내장 동작이 이어진다고 알린다", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    createEditor({
      initialDocument: paragraphDocument("content"),
      keyboardShortcuts: { Enter: () => true },
    });

    const message = String(warnSpy.mock.calls[0]?.[0]);
    warnSpy.mockRestore();
    expect(message).toContain("handler가 먼저 실행된다");
    expect(message).toContain("true를 반환하면 내장 동작");
    expect(message).toContain("건너뛴다");
    expect(message).toContain("false를 반환하면 내장 동작이 이어진다");
  });
});
