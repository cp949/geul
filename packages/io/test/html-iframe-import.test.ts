/**
 * iframe 블록(CUS-001~004, RD-003 DELTA-03)의 HTML inbound 의미를 검증한다
 * (spec §4). export-html.ts(DELTA-02·DELTA-03)가 낸 `<div>`/`<figure>` +
 * `data-geul-*`를 되읽어 원래 Document로 복원하는지, 내부 `<iframe>` 태그는
 * (sanitize가 항상 strip하므로) 참조하지 않고 wrapper 속성만으로
 * 재구성하는지를 다룬다. export→import 연결 전체 round-trip은
 * html-iframe-round-trip.test.ts가 다룬다.
 */
import type { Document, IframeEmbedConfig } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { importHtml } from "../src/index.js";

const documentOf = (block: Document["blocks"][number]): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [block],
});

// 이 파일은 wrapper 재구성 로직 자체를 다룬다 — 정책 재검증(Issue #215)은
// html-iframe-policy.test.ts가 별도로 다루므로, 여기서는 permissive config로
// 정책을 항상 통과시켜 관심사를 분리한다.
const PERMISSIVE: IframeEmbedConfig = { allowCustomUrl: true };

describe("iframe 블록 HTML 가져오기(RD-003 DELTA-03)", () => {
  describe("caption 없음 — div wrapper에서 복원한다", () => {
    it("data-geul-src만 있으면 url만 채운 IframeBlock을 복원한다", () => {
      const result = importHtml(
        '<div data-geul-block-id="ifr-1" data-geul-media-type="iframe" data-geul-src="https://example.com/embed"></div>',
        { iframeEmbed: PERMISSIVE },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document).toEqual(
        documentOf({
          id: "ifr-1",
          type: "iframe",
          url: "https://example.com/embed",
        }),
      );
      expect(result.value.warnings).toEqual([]);
    });

    it("name/previewWidth/textAlignment/aspectRatio 전체 조합을 복원한다", () => {
      const result = importHtml(
        '<div data-geul-block-id="ifr-2" data-geul-media-type="iframe" data-geul-name="영상" data-geul-src="https://example.com/embed" data-geul-aspect-ratio="16:9" data-geul-preview-width="480" data-geul-text-alignment="center"></div>',
        { iframeEmbed: PERMISSIVE },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document).toEqual(
        documentOf({
          id: "ifr-2",
          type: "iframe",
          url: "https://example.com/embed",
          name: "영상",
          aspectRatio: "16:9",
          previewWidth: 480,
          textAlignment: "center",
        }),
      );
      expect(result.value.warnings).toEqual([]);
    });

    it("data-geul-src가 없으면 url 없이 복원된다(빈 블록)", () => {
      const result = importHtml(
        '<div data-geul-block-id="ifr-3" data-geul-media-type="iframe"></div>',
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document).toEqual(
        documentOf({ id: "ifr-3", type: "iframe" }),
      );
      expect(result.value.warnings).toEqual([]);
    });

    it("dataGeulShowPreview가 섞여 있어도 IframeBlock에는 showPreview 필드가 생기지 않는다", () => {
      const result = importHtml(
        '<div data-geul-block-id="ifr-4" data-geul-media-type="iframe" data-geul-src="https://example.com/embed" data-geul-show-preview="false"></div>',
        { iframeEmbed: PERMISSIVE },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const [block] = result.value.document.blocks;
      expect(block).not.toHaveProperty("showPreview");
      expect(block).toEqual({
        id: "ifr-4",
        type: "iframe",
        url: "https://example.com/embed",
      });
    });
  });

  describe("caption 있음 — figure wrapper에서 복원한다", () => {
    it("figcaption을 caption으로, 내부 <iframe> 태그 없이도 wrapper 속성만으로 복원한다", () => {
      const result = importHtml(
        '<figure data-geul-block-id="ifr-5" data-geul-media-type="iframe" data-geul-src="https://example.com/embed" data-geul-aspect-ratio="16:9"><figcaption>설명</figcaption></figure>',
        { iframeEmbed: PERMISSIVE },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document).toEqual(
        documentOf({
          id: "ifr-5",
          type: "iframe",
          url: "https://example.com/embed",
          aspectRatio: "16:9",
          caption: "설명",
        }),
      );
      expect(result.value.warnings).toEqual([]);
    });

    it("내부에 실제 <iframe> 태그가 섞여 있어도(own export 출력) 참조하지 않고 wrapper 속성만 신뢰한다", () => {
      const result = importHtml(
        '<figure data-geul-block-id="ifr-6" data-geul-media-type="iframe" data-geul-src="https://example.com/embed">' +
          '<iframe src="https://attacker.example.com" sandbox="allow-scripts"></iframe>' +
          "<figcaption>설명</figcaption></figure>",
        { iframeEmbed: PERMISSIVE },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document).toEqual(
        documentOf({
          id: "ifr-6",
          type: "iframe",
          url: "https://example.com/embed",
          caption: "설명",
        }),
      );
      expect(result.value.warnings).toContainEqual(
        expect.objectContaining({
          kind: "UNSAFE_ELEMENT_REMOVED",
          element: "iframe",
        }),
      );
    });
  });

  describe("data-geul-src/data-geul-aspect-ratio 오탐 경고가 나지 않는다(DELTA-01 allowlist와의 entanglement)", () => {
    it("div/figure 양쪽 모두 UNSAFE_ATTRIBUTE_REMOVED를 내지 않는다", () => {
      const divResult = importHtml(
        '<div data-geul-block-id="ifr-7" data-geul-media-type="iframe" data-geul-src="https://example.com/embed" data-geul-aspect-ratio="16:9"></div>',
      );
      expect(divResult.ok).toBe(true);
      if (!divResult.ok) return;
      expect(divResult.value.warnings).toEqual([]);

      const figureResult = importHtml(
        '<figure data-geul-block-id="ifr-8" data-geul-media-type="iframe" data-geul-src="https://example.com/embed" data-geul-aspect-ratio="16:9"><figcaption>설명</figcaption></figure>',
      );
      expect(figureResult.ok).toBe(true);
      if (!figureResult.ok) return;
      expect(figureResult.value.warnings).toEqual([]);
    });
  });
});
