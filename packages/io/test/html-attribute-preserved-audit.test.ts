/**
 * importHtml의 속성 보존 경고가 노드 단위로 대응하는지 다룬다(RD-001).
 * 변환기가 보존한 속성은 그 노드에 표시한다. 표시되지 않은 속성만 경고한다.
 *
 * - 같은 (kind, element, attribute)를 가진 다른 노드의 경고는 지워지지 않는다.
 * - 이 파일은 변환기가 속성을 쓰지 않는 노드와 쓰는 노드가 섞인 입력을 고정한다.
 * - blockquote·callout·목록 세그먼트는 자손을 복제해 변환기에 넘긴다. 복제본에
 *   건 표시도 원본 노드의 감사에 보여야 한다(가짜 경고 없음).
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../src/index.js";

const importWarnings = (html: string) => {
  const result = importHtml(html);
  if (!result.ok) throw new Error(result.error.message);
  return result.value.warnings;
};

describe("importHtml 속성 보존 표시", () => {
  it("속성이 없는 빈 미디어 div는 같은 태그의 다른 노드 data-geul-name 경고를 지우지 않는다", () => {
    const warnings = importWarnings(
      `<div data-geul-name="n">text</div><div data-geul-block-id="m1" data-geul-media-type="file"></div>`,
    );

    expect(warnings).toEqual([
      {
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "div",
        attribute: "dataGeulName",
        message: "Unsupported dataGeulName attribute was removed from div",
      },
    ]);
  });

  it("속성이 없는 최상위 img는 표 셀 안 img의 src·alt 경고를 지우지 않는다", () => {
    const warnings = importWarnings(
      `<img><table><tr><td><img src="x.png" alt="y"></td></tr></table>`,
    );

    expect(warnings).toEqual([
      {
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "img",
        attribute: "src",
        message: "Unsupported src attribute was removed from img",
      },
      {
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "img",
        attribute: "alt",
        message: "Unsupported alt attribute was removed from img",
      },
    ]);
  });

  it("표시되지 않은 속성 경고는 수집기 경고 뒤에 붙는다", () => {
    const warnings = importWarnings(
      `<table><tr><td><img src="x.png"></td></tr></table><script>1</script>`,
    );

    expect(warnings.map(({ kind }) => kind)).toEqual([
      "UNSAFE_ELEMENT_REMOVED",
      "UNSAFE_ATTRIBUTE_REMOVED",
    ]);
  });
});

describe("importHtml 속성 보존 표시: 세그먼트 복제 노드", () => {
  it.each([
    [
      "blockquote 안 img",
      `<blockquote><img src="https://x.test/a.png" alt="al" data-geul-name="n"></blockquote>`,
    ],
    [
      "blockquote 안 목록 항목의 id·checked",
      `<blockquote><ul><li data-geul-block-id="a" data-geul-checked="true">x</li></ul></blockquote>`,
    ],
    [
      "blockquote 안 ol start",
      `<blockquote><ol start="3"><li>x</li></ol></blockquote>`,
    ],
    [
      "blockquote 안 video figure",
      `<blockquote><figure data-geul-block-id="f" data-geul-media-type="video"><video src="a.mp4" controls></video></figure></blockquote>`,
    ],
    [
      "blockquote 안 토글 details·summary",
      `<blockquote><details data-geul-toggleable="true" data-geul-block-id="d" open><summary data-geul-block-id="s">t</summary></details></blockquote>`,
    ],
    [
      "callout 안 img",
      `<div data-geul-callout="true"><img src="https://x.test/a.png" data-geul-name="n"></div>`,
    ],
    [
      "callout 안 ul의 li",
      `<div data-geul-callout="true"><ul><li data-geul-block-id="a">x</li></ul></div>`,
    ],
    [
      "목록 항목 안 blockquote 안 img",
      `<ul><li><blockquote><img src="a.png"></blockquote></li></ul>`,
    ],
  ])("%s는 속성 경고를 내지 않는다", (_title, html) => {
    expect(importWarnings(html)).toEqual([]);
  });

  it("quote의 children(목록 항목·이미지)을 export한 html은 경고 없이 다시 읽힌다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "quote-1",
          type: "quote",
          content: [{ text: "인용" }],
          children: [
            { id: "item-1", type: "bulletListItem", content: [{ text: "a" }] },
            { id: "image-1", type: "image", url: "https://x.test/a.png" },
          ],
        },
      ],
    };
    const exported = exportHtml(document);
    if (!exported.ok) throw new Error(exported.error.message);

    expect(importWarnings(exported.value)).toEqual([]);
  });

  it("callout의 children(이미지)을 export한 html은 경고 없이 다시 읽힌다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "callout-1",
          type: "callout",
          content: [{ text: "안내" }],
          children: [
            { id: "image-1", type: "image", url: "https://x.test/a.png" },
          ],
        },
      ],
    };
    const exported = exportHtml(document);
    if (!exported.ok) throw new Error(exported.error.message);

    expect(importWarnings(exported.value)).toEqual([]);
  });
});
