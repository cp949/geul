/**
 * iframe 블록(CUS-001~004, MediaBlockKind 5번째 kind)의 공개 저장 모델과
 * 검증 계약을 확인한다(설계 `docs/specs/2026-09-19-iframe-block-design.md`
 * §2, Issue #212 RD-001). media 4종(file/image/video/audio)과 previewWidth
 * /textAlignment/backgroundColor shape를 공유하되, url 정책은 다르다 —
 * isSupportedMediaUrl(data:/blob: 허용)이 아니라 isSupportedLinkHref(media
 * 조차 아닌 텍스트 링크와 같은 정책)를 재사용한다. showPreview는 갖지
 * 않는다(로컬 파일 미리보기 토글 개념이 없다). aspectRatio는 iframe
 * 전용 필드이고 v1은 "16:9" 리터럴 하나만 허용한다. 화이트리스트·custom
 * URL opt-in·private network 차단 같은 host 설정 기반 정책
 * (iframe-embed-policy.ts)은 이 문서 parse 계층의 범위가 아니다 — RD-001의
 * 후속 DELTA와 그 전용 테스트가 다룬다.
 */
import { describe, expect, it } from "vitest";

import type { Block, IframeBlock } from "../src/index.js";
import { parseDocument } from "../src/index.js";

/** 블록 배열 하나를 formatVersion 1·revision 0 문서로 감싼다. */
const documentOf = (blocks: unknown[]) => ({
  formatVersion: 1,
  revision: 0,
  blocks,
});

describe("iframe 블록 — 최소 shape round-trip", () => {
  it("id·type만 있는 iframe이 통과하고 그대로 보존된다", () => {
    const input = documentOf([{ id: "iframe-1", type: "iframe" }]);
    expect(parseDocument(input)).toEqual({ ok: true, value: input });
  });
});

describe("iframe 블록 — 전체 prop shape round-trip", () => {
  it("공통 prop + previewWidth/textAlignment/aspectRatio가 보존된다", () => {
    const input = documentOf([
      {
        id: "iframe-1",
        type: "iframe",
        url: "https://example.com/embed",
        name: "예시 임베드",
        caption: "설명",
        backgroundColor: "#00FF00",
        previewWidth: 640.5,
        textAlignment: "center",
        aspectRatio: "16:9",
      },
    ]);
    expect(parseDocument(input)).toEqual({ ok: true, value: input });
  });
});

describe("url 검증 — isSupportedLinkHref 재사용(media의 isSupportedMediaUrl과 다른 정책)", () => {
  it("javascript: 프로토콜이면 DOCUMENT_INVALID다", () => {
    const input = documentOf([
      { id: "iframe-1", type: "iframe", url: "javascript:alert(1)" },
    ]);
    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["blocks", 0, "url"] },
    });
  });

  it.each(["data:text/html;base64,PHA+aGk8L3A+", "blob:https://example.com/x"])(
    "media와 달리 %s는 거절한다(iframe은 원격 콘텐츠를 실행 가능한 형태로 로드하므로 data:/blob:를 허용하지 않는다)",
    (url) => {
      const input = documentOf([{ id: "iframe-1", type: "iframe", url }]);
      expect(parseDocument(input)).toMatchObject({
        ok: false,
        error: { code: "DOCUMENT_INVALID", path: ["blocks", 0, "url"] },
      });
    },
  );

  it.each(["https://example.com/embed", "/relative/embed", "#section"])(
    "지원하는 url 형태 %s는 허용한다(https-only 강제·화이트리스트는 이 계층 책임이 아니다)",
    (url) => {
      const input = documentOf([{ id: "iframe-1", type: "iframe", url }]);
      expect(parseDocument(input)).toMatchObject({ ok: true });
    },
  );
});

describe("backgroundColor 검증 — isCanonicalCellColor 재사용", () => {
  it("소문자면 DOCUMENT_INVALID다", () => {
    const input = documentOf([
      { id: "iframe-1", type: "iframe", backgroundColor: "#00ff00" },
    ]);
    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["blocks", 0, "backgroundColor"] },
    });
  });
});

describe("previewWidth 검증 — image/video와 동일 정책(양의 유한수, 상한 없음)", () => {
  it("0이거나 음수면 DOCUMENT_INVALID다", () => {
    for (const previewWidth of [0, -1, -0.5]) {
      const input = documentOf([{ id: "iframe-1", type: "iframe", previewWidth }]);
      expect(parseDocument(input)).toMatchObject({
        ok: false,
        error: { code: "DOCUMENT_INVALID", path: ["blocks", 0, "previewWidth"] },
      });
    }
  });

  it("NaN·Infinity면 DOCUMENT_INVALID다(zod가 거절)", () => {
    for (const previewWidth of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      const input = documentOf([{ id: "iframe-1", type: "iframe", previewWidth }]);
      expect(parseDocument(input)).toMatchObject({ ok: false });
    }
  });

  it("상한 없이 큰 값도 허용한다", () => {
    const input = documentOf([
      { id: "iframe-1", type: "iframe", previewWidth: 100_000 },
    ]);
    expect(parseDocument(input)).toMatchObject({ ok: true });
  });
});

describe("textAlignment 검증 — isCanonicalCellAlign 재사용", () => {
  it("정규 enum 밖이면 DOCUMENT_INVALID다", () => {
    const input = documentOf([
      { id: "iframe-1", type: "iframe", textAlignment: "top" },
    ]);
    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["blocks", 0, "textAlignment"] },
    });
  });
});

describe("aspectRatio 검증 — v1은 zod literal로 \"16:9\" 하나만 허용", () => {
  it("\"16:9\"는 허용한다", () => {
    const input = documentOf([
      { id: "iframe-1", type: "iframe", aspectRatio: "16:9" },
    ]);
    expect(parseDocument(input)).toMatchObject({ ok: true });
  });

  it.each(["4:3", "1:1", "auto"])(
    "v2 예정 값 %s는 v1에서 아직 DOCUMENT_INVALID다",
    (aspectRatio) => {
      const input = documentOf([
        { id: "iframe-1", type: "iframe", aspectRatio },
      ]);
      expect(parseDocument(input)).toMatchObject({
        ok: false,
        error: { code: "DOCUMENT_INVALID", path: ["blocks", 0, "aspectRatio"] },
      });
    },
  );
});

describe("타입별 필드 shape 고정 — zod .strict()", () => {
  it("showPreview가 있으면 DOCUMENT_INVALID다(iframe엔 로컬 미리보기 토글 개념이 없다)", () => {
    const input = documentOf([
      { id: "iframe-1", type: "iframe", showPreview: true },
    ]);
    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["blocks", 0] },
    });
  });

  it("content나 children이 있으면 DOCUMENT_INVALID다", () => {
    expect(
      parseDocument(
        documentOf([
          { id: "iframe-1", type: "iframe", content: [{ text: "x" }] },
        ]),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["blocks", 0] },
    });
    expect(
      parseDocument(
        documentOf([
          {
            id: "iframe-1",
            type: "iframe",
            children: [{ id: "smuggled", type: "paragraph", content: [] }],
          },
        ]),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["blocks", 0] },
    });
  });
});

describe("iframe이 nestable 블록의 자식 위치에 있어도 유효하다", () => {
  it("paragraph children 안의 iframe이 파싱·검증을 통과한다", () => {
    const input = documentOf([
      {
        id: "paragraph-1",
        type: "paragraph",
        content: [],
        children: [{ id: "iframe-in-paragraph", type: "iframe" }],
      },
    ]);
    expect(parseDocument(input)).toEqual({ ok: true, value: input });
  });
});

describe("공개 export", () => {
  it("IframeBlock·Block 타입을 패키지 index에서 import해 값을 만들 수 있다", () => {
    // 판정은 typecheck(tsconfig.test.json)가 한다 — export가 빠지면 import와
    // satisfies가 컴파일 오류다.
    const iframe = {
      id: "iframe-1",
      type: "iframe",
      previewWidth: 640,
    } satisfies IframeBlock;
    const blocks = [iframe] satisfies Block[];

    expect(parseDocument(documentOf(blocks))).toMatchObject({ ok: true });
  });
});
