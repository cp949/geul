/**
 * ClipboardPasteExtension이 목록이 아닌 HTML(heading·quote·codeBlock·
 * paragraph·divider)과 Markdown 텍스트 감지 붙여넣기를 io.importHtml/
 * detectMarkdownPaste + modelToTiptap로 중첩·안정 id까지 보존해 반영하는지
 * 검증한다(Issue #38 슬라이스 10 RD-004). 표 셀 안 가드, 우선순위 경계
 * (HTML/Markdown/plain/무시), depth-clamp, 비표 블록 id 전역 재발급,
 * Google Docs류 클립보드 잡음 내성을 함께 다룬다.
 */
import { MAX_NESTING_DEPTH, type Block } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import {
  pasteData,
  pasteHtml,
  withUnhandledErrorTracking,
} from "./clipboard-test-support.js";
import {
  documentOf,
  editorWithTable,
  maxBlockDepth,
  mountTiptapEditor,
  paragraphBlock,
  paragraphDocument,
  sequentialIds,
} from "./editor-controller-support.js";
import { placeCaretInCell } from "./table-test-support.js";

/**
 * depth단짜리 own-export 형태 wrapper HTML 체인 — 가장 바깥이 top-level,
 * 안쪽으로 갈수록 한 단씩 중첩된다(`html-depth-support.ts`의
 * buildNestedWrapperHtml과 같은 구조, io/core 패키지 경계 때문에 코드는
 * 독립 작성). 리프는 `t<depth>`, 나머지는 own-export의 두 own-content
 * 자리(자기 자신 + dataBeChildren 컨테이너) 형태를 그대로 쓴다.
 */
const nestedParagraphWrapperHtml = (depth: number): string => {
  let html = "";
  for (let level = depth; level >= 1; level -= 1) {
    html = `<div data-be-block-id="w${level}"><p data-be-block-id="p${level}">t${level}</p><div data-be-children="1">${html}</div></div>`;
  }
  return html;
};

/** depth단짜리 paragraph 체인 model Block — chain-1이 top-level, chain-depth가
 * 가장 깊다(top-level=1 기준 절대 깊이 depth). */
const buildParagraphDepthChain = (depth: number): Block => {
  let innermost = paragraphBlock(`chain-${depth}`, "leaf");
  for (let level = depth - 1; level >= 1; level -= 1) {
    innermost = paragraphBlock(`chain-${level}`, "mid", [innermost]);
  }
  return innermost;
};

describe("ClipboardPasteExtension", () => {
  it("표 셀 안에서는 붙여넣기를 가로채지 않는다", () => {
    const { editor, cellIds } = editorWithTable();
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    const cellId = cellIds[0];
    if (cellId === undefined) throw new Error("셀 fixture 준비 실패");
    placeCaretInCell(tiptap, cellId);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, "<blockquote>q</blockquote>");

      const blocks = editor.getDocument().blocks;
      expect(blocks.filter((block) => block.type === "table")).toHaveLength(1);
      expect(blocks.some((block) => block.type === "quote")).toBe(false);
      expect(errors).toEqual([]);
    });
  });

  it.each([
    ["heading", "<h4>t</h4>", { type: "heading", level: 4 }],
    ["quote", "<blockquote>q</blockquote>", { type: "quote" }],
    ["paragraph", "<p>p</p>", { type: "paragraph" }],
  ])(
    "%s HTML 붙여넣기가 해당 블록 타입으로 정확히 반영된다",
    (_label, html, expected) => {
      const editor = createEditor({
        initialDocument: paragraphDocument("seed"),
        createId: sequentialIds("id"),
      });
      const { editable, tiptap } = mountTiptapEditor(editor);
      editable.focus();
      tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

      withUnhandledErrorTracking((errors) => {
        pasteHtml(editable, html);

        const inserted = editor.getDocument().blocks[1];
        expect(inserted).toMatchObject(expected);
        expect(errors).toEqual([]);
      });
    },
  );

  it("codeBlock HTML 붙여넣기가 codeBlock으로 정확히 반영된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, "<pre><code>c</code></pre>");

      const inserted = editor.getDocument().blocks[1];
      expect(inserted).toMatchObject({
        type: "codeBlock",
        content: [{ text: "c" }],
      });
      expect(errors).toEqual([]);
    });
  });

  // 외부 <hr> 단독 붙여넣기가 divider로 반영된다(BLK-006 해소) — 이
  // 확장이 표 아닌 HTML 전부를 처리한다(RD-005).
  it("외부 <hr> 붙여넣기가 divider 블록으로 반영된다(BLK-006)", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, "<hr>");

      const inserted = editor.getDocument().blocks[1];
      expect(inserted).toMatchObject({ type: "divider" });
      expect(errors).toEqual([]);
    });
  });

  // readiness probe 스파이크(회귀 편입) — Google Docs류 클립보드 잡음이
  // 섞여도 io.importHtml의 기존 sanitizer가 이미 제거해 별도 정규화 없이
  // 의도한 블록만 반영된다.
  it("Google Docs류 클립보드 잡음이 섞여도 의도한 블록만 반영된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(
        editable,
        '<meta charset="utf-8"><style>p { margin: 0; }</style>' +
          "<!--StartFragment--><p>text</p><!--EndFragment-->",
      );

      const inserted = editor.getDocument().blocks[1];
      expect(inserted).toMatchObject({
        type: "paragraph",
        content: [{ text: "text" }],
      });
      expect(errors).toEqual([]);
    });
  });

  it("text/html이 없고 Markdown이 감지되면 그 구조로 반영된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteData(editable, { "text/plain": "# 제목\n\n- 항목" });

      const blocks = editor.getDocument().blocks;
      expect(blocks[1]).toMatchObject({
        type: "heading",
        level: 1,
        content: [{ text: "제목" }],
      });
      expect(blocks[2]).toMatchObject({
        type: "bulletListItem",
        content: [{ text: "항목" }],
      });
      expect(errors).toEqual([]);
    });
  });

  it("단일 plain 문단은 감지되지 않아 이벤트를 소비하지 않고 PM 기본 처리에 위임한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteData(editable, { "text/plain": "world" });

      const blocks = editor.getDocument().blocks;
      // 새 블록이 생기지 않고 캐럿이 있던 문단에 텍스트가 그대로
      // 이어붙는다 — PM 기본 plain text 붙여넣기 위임 계약.
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({ content: [{ text: "seedworld" }] });
      expect(errors).toEqual([]);
    });
  });

  it("text/html과 text/plain이 모두 없으면 문서를 바꾸지 않는다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable } = mountTiptapEditor(editor);
    editable.focus();
    const before = editor.getDocument();

    withUnhandledErrorTracking((errors) => {
      pasteData(editable, {});

      expect(editor.getDocument()).toEqual(before);
      expect(errors).toEqual([]);
    });
  });

  // AGENTS.md 안정 id 불변식 — own HTML이 대상 문서와 같은
  // data-be-block-id를 담고 있어도 삽입 하위 트리 id는 전부 새로 발급된다.
  // 충돌하는 id("block-1")로만 검증하면 BlockIdExtension의 사후 중복
  // 보정(appendTransaction, block-id-extension.ts)이 이 확장의 재발급
  // 없이도 우연히 같은 결과를 낸다 — 이 확장 자신의 재발급을 직접
  // 검증하려면 대상 문서와 충돌하지 않는 리터럴 id를 써서, 보정이 아니라
  // 재발급 자체가 값을 바꿨는지 확인해야 한다.
  it("own HTML의 원본 data-be-block-id는 대상 문서와 충돌하지 않아도 재발급된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, '<p data-be-block-id="literal-custom-id">dup</p>');

      const blocks = editor.getDocument().blocks;
      expect(blocks[1]?.id).not.toBe("literal-custom-id");
      expect(blocks[1]?.id).toBe("id-1");
      expect(errors).toEqual([]);
    });
  });

  // Issue #143 N1과 동일 재현 조건 — 삽입 대상 위치가 이미 깊으면 slice
  // 자신의 내부 높이만으로는 못 잡는 합산 초과를 depth-clamp가 잡는다.
  it("삽입 위치 depth와 콘텐츠 높이의 합이 상한을 넘으면 throw 없이 평탄화한다", () => {
    const deepChainDepth = 62;
    const editor = createEditor({
      initialDocument: documentOf(buildParagraphDepthChain(deepChainDepth)),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    // 가장 깊은 문단("leaf") 콘텐츠 시작 지점에 캐럿을 둔다 —
    // block-test-support.ts의 contentTextStart와 같은 목적이지만 이
    // 파일은 그 helper가 전제하는 chain-N 텍스트 규칙을 쓰지 않아 직접
    // 계산한다.
    let target = -1;
    tiptap.state.doc.descendants((node, pos) => {
      if (target !== -1) return false;
      if (node.isText && node.text === "leaf") target = pos;
      return true;
    });
    expect(target).toBeGreaterThanOrEqual(0);
    tiptap.commands.setTextSelection(target + 1);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, nestedParagraphWrapperHtml(5));

      expect(errors).toEqual([]);
      const document = editor.getDocument();
      expect(maxBlockDepth(document.blocks)).toBeLessThanOrEqual(
        MAX_NESTING_DEPTH,
      );
    });
  });
});
