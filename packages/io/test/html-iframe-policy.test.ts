/**
 * iframe HTML import가 host의 URL 정책(whitelist·protocol·private-network,
 * model의 resolveIframeEmbedDecision)을 재검증하는지 확인한다(Issue #215).
 *
 * 결함(수정 전): import-html-media.ts가 wrapper의 data-geul-src를 정책
 * 검증 없이 그대로 IframeBlock.url로 옮겼다 — sanitize는 raw <iframe> 태그만
 * 제거할 뿐 own-format wrapper(div/figure + data-geul-media-type="iframe")의
 * data-geul-src 속성 자체는 media 5종 공통 허용 목록에 있어 그대로
 * 통과시킨다. 조작된 wrapper HTML(예: 클립보드 붙여넣기, 문서 sync, host의
 * 직접 importHtml() 호출)이 whitelist·private-network 정책 없이 살아있는
 * iframe으로 복원됐다.
 *
 * 수정 후 계약: importHtml의 iframeEmbed 옵션이 host 설정이다. 생략 시
 * 가장 보수적인 기본값(빈 config — whitelist 없음·custom URL 비허용·
 * private network 차단·https만 허용)으로 판정한다. own-export 여부와
 * 무관하게 항상 재검증한다(신뢰 예외 없음, RD-001.md "결정").
 */
import type { Document, IframeEmbedConfig } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { importHtml } from "../src/index.js";

const documentOf = (block: Document["blocks"][number]): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [block],
});

const wrapperHtml = (src: string): string =>
  `<div data-geul-block-id="ifr-1" data-geul-media-type="iframe" data-geul-src="${src}"></div>`;

describe("iframe HTML import 정책 재검증(Issue #215)", () => {
  describe("iframeEmbed 옵션 생략 — 가장 보수적인 기본값으로 판정한다", () => {
    it("private-network host(cloud metadata 등 SSRF 표적)로 향하는 src는 삭제된다", () => {
      const result = importHtml(
        wrapperHtml("https://169.254.169.254/latest/meta-data"),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document).toEqual(
        documentOf({ id: "ifr-1", type: "iframe" }),
      );
    });

    it("whitelist 밖 공개 도메인 src도 삭제된다(custom URL opt-in 기본 거부)", () => {
      const result = importHtml(
        wrapperHtml("https://not-whitelisted.example.com/embed"),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document).toEqual(
        documentOf({ id: "ifr-1", type: "iframe" }),
      );
    });

    it("https가 아닌 protocol도 삭제된다", () => {
      const result = importHtml(wrapperHtml("javascript:alert(1)"));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document).toEqual(
        documentOf({ id: "ifr-1", type: "iframe" }),
      );
    });
  });

  describe("iframeEmbed 옵션 명시 — host 설정 기준으로 판정한다", () => {
    it("whitelist에 있는 provider는 유지된다", () => {
      const config: IframeEmbedConfig = {
        providers: [
          {
            name: "youtube",
            match: { type: "wildcard", pattern: "*.youtube.com" },
          },
        ],
      };
      const result = importHtml(
        wrapperHtml("https://www.youtube.com/embed/xyz"),
        { iframeEmbed: config },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document).toEqual(
        documentOf({
          id: "ifr-1",
          type: "iframe",
          url: "https://www.youtube.com/embed/xyz",
        }),
      );
    });

    it("allowCustomUrl:true여도 private network는 allowPrivateNetwork 없이는 여전히 차단된다", () => {
      const result = importHtml(
        wrapperHtml("https://169.254.169.254/latest/meta-data"),
        {
          iframeEmbed: { allowCustomUrl: true },
        },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document).toEqual(
        documentOf({ id: "ifr-1", type: "iframe" }),
      );
    });

    it("own-export 라운드트립이라도 host의 현재 설정을 통과하지 못하면 삭제된다(신뢰 예외 없음)", () => {
      // "own-export"임을 흉내내는 유일한 신호(own-format wrapper 마커)만으로는
      // 신뢰 여부를 구분하지 않는다 — 판정은 오직 현재 host config다.
      const result = importHtml(
        wrapperHtml("https://www.youtube.com/embed/xyz"),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document).toEqual(
        documentOf({ id: "ifr-1", type: "iframe" }),
      );
    });
  });
});
