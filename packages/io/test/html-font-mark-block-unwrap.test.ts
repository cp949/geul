/**
 * 블록을 품은 `font`·`mark`는 태그만 벗기고 자식을 그 자리에 둔다는 계약을
 * 고정한다(Issue #334 리뷰 MAJOR-2).
 *
 * - #334 전에는 sanitize가 `font`·`mark`를 벗겨 블록 구조가 그대로 남았다.
 *   #334가 두 태그를 허용 태그에 올린 뒤에는 블록 자손을 가진 `font`·`mark`가
 *   인라인 요소로 남아 목록이 문단으로, 표가 목록 항목 텍스트로 깨졌다.
 * - 블록 경계 자손이 있으면 sanitize 이후 단계에서 그 태그만 벗긴다. 블록 자손이
 *   없는 `font`·`mark`는 색·배경 마크로 읽는다.
 * - 이 처리는 `importHtml`과 `parseClipboardTable`이 공유한다.
 * - 경고는 raw HAST 기준이라 벗기는 처리로 달라지지 않는다(G-CNV-002).
 * - 기대값은 #334 이전(b5a2b8e5) 번들 실측이다. 아래 "블록 자손이 없는" 묶음은
 *   가드라 수정 전에도 통과한다.
 */
import type { DocumentBlock } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";
import { importHtml } from "../src/index.js";

/** `importHtml` 성공 결과를 꺼낸다. 실패하면 오류 코드로 던진다. */
const imported = (html: string) => {
  const result = importHtml(html);
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
};

/** 블록에서 id 계열 필드를 지워 구조만 비교할 수 있게 한다. */
const withoutIds = (blocks: DocumentBlock[]): unknown =>
  JSON.parse(
    JSON.stringify(blocks, (key, value: unknown) =>
      key === "id" || key === "columnId" || key === "rowId" || key === "cellId"
        ? undefined
        : value,
    ),
  );

/** 표 한 개를 만드는 HTML이다. */
const tableHtml = "<table><tbody><tr><td>c</td></tr></tbody></table>";

/** 표 블록 기대값(id 제외)이다. */
const tableBlock = {
  type: "table",
  columns: [{ width: 160 }],
  rows: [{ cells: [{ rowSpan: 1, columnSpan: 1, content: [{ text: "c" }] }] }],
  headerRows: 0,
  headerColumns: 0,
};

describe("블록을 품은 font·mark는 태그만 벗겨 블록 구조를 유지한다", () => {
  it.each([
    [
      "font > ul > li 둘",
      "<font><ul><li>a</li><li>b</li></ul></font>",
      [
        { type: "bulletListItem", content: [{ text: "a" }] },
        { type: "bulletListItem", content: [{ text: "b" }] },
      ],
    ],
    [
      "font > ol > li",
      "<font><ol><li>a</li></ol></font>",
      [{ type: "numberedListItem", content: [{ text: "a" }] }],
    ],
    [
      "mark > ul > li",
      "<mark><ul><li>a</li></ul></mark>",
      [{ type: "bulletListItem", content: [{ text: "a" }] }],
    ],
    [
      "li 안 font > 글자와 표",
      `<ul><li><font>x${tableHtml}</font></li></ul>`,
      [
        {
          type: "bulletListItem",
          content: [{ text: "x" }],
          children: [tableBlock],
        },
      ],
    ],
    [
      "li 안 mark > 글자와 표",
      `<ul><li><mark>x${tableHtml}</mark></li></ul>`,
      [
        {
          type: "bulletListItem",
          content: [{ text: "x" }],
          children: [tableBlock],
        },
      ],
    ],
  ])("%s", (_name, html, expected) => {
    expect(withoutIds(imported(html).document.blocks)).toEqual(expected);
  });

  it("font 안 제목과 문단도 블록으로 남는다", () => {
    expect(
      withoutIds(imported("<font><h2>t</h2><p>a</p></font>").document.blocks),
    ).toEqual([
      { type: "heading", level: 2, content: [{ text: "t" }] },
      { type: "paragraph", content: [{ text: "a" }] },
    ]);
  });

  it("중첩한 font > mark > ul도 벗긴다", () => {
    expect(
      withoutIds(
        imported("<font><mark><ul><li>a</li></ul></mark></font>").document
          .blocks,
      ),
    ).toEqual([{ type: "bulletListItem", content: [{ text: "a" }] }]);
  });

  it("바깥 font가 벗겨져도 블록 자손이 없는 안쪽 mark는 마크로 남는다", () => {
    expect(
      withoutIds(
        imported("<font><mark>m</mark><ul><li>a</li></ul></font>").document
          .blocks,
      ),
    ).toEqual([
      {
        type: "paragraph",
        content: [
          { text: "m", marks: [{ type: "backgroundColor", color: "#FFFF00" }] },
        ],
      },
      { type: "bulletListItem", content: [{ text: "a" }] },
    ]);
  });

  it("li 안 font·mark가 품은 빈 table은 #334 이전처럼 문서를 거절한다", () => {
    // 벗기지 않으면 빈 table이 li 텍스트에 섞여 table 검증을 피한다. 벗기면
    // 표가 li 자식으로 남아 검증이 이전과 같이 거절한다.
    for (const html of [
      "<ul><li><mark><table></table></mark></li></ul>",
      "<ul><li>a<font><table></table></font></li></ul>",
    ]) {
      const result = importHtml(html);
      expect(result.ok, html).toBe(false);
      if (!result.ok)
        expect(result.error.code, html).toBe("HTML_DOCUMENT_INVALID");
    }
  });

  it("클립보드 표 파서도 font 안 목록을 목록 블록으로 읽는다", () => {
    const result = parseClipboardTable({
      html: `<font><ul><li>a</li></ul></font>${tableHtml}`,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((block) => block.type)).toEqual([
      "bulletListItem",
      "table",
    ]);
  });

  it("클립보드 표 파서의 mark 안 문단도 문단 블록으로 읽는다", () => {
    const result = parseClipboardTable({
      html: `${tableHtml}<mark><p>x</p></mark>`,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((block) => block.type)).toEqual([
      "table",
      "paragraph",
    ]);
  });
});

describe("경고는 블록을 벗겨도 raw HAST 기준 그대로다", () => {
  /** 경고를 `kind:element:attribute`로 줄인다. */
  const warningsOf = (html: string): string[] =>
    imported(html).warnings.map((warning) => {
      const fields = warning as { element?: string; attribute?: string };
      return `${warning.kind}:${fields.element ?? ""}:${fields.attribute ?? ""}`;
    });

  it.each([
    ["<font><ul><li>a</li></ul></font>", ["SAFE_BLOCK_DOWNGRADED:font:"]],
    ["<mark><ul><li>a</li></ul></mark>", ["SAFE_BLOCK_DOWNGRADED:mark:"]],
  ])("%s", (html, expected) => {
    expect(warningsOf(html)).toEqual(expected);
  });
});

describe("블록 자손이 없는 font·mark는 계속 마크로 읽는다", () => {
  it("font color는 글자색 마크다", () => {
    expect(
      withoutIds(imported('<font color="red">x</font>').document.blocks),
    ).toEqual([
      {
        type: "paragraph",
        content: [
          { text: "x", marks: [{ type: "textColor", color: "#FF0000" }] },
        ],
      },
    ]);
  });

  it("mark는 노랑 배경 마크다", () => {
    expect(withoutIds(imported("<mark>x</mark>").document.blocks)).toEqual([
      {
        type: "paragraph",
        content: [
          { text: "x", marks: [{ type: "backgroundColor", color: "#FFFF00" }] },
        ],
      },
    ]);
  });

  it("li 안 font·mark도 마크다", () => {
    expect(
      withoutIds(
        imported('<ul><li><font color="red">x</font></li></ul>').document
          .blocks,
      ),
    ).toEqual([
      {
        type: "bulletListItem",
        content: [
          { text: "x", marks: [{ type: "textColor", color: "#FF0000" }] },
        ],
      },
    ]);
  });

  it("표 셀 안 font color는 두 경로 모두 글자색 마크다", () => {
    const html =
      '<table><tbody><tr><td><font color="red">x</font></td></tr></tbody></table>';
    const expected = [
      { text: "x", marks: [{ type: "textColor", color: "#FF0000" }] },
    ];
    const [block] = imported(html).document.blocks;
    if (block?.type !== "table" || !("rows" in block)) {
      throw new Error("표가 아니다");
    }
    expect(block.rows[0]?.cells[0]?.content).toEqual(expected);
    const clipboard = parseClipboardTable({ html });
    expect(clipboard.ok).toBe(true);
    if (!clipboard.ok) return;
    const [table] = clipboard.value;
    if (table?.type !== "table") throw new Error("표가 아니다");
    expect(table.data.rows[0]?.cells[0]?.content).toEqual(expected);
  });

  it("br만 든 font는 줄바꿈을 마크 안에 둔다", () => {
    expect(
      withoutIds(imported('<font color="red">a<br>b</font>').document.blocks),
    ).toEqual([
      {
        type: "paragraph",
        content: [
          { text: "a\nb", marks: [{ type: "textColor", color: "#FF0000" }] },
        ],
      },
    ]);
  });
});
