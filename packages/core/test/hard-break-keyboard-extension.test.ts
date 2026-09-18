/**
 * heading(level 2~6)/paragraph/quote/list-item(4종)/callout(Issue #209
 * BLK-020)에서 Shift+Enter로 hardBreak를 삽입하는
 * HardBreakKeyboardExtension의 계약을 확인한다(RD-002). h1 예외(그릴링
 * 결정 Q2)도 이 파일이 소유한다. table 안 계약
 * (RD-003)은 table-keyboard-extension.test.ts/editor-controller-table.test.ts가
 * 소유 — 여기서는 이 확장 자신이 "관여하지 않는다"만 codeBlock과 함께
 * 확인한다. codeBlock 안 Shift+Enter가 실제로 어떻게 되는지(캐럿 위치에서
 * codeBlock을 분할해 탈출)는 이 확장보다 먼저 실행되는
 * CodeBlockExitExtension(priority 1_100)의 계약이다 —
 * code-block-exit-extension.test.ts가 소유(2026-09-15 사용자 요청).
 *
 * 키 소비는 real DOM KeyboardEvent(pressShiftEnter)로 시뮬레이션한다 —
 * addKeyboardShortcuts로만 등록돼 editor.commands로 노출되지 않는다
 * (block-split-collapsed.test.ts의 pressEnter와 같은 이유).
 */
import type { Block, Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import {
  mountTiptapEditor,
  sequentialIds,
} from "./editor-controller-support.js";

const pressShiftEnter = (editable: HTMLElement) => {
  editable.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
};

const singleBlockDocument = (block: Block): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [block],
});

// "a"와 "b" 사이(첫 텍스트 노드 시작+1)에 캐럿을 둔다 — 모든 케이스가
// content: [{ text: "ab" }] 하나만 가진 단일 블록 문서라 첫 텍스트 노드가
// 곧 유일한 텍스트 노드다.
const caretBetweenAB = (doc: import("@tiptap/pm/model").Node): number => {
  let pos: number | null = null;
  doc.descendants((node, nodePos) => {
    if (pos !== null) return false;
    if (node.isText) {
      pos = nodePos + 1;
      return false;
    }
    return true;
  });
  if (pos === null) throw new Error("caretPos 조회 실패");
  return pos;
};

describe("Shift+Enter로 hardBreak를 삽입한다(RD-002)", () => {
  it.each<[string, Block]>([
    ["paragraph", { id: "b1", type: "paragraph", content: [{ text: "ab" }] }],
    [
      "heading level 2",
      { id: "b1", type: "heading", level: 2, content: [{ text: "ab" }] },
    ],
    [
      "heading level 6",
      { id: "b1", type: "heading", level: 6, content: [{ text: "ab" }] },
    ],
    ["quote", { id: "b1", type: "quote", content: [{ text: "ab" }] }],
    [
      "bulletListItem",
      { id: "b1", type: "bulletListItem", content: [{ text: "ab" }] },
    ],
    [
      "numberedListItem",
      { id: "b1", type: "numberedListItem", content: [{ text: "ab" }] },
    ],
    [
      "checkListItem",
      {
        id: "b1",
        type: "checkListItem",
        checked: false,
        content: [{ text: "ab" }],
      },
    ],
    [
      "toggleListItem",
      { id: "b1", type: "toggleListItem", content: [{ text: "ab" }] },
    ],
    ["callout", { id: "b1", type: "callout", content: [{ text: "ab" }] }],
  ])(
    "%s 블록의 텍스트 중간에서 Shift+Enter를 누르면 hardBreak가 삽입되고 텍스트 순서는 보존된다",
    (_label, block) => {
      const editor = createEditor({
        initialDocument: singleBlockDocument(block),
        createId: sequentialIds("id"),
      });
      const { editable, tiptap } = mountTiptapEditor(editor);

      tiptap.commands.setTextSelection(caretBetweenAB(tiptap.state.doc));

      pressShiftEnter(editable);

      let hardBreakFound = false;
      let textOrder = "";
      tiptap.state.doc.descendants((node) => {
        if (node.type.name === "hardBreak") hardBreakFound = true;
        if (node.isText) textOrder += node.text ?? "";
      });

      // 변이: HardBreakKeyboardExtension을 extensions 배열에서 빼면
      // hardBreakFound가 false로 남아 실패한다.
      expect(hardBreakFound).toBe(true);
      expect(textOrder).toBe("ab");
    },
  );
});

describe("h1에서는 Shift+Enter를 완전히 무시한다(RD-002, 그릴링 결정 Q2)", () => {
  it("heading level 1의 텍스트 중간에서 Shift+Enter를 눌러도 문서가 바뀌지 않는다", () => {
    const editor = createEditor({
      initialDocument: singleBlockDocument({
        id: "b1",
        type: "heading",
        level: 1,
        content: [{ text: "ab" }],
      }),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);

    tiptap.commands.setTextSelection(caretBetweenAB(tiptap.state.doc));
    const before = tiptap.state.doc;

    pressShiftEnter(editable);

    // 변이: level 1 특수 분기를 지우면 h1에도 hardBreak가 삽입돼 doc.eq가
    // false를 반환한다.
    expect(tiptap.state.doc.eq(before)).toBe(true);
  });
});

describe("codeBlock 안 Shift+Enter는 이 확장이 관여하지 않는다", () => {
  it("codeBlock 텍스트 중간에서 Shift+Enter를 눌러도 hardBreak가 생기지 않고 크래시하지 않는다", () => {
    const editor = createEditor({
      initialDocument: singleBlockDocument({
        id: "b1",
        type: "codeBlock",
        content: [{ text: "ab" }],
      }),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);

    tiptap.commands.setTextSelection(caretBetweenAB(tiptap.state.doc));

    // codeBlock content(`"text*"`)는 hardBreak(inline 그룹)를 받지 않는다 —
    // 이 확장 자신의 allow-list(HARD_BREAK_TARGET_NODE_TYPES)가 codeBlock을
    // 걸러 insertContent를 아예 시도하지 않는다. 2026-09-15부터는 그
    // 이전에 우선순위가 더 높은 CodeBlockExitExtension이 Shift-Enter를
    // 먼저 소비해(캐럿 위치에서 codeBlock을 분할) 이 확장의 핸들러 자체가
    // 호출되지 않는다 — 어느 경로든 이 확장이 hardBreak를 넣는 일은 없다.
    // 던지면 실패.
    expect(() => pressShiftEnter(editable)).not.toThrow();

    let hardBreakFound = false;
    tiptap.state.doc.descendants((node) => {
      if (node.type.name === "hardBreak") hardBreakFound = true;
    });
    expect(hardBreakFound).toBe(false);
  });
});
