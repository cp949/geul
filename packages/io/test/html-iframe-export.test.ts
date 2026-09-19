/**
 * iframe 블록(CUS-001~004, RD-003 DELTA-02)의 HTML export 계약을 검증한다.
 * host가 `iframeEmbed` 설정을 넘기지 않거나 src가 정책을 통과하지 못하면
 * DELTA-00b의 안전한 데이터 속성 전용 wrapper를 그대로 유지하고(회귀),
 * 검증을 통과한 src만 실제 `<iframe sandbox allow referrerpolicy loading
 * title>` 태그를 방출한다(spec §1/§4). import는 DELTA-03 몫이라 다루지
 * 않는다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml } from "../src/index.js";
import type { IframeEmbedExportConfig } from "../src/html/export-html.js";

const documentOf = (block: Document["blocks"][number]): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [block],
});

const YOUTUBE_CONFIG: IframeEmbedExportConfig = {
  providers: [
    { name: "youtube", match: { type: "wildcard", pattern: "*.youtube.com" } },
  ],
};

const DEFAULT_IFRAME_ATTRS =
  'sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms" allow="" referrerpolicy="strict-origin-when-cross-origin"';

describe("iframe HTML 내보내기(RD-003 DELTA-02)", () => {
  describe("host 설정 없음 — DELTA-00b 안전 축소판을 유지한다(회귀)", () => {
    it("url이 있어도 옵션을 넘기지 않으면 실제 <iframe> 태그를 내지 않는다", () => {
      const result = exportHtml(
        documentOf({
          id: "ifr-1",
          type: "iframe",
          url: "https://www.youtube.com/embed/xyz",
          name: "영상",
          aspectRatio: "16:9",
        }),
      );
      expect(result).toEqual({
        ok: true,
        value:
          '<div data-geul-block-id="ifr-1" data-geul-media-type="iframe" data-geul-name="영상" data-geul-src="https://www.youtube.com/embed/xyz" data-geul-aspect-ratio="16:9"></div>',
      });
    });
  });

  describe("host가 whitelist provider를 설정하면 실제 <iframe> 태그를 방출한다(완료 조건 2)", () => {
    // caption 없어도 wrapper(div)로 감싸고 그 안에 실제 <iframe>을 담는다
    // (RD-003 DELTA-03 정정) — <iframe>은 sanitize가 태그명만으로 무조건
    // strip하므로(ADR-0003) data-geul-*를 <iframe> 태그 자신에 실으면(DELTA-02
    // 원안) re-import 시 통째로 사라져 라운드트립이 깨진다.
    it("provider가 매치하면 CUS-002 기본 sandbox/allow/referrerPolicy로 태그를 낸다", () => {
      const result = exportHtml(
        documentOf({
          id: "ifr-2",
          type: "iframe",
          url: "https://www.youtube.com/embed/xyz",
          name: "영상",
        }),
        { iframeEmbed: YOUTUBE_CONFIG },
      );
      expect(result).toEqual({
        ok: true,
        value:
          `<div data-geul-block-id="ifr-2" data-geul-media-type="iframe" data-geul-name="영상" data-geul-src="https://www.youtube.com/embed/xyz" style="width:640px;max-width:100%;aspect-ratio:16/9">` +
          `<iframe src="https://www.youtube.com/embed/xyz" ${DEFAULT_IFRAME_ATTRS} loading="lazy" title="영상" style="width:640px;max-width:100%;aspect-ratio:16/9">` +
          `</iframe></div>`,
      });
    });

    it("host가 sandbox/allow/referrerPolicy를 override하면 그 값이 실린다", () => {
      const result = exportHtml(
        documentOf({
          id: "ifr-3",
          type: "iframe",
          url: "https://www.youtube.com/embed/xyz",
        }),
        {
          iframeEmbed: {
            ...YOUTUBE_CONFIG,
            sandbox: "allow-scripts",
            allow: "fullscreen",
            referrerPolicy: "no-referrer",
          },
        },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.message);
      expect(result.value).toContain('sandbox="allow-scripts"');
      expect(result.value).toContain('allow="fullscreen"');
      expect(result.value).toContain('referrerpolicy="no-referrer"');
    });

    it("previewWidth를 지정하면 그 값을 width 스타일과 data-geul-preview-width에 쓴다", () => {
      const result = exportHtml(
        documentOf({
          id: "ifr-4",
          type: "iframe",
          url: "https://www.youtube.com/embed/xyz",
          previewWidth: 800,
        }),
        { iframeEmbed: YOUTUBE_CONFIG },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.message);
      expect(result.value).toContain("width:800px");
      expect(result.value).toContain('data-geul-preview-width="800"');
    });

    it("previewWidth 미설정이면 640px 기본값을 쓴다", () => {
      const result = exportHtml(
        documentOf({
          id: "ifr-4b",
          type: "iframe",
          url: "https://www.youtube.com/embed/xyz",
        }),
        { iframeEmbed: YOUTUBE_CONFIG },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.message);
      expect(result.value).toContain("width:640px");
    });

    it("caption이 있으면 <figure>로 감싸고 실제 <iframe>과 <figcaption>을 담는다", () => {
      const result = exportHtml(
        documentOf({
          id: "ifr-5",
          type: "iframe",
          url: "https://www.youtube.com/embed/xyz",
          caption: "설명",
        }),
        { iframeEmbed: YOUTUBE_CONFIG },
      );
      expect(result).toEqual({
        ok: true,
        value:
          `<figure data-geul-block-id="ifr-5" data-geul-media-type="iframe" data-geul-src="https://www.youtube.com/embed/xyz" style="width:640px;max-width:100%;aspect-ratio:16/9">` +
          `<iframe src="https://www.youtube.com/embed/xyz" ${DEFAULT_IFRAME_ATTRS} loading="lazy" title="" style="width:640px;max-width:100%;aspect-ratio:16/9">` +
          `</iframe><figcaption>설명</figcaption></figure>`,
      });
    });
  });

  describe("검증 실패 src는 여전히 데이터 속성 전용 wrapper로 남는다", () => {
    it("허용되지 않은 protocol이면 실제 태그를 내지 않는다", () => {
      // model parse 단계(document-structure-validation.ts)는 iframe url을
      // isSupportedLinkHref(http/https/mailto/tel)로만 걸러 javascript: 등은
      // exportHtml 진입 전에 이미 거절된다 — 여기서 검증하려는 것은 그
      // 게이트를 통과하지만 host의 런타임 protocol 정책(기본 https:만
      // 허용)에는 막히는 http:// 케이스다.
      const result = exportHtml(
        documentOf({
          id: "ifr-6",
          type: "iframe",
          url: "http://insecure.example.com/embed",
        }),
        { iframeEmbed: { allowCustomUrl: true } },
      );
      expect(result).toEqual({
        ok: true,
        value:
          '<div data-geul-block-id="ifr-6" data-geul-media-type="iframe" data-geul-src="http://insecure.example.com/embed"></div>',
      });
    });

    it("whitelist에 없고 allowCustomUrl이 false면 실제 태그를 내지 않는다", () => {
      const result = exportHtml(
        documentOf({
          id: "ifr-7",
          type: "iframe",
          url: "https://evil.example.com/embed",
        }),
        { iframeEmbed: YOUTUBE_CONFIG },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.message);
      expect(result.value).not.toContain("<iframe ");
      expect(result.value).toContain(
        'data-geul-src="https://evil.example.com/embed"',
      );
    });
  });

  describe("nested — quote children의 iframe도 동일한 host 설정을 적용받는다", () => {
    it("quote children 안의 iframe도 실제 태그를 낸다", () => {
      const result = exportHtml(
        documentOf({
          id: "q-1",
          type: "quote",
          content: [],
          children: [
            {
              id: "ifr-8",
              type: "iframe",
              url: "https://www.youtube.com/embed/xyz",
            },
          ],
        }),
        { iframeEmbed: YOUTUBE_CONFIG },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.message);
      expect(result.value).toContain("<iframe ");
    });
  });
});
