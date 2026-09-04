/**
 * model↔PM codec의 4종 미디어 블록 무손실 왕복을 검증한다(RD-002
 * DELTA-01) — modelToTiptap(encode)·tiptapToModel(decode)를 직접
 * 호출한다(code-block-codec.test.ts와 같은 층위, production 마운트는
 * media-block-load-save.test.ts가 담당).
 */
import type {
  AudioBlock,
  Document,
  FileBlock,
  ImageBlock,
  VideoBlock,
} from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { modelToTiptap } from "../src/model-to-tiptap.js";
import { tiptapToModel } from "../src/tiptap-to-model.js";
import { sequentialIds } from "./list-item-block-type-support.js";

/** block 1개를 담은 revision 0 문서로 감싼다. */
const documentOf = (block: Document["blocks"][number]): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [block],
});

/** encode → decode 왕복 뒤 원본 문서와 정확히 같은지 확인한다. */
const expectRoundTrip = (document: Document): void => {
  const encoded = modelToTiptap(document);
  expect(encoded.ok).toBe(true);
  if (!encoded.ok) return;

  const decoded = tiptapToModel(
    encoded.value,
    document.revision,
    sequentialIds("id"),
  );
  expect(decoded).toEqual({ ok: true, value: document });
};

describe("4종 미디어 블록 codec 왕복", () => {
  it.each(["file", "image", "video", "audio"] as const)(
    "%s의 최소 shape(id·type만)이 왕복한다",
    (type) => {
      expectRoundTrip(documentOf({ id: `${type}-min`, type }));
    },
  );

  it("file의 공통 prop(url/name/caption/backgroundColor)이 왕복한다", () => {
    const block: FileBlock = {
      id: "file-1",
      type: "file",
      url: "https://example.com/doc.pdf",
      name: "doc.pdf",
      caption: "문서",
      backgroundColor: "#FF0000",
    };
    expectRoundTrip(documentOf(block));
  });

  it.each(["image", "video"] as const)(
    "%s의 전체 prop(공통 + showPreview/previewWidth/textAlignment)이 왕복한다",
    (type) => {
      const block: ImageBlock | VideoBlock = {
        id: `${type}-1`,
        type,
        url: `https://example.com/media.${type}`,
        name: `media.${type}`,
        caption: "미디어",
        backgroundColor: "#00FF00",
        showPreview: true,
        previewWidth: 320.5,
        textAlignment: "center",
      };
      expectRoundTrip(documentOf(block));
    },
  );

  it("audio의 전체 prop(공통 + showPreview만)이 왕복한다", () => {
    const block: AudioBlock = {
      id: "audio-1",
      type: "audio",
      url: "https://example.com/a.mp3",
      name: "a.mp3",
      caption: "오디오",
      backgroundColor: "#0000FF",
      showPreview: false,
    };
    expectRoundTrip(documentOf(block));
  });

  it("여러 미디어 블록이 형제로 있어도 각자 독립적으로 왕복한다", () => {
    expectRoundTrip({
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "file-1", type: "file", url: "https://example.com/a.pdf" },
        { id: "image-1", type: "image", previewWidth: 100 },
        { id: "video-1", type: "video", showPreview: false },
        { id: "audio-1", type: "audio" },
      ],
    });
  });
});
