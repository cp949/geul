/**
 * iframe 블록(CUS-001~004, RD-003 DELTA-03)의 HTML export→import 연결
 * round-trip을 검증한다(spec §4, 완료 조건 3). `Document → exportHtml →
 * importHtml → Document`가 항등인지 직접 연결해 두 계약의 드리프트를
 * 잡는다 — 개별 계약 fixture는 html-iframe-export.test.ts·
 * html-iframe-import.test.ts가 이미 소유한다(html-media-round-trip.test.ts와
 * 동일 분업).
 *
 * 4종 media와 다른 점: 호스트 설정이 src를 허용해 실제 `<iframe>` 태그를
 * 낸 경로는 raw 경고 스캐너(import-warnings.ts)가 이 태그를 "완전히
 * 제거됨"(UNSAFE_ELEMENT_REMOVED)으로 보고할 뿐 아니라, 이미 element
 * 자체가 사라질 노드인데도 그 위에 실린 개별 속성(src/sandbox/allow/
 * referrerPolicy/loading/title/style)까지 각각 UNSAFE_ATTRIBUTE_REMOVED로
 * 함께 보고한다(html-iframe-sanitize-schema.test.ts의 완료 조건 1 테스트가
 * 이미 확인한 기존 스캐너 동작 — element 제거와 attribute 제거 보고가
 * 독립적이다). wrapper(div/figure) 자신의 `style`도 4종 media용
 * isOwnEchoStyle 판정(import-warnings.ts)이 iframe의 스타일 포맷을 모르므로
 * 같은 이유로 제거 보고된다. 데이터 손실은 아니다 — Document 재구성은
 * data-geul-*만 쓰고 이 style/내부 태그 어느 것도 읽지 않는다. 그래서
 * 이 노이즈 전부를 정확히 나열하는 대신(구현 세부에 결합돼 깨지기 쉽다)
 * document 동등성 + "iframe 태그가 제거됐다" 신호 하나만 확인한다(완료
 * 조건 1 테스트와 동일 판단으로 toContainEqual을 쓴다). 호스트 설정이
 * 없거나 src가 정책에 막히면 실제 태그 자체가 없어 경고도 전혀 없다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../src/index.js";
import type { IframeEmbedExportConfig } from "../src/html/export-html.js";
import type { HtmlImportWarning } from "../src/html/import-warnings.js";

const documentOf = (block: Document["blocks"][number]): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [block],
});

const roundTrip = (
  document: Document,
  options?: { iframeEmbed?: IframeEmbedExportConfig },
): { document: Document; warnings: HtmlImportWarning[] } => {
  const exported = exportHtml(document, options);
  if (!exported.ok) {
    throw new Error(`export 실패: ${exported.error.message}`);
  }
  const imported = importHtml(exported.value);
  if (!imported.ok) {
    throw new Error(`import 실패: ${imported.error.message}`);
  }
  return {
    document: imported.value.document,
    warnings: imported.value.warnings,
  };
};

const IFRAME_REMOVED_WARNING = {
  kind: "UNSAFE_ELEMENT_REMOVED",
  element: "iframe",
  message: expect.any(String),
};

const YOUTUBE_CONFIG: IframeEmbedExportConfig = {
  providers: [
    { name: "youtube", match: { type: "wildcard", pattern: "*.youtube.com" } },
  ],
};

describe("iframe 블록 HTML round-trip(export→import 연결, RD-003 DELTA-03)", () => {
  describe("호스트 설정 없음 — 안전 wrapper만 남고 실제 태그가 없어 경고도 없다", () => {
    it("빈 블록이 그대로 round-trip한다", () => {
      const original = documentOf({ id: "ifr-empty", type: "iframe" });
      const result = roundTrip(original);
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });

    it("caption 없이 전체 공통 prop(url/name/backgroundColor/previewWidth/textAlignment/aspectRatio)이 round-trip한다", () => {
      const original = documentOf({
        id: "ifr-full",
        type: "iframe",
        url: "https://www.youtube.com/embed/xyz",
        name: "영상",
        backgroundColor: "#FF0000",
        previewWidth: 480,
        textAlignment: "center",
        aspectRatio: "16:9",
      });
      const result = roundTrip(original);
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });

    it("caption 있는 전체 prop 조합(figure)이 round-trip한다", () => {
      const original = documentOf({
        id: "ifr-caption",
        type: "iframe",
        url: "https://www.youtube.com/embed/xyz",
        name: "영상",
        caption: "설명",
        backgroundColor: "#00FF00",
        previewWidth: 800,
        textAlignment: "right",
        aspectRatio: "16:9",
      });
      const result = roundTrip(original);
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });

    it("whitelist 밖 src(정책 미허용)도 실제 태그 없이 round-trip한다", () => {
      const original = documentOf({
        id: "ifr-rejected",
        type: "iframe",
        url: "https://evil.example.com/embed",
      });
      const result = roundTrip(original, { iframeEmbed: YOUTUBE_CONFIG });
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });
  });

  describe("호스트 설정 있음 — 실제 <iframe> 태그를 방출해도 wrapper만으로 온전히 round-trip한다", () => {
    it("caption 없이 전체 prop 조합이 round-trip한다(DELTA-02 bare 태그 결함 수정 확인)", () => {
      const original = documentOf({
        id: "ifr-live-full",
        type: "iframe",
        url: "https://www.youtube.com/embed/xyz",
        name: "영상",
        backgroundColor: "#FF0000",
        previewWidth: 480,
        textAlignment: "center",
        aspectRatio: "16:9",
      });
      const result = roundTrip(original, { iframeEmbed: YOUTUBE_CONFIG });
      expect(result.document).toEqual(original);
      expect(result.warnings).toContainEqual(IFRAME_REMOVED_WARNING);
    });

    it("caption 있는 전체 prop 조합(figure)이 round-trip한다", () => {
      const original = documentOf({
        id: "ifr-live-caption",
        type: "iframe",
        url: "https://www.youtube.com/embed/xyz",
        name: "영상",
        caption: "설명",
        backgroundColor: "#00FF00",
        previewWidth: 800,
        textAlignment: "right",
        aspectRatio: "16:9",
      });
      const result = roundTrip(original, { iframeEmbed: YOUTUBE_CONFIG });
      expect(result.document).toEqual(original);
      expect(result.warnings).toContainEqual(IFRAME_REMOVED_WARNING);
    });
  });

  describe("nested — quote children의 iframe도 round-trip한다", () => {
    it("호스트 설정이 있을 때 quote 안의 iframe도 wrapper만으로 복원된다", () => {
      const original = documentOf({
        id: "q-1",
        type: "quote",
        content: [],
        children: [
          {
            id: "ifr-nested",
            type: "iframe",
            url: "https://www.youtube.com/embed/xyz",
            aspectRatio: "16:9",
          },
        ],
      });
      const result = roundTrip(original, { iframeEmbed: YOUTUBE_CONFIG });
      expect(result.document).toEqual(original);
      expect(result.warnings).toContainEqual(IFRAME_REMOVED_WARNING);
    });
  });
});
