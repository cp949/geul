/**
 * `data-geul-preview-width`의 소수 판독을 검증한다(Issue #424, RD-004-DELTA-01).
 *
 * - export는 `String(previewWidth)`로 소수를 그대로 낸다. import도 소수 문법을 읽어야 geul 자체
 *   HTML 왕복에서 값이 사라지지 않는다(image·video·iframe 공통).
 * - 값 검증(양의 유한수)은 model `isValidMediaPreviewWidth`가 소유한다(G-CNV-001). 이 파일은 문법
 *   검사와 그 검증 호출을 고정한다.
 * - 문법 밖 입력은 이전처럼 조용히 값 없음이고, 문법은 맞는데 양수가 아니면 그 필드만 버리고
 *   경고 1건이다.
 */
import type { Document, IframeEmbedConfig } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../src/index.js";

const PERMISSIVE: IframeEmbedConfig = { allowCustomUrl: true };

const documentOf = (block: Document["blocks"][number]): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [block],
});

const exported = (document: Document): string => {
  const result = exportHtml(document, { iframeEmbed: PERMISSIVE });
  if (!result.ok) throw new Error(`export 실패: ${result.error.message}`);
  return result.value;
};

const imported = (html: string) => {
  const result = importHtml(html, { iframeEmbed: PERMISSIVE });
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
};

const widthWarning = (element: string) => ({
  kind: "UNSAFE_ATTRIBUTE_REMOVED",
  element,
  attribute: "data-geul-preview-width",
  message: `Unsupported data-geul-preview-width attribute was removed from ${element}`,
});

const SHAPES = [
  {
    name: "image",
    tag: "img",
    html: (attr: string) =>
      `<img src="https://e.com/a.png" data-geul-block-id="m1" data-geul-media-type="image"${attr}>`,
    block: (previewWidth: number): Document["blocks"][number] => ({
      id: "m1",
      type: "image",
      url: "https://e.com/a.png",
      previewWidth,
    }),
  },
  {
    name: "caption 있는 figure image",
    tag: "figure",
    html: (attr: string) =>
      `<figure data-geul-block-id="m1" data-geul-media-type="image"${attr}><img src="https://e.com/a.png"><figcaption>cap</figcaption></figure>`,
    block: (previewWidth: number): Document["blocks"][number] => ({
      id: "m1",
      type: "image",
      url: "https://e.com/a.png",
      caption: "cap",
      previewWidth,
    }),
  },
  {
    name: "video",
    tag: "video",
    html: (attr: string) =>
      `<video src="https://e.com/a.mp4" controls data-geul-block-id="m1" data-geul-media-type="video"${attr}></video>`,
    block: (previewWidth: number): Document["blocks"][number] => ({
      id: "m1",
      type: "video",
      url: "https://e.com/a.mp4",
      previewWidth,
    }),
  },
  {
    name: "iframe",
    tag: "div",
    html: (attr: string) =>
      `<div data-geul-block-id="m1" data-geul-media-type="iframe" data-geul-src="https://e.com/embed"${attr}></div>`,
    block: (previewWidth: number): Document["blocks"][number] => ({
      id: "m1",
      type: "iframe",
      url: "https://e.com/embed",
      previewWidth,
    }),
  },
] as const;

describe("미디어 previewWidth 소수 판독", () => {
  it.each(SHAPES)(
    "$name: export → import → export에서 소수 폭이 같은 값·같은 출력으로 유지된다",
    (shape) => {
      const original = documentOf(shape.block(320.5));
      const html = exported(original);
      const { document, warnings } = imported(html);
      expect(document).toEqual(original);
      // iframe은 실제 <iframe> 태그의 속성 제거 경고가 따로 난다(html-iframe-round-trip.test.ts).
      // 폭 속성 자체의 제거 경고만 없음을 본다.
      expect(
        warnings.filter(
          (warning) =>
            "attribute" in warning &&
            warning.attribute === "data-geul-preview-width",
        ),
      ).toEqual([]);
      expect(exported(document)).toBe(html);
    },
  );

  it.each(SHAPES)("$name: 소수 폭 판독에서 경고가 없다", (shape) => {
    const { document, warnings } = imported(
      shape.html(' data-geul-preview-width="320.5"'),
    );
    expect(document.blocks[0]).toMatchObject({ previewWidth: 320.5 });
    expect(warnings).toEqual([]);
  });

  it.each([
    ["320", 320],
    ["+320", 320],
    ["0320", 320],
    ["0.5", 0.5],
    ["320.50", 320.5],
    ["1000000.125", 1000000.125],
  ] as const)("previewWidth %s는 %s로 읽는다", (raw, expected) => {
    const { document, warnings } = imported(
      SHAPES[0].html(` data-geul-preview-width="${raw}"`),
    );
    expect(document.blocks[0]).toMatchObject({ previewWidth: expected });
    expect(warnings).toEqual([]);
  });

  it.each(["0", "0.0", "-5", "-0.5", "+0.0"])(
    "문법은 맞고 양수가 아닌 previewWidth %s는 그 필드만 버리고 경고 1건이다",
    (raw) => {
      for (const shape of SHAPES) {
        const { document, warnings } = imported(
          shape.html(` data-geul-preview-width="${raw}"`),
        );
        expect(document.blocks[0]).not.toHaveProperty("previewWidth");
        expect(warnings).toEqual([widthWarning(shape.tag)]);
      }
    },
  );

  it.each([
    " 320",
    "320 ",
    "0x10",
    "Infinity",
    "-Infinity",
    "NaN",
    "1e3",
    "1E3",
    "abc",
    "",
    ".5",
    "5.",
    "3.",
    "1.2.3",
    "1,5",
    "320px",
    "٣٢٠",
  ])("문법 밖 previewWidth %j는 경고 없이 값 없음이다", (raw) => {
    for (const shape of SHAPES) {
      const { document, warnings } = imported(
        shape.html(` data-geul-preview-width="${raw}"`),
      );
      expect(document.blocks[0]).not.toHaveProperty("previewWidth");
      expect(warnings).toEqual([]);
    }
  });

  it.each([
    ["400자리 정수", "9".repeat(400)],
    ["400자리 정수부 소수", `${"9".repeat(400)}.5`],
  ])(
    "Number()가 Infinity로 올리는 %s는 정수 판독 때처럼 경고 없이 값 없음이다",
    (_name, raw) => {
      const { document, warnings } = imported(
        SHAPES[0].html(` data-geul-preview-width="${raw}"`),
      );
      expect(document.blocks[0]).not.toHaveProperty("previewWidth");
      expect(warnings).toEqual([]);
    },
  );

  it("String()이 지수 표기를 내는 극단값은 왕복하지 않고 값 없음이 된다", () => {
    const original = documentOf({
      id: "m1",
      type: "image",
      url: "https://e.com/a.png",
      previewWidth: 1e21,
    });
    const html = exported(original);
    expect(html).toContain('data-geul-preview-width="1e+21"');
    const { document } = imported(html);
    expect(document.blocks[0]).not.toHaveProperty("previewWidth");
  });
});
