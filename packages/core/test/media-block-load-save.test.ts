/**
 * production `createEditor`/`replaceDocument`/`getDocument`가 4종 미디어
 * 블록을 포함한 문서를 오류 없이 처리한다(RD-002 DELTA-01 완료 조건 4).
 * codec 자체(encode/decode 무손실)는 media-block-codec.test.ts가 소유한다
 * — 여기는 production 경계(createTiptapEditor·readEditorDocument)만 본다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import {
  documentOf,
  mediaBlock,
  mountTiptapEditor,
  sequentialIds,
  tailParagraphBlock,
} from "./editor-controller-support.js";

const testFile = (name = "photo.png") =>
  new File(["binary"], name, { type: "image/png" });

// 마지막 top-level 블록을 자식 없는 빈 paragraph로 미리 둔다 — 아니면
// TrailingBlockExtension이 로드 시 빈 paragraph를 자동 추가해(R2 슬라이스2
// 불변식) getDocument() 비교가 media 블록과 무관한 그 동작까지 검증하게
// 된다(code-block-load-save.test.ts와 같은 전례, "trailing paragraph만
// 추가" 케이스).
const documentWithMediaBlocks = (): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "file-1",
      type: "file",
      url: "https://example.com/doc.pdf",
      name: "doc.pdf",
    },
    {
      id: "image-1",
      type: "image",
      url: "https://example.com/pic.png",
      previewWidth: 200,
    },
    { id: "video-1", type: "video", showPreview: false },
    { id: "audio-1", type: "audio" },
    { id: "tail-1", type: "paragraph", content: [] },
  ],
});

describe("production load/save — 4종 미디어 블록", () => {
  it("createEditor가 4종을 포함한 초기 문서를 오류 없이 마운트한다", () => {
    const editor = createEditor({
      initialDocument: documentWithMediaBlocks(),
      createId: sequentialIds("id"),
    });
    const { tiptap } = mountTiptapEditor(editor);

    let mediaNodeCount = 0;
    tiptap.state.doc.descendants((node) => {
      if (["file", "image", "video", "audio"].includes(node.type.name)) {
        mediaNodeCount += 1;
      }
      return true;
    });
    expect(mediaNodeCount).toBe(4);
  });

  it("getDocument가 저장 시 원본과 동일한 4종 블록을 반환한다", () => {
    const initial = documentWithMediaBlocks();
    const editor = createEditor({
      initialDocument: initial,
      createId: sequentialIds("id"),
    });
    mountTiptapEditor(editor);

    expect(editor.getDocument().blocks).toEqual(initial.blocks);
  });

  it("replaceDocument가 4종을 포함한 새 문서로 교체한다", () => {
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [{ id: "p-1", type: "paragraph", content: [] }],
      },
      createId: sequentialIds("id"),
    });
    mountTiptapEditor(editor);

    const next = documentWithMediaBlocks();
    const result = editor.replaceDocument(next);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks).toEqual(next.blocks);
  });
});

// RD-002 완료 조건 5(Issue #168 roadmap DELTA-05) — 로컬 프리뷰(ADR 0015)는
// getDocument()가 반환하는 저장 Document에 애초에 왕복하지 않는다(model
// 스키마에 localPreviewUrl/localPreviewFile 필드 자체가 없다,
// media-block-extension.ts "로컬 프리뷰" 주석) — 그래서 "저장 후 재로드"를
// 새 createEditor() 인스턴스로 직접 재현해, 그 비영속이 실제로 화면
// placeholder로 이어지는지까지 고정한다(codec 레벨 무손실 왕복만 보는
// media-block-codec.test.ts와 다른 층위).
describe("로컬 프리뷰 — 저장 후 재로드(Issue #168 roadmap RD-002 완료 조건 5)", () => {
  it("로컬 프리뷰가 있는 이미지를 저장 후 재로드하면 로컬 프리뷰가 사라지고 업로드 대기 상태로 렌더된다", async () => {
    const editor = createEditor({
      initialDocument: documentOf(
        mediaBlock("image", "image-1"),
        tailParagraphBlock,
      ),
      createId: sequentialIds("id"),
      // uploadFile 콜백 미등록 — spec §4.1, 대상에 url이 없어 로컬 프리뷰로
      // 대체되는 정상 경로(production-editor-media-upload.ts).
    });
    const { tiptap } = mountTiptapEditor(editor);

    expect(
      await editor.commands.uploadMediaFile("image-1", testFile()),
    ).toEqual({ ok: true, value: undefined });
    // 저장 전 사전 조건: 로컬 프리뷰 배지 마커가 실제로 붙어 있다.
    expect(
      tiptap.view.dom
        .querySelector('[data-geul-block-id="image-1"]')
        ?.hasAttribute("data-geul-media-local-preview"),
    ).toBe(true);

    const saved = editor.getDocument();

    const reloaded = createEditor({
      initialDocument: saved,
      createId: sequentialIds("id"),
    });
    const { tiptap: reloadedTiptap } = mountTiptapEditor(reloaded);
    const wrapper = reloadedTiptap.view.dom.querySelector(
      '[data-geul-block-id="image-1"]',
    );

    expect(wrapper?.hasAttribute("data-geul-media-local-preview")).toBe(false);
    expect(wrapper?.getAttribute("data-geul-media-empty")).toBe("image");
  });
});
