/**
 * 이미지 `alt`가 core의 codec·load/save·명령·편집 화면 렌더를 거쳐도 name·caption과 독립으로
 * 유지되는지 검증한다(Issue #424, RD-002-DELTA-03).
 *
 * - alt는 빈 문자열도 유효값이다(인코드는 null로 부재를 표현하고 디코드는 문자열만 승격한다).
 * - 편집 화면 `<img alt>`는 `alt ?? caption ?? name ?? ""`를 따른다.
 * - `setMediaBlockName`·`setMediaBlockCaption`은 alt를 바꾸지 않는다.
 */
import { exportHtml, importHtml } from "@cp949/geul-io";
import type { Document, ImageBlock } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import { modelToTiptap } from "../src/model-to-tiptap.js";
import { tiptapToModel } from "../src/tiptap-to-model.js";
import {
  documentOf,
  mountTiptapEditor,
  paragraphBlock,
  sequentialIds,
  tailParagraphBlock,
} from "./editor-controller-support.js";

const imageBlock = (
  fields: Partial<Omit<ImageBlock, "id" | "type">>,
): ImageBlock => ({
  id: "image-1",
  type: "image",
  url: "https://example.com/pic.png",
  ...fields,
});

const imageDocument = (fields: Partial<Omit<ImageBlock, "id" | "type">>) =>
  documentOf(imageBlock(fields), tailParagraphBlock);

const renderedAlt = (tiptap: { view: { dom: HTMLElement } }): string | null =>
  tiptap.view.dom
    .querySelector('[data-geul-block-id="image-1"] img')
    ?.getAttribute("alt") ?? null;

const hasAltKey = (document: Document): boolean =>
  JSON.stringify(document.blocks[0]).includes('"alt"');

describe("이미지 alt codec 왕복", () => {
  it.each([
    ["alt만", { alt: "설명" }],
    ["빈 alt", { alt: "" }],
    ["alt와 다른 name·caption", { alt: "대체", name: "이름", caption: "캡션" }],
    ["빈 alt와 name·caption", { alt: "", name: "이름", caption: "캡션" }],
    ["alt 없음", { name: "이름", caption: "캡션" }],
  ] as const)(
    "%s가 modelToTiptap → tiptapToModel에서 같은 문서가 된다",
    (_name, fields) => {
      const document = documentOf(imageBlock(fields));
      const encoded = modelToTiptap(document);
      expect(encoded.ok).toBe(true);
      if (!encoded.ok) return;
      expect(tiptapToModel(encoded.value, 0, sequentialIds("id"))).toEqual({
        ok: true,
        value: document,
      });
    },
  );

  it("alt가 없는 이미지는 디코드 결과에 alt 키가 없다", () => {
    const encoded = modelToTiptap(documentOf(imageBlock({ name: "이름" })));
    if (!encoded.ok) throw new Error("encode 실패");
    const decoded = tiptapToModel(encoded.value, 0, sequentialIds("id"));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(hasAltKey(decoded.value)).toBe(false);
  });
});

describe("이미지 alt load/save", () => {
  it.each([
    { alt: "설명" },
    { alt: "" },
    { alt: "대체", name: "이름", caption: "캡션" },
  ])("createEditor → getDocument에서 %j가 유지된다", (fields) => {
    const initial = imageDocument(fields);
    const editor = createEditor({
      initialDocument: initial,
      createId: sequentialIds("id"),
    });
    mountTiptapEditor(editor);
    expect(editor.getDocument().blocks).toEqual(initial.blocks);
  });

  it("replaceDocument → getDocument에서 alt가 유지된다", () => {
    const editor = createEditor({
      initialDocument: documentOf(paragraphBlock("p-1", "start")),
      createId: sequentialIds("id"),
    });
    mountTiptapEditor(editor);
    const next = imageDocument({ alt: "", name: "이름" });
    expect(editor.replaceDocument(next)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument().blocks).toEqual(next.blocks);
  });
});

describe("이미지 alt 편집 화면 렌더", () => {
  it.each([
    [
      "alt가 있으면 alt",
      { alt: "대체", name: "이름", caption: "캡션" },
      "대체",
    ],
    ["빈 alt도 alt다", { alt: "", name: "이름", caption: "캡션" }, ""],
    ["alt가 없으면 caption", { name: "이름", caption: "캡션" }, "캡션"],
    ["alt와 caption이 없으면 name", { name: "이름" }, "이름"],
    ["아무것도 없으면 빈 문자열", {}, ""],
  ] as const)("%s", (_name, fields, expected) => {
    const editor = createEditor({
      initialDocument: imageDocument(fields),
      createId: sequentialIds("id"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    expect(renderedAlt(tiptap)).toBe(expected);
  });
});

describe("name·caption 변경이 alt를 바꾸지 않는다", () => {
  it("setMediaBlockName·setMediaBlockCaption 뒤에도 alt가 그대로이고 undo/redo에서도 유지된다", () => {
    const editor = createEditor({
      initialDocument: imageDocument({ alt: "대체", name: "이름" }),
      createId: sequentialIds("id"),
    });
    const { tiptap } = mountTiptapEditor(editor);

    expect(
      editor.commands.setMediaBlockName("image-1", "새 이름"),
    ).toMatchObject({ ok: true });
    expect(
      editor.commands.setMediaBlockCaption("image-1", "새 캡션"),
    ).toMatchObject({ ok: true });
    expect(editor.getDocument().blocks[0]).toMatchObject({
      alt: "대체",
      name: "새 이름",
      caption: "새 캡션",
    });
    expect(renderedAlt(tiptap)).toBe("대체");

    expect(editor.commands.undo()).toMatchObject({ ok: true });
    expect(editor.getDocument().blocks[0]).toMatchObject({
      alt: "대체",
      name: "새 이름",
    });
    expect(editor.commands.undo()).toMatchObject({ ok: true });
    expect(editor.getDocument().blocks[0]).toMatchObject({
      alt: "대체",
      name: "이름",
    });
    expect(editor.commands.redo()).toMatchObject({ ok: true });
    expect(editor.getDocument().blocks[0]).toMatchObject({
      alt: "대체",
      name: "새 이름",
    });
  });

  it("alt가 빈 문자열이어도 name·caption 변경 뒤 빈 문자열로 남는다", () => {
    const editor = createEditor({
      initialDocument: imageDocument({ alt: "", name: "이름" }),
      createId: sequentialIds("id"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    editor.commands.setMediaBlockName("image-1", "다른 이름");
    editor.commands.setMediaBlockCaption("image-1", "캡션");
    expect(editor.getDocument().blocks[0]).toMatchObject({ alt: "" });
    expect(renderedAlt(tiptap)).toBe("");
  });

  it("alt가 없던 블록은 name·caption을 바꿔도 alt 키가 생기지 않고 렌더는 이전 규칙이다", () => {
    const editor = createEditor({
      initialDocument: imageDocument({ name: "이름" }),
      createId: sequentialIds("id"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    editor.commands.setMediaBlockCaption("image-1", "캡션");
    expect(hasAltKey(editor.getDocument())).toBe(false);
    expect(renderedAlt(tiptap)).toBe("캡션");
  });
});

describe("legacy HTML alt가 편집기를 거쳐 발행된다", () => {
  it("importHtml → replaceDocument → getDocument → exportHtml에서 alt가 유지된다", () => {
    const imported = importHtml(
      '<img src="https://example.com/pic.png" alt="약정 설명 이미지" data-geul-name="파일명.png"><img src="https://example.com/b.png" alt="">',
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    const editor = createEditor({
      initialDocument: documentOf(paragraphBlock("p-1", "start")),
      createId: sequentialIds("id"),
    });
    mountTiptapEditor(editor);
    expect(editor.replaceDocument(imported.value.document)).toEqual({
      ok: true,
      value: undefined,
    });

    const saved = editor.getDocument();
    // 편집기가 끝에 빈 문단을 보충하므로 앞의 두 이미지만 본다.
    expect(saved.blocks.slice(0, 2)).toMatchObject([
      { type: "image", alt: "약정 설명 이미지", name: "파일명.png" },
      { type: "image", alt: "" },
    ]);
    const html = exportHtml(saved);
    expect(html.ok).toBe(true);
    if (!html.ok) return;
    expect(html.value).toContain('alt="약정 설명 이미지"');
    expect(html.value).toContain('data-geul-alt="약정 설명 이미지"');
    expect(html.value).toContain('data-geul-alt=""');
  });
});
