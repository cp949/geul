/**
 * importHtml이 무효 선택 표시 값과 무효 미디어 url을 문서 전체 거절 대신 버리는지 검증한다
 * (Issue #358).
 *
 * - 선택 표시 필드(색·정렬·미디어 폭·aspectRatio·시작 번호·열 폭)의 무효 값은 그 필드만 버린다.
 *   같은 요소의 유효한 다른 필드는 남고 경고는 `UNSAFE_ATTRIBUTE_REMOVED` 정확히 1건이다.
 * - image·video·audio의 `src`가 미디어 url 정책을 통과하지 못하면 블록째 버린다.
 *   경고는 `UNSAFE_URL_REMOVED` 1건이고 형제 블록과 id 발급 순서는 그대로다.
 * - 판정 규칙은 model export가 소유한다(G-CNV-001). 이 파일은 변환기가 그 판정을 읽는 자리마다 호출하는지 고정한다.
 * - file 블록·iframe의 동작과 정규형 입력의 결과는 바뀌지 않는다.
 *
 * 클립보드 표 옆 블록은 이미 `parseClipboardTable`이 같은 결과를 내므로 이 파일에서는 가드로만 둔다.
 */
import {
  type Document,
  type IframeEmbedConfig,
  parseDocument,
} from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../src/index.js";
import { clipboardBlocks } from "./clipboard-table-support.js";

/** importHtml 성공 결과다. 거절되면 코드와 메시지를 담아 던진다. */
const imported = (html: string, iframeEmbed?: IframeEmbedConfig) => {
  const result = importHtml(
    html,
    iframeEmbed === undefined ? undefined : { iframeEmbed },
  );
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
};

/** 속성 제거 경고의 기대값이다. 메시지 문안은 수집기·감사 경고와 같다. */
const attributeWarning = (element: string, attribute: string) => ({
  kind: "UNSAFE_ATTRIBUTE_REMOVED",
  element,
  attribute,
  message: `Unsupported ${attribute} attribute was removed from ${element}`,
});

/** 미디어 url 제거 경고의 기대값이다. 메시지는 고정하지 않는다. */
const urlWarning = (element: string, attribute: string) => ({
  kind: "UNSAFE_URL_REMOVED",
  element,
  attribute,
  message: expect.any(String),
});

/** 결과 블록이 model 검증을 보정 없이 통과하는지 확인한다(G-CNV-001). */
const expectModelAccepts = (document: Document) => {
  expect(parseDocument(document).ok).toBe(true);
};

describe("이슈 재현 5행", () => {
  it("file:/// img는 문서를 거절하지 않고 img만 버린다", () => {
    const { document, warnings } = imported(
      '<p>a</p><img src="file:///C:/x.png">',
    );
    expect(document.blocks.map((block) => block.type)).toEqual(["paragraph"]);
    expect(warnings).toEqual([urlWarning("img", "src")]);
  });

  it("cid: img는 문서를 거절하지 않고 img만 버린다", () => {
    const { document, warnings } = imported('<p>a</p><img src="cid:a@b">');
    expect(document.blocks.map((block) => block.type)).toEqual(["paragraph"]);
    expect(warnings).toEqual([urlWarning("img", "src")]);
  });

  it("비정규형 data-geul-text-color는 textColor만 버린다", () => {
    const { document, warnings } = imported(
      '<p data-geul-text-color="red">x</p>',
    );
    expect(document.blocks).toHaveLength(1);
    const [block] = document.blocks;
    expect(block?.type).toBe("paragraph");
    expect(block).not.toHaveProperty("textColor");
    expect(warnings).toEqual([attributeWarning("p", "data-geul-text-color")]);
  });

  it("https img는 image 블록으로 남고 경고가 없다", () => {
    const { document, warnings } = imported(
      '<p>a</p><img src="https://e.com/a.png">',
    );
    expect(document.blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "image",
    ]);
    expect(warnings).toEqual([]);
  });

  it("file: a href는 현행대로 UNSAFE_URL_REMOVED(a, href) 1건이다", () => {
    const { document, warnings } = imported('<p><a href="file:///x">t</a></p>');
    expect(document.blocks.map((block) => block.type)).toEqual(["paragraph"]);
    expect(warnings).toEqual([
      {
        kind: "UNSAFE_URL_REMOVED",
        element: "a",
        attribute: "href",
        message: "Unsafe link URL was removed",
      },
    ]);
  });
});

/** 텍스트 블록 필드가 놓이는 요소 모양이다. attrs는 `" data-geul-..."` 형태로 이어 붙인다. */
const TEXT_SHAPES = [
  {
    name: "paragraph",
    tag: "p",
    type: "paragraph",
    html: (attrs: string) => `<p data-geul-block-id="b1"${attrs}>x</p>`,
  },
  {
    name: "heading",
    tag: "h2",
    type: "heading",
    html: (attrs: string) => `<h2 data-geul-block-id="b1"${attrs}>x</h2>`,
  },
  {
    name: "quote",
    tag: "blockquote",
    type: "quote",
    html: (attrs: string) =>
      `<blockquote data-geul-block-id="b1"${attrs}>x</blockquote>`,
  },
  {
    name: "bulletListItem",
    tag: "li",
    type: "bulletListItem",
    html: (attrs: string) =>
      `<ul><li data-geul-block-id="b1"${attrs}>x</li></ul>`,
  },
  {
    name: "callout",
    tag: "div",
    type: "callout",
    html: (attrs: string) =>
      `<div data-geul-block-id="b1" data-geul-callout="true"${attrs}><p>x</p></div>`,
  },
  {
    name: "toggleListItem",
    tag: "summary",
    type: "toggleListItem",
    html: (attrs: string) =>
      `<details data-geul-toggleable="true"><summary data-geul-block-id="b1"${attrs}>x</summary></details>`,
  },
] as const;

/** 무효 값 하나와 그 옆에 남아야 하는 유효 값 하나다. */
const TEXT_FIELDS = [
  {
    name: "textColor",
    attribute: "data-geul-text-color",
    invalid: ' data-geul-text-color="red"',
    kept: ' data-geul-background-color="#112233"',
    keptProps: { backgroundColor: "#112233" },
  },
  {
    name: "backgroundColor",
    attribute: "data-geul-background-color",
    invalid: ' data-geul-background-color="#abcdef"',
    kept: ' data-geul-text-color="#112233"',
    keptProps: { textColor: "#112233" },
  },
  {
    name: "textAlignment",
    attribute: "data-geul-text-alignment",
    invalid: ' data-geul-text-alignment="justify"',
    kept: ' data-geul-text-color="#112233"',
    keptProps: { textColor: "#112233" },
  },
] as const;

const TEXT_MATRIX = TEXT_SHAPES.flatMap((shape) =>
  TEXT_FIELDS.map((field) => ({ shape, field })),
);

describe("텍스트 블록 선택 표시 필드 무효 값", () => {
  it.each(TEXT_MATRIX)(
    "$shape.name, 무효 $field.name: 그 필드만 버리고 경고 1건을 낸다",
    ({ shape, field }) => {
      const { document, warnings } = imported(
        shape.html(field.invalid + field.kept),
      );

      const [block] = document.blocks;
      expect(document.blocks).toHaveLength(1);
      expect(block?.type).toBe(shape.type);
      expect(block).toMatchObject({ id: "b1", ...field.keptProps });
      expect(block).not.toHaveProperty(field.name);
      expect(warnings).toEqual([attributeWarning(shape.tag, field.attribute)]);
      expectModelAccepts(document);
    },
  );

  it.each(TEXT_MATRIX)(
    "$shape.name, 정규형 $field.name: 그대로 남고 경고가 없다",
    ({ shape, field }) => {
      const valid = {
        textColor: ' data-geul-text-color="#112233"',
        backgroundColor: ' data-geul-background-color="#445566"',
        textAlignment: ' data-geul-text-alignment="center"',
      }[field.name];
      const { document, warnings } = imported(shape.html(valid));

      expect(document.blocks[0]).toHaveProperty(field.name);
      expect(warnings).toEqual([]);
    },
  );

  it("한 요소의 필드 둘이 무효이면 필드마다 경고 1건씩이다", () => {
    const { document, warnings } = imported(
      '<p data-geul-text-color="red" data-geul-text-alignment="justify" data-geul-background-color="#112233">x</p>',
    );
    expect(document.blocks[0]).toMatchObject({ backgroundColor: "#112233" });
    expect(document.blocks[0]).not.toHaveProperty("textColor");
    expect(document.blocks[0]).not.toHaveProperty("textAlignment");
    expect(warnings).toEqual([
      attributeWarning("p", "data-geul-text-color"),
      attributeWarning("p", "data-geul-text-alignment"),
    ]);
  });

  it("무효 data-geul 색은 유효한 style 색으로 되살리지 않는다", () => {
    const { document, warnings } = imported(
      '<p data-geul-text-color="red" style="color:#ff0000">x</p>',
    );
    expect(document.blocks[0]).not.toHaveProperty("textColor");
    // 수집기의 style 제거 경고가 먼저, 변환기의 값 제거 경고가 뒤다.
    expect(warnings).toEqual([
      attributeWarning("p", "style"),
      attributeWarning("p", "data-geul-text-color"),
    ]);
  });
});

describe("production 번호 목록 data-geul-start-number 무효 값", () => {
  const production = (attrs: string) =>
    `<div data-geul-block-id="A"><div data-geul-numbered-list-item${attrs}>text</div></div>`;

  it.each([
    ["음수", "-1"],
    ["상한 초과", "1000000000"],
  ])("%s 시작 번호는 startNumber만 버리고 경고 1건을 낸다", (_name, value) => {
    const { document, warnings } = imported(
      production(` data-geul-start-number="${value}"`),
    );
    expect(document.blocks).toEqual([
      { id: "A", type: "numberedListItem", content: [{ text: "text" }] },
    ]);
    expect(warnings).toEqual([
      attributeWarning("div", "data-geul-start-number"),
    ]);
  });

  it("범위 안 시작 번호는 그대로 남고 경고가 없다", () => {
    const { document, warnings } = imported(
      production(' data-geul-start-number="3"'),
    );
    expect(document.blocks[0]).toMatchObject({ startNumber: 3 });
    expect(warnings).toEqual([]);
  });
});

describe("callout data-geul-icon 무효 값", () => {
  const callout = (attrs: string) =>
    `<div data-geul-block-id="c1" data-geul-callout="true"${attrs}><p>x</p></div>`;

  it("제어문자를 품은 icon은 icon만 버리고 경고 1건을 낸다", () => {
    const { document, warnings } = imported(
      callout(' data-geul-icon="a&#1;b" data-geul-text-color="#112233"'),
    );
    expect(document.blocks).toEqual([
      {
        id: "c1",
        type: "callout",
        content: [{ text: "x" }],
        textColor: "#112233",
      },
    ]);
    expect(warnings).toEqual([attributeWarning("div", "data-geul-icon")]);
  });

  it("유효한 icon은 그대로 남고 경고가 없다", () => {
    const { document, warnings } = imported(callout(' data-geul-icon="💡"'));
    expect(document.blocks[0]).toMatchObject({ icon: "💡" });
    expect(warnings).toEqual([]);
  });
});

/** 미디어 모양이다. attrs는 `" data-geul-..."` 형태로 이어 붙인다. */
const MEDIA_SHAPES = [
  {
    name: "image",
    tag: "img",
    html: (attrs: string) =>
      `<img src="https://e.com/a.png" data-geul-block-id="m1" data-geul-media-type="image"${attrs}>`,
  },
  {
    name: "video",
    tag: "video",
    html: (attrs: string) =>
      `<video src="https://e.com/a.mp4" controls data-geul-block-id="m1" data-geul-media-type="video"${attrs}></video>`,
  },
  {
    name: "caption 있는 figure image",
    tag: "figure",
    html: (attrs: string) =>
      `<figure data-geul-block-id="m1" data-geul-media-type="image"${attrs}><img src="https://e.com/a.png"><figcaption>cap</figcaption></figure>`,
  },
  {
    name: "iframe",
    tag: "div",
    html: (attrs: string) =>
      `<div data-geul-block-id="m1" data-geul-media-type="iframe" data-geul-src="https://e.com/embed"${attrs}></div>`,
  },
] as const;

/** iframe url 정책을 항상 통과시켜 필드 판정만 본다(html-iframe-import.test.ts와 같은 방식). */
const PERMISSIVE: IframeEmbedConfig = { allowCustomUrl: true };

/** 모든 미디어 타입이 읽는 backgroundColor 모양이다. */
const BACKGROUND_SHAPES = [
  ...MEDIA_SHAPES,
  {
    name: "audio",
    tag: "audio",
    html: (attrs: string) =>
      `<audio src="https://e.com/a.mp3" controls data-geul-block-id="m1" data-geul-media-type="audio"${attrs}></audio>`,
  },
  {
    name: "file",
    tag: "a",
    html: (attrs: string) =>
      `<a href="https://e.com/a.pdf" data-geul-block-id="m1" data-geul-media-type="file"${attrs}>f</a>`,
  },
] as const;

describe("미디어 블록 선택 표시 필드 무효 값", () => {
  it.each(BACKGROUND_SHAPES)(
    "$name, 무효 backgroundColor: 그 필드만 버리고 경고 1건을 낸다",
    (shape) => {
      const { document, warnings } = imported(
        shape.html(' data-geul-background-color="red" data-geul-name="n"'),
        PERMISSIVE,
      );
      const [block] = document.blocks;
      expect(document.blocks).toHaveLength(1);
      expect(block).toMatchObject({ id: "m1", name: "n" });
      expect(block).not.toHaveProperty("backgroundColor");
      expect(warnings).toEqual([
        attributeWarning(shape.tag, "data-geul-background-color"),
      ]);
      expectModelAccepts(document);
    },
  );

  it.each(MEDIA_SHAPES)(
    "$name, 무효 textAlignment: 그 필드만 버리고 경고 1건을 낸다",
    (shape) => {
      const { document, warnings } = imported(
        shape.html(' data-geul-text-alignment="justify" data-geul-name="n"'),
        PERMISSIVE,
      );
      const [block] = document.blocks;
      expect(block).toMatchObject({ id: "m1", name: "n" });
      expect(block).not.toHaveProperty("textAlignment");
      expect(warnings).toEqual([
        attributeWarning(shape.tag, "data-geul-text-alignment"),
      ]);
      expectModelAccepts(document);
    },
  );

  it.each(
    MEDIA_SHAPES.flatMap((shape) =>
      (["0", "-5"] as const).map((width) => ({ shape, width })),
    ),
  )(
    "$shape.name, previewWidth $width: 그 필드만 버리고 경고 1건을 낸다",
    ({ shape, width }) => {
      const { document, warnings } = imported(
        shape.html(
          ` data-geul-preview-width="${width}" data-geul-text-alignment="center"`,
        ),
        PERMISSIVE,
      );
      const [block] = document.blocks;
      expect(block).toMatchObject({ id: "m1", textAlignment: "center" });
      expect(block).not.toHaveProperty("previewWidth");
      expect(warnings).toEqual([
        attributeWarning(shape.tag, "data-geul-preview-width"),
      ]);
      expectModelAccepts(document);
    },
  );

  it("iframe의 무효 aspectRatio는 그 필드만 버리고 경고 1건을 낸다", () => {
    const { document, warnings } = imported(
      '<div data-geul-block-id="m1" data-geul-media-type="iframe" data-geul-src="https://e.com/embed" data-geul-aspect-ratio="4:3" data-geul-preview-width="480"></div>',
      PERMISSIVE,
    );
    const [block] = document.blocks;
    expect(block).toMatchObject({
      id: "m1",
      type: "iframe",
      previewWidth: 480,
    });
    expect(block).not.toHaveProperty("aspectRatio");
    expect(warnings).toEqual([
      attributeWarning("div", "data-geul-aspect-ratio"),
    ]);
    expectModelAccepts(document);
  });

  it("정규형 미디어 필드는 그대로 남고 경고가 없다", () => {
    const { document, warnings } = imported(
      '<div data-geul-block-id="m1" data-geul-media-type="iframe" data-geul-src="https://e.com/embed" data-geul-aspect-ratio="16:9" data-geul-preview-width="480" data-geul-text-alignment="right" data-geul-background-color="#112233"></div>',
      PERMISSIVE,
    );
    expect(document.blocks[0]).toMatchObject({
      type: "iframe",
      aspectRatio: "16:9",
      previewWidth: 480,
      textAlignment: "right",
      backgroundColor: "#112233",
    });
    expect(warnings).toEqual([]);
  });
});

/** 미디어 url 정책이 거절하는 src다. javascript:는 sanitize가 먼저 지워 이 경로로 오지 않는다. */
const INVALID_SRCS = [
  ["Word 임시 파일", "file:///C:/Users/u/AppData/Local/Temp/clip_image002.png"],
  ["Outlook cid", "cid:image001.png@01DA0000.00000000"],
  ["공백 든 url", "https://e.com/a b.png"],
] as const;

/** 시각 태그 세 종류다. */
const VISUAL_TAGS = [
  ["img", (src: string) => `<img src="${src}" alt="a">`],
  ["video", (src: string) => `<video src="${src}" controls></video>`],
  ["audio", (src: string) => `<audio src="${src}" controls></audio>`],
] as const;

const VISUAL_CASES = VISUAL_TAGS.flatMap(([tag, build]) =>
  INVALID_SRCS.map(([label, src]) => [tag, label, build(src)] as const),
);

describe("무효 미디어 url은 블록째 버린다", () => {
  it.each(VISUAL_CASES)(
    "%s, %s: 앞뒤 문단은 남고 미디어만 빠지며 경고 1건을 낸다",
    (tag, _label, media) => {
      const { document, warnings } = imported(`<p>a</p>${media}<p>b</p>`);
      expect(document.blocks.map((block) => block.type)).toEqual([
        "paragraph",
        "paragraph",
      ]);
      expect(warnings).toEqual([urlWarning(tag, "src")]);
      expectModelAccepts(document);
    },
  );

  it("own-format figure 안 무효 img는 블록째 빠지고 caption 경고를 따로 내지 않는다", () => {
    const { document, warnings } = imported(
      '<p>a</p><figure data-geul-block-id="m1" data-geul-media-type="image"><img src="cid:a"><figcaption>cap</figcaption></figure><p>b</p>',
    );
    expect(document.blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "paragraph",
    ]);
    expect(warnings).toEqual([urlWarning("img", "src")]);
  });

  it("마커 없는 figure 안 무효 img는 빠지고 figcaption 글자는 문단으로 남는다", () => {
    const { document, warnings } = imported(
      '<p>a</p><figure><img src="cid:a"><figcaption>cap</figcaption></figure><p>b</p>',
    );
    expect(document.blocks).toMatchObject([
      { type: "paragraph", content: [{ text: "a" }] },
      { type: "paragraph", content: [{ text: "cap" }] },
      { type: "paragraph", content: [{ text: "b" }] },
    ]);
    expect(warnings).toEqual([urlWarning("img", "src")]);
  });

  it("li 안 무효 img는 빠지고 목록 항목과 형제 항목은 남는다", () => {
    const { document, warnings } = imported(
      '<ul><li>a<img src="file:///C:/x.png"></li><li>b</li></ul>',
    );
    expect(document.blocks).toEqual([
      expect.objectContaining({
        type: "bulletListItem",
        content: [{ text: "a" }],
      }),
      expect.objectContaining({
        type: "bulletListItem",
        content: [{ text: "b" }],
      }),
    ]);
    expect(document.blocks[0]).not.toHaveProperty("children");
    expect(warnings).toEqual([urlWarning("img", "src")]);
  });

  it("표 옆 무효 img는 빠지고 표와 문단은 남는다", () => {
    const { document, warnings } = imported(
      '<p>a</p><img src="cid:a"><table><tr><td>1</td></tr></table>',
    );
    expect(document.blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "table",
    ]);
    expect(warnings).toEqual([urlWarning("img", "src")]);
  });

  it("버린 블록은 id를 발급하지 않아 뒤 블록의 자동 id가 밀리지 않는다", () => {
    const { document } = imported('<img src="cid:a"><p>b</p>');
    expect(document.blocks).toHaveLength(1);
    expect(document.blocks[0]?.id).toBe("html-1");
  });

  it("무효 img 뒤의 유효 img는 남는다", () => {
    const { document, warnings } = imported(
      '<img src="cid:a"><img src="https://e.com/a.png">',
    );
    expect(document.blocks).toMatchObject([
      { type: "image", url: "https://e.com/a.png" },
    ]);
    expect(warnings).toEqual([urlWarning("img", "src")]);
  });

  it.each([
    ["문단", '<p>a<img src="cid:x">b</p>'],
    ["제목", '<h2><img src="cid:x"></h2>'],
    ["video", '<p><video src="cid:x"></video></p>'],
  ])(
    "children wrapper의 own %s 안 무효 미디어는 wrapper 인식을 취소해도 경고 1건이다",
    (_name, own) => {
      const { warnings } = imported(
        `<div data-geul-block-container="true" data-geul-block-id="w">${own}<div data-geul-children="true"><p>c</p></div></div>`,
      );
      expect(
        warnings.filter((warning) => warning.kind === "UNSAFE_URL_REMOVED"),
      ).toHaveLength(1);
    },
  );

  it("file 마커 figure 안 img의 무효 src도 블록째 버리고 경고 1건을 낸다", () => {
    const { document, warnings } = imported(
      '<p>a</p><figure data-geul-media-type="file"><img src="cid:x"></figure>',
    );
    expect(document.blocks).toMatchObject([{ type: "paragraph" }]);
    expect(document.blocks).toHaveLength(1);
    expect(warnings).toEqual([urlWarning("img", "src")]);
  });

  it.each([
    ["data:", "data:image/png;base64,AAAA"],
    ["blob:", "blob:https://e.com/1-2"],
    ["상대 경로", "./a.png"],
  ])("미디어 url 정책이 허용하는 %s src는 그대로 남는다", (_name, src) => {
    const { document, warnings } = imported(`<img src="${src}">`);
    expect(document.blocks).toMatchObject([{ type: "image", url: src }]);
    expect(warnings).toEqual([]);
  });
});

const TABLE =
  "<table><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></table>";

/** 표 variant 자리를 비교하는 matcher다. */
const TABLE_SLOT = {
  type: "table",
  data: expect.objectContaining({ columnCount: 2 }),
};

describe("클립보드 표 옆 무효 img (이미 같은 결과를 내는 가드)", () => {
  it("단독 img는 빠지고 표는 남는다", () => {
    expect(clipboardBlocks(`<p>a</p><img src="cid:a">${TABLE}`)).toEqual([
      { type: "paragraph", content: [{ text: "a" }] },
      TABLE_SLOT,
    ]);
  });

  it("file 마커 figure 안 무효 src img는 빠지고 표는 남는다", () => {
    expect(
      clipboardBlocks(
        `<figure data-geul-media-type="file"><img src="cid:x"></figure>${TABLE}`,
      ),
    ).toEqual([TABLE_SLOT]);
  });

  it("마커 없는 figure 안 img는 빠지고 figcaption 글자는 남는다", () => {
    expect(
      clipboardBlocks(
        `<figure><img src="file:///C:/x.png"><figcaption>cap</figcaption></figure>${TABLE}`,
      ),
    ).toEqual([{ type: "paragraph", content: [{ text: "cap" }] }, TABLE_SLOT]);
  });

  it("li 안 img는 빠지고 목록 항목과 표는 남는다", () => {
    expect(
      clipboardBlocks(`<ul><li>a<img src="cid:a"></li></ul>${TABLE}`),
    ).toEqual([
      { type: "bulletListItem", content: [{ text: "a" }] },
      TABLE_SLOT,
    ]);
  });
});

/** 문서의 첫 표 블록이다. 없으면 던진다. */
const firstTable = (document: Document) => {
  const table = document.blocks.find((block) => block.type === "table");
  if (table === undefined || !("rows" in table)) throw new Error("표가 없다");
  return table;
};

/** 열 폭 판정 입력이다. 표는 열 하나, 셀 하나다. */
const columnTable = (colAttrs: string) =>
  `<table data-geul-block-id="t1"><colgroup><col data-geul-column-id="c1"${colAttrs}></colgroup><tbody><tr data-geul-row-id="r1"><td data-geul-cell-id="x1" data-geul-column-id="c1" rowspan="1" colspan="1">v</td></tr></tbody></table>`;

/** 첫 표 블록의 첫 열 폭이다. */
const firstColumnWidth = (document: Document): number | undefined =>
  firstTable(document).columns[0]?.width;

describe("표 열 폭 무효 값", () => {
  it.each([
    ["최소 미만", "10"],
    ["최대 초과", "5000"],
    ["0", "0"],
    ["음수", "-160"],
  ])(
    "data-geul-width %s는 기본 폭 160으로 접고 경고 1건을 낸다",
    (_name, value) => {
      const { document, warnings } = imported(
        columnTable(` data-geul-width="${value}"`),
      );
      expect(firstColumnWidth(document)).toBe(160);
      expect(warnings).toEqual([attributeWarning("col", "data-geul-width")]);
      expectModelAccepts(document);
    },
  );

  it("무효 col width 속성은 기본 폭 160으로 접고 경고 1건을 낸다", () => {
    const { document, warnings } = imported(columnTable(' width="0"'));
    expect(firstColumnWidth(document)).toBe(160);
    expect(warnings).toEqual([attributeWarning("col", "width")]);
  });

  it("무효 data-geul-width는 유효한 col width 속성으로 대신한다", () => {
    const { document, warnings } = imported(
      columnTable(' data-geul-width="10" width="200"'),
    );
    expect(firstColumnWidth(document)).toBe(200);
    expect(warnings).toEqual([attributeWarning("col", "data-geul-width")]);
  });

  it.each([
    ["최소", "48"],
    ["최대", "1200"],
  ])("경계값 %s 폭은 그대로 남고 경고가 없다", (_name, value) => {
    const { document, warnings } = imported(
      columnTable(` data-geul-width="${value}"`),
    );
    expect(firstColumnWidth(document)).toBe(Number(value));
    expect(warnings).toEqual([]);
  });
});

/** 셀 필드 판정 입력이다. 표는 열 하나, 셀 하나다. cellTag는 td 또는 th다. */
const cellTable = (cellTag: "td" | "th", cellAttrs: string, tableStyle = "") =>
  `<table data-geul-block-id="t1"${tableStyle}><colgroup><col data-geul-column-id="c1" data-geul-width="160"></colgroup><tbody><tr data-geul-row-id="r1"><${cellTag} data-geul-cell-id="x1" data-geul-column-id="c1" rowspan="1" colspan="1"${cellAttrs}>v</${cellTag}></tr></tbody></table>`;

/** 첫 표 블록의 첫 셀이다. */
const firstCell = (document: Document) => {
  const cell = firstTable(document).rows[0]?.cells[0];
  if (cell === undefined) throw new Error("셀이 없다");
  return cell;
};

const CELL_FIELDS = [
  {
    name: "textColor",
    attribute: "data-geul-text-color",
    invalid: ' data-geul-text-color="red"',
    kept: ' data-geul-align="center"',
    keptProps: { align: "center" },
  },
  {
    name: "backgroundColor",
    attribute: "data-geul-background-color",
    invalid: ' data-geul-background-color="#abcdef"',
    kept: ' data-geul-align="center"',
    keptProps: { align: "center" },
  },
  {
    name: "align",
    attribute: "data-geul-align",
    invalid: ' data-geul-align="justify"',
    kept: ' data-geul-text-color="#112233"',
    keptProps: { textColor: "#112233" },
  },
] as const;

const CELL_MATRIX = (["td", "th"] as const).flatMap((tag) =>
  CELL_FIELDS.map((field) => ({ tag, field })),
);

describe("표 셀 선택 표시 필드 무효 값", () => {
  it.each(CELL_MATRIX)(
    "$tag, 무효 $field.name: 그 필드만 버리고 경고 1건을 낸다",
    ({ tag, field }) => {
      const { document, warnings } = imported(
        cellTable(tag, field.invalid + field.kept),
      );
      const cell = firstCell(document);
      expect(cell).toMatchObject(field.keptProps);
      expect(cell).not.toHaveProperty(field.name);
      expect(warnings).toEqual([attributeWarning(tag, field.attribute)]);
      expectModelAccepts(document);
    },
  );

  it("무효 data-geul 셀 색은 유효한 style 색으로 되살리지 않는다", () => {
    const { document, warnings } = imported(
      cellTable("td", ' style="color:#00ff00" data-geul-text-color="red"'),
    );
    expect(firstCell(document)).not.toHaveProperty("textColor");
    // 수집기의 style 제거 경고가 먼저, 변환기의 값 제거 경고가 뒤다.
    expect(warnings).toEqual([
      attributeWarning("td", "style"),
      attributeWarning("td", "data-geul-text-color"),
    ]);
  });

  it("정규형 셀 필드는 그대로 남고 경고가 없다", () => {
    const { document, warnings } = imported(
      cellTable(
        "td",
        ' data-geul-text-color="#112233" data-geul-background-color="#445566" data-geul-align="right"',
      ),
    );
    expect(firstCell(document)).toMatchObject({
      textColor: "#112233",
      backgroundColor: "#445566",
      align: "right",
    });
    expect(warnings).toEqual([]);
  });
});

describe("바뀌지 않는 동작", () => {
  it("file 블록의 무효 href는 url 없는 블록을 남기고 UNSAFE_URL_REMOVED(a, href)를 낸다", () => {
    const { document, warnings } = imported(
      '<a href="file:///x" data-geul-block-id="f1" data-geul-media-type="file" data-geul-name="n">n</a>',
    );
    expect(document.blocks).toEqual([{ id: "f1", type: "file", name: "n" }]);
    expect(warnings).toEqual([
      {
        kind: "UNSAFE_URL_REMOVED",
        element: "a",
        attribute: "href",
        message: "Unsafe link URL was removed",
      },
    ]);
  });

  it("url 정책이 막는 iframe은 경고 없이 url 없는 빈 블록으로 남는다", () => {
    const { document, warnings } = imported(
      '<div data-geul-block-id="i1" data-geul-media-type="iframe" data-geul-src="https://e.com/embed"></div>',
    );
    expect(document.blocks).toEqual([{ id: "i1", type: "iframe" }]);
    expect(warnings).toEqual([]);
  });

  it("모든 선택 표시 필드가 정규형인 문서는 export 뒤 import해도 같고 경고가 없다", () => {
    const original = {
      formatVersion: 1 as const,
      revision: 0,
      blocks: [
        {
          id: "p1",
          type: "paragraph" as const,
          content: [{ text: "x" }],
          textColor: "#112233",
          backgroundColor: "#445566",
          textAlignment: "center" as const,
        },
        {
          id: "i1",
          type: "image" as const,
          url: "https://e.com/a.png",
          backgroundColor: "#112233",
          previewWidth: 320,
          textAlignment: "right" as const,
        },
        {
          id: "t1",
          type: "table" as const,
          columns: [{ id: "c1", width: 200 }],
          rows: [
            {
              id: "r1",
              cells: [
                {
                  id: "x1",
                  columnId: "c1",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [{ text: "v" }],
                  textColor: "#112233",
                  backgroundColor: "#445566",
                  align: "center" as const,
                },
              ],
            },
          ],
          headerRows: 0 as const,
          headerColumns: 0 as const,
        },
      ],
    };
    const exported = exportHtml(original);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document: original, warnings: [] },
    });
  });
});
