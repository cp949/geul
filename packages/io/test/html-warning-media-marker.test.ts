/**
 * `data-geul-media-type` 마커를 단 `<a>`의 SAFE_BLOCK_DOWNGRADED 경고 판정을
 * 검증한다(Issue #369). 경고 수집기(import-warnings.ts)와 변환기가 같은 마커
 * 표(media-type-marker.ts)를 읽는지 본다. 수집기가 마커 값을 따로 알면
 * iframe 앵커가 블록으로 읽히는데도 강등 경고가 난다.
 */
import { describe, expect, it } from "vitest";

import { importHtml } from "../src/index.js";
import { MEDIA_MARKER_TYPES } from "../src/html/media-type-marker.js";

const IFRAME_ANCHOR =
  '<a data-geul-media-type="iframe" data-geul-src="https://example.com/x" href="https://example.com/x">x</a>';

const importOk = (
  html: string,
  options?: Parameters<typeof importHtml>[1],
): { blocks: { type: string }[]; kinds: string[]; elements: string[] } => {
  const result = importHtml(html, options);
  if (!result.ok) throw new Error(result.error.message);
  const downgraded = result.value.warnings.filter(
    (warning) => warning.kind === "SAFE_BLOCK_DOWNGRADED",
  );
  return {
    blocks: result.value.document.blocks,
    kinds: result.value.warnings.map((warning) => warning.kind),
    elements: downgraded.map((warning) => warning.element),
  };
};

describe("미디어 마커 앵커의 블록 강등 경고(Issue #369)", () => {
  describe("iframe 앵커", () => {
    it("iframeEmbed 옵션이 없어도 강등 경고 없이 iframe 블록 하나가 된다", () => {
      const result = importOk(IFRAME_ANCHOR);

      expect(result.blocks.map((block) => block.type)).toEqual(["iframe"]);
      expect(result.kinds).not.toContain("SAFE_BLOCK_DOWNGRADED");
    });

    it("iframeEmbed: { allowCustomUrl: true }여도 강등 경고 없이 iframe 블록 하나가 된다", () => {
      const result = importOk(IFRAME_ANCHOR, {
        iframeEmbed: { allowCustomUrl: true },
      });

      expect(result.blocks.map((block) => block.type)).toEqual(["iframe"]);
      expect(result.kinds).not.toContain("SAFE_BLOCK_DOWNGRADED");
    });
  });

  describe("마커 표 전 값 가드", () => {
    it.each(MEDIA_MARKER_TYPES)(
      "마커 값 %s인 앵커는 강등 경고를 내지 않는다",
      (markerType) => {
        const result = importOk(
          `<a data-geul-media-type="${markerType}" href="https://example.com/x">x</a>`,
        );

        expect(result.kinds).not.toContain("SAFE_BLOCK_DOWNGRADED");
      },
    );
  });

  describe("대조군", () => {
    it("마커 없는 앵커는 SAFE_BLOCK_DOWNGRADED:a 경고와 문단이 된다", () => {
      const result = importOk('<a href="https://example.com/x">x</a>');

      expect(result.elements).toEqual(["a"]);
      expect(result.blocks.map((block) => block.type)).toEqual(["paragraph"]);
    });

    it("표에 없는 마커 값의 앵커는 SAFE_BLOCK_DOWNGRADED:a 경고를 낸다", () => {
      const result = importOk(
        '<a data-geul-media-type="unknown" href="https://example.com/x">x</a>',
      );

      expect(result.elements).toEqual(["a"]);
    });

    it("마커가 iframe인 div는 경고 없이 iframe 블록이 된다", () => {
      const result = importOk(
        '<div data-geul-media-type="iframe" data-geul-src="https://example.com/x">x</div>',
      );

      expect(result.blocks.map((block) => block.type)).toEqual(["iframe"]);
      expect(result.kinds).not.toContain("SAFE_BLOCK_DOWNGRADED");
    });

    it("마커가 file인 앵커는 경고 없이 file 블록이 된다", () => {
      const result = importOk(
        '<a data-geul-media-type="file" href="https://example.com/x.pdf">x</a>',
      );

      expect(result.blocks.map((block) => block.type)).toEqual(["file"]);
      expect(result.kinds).not.toContain("SAFE_BLOCK_DOWNGRADED");
    });
  });
});
