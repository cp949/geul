/**
 * 빈 블록 placeholder 데코레이션(UI-009, spec §6.4)을 검증한다.
 * 빈 paragraph는 캐럿(selection anchor)이 그 블록 안에 있을 때만, 빈
 * heading(레벨 1~6)·빈 quote는 캐럿 위치와 무관하게 data-placeholder
 * 속성을 받고, 표 셀 안에는 붙지 않으며, 저장 문서에는 어떤 흔적도 남기지
 * 않는다(계획 완료 조건 1~4, Issue #38 슬라이스 3 DELTA-05 05-C3).
 */
import type { Document } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  documentOf,
  headingLevels456Document,
  mountTiptapEditor,
  paragraphDocument,
  sequentialIds,
} from "./editor-controller-support.js";

const PARAGRAPH_PLACEHOLDER = "Enter text or type '/' for commands";
const QUOTE_PLACEHOLDER = "Quote";

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
 * 빈 quote 하나 뒤에 내용 있는 paragraph를 둔 문서. 캐럿을 quote 안·밖
 * 양쪽에 두고 quote placeholder의 "상시" 조건을 관찰한다.
 */
const emptyQuoteDocument = (): Document =>
  documentOf(
    { id: "q-empty", type: "quote", content: [] },
    { id: "p-end", type: "paragraph", content: [{ text: "end" }] },
  );

/**
 * headingLevels456Document의 heading 셋(h4·h5·h6)을 비운 변형 — 꼬리
 * 문단(tail)은 그대로 둬 캐럿을 heading 밖에 둘 수 있다.
 */
const emptyHeadings456Document = (): Document => ({
  ...headingLevels456Document(),
  blocks: headingLevels456Document().blocks.map((block) =>
    block.type === "heading" ? { ...block, content: [] } : block,
  ),
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

  it("빈 quote는 캐럿 위치와 무관하게 Quote placeholder가 붙고 저장 문서에 흔적이 없다", () => {
    const editor = createEditor({ initialDocument: emptyQuoteDocument() });
    const { editable, tiptap } = mountTiptapEditor(editor);
    const before = editor.getDocument();

    // 캐럿이 quote 밖(p-end)에 있어도 붙는다 — heading과 같은 상시 조건.
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "p-end"));
    expect(
      editable.querySelector("blockquote")?.getAttribute("data-placeholder"),
    ).toBe(QUOTE_PLACEHOLDER);
    // 내용 있는 p-end에는 붙지 않는다 — data-placeholder는 quote 하나뿐이다.
    expect(editable.querySelectorAll("[data-placeholder]")).toHaveLength(1);

    // 캐럿이 quote 안에 있어도 같은 문구다.
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "q-empty"));
    expect(
      editable.querySelector("blockquote")?.getAttribute("data-placeholder"),
    ).toBe(QUOTE_PLACEHOLDER);

    // 데코레이션일 뿐 저장 문서는 로드 그대로다.
    expect(editor.getDocument()).toEqual(before);
    expect(editor.getDocument().blocks[0]).toEqual({
      id: "q-empty",
      type: "quote",
      content: [],
    });
  });

  it("빈 h4·h5·h6에 Heading 4/5/6 placeholder가 상시 붙는다", () => {
    const editor = createEditor({
      initialDocument: emptyHeadings456Document(),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "tail"));

    // 문구는 `Heading ${level}` 보간이다 — level을 하드코딩하면 4~6이
    // 어긋난다(characterization).
    expect(editable.querySelector("h4")?.getAttribute("data-placeholder")).toBe(
      "Heading 4",
    );
    expect(editable.querySelector("h5")?.getAttribute("data-placeholder")).toBe(
      "Heading 5",
    );
    expect(editable.querySelector("h6")?.getAttribute("data-placeholder")).toBe(
      "Heading 6",
    );
    expect(editable.querySelectorAll("[data-placeholder]")).toHaveLength(3);
  });
});
