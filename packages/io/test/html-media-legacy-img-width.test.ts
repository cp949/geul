/**
 * `data-geul-preview-width`가 없는 legacy `<img style="width: Npx">`가 `previewWidth`로 읽히는지
 * 검증한다(Issue #424, RD-004-DELTA-02).
 *
 * - 구 에디터가 저장한 HTML은 geul data 속성이 없고 이미지 폭을 inline style로만 갖는다.
 * - data 속성이 있으면(무효·빈 값 포함) style로 복구하지 않는다.
 * - image만 읽는다. video·audio·강등된 `a`·`img[width]` 속성은 읽지 않는다(RD-004.md 결정).
 * - style 읽기는 부분 읽기 정책이다. 다른 선언은 버려지므로 raw `UNSAFE_ATTRIBUTE_REMOVED(style)`
 *   경고는 이전처럼 난다(G-CNV-002).
 * - 클립보드 붙여넣기는 같은 sanitize 스키마 계열이라 같은 결과를 낸다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../src/index.js";
import { clipboardBlocks } from "./clipboard-table-support.js";

const imported = (html: string) => {
  const result = importHtml(html);
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
};

const styleWarning = (element: string) => ({
  kind: "UNSAFE_ATTRIBUTE_REMOVED",
  element,
  attribute: "style",
  message: `Unsupported style attribute was removed from ${element}`,
});

const IMG = (attrs: string) => `<img src="https://e.com/a.png" ${attrs}>`;

describe("legacy img inline px 폭", () => {
  it.each([
    ["width: 320px", 320],
    ["width: 320.5px", 320.5],
    ["width:320px;height:auto", 320],
    ["max-width: 100%; width: 320px", 320],
    ["width: 320px !important; width: 100px", 320],
    ["width: 100px; width: 320px", 320],
  ] as const)("style=%j는 previewWidth %s로 읽힌다", (style, expected) => {
    const { document } = imported(IMG(`style="${style}"`));
    expect(document.blocks).toMatchObject([
      { type: "image", url: "https://e.com/a.png", previewWidth: expected },
    ]);
  });

  it.each([
    "width: 50%",
    "width: calc(100% - 10px)",
    "width: auto",
    "width: 10em",
    "width: 320px; width: 50%",
    "width: 0px",
    "width: -5px",
    "height: 100px",
    "max-width: 320px",
  ])("style=%j는 previewWidth 없이 읽힌다", (style) => {
    const { document } = imported(IMG(`style="${style}"`));
    expect(document.blocks).toHaveLength(1);
    expect(document.blocks[0]).toMatchObject({ type: "image" });
    expect(document.blocks[0]).not.toHaveProperty("previewWidth");
  });

  it("읽어도 style 제거 경고는 이전처럼 1건 난다", () => {
    const { warnings } = imported(IMG('style="width: 320px"'));
    expect(warnings).toEqual([styleWarning("img")]);
  });

  it("img[width] 속성은 읽지 않는다", () => {
    const { document } = imported(IMG('width="300"'));
    expect(document.blocks[0]).not.toHaveProperty("previewWidth");
  });

  it("img의 위험 속성은 제거하고 폭만 읽는다", () => {
    const { document, warnings } = imported(
      IMG(
        'style="width: 320px; background: url(javascript:alert(1))" onerror="alert(1)"',
      ),
    );
    expect(document.blocks).toMatchObject([
      { type: "image", previewWidth: 320 },
    ]);
    expect(JSON.stringify(document)).not.toContain("javascript");
    expect(
      warnings.map((warning) => [
        warning.kind,
        "attribute" in warning ? warning.attribute : undefined,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ["UNSAFE_ATTRIBUTE_REMOVED", "style"],
        ["UNSAFE_ATTRIBUTE_REMOVED", "onError"],
      ]),
    );
  });
});

describe("legacy img 폭과 data 속성 우선순위", () => {
  it("data-geul-preview-width가 있으면 style 폭을 읽지 않는다", () => {
    const { document } = imported(
      IMG(
        'data-geul-media-type="image" data-geul-preview-width="200" style="width: 320px"',
      ),
    );
    expect(document.blocks[0]).toMatchObject({ previewWidth: 200 });
  });

  it.each(["0", "-5", "abc", "", "1e3", " 320"])(
    "무효 data-geul-preview-width %j는 style 폭으로 복구하지 않는다",
    (raw) => {
      const { document } = imported(
        IMG(
          `data-geul-media-type="image" data-geul-preview-width="${raw}" style="width: 320px"`,
        ),
      );
      expect(document.blocks[0]).not.toHaveProperty("previewWidth");
    },
  );

  it("data 속성 값 없는 boolean 꼴도 있는 것으로 보고 style로 복구하지 않는다", () => {
    const { document } = imported(
      IMG(
        'data-geul-media-type="image" data-geul-preview-width style="width: 320px"',
      ),
    );
    expect(document.blocks[0]).not.toHaveProperty("previewWidth");
  });
});

describe("legacy img를 감싼 구조", () => {
  it("마커 없는 figure 안의 img style 폭을 읽고 figcaption은 기존처럼 문단이 된다", () => {
    const { document } = imported(
      '<figure><img src="https://e.com/a.png" style="width: 320px"><figcaption>설명</figcaption></figure>',
    );
    expect(document.blocks).toMatchObject([
      { type: "image", previewWidth: 320 },
      { type: "paragraph" },
    ]);
  });

  it("figure의 style 폭은 읽지 않는다", () => {
    const { document } = imported(
      '<figure style="width: 320px"><img src="https://e.com/a.png"><figcaption>설명</figcaption></figure>',
    );
    expect(document.blocks[0]).toMatchObject({ type: "image" });
    expect(document.blocks[0]).not.toHaveProperty("previewWidth");
  });

  it("마커 있는 figure에 data 속성이 없으면 안쪽 img style 폭을 읽는다", () => {
    const { document } = imported(
      '<figure data-geul-block-id="i1" data-geul-media-type="image"><img src="https://e.com/a.png" style="width: 320px"><figcaption>설명</figcaption></figure>',
    );
    expect(document.blocks).toEqual([
      {
        id: "i1",
        type: "image",
        url: "https://e.com/a.png",
        caption: "설명",
        previewWidth: 320,
      },
    ]);
  });

  it("마커 있는 figure에 data 속성이 있으면 안쪽 img style 폭을 읽지 않는다", () => {
    const { document } = imported(
      '<figure data-geul-block-id="i1" data-geul-media-type="image" data-geul-preview-width="200"><img src="https://e.com/a.png" style="width: 320px"><figcaption>설명</figcaption></figure>',
    );
    expect(document.blocks[0]).toMatchObject({ previewWidth: 200 });
  });

  it("p 안의 img도 읽는다", () => {
    const { document } = imported(
      '<p><img src="https://e.com/a.png" style="width: 320px"></p>',
    );
    expect(document.blocks).toMatchObject([
      { type: "image", previewWidth: 320 },
    ]);
  });
});

describe("image 밖 태그는 style 폭을 읽지 않는다", () => {
  it.each([
    '<video src="https://e.com/a.mp4" controls style="width: 480px"></video>',
    '<audio src="https://e.com/a.mp3" controls style="width: 480px"></audio>',
    '<a href="https://e.com/a.png" data-geul-media-type="image" data-geul-show-preview="false" style="width: 320px">a</a>',
  ])("%s", (html) => {
    const { document } = imported(html);
    expect(document.blocks[0]).not.toHaveProperty("previewWidth");
  });
});

describe("legacy 폭 왕복", () => {
  it.each([320, 320.5])(
    "style 폭 %s는 export → import → export에서 유지된다",
    (width) => {
      const first = imported(IMG(`style="width: ${width}px"`)).document;
      expect(first.blocks[0]).toMatchObject({ previewWidth: width });

      const html = exportHtml(first);
      expect(html.ok).toBe(true);
      if (!html.ok) return;
      const second = imported(html.value);
      expect(second.document).toEqual(first);
      // own-export는 data 속성과 같은 폭 style을 함께 낸다. 새 경고가 늘지 않는다.
      expect(second.warnings).toEqual([]);
      const again = exportHtml(second.document as Document);
      expect(again).toEqual(html);
    },
  );
});

describe("클립보드 붙여넣기", () => {
  it("표 옆에 붙은 legacy img의 style 폭도 같은 결과로 읽는다", () => {
    const blocks = clipboardBlocks(
      `${IMG('style="width: 320.5px"')}<table><tr><td>a</td></tr></table>`,
    );
    expect(blocks).toMatchObject([
      { type: "image", previewWidth: 320.5 },
      { type: "table" },
    ]);
  });
});
