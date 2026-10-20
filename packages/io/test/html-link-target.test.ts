/**
 * 링크 `target`의 HTML import/export를 검증한다(Issue #424, RD-001-DELTA-02).
 *
 * - 구 에디터가 저장한 `<a target="_blank" rel="...">`의 target이 import → model → export에서
 *   유지된다. 허용값은 D3의 4종이고 ASCII 소문자로 정규화한다.
 * - 허용 밖 target은 필드를 버리고 `UNSAFE_ATTRIBUTE_REMOVED(a, target)` 1건을 낸다. 읽힌 target은
 *   경고가 없다(속성 보존 감사, G-CNV-002).
 * - `rel`은 읽지 않는다. export가 `_blank`일 때만 `rel="noopener noreferrer"`를 낸다. `nofollow`는
 *   붙이지 않는다.
 * - target이 없는 링크의 출력은 바뀌지 않는다.
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

const attributeWarning = (element: string, attribute: string) => ({
  kind: "UNSAFE_ATTRIBUTE_REMOVED",
  element,
  attribute,
  message: `Unsupported ${attribute} attribute was removed from ${element}`,
});

const exported = (document: Document): string => {
  const result = exportHtml(document);
  if (!result.ok) throw new Error(`export 실패: ${result.error.message}`);
  return result.value;
};

const paragraphWith = (
  content: Extract<
    Document["blocks"][number],
    { type: "paragraph" }
  >["content"],
): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [{ id: "p1", type: "paragraph", content }],
});

const LEGACY_REL = 'rel="noopener noreferrer nofollow"';

describe("링크 target import", () => {
  it.each([
    ["_blank", "_blank"],
    ["_self", "_self"],
    ["_parent", "_parent"],
    ["_top", "_top"],
    ["_BLANK", "_blank"],
    ["_Self", "_self"],
  ])("target=%j는 %j로 읽는다", (raw, expected) => {
    const { document, warnings } = imported(
      `<p><a href="https://e.com" target="${raw}">t</a></p>`,
    );
    expect(document.blocks).toMatchObject([
      {
        content: [
          {
            text: "t",
            marks: [{ type: "link", href: "https://e.com", target: expected }],
          },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("구 에디터 링크는 target을 읽고 rel만 이전처럼 경고한다", () => {
    const { document, warnings } = imported(
      `<p><a href="https://e.com" target="_blank" ${LEGACY_REL}>t</a></p>`,
    );
    expect(document.blocks).toMatchObject([
      {
        content: [
          {
            marks: [{ type: "link", href: "https://e.com", target: "_blank" }],
          },
        ],
      },
    ]);
    expect(warnings).toEqual([attributeWarning("a", "rel")]);
  });

  it.each(["foo", "", "frame1", " _blank", "_blank ", "_blanK"])(
    "허용 밖 target=%j는 버리고 경고 1건이다",
    (raw) => {
      const { document, warnings } = imported(
        `<p><a href="https://e.com" target="${raw}">t</a></p>`,
      );
      expect(JSON.stringify(document.blocks[0])).toContain(
        '"marks":[{"type":"link","href":"https://e.com"}]',
      );
      expect(warnings).toEqual([attributeWarning("a", "target")]);
    },
  );

  it("target이 없는 링크는 target 키가 생기지 않는다", () => {
    const { document, warnings } = imported(
      '<p><a href="https://e.com">t</a></p>',
    );
    expect(JSON.stringify(document.blocks[0])).toContain(
      '"marks":[{"type":"link","href":"https://e.com"}]',
    );
    expect(warnings).toEqual([]);
  });

  it("rel만 있는 링크에는 target이 생기지 않는다", () => {
    const { document, warnings } = imported(
      `<p><a href="https://e.com" ${LEGACY_REL}>t</a></p>`,
    );
    expect(JSON.stringify(document.blocks[0])).not.toContain("target");
    expect(warnings).toEqual([attributeWarning("a", "rel")]);
  });

  it("위험 href는 이전처럼 제거되고 target 경고가 따로 나지 않는다", () => {
    const { document, warnings } = imported(
      '<p><a href="javascript:alert(1)" target="_blank">t</a></p>',
    );
    expect(JSON.stringify(document.blocks[0])).not.toContain("link");
    expect(warnings.map((warning) => warning.kind)).toEqual([
      "UNSAFE_URL_REMOVED",
    ]);
    expect(JSON.stringify(warnings)).not.toContain('"target"');
  });

  it("같은 href·다른 target 인접 링크는 병합하지 않는다", () => {
    const { document } = imported(
      '<p><a href="https://e.com" target="_blank">a</a><a href="https://e.com">b</a><a href="https://e.com" target="_self">c</a></p>',
    );
    expect(document.blocks).toMatchObject([
      {
        content: [
          { text: "a", marks: [{ target: "_blank" }] },
          { text: "b", marks: [{ type: "link" }] },
          { text: "c", marks: [{ target: "_self" }] },
        ],
      },
    ]);
  });

  it("같은 href·같은 target 인접 링크는 병합한다", () => {
    const { document } = imported(
      '<p><a href="https://e.com" target="_blank">a</a><a href="https://e.com" target="_BLANK">b</a></p>',
    );
    expect(document.blocks).toMatchObject([
      { content: [{ text: "ab", marks: [{ target: "_blank" }] }] },
    ]);
  });

  it("제목·목록·인용·표 셀 안의 링크도 target을 읽고 경고가 없다", () => {
    const link = '<a href="https://e.com" target="_blank">t</a>';
    const { document, warnings } = imported(
      `<h2>${link}</h2><ul><li>${link}</li></ul><blockquote><p>${link}</p></blockquote><table><tbody><tr><td>${link}</td></tr></tbody></table>`,
    );
    const json = JSON.stringify(document.blocks);
    expect(json.match(/"target":"_blank"/g)).toHaveLength(4);
    expect(warnings).toEqual([]);
  });

  it("표 셀의 허용 밖 target도 같은 규칙으로 경고한다", () => {
    const { document, warnings } = imported(
      '<table><tbody><tr><td><a href="https://e.com" target="foo">t</a></td></tr></tbody></table>',
    );
    expect(JSON.stringify(document.blocks)).not.toContain("target");
    expect(warnings).toEqual([attributeWarning("a", "target")]);
  });

  it("클립보드 표 옆 링크의 target도 읽는다", () => {
    const blocks = clipboardBlocks(
      '<p><a href="https://e.com" target="_blank">t</a></p><table><tr><td>a</td></tr></table>',
    );
    expect(blocks).toMatchObject([
      {
        type: "paragraph",
        content: [
          {
            marks: [{ type: "link", href: "https://e.com", target: "_blank" }],
          },
        ],
      },
      { type: "table" },
    ]);
  });
});

describe("링크 target export", () => {
  const withTarget = (target?: string): Document =>
    paragraphWith([
      {
        text: "t",
        marks: [
          {
            type: "link",
            href: "https://e.com",
            ...(target === undefined ? {} : { target }),
          },
        ],
      },
    ]);

  it("target이 없으면 이전과 같은 출력이다", () => {
    expect(exported(withTarget())).toBe(
      '<p data-geul-block-id="p1"><a href="https://e.com">t</a></p>',
    );
  });

  it("_blank는 target과 rel을 낸다. nofollow는 붙이지 않는다", () => {
    expect(exported(withTarget("_blank"))).toBe(
      '<p data-geul-block-id="p1"><a href="https://e.com" target="_blank" rel="noopener noreferrer">t</a></p>',
    );
  });

  it.each(["_self", "_parent", "_top"])("%s는 target만 낸다", (target) => {
    expect(exported(withTarget(target))).toBe(
      `<p data-geul-block-id="p1"><a href="https://e.com" target="${target}">t</a></p>`,
    );
  });

  it("정규형이 아닌 target을 가진 문서는 export를 거절한다", () => {
    expect(exportHtml(withTarget("_BLANK")).ok).toBe(false);
  });

  it("표 셀 링크도 같은 출력이다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "t1",
          type: "table",
          headerRows: 0,
          headerColumns: 0,
          columns: [{ id: "c1", width: 160 }],
          rows: [
            {
              id: "r1",
              cells: [
                {
                  id: "x1",
                  columnId: "c1",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [
                    {
                      text: "t",
                      marks: [
                        {
                          type: "link",
                          href: "https://e.com",
                          target: "_blank",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(exported(document)).toContain(
      '<a href="https://e.com" target="_blank" rel="noopener noreferrer">t</a>',
    );
  });

  it("속성값 escaping이 유지된다(href의 따옴표·앰퍼샌드)", () => {
    const document = paragraphWith([
      {
        text: "t",
        marks: [
          { type: "link", href: 'https://e.com/?a=1&b="2"', target: "_blank" },
        ],
      },
    ]);
    const html = exported(document);
    expect(html).toContain('href="https://e.com/?a=1&#x26;b=&#x22;2&#x22;"');
    expect(html).toContain('target="_blank"');
  });
});

describe("링크 target 왕복", () => {
  it.each(["_blank", "_self", "_parent", "_top", undefined])(
    "target %s가 export → import에서 같은 문서·경고 없음으로 돌아온다",
    (target) => {
      const document = paragraphWith([
        { text: "a" },
        {
          text: "link",
          marks: [
            {
              type: "link",
              href: "https://e.com",
              ...(target === undefined ? {} : { target }),
            },
            { type: "bold" },
          ],
        },
      ]);
      const html = exported(document);
      const { document: back, warnings } = imported(html);
      expect(back.blocks[0]).toMatchObject({
        content: [
          { text: "a" },
          {
            text: "link",
            marks: [{ type: "link", href: "https://e.com" }, { type: "bold" }],
          },
        ],
      });
      expect(JSON.stringify(back.blocks[0]).includes('"target"')).toBe(
        target !== undefined,
      );
      expect(warnings).toEqual([]);
      expect(exported(back)).toBe(html);
    },
  );
});
