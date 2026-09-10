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

import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
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
      // it.each 콜백의 case별 리터럴이 유니온 하나로 묶여(RD-002-DELTA-08과
      // 동일 패턴) `type` 필드만 유니온으로 추론된다 — 개별 media 타입으로
      // 캐스트해 해소한다.
      expectRoundTrip(
        documentOf({ id: `${type}-min`, type } as
          FileBlock | ImageBlock | VideoBlock | AudioBlock),
      );
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

// ADR 0015 — 로컬 프리뷰는 저장 원본을 절대 왕복하지 않는다. modelToTiptap은
// 애초에 이 attrs를 설정하지 않으므로(encode 방향은 자명), 여기서는 PM
// 상태가 이미 채워져 있는 상황을 직접 시뮬레이션해 decode(tiptapToModel)
// 방향의 제외를 고정한다 — paste/drop 등 실제 삽입 경로가 attrs를 채운
// 뒤에도 저장 시점에는 반드시 사라짐을 보장하는 것이 이 테스트의 목적이다.
// `toEqual`로 Block 전체를 정확히 비교해 두 attrs가 조금이라도 새어 나오면
// 실패하게 한다(단순 `.not.toHaveProperty`보다 엄격 — 다른 필드 누락도
// 같이 잡는다).
describe("로컬 프리뷰 attrs — 모델 왕복 제외(RD-001 DELTA-01)", () => {
  it.each(["file", "image", "video", "audio"] as const)(
    "%s: localPreviewUrl·localPreviewFile이 채워져 있어도 디코드 결과 Block에 나타나지 않는다",
    (type) => {
      const json: TiptapJsonNode = {
        type: "doc",
        content: [
          {
            type,
            attrs: {
              blockId: `${type}-1`,
              url: "https://example.com/x",
              localPreviewUrl: "blob:http://localhost/preview",
              localPreviewFile: new File(["x"], "x.bin"),
            },
          },
        ],
      };

      const decoded = tiptapToModel(json, 0, sequentialIds("id"));

      expect(decoded).toEqual({
        ok: true,
        value: {
          formatVersion: 1,
          revision: 0,
          blocks: [{ id: `${type}-1`, type, url: "https://example.com/x" }],
        },
      });
    },
  );
});
