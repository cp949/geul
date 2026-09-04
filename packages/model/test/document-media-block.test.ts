/**
 * R3 슬라이스1(Issue #152, RD-001)이 저장 모델에 더하는 4종 leaf 미디어
 * 블록(file/image/video/audio, spec §3.1)의 파싱·검증 계약을 확인한다 —
 * 최소/전체 prop shape round-trip, `url`(`isSupportedLinkHref` 재사용,
 * spec §3.2), `backgroundColor`(`isCanonicalCellColor` 재사용),
 * `previewWidth`(image/video만, 양의 유한수, 상한 없음, spec §5.3),
 * `textAlignment`(image/video만, `isCanonicalCellAlign` 재사용), 그리고
 * audio/file의 타입별 필드 부재 shape가 zod `.strict()`로 고정됨을 검증한다.
 * 편집 명령·React UX·upload·drag drop·HTML/GFM은 후속 슬라이스 범위다.
 */
import { describe, expect, it } from "vitest";

import type {
  AudioBlock,
  Block,
  FileBlock,
  ImageBlock,
  VideoBlock,
} from "../src/index.js";
import { parseDocument } from "../src/index.js";

/**
 * 블록 배열 하나를 formatVersion 1·revision 0 문서로 감싼다(기존 전례,
 * document-heading-quote-divider.test.ts와 동일).
 */
const documentOf = (blocks: unknown[]) => ({
  formatVersion: 1,
  revision: 0,
  blocks,
});

describe("4종 미디어 블록 — 최소 shape round-trip", () => {
  it.each([
    { id: "file-1", type: "file" },
    { id: "image-1", type: "image" },
    { id: "video-1", type: "video" },
    { id: "audio-1", type: "audio" },
  ])("id·type만 있는 %s가 통과하고 그대로 보존된다", (block) => {
    const input = documentOf([block]);
    expect(parseDocument(input)).toEqual({ ok: true, value: input });
  });
});

describe("4종 미디어 블록 — 전체 prop shape round-trip", () => {
  it("file의 공통 prop(url/name/caption/backgroundColor)이 보존된다", () => {
    const input = documentOf([
      {
        id: "file-1",
        type: "file",
        url: "https://example.com/doc.pdf",
        name: "doc.pdf",
        caption: "문서",
        backgroundColor: "#FF0000",
      },
    ]);
    expect(parseDocument(input)).toEqual({ ok: true, value: input });
  });

  it.each(["image", "video"])(
    "%s의 공통 prop + showPreview/previewWidth/textAlignment가 보존된다",
    (type) => {
      const input = documentOf([
        {
          id: `${type}-1`,
          type,
          url: `https://example.com/media.${type}`,
          name: `media.${type}`,
          caption: "미디어",
          backgroundColor: "#00FF00",
          showPreview: true,
          previewWidth: 320.5,
          textAlignment: "center",
        },
      ]);
      expect(parseDocument(input)).toEqual({ ok: true, value: input });
    },
  );

  it("audio의 공통 prop + showPreview가 보존된다(previewWidth·textAlignment 없음)", () => {
    const input = documentOf([
      {
        id: "audio-1",
        type: "audio",
        url: "https://example.com/a.mp3",
        name: "a.mp3",
        caption: "오디오",
        backgroundColor: "#0000FF",
        showPreview: false,
      },
    ]);
    expect(parseDocument(input)).toEqual({ ok: true, value: input });
  });
});

describe("url 검증 — isSupportedLinkHref 재사용(spec §3.2)", () => {
  it.each(["file", "image", "video", "audio"])(
    "%s의 url이 javascript: 프로토콜이면 DOCUMENT_INVALID다",
    (type) => {
      const input = documentOf([
        { id: `${type}-1`, type, url: "javascript:alert(1)" },
      ]);
      expect(parseDocument(input)).toMatchObject({
        ok: false,
        error: { code: "DOCUMENT_INVALID", path: ["blocks", 0, "url"] },
      });
    },
  );

  it.each(["https://example.com/a", "/relative/a", "#section"])(
    "지원하는 url 형태 %s는 허용한다",
    (url) => {
      const input = documentOf([{ id: "file-1", type: "file", url }]);
      expect(parseDocument(input)).toMatchObject({ ok: true });
    },
  );
});

describe("backgroundColor 검증 — isCanonicalCellColor 재사용", () => {
  it.each(["file", "image", "video", "audio"])(
    "%s의 backgroundColor가 소문자면 DOCUMENT_INVALID다",
    (type) => {
      const input = documentOf([
        { id: `${type}-1`, type, backgroundColor: "#ff0000" },
      ]);
      expect(parseDocument(input)).toMatchObject({
        ok: false,
        error: {
          code: "DOCUMENT_INVALID",
          path: ["blocks", 0, "backgroundColor"],
        },
      });
    },
  );
});

describe("previewWidth 검증 — image/video만, 양의 유한수, 상한 없음(spec §5.3)", () => {
  it.each(["image", "video"])(
    "%s의 previewWidth가 0이거나 음수면 DOCUMENT_INVALID다",
    (type) => {
      for (const previewWidth of [0, -1, -0.5]) {
        const input = documentOf([{ id: `${type}-1`, type, previewWidth }]);
        expect(parseDocument(input)).toMatchObject({
          ok: false,
          error: {
            code: "DOCUMENT_INVALID",
            path: ["blocks", 0, "previewWidth"],
          },
        });
      }
    },
  );

  it.each(["image", "video"])(
    "%s의 previewWidth가 NaN·Infinity면 DOCUMENT_INVALID다(zod가 거절)",
    (type) => {
      for (const previewWidth of [
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ]) {
        const input = documentOf([{ id: `${type}-1`, type, previewWidth }]);
        expect(parseDocument(input)).toMatchObject({ ok: false });
      }
    },
  );

  it.each(["image", "video"])(
    "%s의 previewWidth는 상한 없이 큰 값도 허용한다(표 열 너비와 다른 계약)",
    (type) => {
      const input = documentOf([
        { id: `${type}-1`, type, previewWidth: 100_000 },
      ]);
      expect(parseDocument(input)).toMatchObject({ ok: true });
    },
  );
});

describe("textAlignment 검증 — image/video만, isCanonicalCellAlign 재사용", () => {
  it.each(["image", "video"])(
    "%s의 textAlignment가 정규 enum 밖이면 DOCUMENT_INVALID다",
    (type) => {
      const input = documentOf([
        { id: `${type}-1`, type, textAlignment: "top" },
      ]);
      expect(parseDocument(input)).toMatchObject({
        ok: false,
        error: {
          code: "DOCUMENT_INVALID",
          path: ["blocks", 0, "textAlignment"],
        },
      });
    },
  );
});

describe("타입별 필드 shape 고정 — zod .strict()", () => {
  it("audio에 previewWidth가 있으면 DOCUMENT_INVALID다", () => {
    const input = documentOf([
      { id: "audio-1", type: "audio", previewWidth: 100 },
    ]);
    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["blocks", 0] },
    });
  });

  it("audio에 textAlignment가 있으면 DOCUMENT_INVALID다", () => {
    const input = documentOf([
      { id: "audio-1", type: "audio", textAlignment: "center" },
    ]);
    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["blocks", 0] },
    });
  });

  it("file에 previewWidth가 있으면 DOCUMENT_INVALID다", () => {
    const input = documentOf([
      { id: "file-1", type: "file", previewWidth: 100 },
    ]);
    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["blocks", 0] },
    });
  });

  it("file에 textAlignment가 있으면 DOCUMENT_INVALID다", () => {
    const input = documentOf([
      { id: "file-1", type: "file", textAlignment: "center" },
    ]);
    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["blocks", 0] },
    });
  });

  it("file에 showPreview가 있으면 DOCUMENT_INVALID다", () => {
    const input = documentOf([
      { id: "file-1", type: "file", showPreview: true },
    ]);
    expect(parseDocument(input)).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID", path: ["blocks", 0] },
    });
  });

  it("file·image·video·audio에 content나 children이 있으면 DOCUMENT_INVALID다", () => {
    for (const type of ["file", "image", "video", "audio"]) {
      expect(
        parseDocument(
          documentOf([{ id: `${type}-1`, type, content: [{ text: "x" }] }]),
        ),
      ).toMatchObject({
        ok: false,
        error: { code: "DOCUMENT_INVALID", path: ["blocks", 0] },
      });
      expect(
        parseDocument(
          documentOf([
            {
              id: `${type}-1`,
              type,
              children: [{ id: "smuggled", type: "paragraph", content: [] }],
            },
          ]),
        ),
      ).toMatchObject({
        ok: false,
        error: { code: "DOCUMENT_INVALID", path: ["blocks", 0] },
      });
    }
  });
});

describe("미디어 블록이 nestable 블록의 자식 위치에 있어도 유효하다", () => {
  it("paragraph children 안의 4종이 파싱·검증을 통과한다", () => {
    const input = documentOf([
      {
        id: "paragraph-1",
        type: "paragraph",
        content: [],
        children: [
          { id: "file-in-paragraph", type: "file" },
          { id: "image-in-paragraph", type: "image" },
          { id: "video-in-paragraph", type: "video" },
          { id: "audio-in-paragraph", type: "audio" },
        ],
      },
    ]);
    expect(parseDocument(input)).toEqual({ ok: true, value: input });
  });
});

describe("공개 export", () => {
  it("FileBlock·ImageBlock·VideoBlock·AudioBlock·Block 타입을 패키지 index에서 import해 값을 만들 수 있다", () => {
    // 판정은 typecheck(tsconfig.test.json)가 한다 — export가 빠지면 import와
    // satisfies가 컴파일 오류다. 런타임 단언은 값이 Block union에 실제로
    // 들어간다는 것만 확인한다.
    const file = { id: "file-1", type: "file" } satisfies FileBlock;
    const image = {
      id: "image-1",
      type: "image",
      previewWidth: 100,
    } satisfies ImageBlock;
    const video = { id: "video-1", type: "video" } satisfies VideoBlock;
    const audio = { id: "audio-1", type: "audio" } satisfies AudioBlock;
    const blocks = [file, image, video, audio] satisfies Block[];

    expect(parseDocument(documentOf(blocks))).toMatchObject({ ok: true });
  });
});
