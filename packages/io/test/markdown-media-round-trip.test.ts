/**
 * 4종 미디어 블록(file/image/video/audio)의 GFM export→import 연결
 * round-trip을 검증한다(spec §7.2·§7.3). export-markdown.ts(RD-002
 * DELTA-01)와 import-markdown.ts(RD-002 DELTA-02)를 각각 리터럴 문자열로
 * 개별 대조하는 대신, `Document → exportMarkdown → importMarkdown →
 * Document`를 직접 연결해 두 계약의 드리프트를 잡는다(html-media-
 * round-trip.test.ts와 동일 패턴). 개별 계약 fixture(손실 카테고리·
 * export 문자열 모양·import 승격 분기)는 markdown-media-loss.test.ts·
 * markdown-media-export.test.ts·markdown-media-import.test.ts가 이미
 * 소유한다 — 여기서 재작성하지 않는다.
 *
 * GFM은 HTML과 달리 블록 id를 문서에 싣지 않는다 — `importMarkdown`의
 * `createId` 옵션으로 원본 id 순서를 재생해 `toEqual(original)` 정확한
 * 비교를 만든다(markdown-round-trip-basic.test.ts의 기존 패턴 재사용).
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportMarkdown, importMarkdown } from "../src/index.js";

const documentOf = (block: Document["blocks"][number]): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [block],
});

/**
 * strict export→import를 연결해 원본 id 순서를 재생하며 되돌린다. strict가
 * 거절되면 원인이 드러나도록 즉시 throw한다.
 */
const strictRoundTrip = (
  document: Document,
  ids: string[],
): { document: Document; warnings: string[] } => {
  const exported = exportMarkdown(document, { mode: "strict" });
  if (!exported.ok) {
    throw new Error(`strict export 실패: ${JSON.stringify(exported.error)}`);
  }
  const queue = [...ids];
  const imported = importMarkdown(exported.value, {
    createId: () => queue.shift() ?? "unexpected-id",
  });
  if (!imported.ok) {
    throw new Error(`import 실패: ${imported.error.message}`);
  }
  return {
    document: imported.value.document,
    warnings: imported.value.warnings.map((warning) => warning.kind),
  };
};

/**
 * lossy export→import를 연결한다. lossy는 값 폐기를 전제하므로 원본과
 * 같음을 기대하지 않는다 — 호출자가 축소된 결과를 직접 단언한다.
 */
const lossyRoundTrip = (
  document: Document,
  ids: string[],
): {
  document: Document;
  exportWarningKinds: string[];
  importWarningKinds: string[];
} => {
  const exported = exportMarkdown(document, { mode: "lossy" });
  if (!exported.ok) {
    throw new Error(`lossy export 실패: ${JSON.stringify(exported.error)}`);
  }
  const queue = [...ids];
  const imported = importMarkdown(exported.value.markdown, {
    createId: () => queue.shift() ?? "unexpected-id",
  });
  if (!imported.ok) {
    throw new Error(`import 실패: ${imported.error.message}`);
  }
  return {
    document: imported.value.document,
    exportWarningKinds: exported.value.warnings.map((loss) => loss.kind),
    importWarningKinds: imported.value.warnings.map((warning) => warning.kind),
  };
};

describe("미디어 블록 GFM round-trip(export→import 연결)", () => {
  describe("image strict round-trip", () => {
    it("빈 블록(url·name 없음)이 그대로 round-trip한다", () => {
      const original = documentOf({ id: "image-empty", type: "image" });
      const result = strictRoundTrip(original, ["image-empty"]);
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });

    it("url·name만 있으면(다른 prop 없음) 그대로 round-trip한다", () => {
      const original = documentOf({
        id: "image-basic",
        type: "image",
        url: "https://example.com/a.png",
        name: "그림",
      });
      const result = strictRoundTrip(original, ["image-basic"]);
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });
  });

  describe("image lossy 강등(각 prop 개별)", () => {
    it("previewWidth가 있으면 lossy 재import 후 그 값이 사라진 Image로 복원된다", () => {
      const original = documentOf({
        id: "image-1",
        type: "image",
        url: "https://example.com/a.png",
        name: "그림",
        previewWidth: 480,
      });
      const result = lossyRoundTrip(original, ["image-1"]);
      expect(result.document).toEqual(
        documentOf({
          id: "image-1",
          type: "image",
          url: "https://example.com/a.png",
          name: "그림",
        }),
      );
      expect(result.exportWarningKinds).toEqual(["MEDIA_PREVIEW_WIDTH"]);
      expect(result.importWarningKinds).toEqual([]);
    });

    it("textAlignment가 있으면 lossy 재import 후 그 값이 사라진 Image로 복원된다", () => {
      const original = documentOf({
        id: "image-1",
        type: "image",
        url: "https://example.com/a.png",
        name: "그림",
        textAlignment: "center",
      });
      const result = lossyRoundTrip(original, ["image-1"]);
      expect(result.document).toEqual(
        documentOf({
          id: "image-1",
          type: "image",
          url: "https://example.com/a.png",
          name: "그림",
        }),
      );
      expect(result.exportWarningKinds).toEqual(["MEDIA_TEXT_ALIGNMENT"]);
    });

    it("caption이 있으면 lossy 재import 후 caption이 사라진 Image로 복원된다", () => {
      const original = documentOf({
        id: "image-1",
        type: "image",
        url: "https://example.com/a.png",
        name: "그림",
        caption: "설명",
      });
      const result = lossyRoundTrip(original, ["image-1"]);
      expect(result.document).toEqual(
        documentOf({
          id: "image-1",
          type: "image",
          url: "https://example.com/a.png",
          name: "그림",
        }),
      );
      expect(result.exportWarningKinds).toEqual(["MEDIA_CAPTION"]);
    });

    it("backgroundColor가 있으면 lossy 재import 후 그 값이 사라진 Image로 복원된다", () => {
      const original = documentOf({
        id: "image-1",
        type: "image",
        url: "https://example.com/a.png",
        name: "그림",
        backgroundColor: "#FFFF00",
      });
      const result = lossyRoundTrip(original, ["image-1"]);
      expect(result.document).toEqual(
        documentOf({
          id: "image-1",
          type: "image",
          url: "https://example.com/a.png",
          name: "그림",
        }),
      );
      expect(result.exportWarningKinds).toEqual(["BLOCK_COLOR"]);
    });

    it("showPreview:false는 재import 시 Image 타입 자체를 잃고 plain paragraph + link mark가 된다(image-only 매핑의 직접 귀결)", () => {
      const original = documentOf({
        id: "image-1",
        type: "image",
        url: "https://example.com/a.png",
        name: "그림",
        showPreview: false,
      });
      const result = lossyRoundTrip(original, ["image-1"]);
      expect(result.document).toEqual(
        documentOf({
          id: "image-1",
          type: "paragraph",
          content: [
            {
              text: "그림",
              marks: [{ type: "link", href: "https://example.com/a.png" }],
            },
          ],
        }),
      );
      expect(result.exportWarningKinds).toEqual(["MEDIA_SHOW_PREVIEW"]);
      expect(result.importWarningKinds).toEqual([]);
    });
  });

  describe("video/audio/file lossy 강등", () => {
    it.each(["video", "audio", "file"] as const)(
      "%s 빈 블록(url·name만)은 재import 후 타입 자체를 잃고 plain paragraph + link mark가 된다",
      (type) => {
        const original = documentOf({
          id: "media-1",
          type,
          url: "https://example.com/a",
          name: "미디어",
        });
        const result = lossyRoundTrip(original, ["media-1"]);
        expect(result.document).toEqual(
          documentOf({
            id: "media-1",
            type: "paragraph",
            content: [
              {
                text: "미디어",
                marks: [{ type: "link", href: "https://example.com/a" }],
              },
            ],
          }),
        );
        expect(result.exportWarningKinds).toEqual(["MEDIA_TYPE_LOST"]);
      },
    );
  });

  it("4종 혼합 문서가 순서를 보존한 채 lossy round-trip한다", () => {
    const original: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "p-1", type: "paragraph", content: [{ text: "before" }] },
        {
          id: "image-1",
          type: "image",
          url: "https://example.com/a.png",
          name: "그림",
        },
        {
          id: "video-1",
          type: "video",
          url: "https://example.com/a.mp4",
          name: "영상",
        },
        { id: "p-2", type: "paragraph", content: [{ text: "after" }] },
      ],
    };
    const result = lossyRoundTrip(original, [
      "p-1",
      "image-1",
      "video-1",
      "p-2",
    ]);

    expect(result.document).toEqual({
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "p-1", type: "paragraph", content: [{ text: "before" }] },
        {
          id: "image-1",
          type: "image",
          url: "https://example.com/a.png",
          name: "그림",
        },
        {
          id: "video-1",
          type: "paragraph",
          content: [
            {
              text: "영상",
              marks: [{ type: "link", href: "https://example.com/a.mp4" }],
            },
          ],
        },
        { id: "p-2", type: "paragraph", content: [{ text: "after" }] },
      ],
    });
  });
});
