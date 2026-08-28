/**
 * 빈 블록 placeholder 데코레이션(UI-009, spec §6.4)을 검증한다.
 * 빈 paragraph는 캐럿(selection anchor)이 그 블록 안에 있을 때만, 빈
 * heading(레벨 1·2·3)은 캐럿 위치와 무관하게 data-placeholder 속성을 받고,
 * 표 셀 안에는 붙지 않으며, 저장 문서에는 어떤 흔적도 남기지 않는다
 * (계획 완료 조건 1~4).
 */
import type { Document } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  mountTiptapEditor,
  paragraphDocument,
  sequentialIds,
} from "./editor-controller-support.js";

const PARAGRAPH_PLACEHOLDER = "Enter text or type '/' for commands";

/**
 * 빈 paragraph(p-empty)와 내용 있는 paragraph(p-filled)를 나란히 둔 문서.
 * 캐럿 위치에 따른 paragraph placeholder 표시·미표시를 한 문서로 관찰한다.
 * 마지막 블록이 자식 없는 paragraph라 trailing 자동 추가가 개입하지 않는다.
 */
const emptyAndFilledParagraphs = (): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    { id: "p-empty", type: "paragraph", content: [] },
    { id: "p-filled", type: "paragraph", content: [{ text: "filled" }] },
  ],
});

/**
 * 빈 heading 1·2·3 뒤에 내용 있는 paragraph를 둔 문서. 캐럿을 마지막
 * paragraph에 두고 heading placeholder의 "상시" 조건을 관찰한다.
 */
const emptyHeadingsDocument = (): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    { id: "head-1", type: "heading", level: 1, content: [] },
    { id: "head-2", type: "heading", level: 2, content: [] },
    { id: "head-3", type: "heading", level: 3, content: [] },
    { id: "p-end", type: "paragraph", content: [{ text: "end" }] },
  ],
});

/**
 * 문서의 첫 tableCell 내부 위치를 찾는다 — 빈 셀에 캐럿을 두는 용도.
 * 셀 content는 "inline*"이라 셀 시작 + 1이 곧 텍스트 내부다.
 */
const firstCellInterior = (tiptap: Pick<TiptapEditor, "state">): number => {
  let found: number | null = null;
  tiptap.state.doc.descendants((node, position) => {
    if (found !== null) return false;
    if (node.type.name === "tableCell") {
      found = position + 1;
      return false;
    }
    return true;
  });
  if (found === null) throw new Error("tableCell 조회 실패");
  return found;
};

describe("placeholder 데코레이션", () => {
  it("캐럿이 있는 빈 paragraph에만 placeholder가 붙는다", () => {
    const editor = createEditor({
      initialDocument: emptyAndFilledParagraphs(),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "p-empty"));
    expect(editable.querySelector("p")?.getAttribute("data-placeholder")).toBe(
      PARAGRAPH_PLACEHOLDER,
    );

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "p-filled"));
    expect(editable.querySelectorAll("[data-placeholder]")).toHaveLength(0);
  });

  it("빈 heading은 캐럿 위치와 무관하게 레벨별 placeholder가 붙는다", () => {
    const editor = createEditor({ initialDocument: emptyHeadingsDocument() });
    const { editable, tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "p-end"));

    expect(editable.querySelector("h1")?.getAttribute("data-placeholder")).toBe(
      "Heading 1",
    );
    expect(editable.querySelector("h2")?.getAttribute("data-placeholder")).toBe(
      "Heading 2",
    );
    expect(editable.querySelector("h3")?.getAttribute("data-placeholder")).toBe(
      "Heading 3",
    );
  });

  it("표 셀 안 빈 블록에는 placeholder가 붙지 않는다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("id"),
    });
    const inserted = editor.commands.insertTable("block-1", {
      rows: 1,
      columns: 1,
    });
    if (!inserted.ok) throw new Error("표 삽입 fixture 준비 실패");
    const { editable, tiptap } = mountTiptapEditor(editor);

    tiptap.commands.setTextSelection(firstCellInterior(tiptap));
    expect(editable.querySelectorAll("[data-placeholder]")).toHaveLength(0);
  });

  it("placeholder 표시가 저장 문서에 흔적을 남기지 않는다", () => {
    const editor = createEditor({
      initialDocument: emptyAndFilledParagraphs(),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    const before = editor.getDocument();

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "p-empty"));
    expect(editable.querySelector("[data-placeholder]")).not.toBeNull();
    expect(editor.getDocument()).toEqual(before);
  });
});
