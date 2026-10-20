/**
 * 링크 `target`이 core의 load/save·편집을 거쳐도 유지되고, target 없는 링크에는 어떤 경로로도
 * 생기지 않는지 검증한다(Issue #424, RD-001-DELTA-03).
 *
 * - Tiptap Link의 기본값(`target: "_blank"`, `rel: "noopener noreferrer nofollow"`)을 끈다.
 *   기본값이 남으면 model로 디코드할 때 새로 만든 모든 링크에 `_blank`가 주입된다.
 * - model↔PM codec 두 경로(문단: tiptap JSON, 표 셀: PM 노드)가 같은 계약을 따른다.
 * - 붙여넣기로 PM에 들어온 허용 밖 target은 문서를 거절시키지 않고 버려진다
 *   (model `decodeTextMark`).
 */
import type { Document, InlineContent } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import { pasteData, pasteHtml } from "./clipboard-test-support.js";
import {
  documentOf,
  documentWithContent,
  mountTiptapEditor,
  oneCellTableBlock,
  paragraphDocument,
  tableBlockIn,
} from "./editor-controller-support.js";

const HREF = "https://example.com";

const emptyParagraphDocument = (): Document =>
  documentOf({ id: "block-1", type: "paragraph", content: [] });

const linkContent = (target?: string): InlineContent => [
  {
    text: "content",
    marks: [
      {
        type: "link",
        href: HREF,
        ...(target === undefined ? {} : { target }),
      },
    ],
  },
];

const tableDocumentWithLink = (target?: string): Document => {
  const table = oneCellTableBlock("table-1");
  if (table.type !== "table") throw new Error("Expected a table block");
  const cell = table.rows[0]?.cells[0];
  if (cell === undefined) throw new Error("Expected a cell");
  cell.content = linkContent(target);
  return {
    formatVersion: 1,
    revision: 0,
    blocks: [{ id: "p-1", type: "paragraph", content: [] }, table],
  };
};

const hasTargetKey = (value: unknown): boolean =>
  JSON.stringify(value).includes('"target"');

describe("링크 target load/save", () => {
  it.each(["_blank", "_self", "_parent", "_top"])(
    "문단 링크 target %s를 createEditor → getDocument에서 유지한다",
    (target) => {
      const initial = documentWithContent(linkContent(target));
      const editor = createEditor({ initialDocument: initial });
      mountTiptapEditor(editor);
      expect(editor.getDocument().blocks).toEqual(initial.blocks);
    },
  );

  it.each(["_blank", "_self"])(
    "replaceDocument → getDocument에서 target %s를 유지한다",
    (target) => {
      const editor = createEditor({
        initialDocument: paragraphDocument("start"),
      });
      mountTiptapEditor(editor);
      const next = documentWithContent(linkContent(target));
      expect(editor.replaceDocument(next)).toEqual({
        ok: true,
        value: undefined,
      });
      expect(editor.getDocument().blocks).toEqual(next.blocks);
    },
  );

  it.each(["_blank", "_self"])(
    "표 셀 링크 target %s를 replaceDocument → getDocument에서 유지한다",
    (target) => {
      const editor = createEditor({
        initialDocument: paragraphDocument("start"),
      });
      mountTiptapEditor(editor);
      const next = tableDocumentWithLink(target);
      expect(editor.replaceDocument(next)).toEqual({
        ok: true,
        value: undefined,
      });
      expect(
        tableBlockIn(editor.getDocument()).rows[0]?.cells[0]?.content,
      ).toEqual(linkContent(target));
    },
  );

  it.each(["_blank", "_self"])(
    "표 명령(행 삽입)이 PM 노드를 다시 디코드해도 셀 링크 target %s가 유지된다",
    (target) => {
      const editor = createEditor({
        initialDocument: paragraphDocument("start"),
      });
      mountTiptapEditor(editor);
      expect(editor.replaceDocument(tableDocumentWithLink(target))).toEqual({
        ok: true,
        value: undefined,
      });
      expect(editor.commands.insertTableRow("table-1", 1)).toEqual({
        ok: true,
        value: undefined,
      });
      const table = tableBlockIn(editor.getDocument());
      expect(table.rows).toHaveLength(2);
      expect(table.rows[0]?.cells[0]?.content).toEqual(linkContent(target));
    },
  );

  it("target 없는 링크는 load/save에서 target 키가 생기지 않는다(문단·표 셀)", () => {
    const editor = createEditor({
      initialDocument: documentWithContent(linkContent()),
    });
    mountTiptapEditor(editor);
    expect(hasTargetKey(editor.getDocument())).toBe(false);

    expect(editor.replaceDocument(tableDocumentWithLink())).toEqual({
      ok: true,
      value: undefined,
    });
    expect(hasTargetKey(editor.getDocument())).toBe(false);
  });

  it("같은 href·다른 target 인접 링크가 load/save에서 병합되지 않는다", () => {
    const content: InlineContent = [
      { text: "a", marks: [{ type: "link", href: HREF }] },
      { text: "b", marks: [{ type: "link", href: HREF, target: "_blank" }] },
      { text: "c", marks: [{ type: "link", href: HREF, target: "_self" }] },
    ];
    const initial = documentWithContent(content);
    const editor = createEditor({ initialDocument: initial });
    mountTiptapEditor(editor);
    expect(editor.getDocument().blocks).toEqual(initial.blocks);
  });

  it("정규형이 아닌 target을 가진 초기 문서를 거부한다", () => {
    expect(() =>
      createEditor({
        initialDocument: documentWithContent(linkContent("_BLANK")),
      }),
    ).toThrow(TypeError);
  });

  it("정규형이 아닌 target을 가진 문서 교체를 원자적으로 거부한다", () => {
    const editor = createEditor({ initialDocument: paragraphDocument("kept") });
    mountTiptapEditor(editor);
    const result = editor.replaceDocument(
      documentWithContent(linkContent("foo")),
    );
    expect(result.ok).toBe(false);
    expect(editor.getDocument().blocks).toEqual(
      paragraphDocument("kept").blocks,
    );
  });
});

describe("새 링크에는 target이 생기지 않는다", () => {
  it("editor.commands.setLink로 만든 링크에 target이 없다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 2, to: 9 });
    expect(editor.commands.setLink(HREF)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument().blocks[0]).toMatchObject({
      content: [{ marks: [{ type: "link", href: HREF }] }],
    });
    expect(hasTargetKey(editor.getDocument())).toBe(false);
  });

  it("tiptap setLink 명령으로 만든 링크에 target이 없다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 2, to: 9 });
    expect(tiptap.commands.setLink({ href: HREF })).toBe(true);
    expect(hasTargetKey(editor.getDocument())).toBe(false);
  });

  it("URL을 입력하고 공백을 치면 생기는 autolink에 target이 없다", () => {
    const editor = createEditor({ initialDocument: emptyParagraphDocument() });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(2);
    tiptap.commands.insertContent("https://example.com ");
    const document = editor.getDocument();
    // autolink가 실제로 만들어졌는지 먼저 확인한다 — 아니면 아래 단언이 공허하다.
    expect(JSON.stringify(document)).toContain('"type":"link"');
    expect(hasTargetKey(document)).toBe(false);
  });

  it("선택 영역에 URL을 붙여넣어 만든 링크(linkOnPaste)에 target이 없다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 2, to: 9 });
    pasteData(tiptap.view.dom, { "text/plain": HREF });
    const document = editor.getDocument();
    expect(JSON.stringify(document)).toContain('"type":"link"');
    expect(hasTargetKey(document)).toBe(false);
  });

  it("편집기 DOM의 링크에 target·rel 속성이 렌더되지 않는다", () => {
    const editor = createEditor({
      initialDocument: documentWithContent(linkContent()),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const anchor = tiptap.view.dom.querySelector("a");
    expect(anchor).not.toBeNull();
    expect(anchor?.hasAttribute("target")).toBe(false);
    expect(anchor?.hasAttribute("rel")).toBe(false);
  });

  it("target이 있는 링크는 편집기 DOM에서 target을 렌더하되 rel은 만들지 않는다", () => {
    const editor = createEditor({
      initialDocument: documentWithContent(linkContent("_blank")),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const anchor = tiptap.view.dom.querySelector("a");
    expect(anchor?.getAttribute("target")).toBe("_blank");
    expect(anchor?.hasAttribute("rel")).toBe(false);
  });
});

describe("편집 중 target 유지", () => {
  it("글자를 입력해도 링크 target이 유지된다", () => {
    const editor = createEditor({
      initialDocument: documentWithContent(linkContent("_blank")),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(5);
    tiptap.commands.insertContent("X");
    expect(editor.getDocument().blocks[0]).toMatchObject({
      content: [
        {
          text: "conXtent",
          marks: [{ type: "link", href: HREF, target: "_blank" }],
        },
      ],
    });
  });

  it("unsetLink 뒤 undo가 target을 복원한다", () => {
    const editor = createEditor({
      initialDocument: documentWithContent(linkContent("_self")),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);
    expect(editor.commands.unsetLink()).toMatchObject({ ok: true });
    expect(hasTargetKey(editor.getDocument())).toBe(false);

    expect(editor.commands.undo()).toMatchObject({ ok: true });
    expect(editor.getDocument().blocks[0]).toMatchObject({
      content: [{ marks: [{ type: "link", href: HREF, target: "_self" }] }],
    });
    expect(editor.commands.redo()).toMatchObject({ ok: true });
    expect(hasTargetKey(editor.getDocument())).toBe(false);
  });

  it("기존 링크의 href를 바꿔도 target이 유지된다", () => {
    const editor = createEditor({
      initialDocument: documentWithContent(linkContent("_blank")),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);
    expect(editor.commands.setLink("https://updated.example.com")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument().blocks[0]).toMatchObject({
      content: [
        {
          marks: [
            {
              type: "link",
              href: "https://updated.example.com",
              target: "_blank",
            },
          ],
        },
      ],
    });
  });
});

describe("붙여넣기로 들어온 target", () => {
  it("HTML 붙여넣기의 target을 정규화해 유지하고 허용 밖 값은 버린다", () => {
    const editor = createEditor({ initialDocument: emptyParagraphDocument() });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(2);
    pasteHtml(
      tiptap.view.dom,
      `<p><a href="${HREF}" target="_BLANK" rel="noopener noreferrer nofollow">kept</a> <a href="${HREF}/b" target="frame1">dropped</a></p>`,
    );
    const json = JSON.stringify(editor.getDocument());
    expect(json).toContain('"target":"_blank"');
    expect(json).not.toContain("frame1");
    expect(json.match(/"target"/g)).toHaveLength(1);
    expect(json).not.toContain("nofollow");
  });
});
