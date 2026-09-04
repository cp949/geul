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
  mountTiptapEditor,
  sequentialIds,
} from "./editor-controller-support.js";

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
