/**
 * 표 셀 색을 `td`·`th` → `tr` → `table` 순으로 읽는지 고정한다(Issue #334
 * 단계 C).
 *
 * - 글자색은 세 단의 `style color`다. 윗단 값이 없을 때만 아랫단을 쓴다.
 * - 배경은 단마다 `style`이 `bgcolor` 속성을 이긴다. 윗단 값이 없을 때만 아랫단을
 *   쓴다.
 * - `importHtml`과 `parseClipboardTable`이 같은 입력에서 같은 셀 색을 낸다.
 *   `data-geul-*`가 없는 입력이다.
 * - `data-geul-*`는 필드별로 이긴다. `importHtml`은 원시 문자열을 그대로
 *   통과시키고, 클립보드는 정규형일 때만 쓴다.
 * - 셀의 `tr`은 그 셀이 시작하는 행이다. rowspan 셀도 시작 행 기준이다.
 * - 셀 안 블록 요소의 `style` 색은 단계 B가 텍스트 마크로 읽는다. 셀 속성과
 *   마크가 겹쳐 반영되지 않는다.
 * - 기대값은 Chromium `getComputedStyle` 실측(2026-10-10)이다. 의도해서
 *   Chromium과 다르게 읽는 값은 묶음마다 이유를 적었다.
 * - sanitize 스키마는 `style`·`bgColor`를 남기되 경고 기준
 *   (`htmlAllowedAttributes`)은 늘리지 않는다. 기존 제거 경고는 이전과 같다.
 */
import type { Document } from "@cp949/geul-model";
import type { Schema } from "hast-util-sanitize";
import { describe, expect, it } from "vitest";

import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";
import { clipboardSanitizeSchema } from "../src/html/clipboard-sanitize-schema.js";
import { htmlImportSanitizeSchema } from "../src/html/import-html-sanitize-schema.js";
import {
  htmlAllowedAttributes,
  htmlSanitizeSchema,
} from "../src/html/sanitize-schema.js";
import { exportHtml, importHtml } from "../src/index.js";
import { expectSingleTable } from "./clipboard-table-support.js";

/** 셀 색 두 필드다. 없는 필드는 키가 없다. */
type CellColors = { textColor?: string; backgroundColor?: string };

/** 셀에서 색 두 필드만 꺼낸다. */
const colorsOfCell = (cell: CellColors): CellColors => {
  const colors: CellColors = {};
  if (cell.textColor !== undefined) colors.textColor = cell.textColor;
  if (cell.backgroundColor !== undefined) {
    colors.backgroundColor = cell.backgroundColor;
  }
  return colors;
};

/** importHtml이 읽은 첫 표의 셀 색을 행 순서·셀 순서로 돌려준다. */
const importedColors = (html: string): CellColors[][] => {
  const result = importHtml(html);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  const block = result.value.document.blocks[0];
  if (block?.type !== "table" || !("rows" in block)) {
    throw new Error("표 블록이 아니다");
  }
  return block.rows.map((row) => row.cells.map(colorsOfCell));
};

/** 클립보드 파서가 읽은 표의 셀 색을 행 순서·셀 순서로 돌려준다. */
const clipboardColors = (html: string): CellColors[][] =>
  expectSingleTable(parseClipboardTable({ html })).rows.map((row) =>
    row.cells.map(colorsOfCell),
  );

/** 두 경로가 같은 셀 색을 내는지 확인하고 그 결과를 돌려준다. */
const sharedColors = (html: string): CellColors[][] => {
  const fromImport = importedColors(html);
  const fromClipboard = clipboardColors(html);
  expect(fromClipboard).toEqual(fromImport);
  return fromImport;
};

/** 한 셀짜리 표를 만든다. 세 단의 속성 문자열은 그대로 붙는다. */
const table = (
  tableAttributes: string,
  rowAttributes: string,
  cellAttributes: string,
  cellTag: "td" | "th" = "td",
): string =>
  `<table${tableAttributes}><tbody><tr${rowAttributes}><${cellTag}${cellAttributes}>x</${cellTag}></tr></tbody></table>`;

const RED = "#FF0000";
const GREEN = "#00FF00";
const BLUE = "#0000FF";

describe("셀 글자색은 td → tr → table 순으로 읽는다", () => {
  it.each<[string, string, CellColors]>([
    [
      "td의 style 글자색",
      table("", "", ' style="color:#ff0000"'),
      { textColor: RED },
    ],
    [
      "th의 style 글자색",
      table("", "", ' style="color:#ff0000"', "th"),
      { textColor: RED },
    ],
    [
      "tr의 style 글자색",
      table("", ' style="color:#00ff00"', ""),
      { textColor: GREEN },
    ],
    [
      "table의 style 글자색",
      table(' style="color:#0000ff"', "", ""),
      { textColor: BLUE },
    ],
    [
      "td가 tr과 table을 이긴다",
      table(
        ' style="color:#0000ff"',
        ' style="color:#00ff00"',
        ' style="color:#ff0000"',
      ),
      { textColor: RED },
    ],
    [
      "tr이 table을 이긴다",
      table(' style="color:#0000ff"', ' style="color:#00ff00"', ""),
      { textColor: GREEN },
    ],
    [
      "td가 색 없는 서식만 가지면 tr 색을 쓴다",
      table("", ' style="color:#00ff00"', ' style="font-weight:700"'),
      { textColor: GREEN },
    ],
    [
      "th도 tr 색을 쓴다",
      table("", ' style="color:#00ff00"', "", "th"),
      { textColor: GREEN },
    ],
  ])("%s", (_name, html, expected) => {
    expect(sharedColors(html)).toEqual([[expected]]);
  });

  it("색 이름과 rgb 문법도 읽는다", () => {
    expect(
      sharedColors(
        table(' style="color:blue"', ' style="color:rgb(0 255 0)"', ""),
      ),
    ).toEqual([[{ textColor: GREEN }]]);
    expect(sharedColors(table(' style="color:blue"', "", ""))).toEqual([
      [{ textColor: BLUE }],
    ]);
  });

  it("문법 오류 선언은 버리고 아랫단을 쓴다", () => {
    expect(
      sharedColors(
        table("", ' style="color:#00ff00"', ' style="color:not-a-color"'),
      ),
    ).toEqual([[{ textColor: GREEN }]]);
  });

  it("글자색 속성이 없는 표는 색을 만들지 않는다", () => {
    expect(sharedColors(table("", "", ""))).toEqual([[{}]]);
  });
});

describe("셀 배경은 td → tr → table 순으로 읽고 단마다 style이 bgcolor를 이긴다", () => {
  it.each<[string, string, CellColors]>([
    [
      "td의 bgcolor(hex)",
      table("", "", ' bgcolor="#ff0000"'),
      { backgroundColor: RED },
    ],
    [
      "td의 bgcolor(색 이름)",
      table("", "", ' bgcolor="red"'),
      { backgroundColor: RED },
    ],
    [
      "td의 bgcolor(# 없는 hex)",
      table("", "", ' bgcolor="ff0000"'),
      { backgroundColor: RED },
    ],
    [
      "th의 bgcolor",
      table("", "", ' bgcolor="#ff0000"', "th"),
      { backgroundColor: RED },
    ],
    [
      "td의 style 배경",
      table("", "", ' style="background-color:#ff0000"'),
      { backgroundColor: RED },
    ],
    [
      "td의 style background 줄임",
      table("", "", ' style="background:#ff0000"'),
      { backgroundColor: RED },
    ],
    [
      "td에서 style이 bgcolor를 이긴다",
      table("", "", ' bgcolor="#00ff00" style="background-color:#ff0000"'),
      { backgroundColor: RED },
    ],
    [
      "td의 bgcolor가 tr의 style을 이긴다",
      table("", ' style="background-color:#0000ff"', ' bgcolor="#ff0000"'),
      { backgroundColor: RED },
    ],
    [
      "tr의 style 배경",
      table("", ' style="background-color:#00ff00"', ""),
      { backgroundColor: GREEN },
    ],
    [
      "tr의 bgcolor",
      table("", ' bgcolor="#00ff00"', ""),
      { backgroundColor: GREEN },
    ],
    [
      "tr에서 style이 bgcolor를 이긴다",
      table("", ' bgcolor="#0000ff" style="background-color:#00ff00"', ""),
      { backgroundColor: GREEN },
    ],
    [
      "tr이 table을 이긴다",
      table(
        ' style="background-color:#0000ff"',
        ' style="background-color:#00ff00"',
        "",
      ),
      { backgroundColor: GREEN },
    ],
    [
      "tr의 bgcolor가 table의 style을 이긴다",
      table(' style="background-color:#0000ff"', ' bgcolor="#00ff00"', ""),
      { backgroundColor: GREEN },
    ],
    [
      "table의 style 배경",
      table(' style="background-color:#0000ff"', "", ""),
      { backgroundColor: BLUE },
    ],
    [
      "table의 bgcolor",
      table(' bgcolor="#0000ff"', "", ""),
      { backgroundColor: BLUE },
    ],
    [
      "table에서 style이 bgcolor를 이긴다",
      table(' bgcolor="#00ff00" style="background-color:#0000ff"', "", ""),
      { backgroundColor: BLUE },
    ],
    [
      "td가 tr과 table을 이긴다",
      table(
        ' style="background-color:#0000ff"',
        ' style="background-color:#00ff00"',
        ' style="background-color:#ff0000"',
      ),
      { backgroundColor: RED },
    ],
    [
      "td 배경이 없으면 tr 배경이 table 배경을 이긴다",
      table(
        ' style="background-color:#0000ff"',
        ' style="background-color:#00ff00"',
        ' style="font-weight:700"',
      ),
      { backgroundColor: GREEN },
    ],
  ])("%s", (_name, html, expected) => {
    expect(sharedColors(html)).toEqual([[expected]]);
  });

  it("글자색과 배경이 서로 다른 단에서 와도 각자 정해진다", () => {
    expect(
      sharedColors(
        table(
          ' style="background-color:#0000ff"',
          ' style="color:#00ff00"',
          ' bgcolor="#ff0000"',
        ),
      ),
    ).toEqual([[{ textColor: GREEN, backgroundColor: RED }]]);
  });

  it("style이 문법 오류면 같은 단의 bgcolor를 쓴다", () => {
    expect(
      sharedColors(
        table("", "", ' bgcolor="#00ff00" style="background-color:bogus"'),
      ),
    ).toEqual([[{ backgroundColor: GREEN }]]);
  });

  it("bgcolor 값이 투명이거나 읽을 수 없으면 아랫단을 쓴다", () => {
    for (const value of ["transparent", "inherit", ""]) {
      expect(
        sharedColors(
          table(' style="background-color:#0000ff"', ` bgcolor="${value}"`, ""),
        ),
        value,
      ).toEqual([[{ backgroundColor: BLUE }]]);
    }
  });
});

describe("투명 배경은 색을 정하지 않아 아랫단이 비친다(Chromium 실측)", () => {
  it("td의 transparent는 tr 배경이 비친다", () => {
    expect(
      sharedColors(
        table(
          ' style="background-color:#0000ff"',
          ' style="background-color:#00ff00"',
          ' style="background-color:transparent"',
        ),
      ),
    ).toEqual([[{ backgroundColor: GREEN }]]);
  });

  it("tr의 transparent는 table 배경이 비친다", () => {
    expect(
      sharedColors(
        table(
          ' style="background-color:#0000ff"',
          ' style="background-color:transparent"',
          "",
        ),
      ),
    ).toEqual([[{ backgroundColor: BLUE }]]);
  });

  it("td의 transparent가 같은 td의 bgcolor도 지운다", () => {
    expect(
      sharedColors(
        table(
          "",
          "",
          ' bgcolor="#00ff00" style="background-color:transparent"',
        ),
      ),
    ).toEqual([[{}]]);
  });

  it("td의 transparent가 같은 td의 bgcolor를 지우고 tr 배경이 비친다", () => {
    expect(
      sharedColors(
        table(
          "",
          ' style="background-color:#0000ff"',
          ' bgcolor="#00ff00" style="background-color:transparent"',
        ),
      ),
    ).toEqual([[{ backgroundColor: BLUE }]]);
  });

  it("td의 inherit·initial·unset도 tr 배경이 비친다", () => {
    for (const value of ["inherit", "initial", "unset"]) {
      expect(
        sharedColors(
          table(
            "",
            ' style="background-color:#0000ff"',
            ` bgcolor="#00ff00" style="background-color:${value}"`,
          ),
        ),
        value,
      ).toEqual([[{ backgroundColor: BLUE }]]);
    }
  });

  it("td의 color:inherit는 tr 글자색을 쓴다", () => {
    expect(
      sharedColors(
        table("", ' style="color:#00ff00"', ' style="color:inherit"'),
      ),
    ).toEqual([[{ textColor: GREEN }]]);
  });
});

describe("설계상 Chromium과 다르게 읽는 셀 색", () => {
  // Chromium은 반투명 배경을 아랫단 위에 합성해 그린다. 모델은 alpha를 담지
  // 않으므로 반투명은 색을 정하지 않은 값으로 두고 아랫단을 쓴다.
  it("td의 반투명 배경은 색이 아니라서 tr 배경을 쓴다", () => {
    expect(
      sharedColors(
        table(
          "",
          ' style="background-color:#0000ff"',
          ' style="background-color:rgba(255,0,0,0.5)"',
        ),
      ),
    ).toEqual([[{ backgroundColor: BLUE }]]);
  });

  // Chromium은 color:transparent를 투명 글자로 그리고 tr 색을 상속하지 않는다.
  // 읽기 규칙은 span과 같이 색을 정하지 않은 값으로 보고 아랫단을 쓴다
  // (#333 이후 span 중첩과 같은 처리).
  it("td의 color:transparent는 색이 아니라서 tr 글자색을 쓴다", () => {
    expect(
      sharedColors(
        table("", ' style="color:#00ff00"', ' style="color:transparent"'),
      ),
    ).toEqual([[{ textColor: GREEN }]]);
  });

  // Chromium은 옛 속성의 쓰레기 값도 색으로 바꿔 그린다. 읽지 않는다.
  it("bgcolor의 쓰레기 값은 읽지 않는다", () => {
    expect(sharedColors(table("", "", ' bgcolor="garbage"'))).toEqual([[{}]]);
    expect(sharedColors(table("", "", ' bgcolor="rgb(255,0,0)"'))).toEqual([
      [{}],
    ]);
  });
});

describe("셀의 tr은 그 셀이 시작하는 행이다", () => {
  const rowspanHtml =
    '<table style="background:#0000ff"><tbody>' +
    '<tr style="background:#00ff00;color:#00ff00"><td rowspan="2">a</td><td>b</td></tr>' +
    '<tr style="background:#ffff00;color:#ffff00"><td>c</td></tr>' +
    "</tbody></table>";

  it("rowspan 셀은 시작 행의 색을 쓰고 다음 행 셀은 자기 행의 색을 쓴다", () => {
    expect(importedColors(rowspanHtml)).toEqual([
      [
        { textColor: GREEN, backgroundColor: GREEN },
        { textColor: GREEN, backgroundColor: GREEN },
      ],
      [{ textColor: "#FFFF00", backgroundColor: "#FFFF00" }],
    ]);
  });

  it("클립보드 경로도 같다", () => {
    const rows = clipboardColors(rowspanHtml);
    expect(rows[0]).toEqual([
      { textColor: GREEN, backgroundColor: GREEN },
      { textColor: GREEN, backgroundColor: GREEN },
    ]);
    expect(rows[1]).toEqual([
      { textColor: "#FFFF00", backgroundColor: "#FFFF00" },
    ]);
  });

  it("행마다 다른 tr 색을 각 행의 셀에 준다", () => {
    const html =
      "<table><tbody>" +
      '<tr style="background-color:#ff0000"><td>a</td></tr>' +
      '<tr style="background-color:#00ff00"><td>b</td></tr>' +
      "<tr><td>c</td></tr>" +
      "</tbody></table>";
    expect(sharedColors(html)).toEqual([
      [{ backgroundColor: RED }],
      [{ backgroundColor: GREEN }],
      [{}],
    ]);
  });

  it("thead·tfoot 행의 tr도 같은 규칙이다", () => {
    const html =
      "<table><thead>" +
      '<tr style="background-color:#ff0000"><th>h</th></tr>' +
      '</thead><tbody><tr><td>b</td></tr></tbody><tfoot><tr style="background-color:#00ff00"><td>f</td></tr></tfoot></table>';
    expect(sharedColors(html)).toEqual([
      [{ backgroundColor: RED }],
      [{}],
      [{ backgroundColor: GREEN }],
    ]);
  });
});

describe("data-geul-*가 셀 style·bgcolor보다 필드별로 우선한다", () => {
  it("data-geul 글자색이 tr 글자색을 이긴다", () => {
    const html = table(
      "",
      ' style="color:#00ff00"',
      ' data-geul-text-color="#112233"',
    );
    expect(sharedColors(html)).toEqual([[{ textColor: "#112233" }]]);
  });

  it("data-geul 배경이 td의 bgcolor·tr의 style을 이긴다", () => {
    const html = table(
      "",
      ' style="background-color:#00ff00"',
      ' data-geul-background-color="#112233" bgcolor="#ff0000"',
    );
    expect(sharedColors(html)).toEqual([[{ backgroundColor: "#112233" }]]);
  });

  it("data-geul가 없는 필드만 tr·table에서 채운다", () => {
    const html = table(
      ' style="background-color:#0000ff"',
      ' style="color:#00ff00"',
      ' data-geul-text-color="#112233"',
    );
    expect(sharedColors(html)).toEqual([
      [{ textColor: "#112233", backgroundColor: BLUE }],
    ]);
  });

  it("importHtml은 비정규형 data-geul 값을 원시 문자열 그대로 통과시켜 문서 검증이 거절한다", () => {
    const result = importHtml(
      table("", ' style="color:#00ff00"', ' data-geul-text-color="red"'),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("HTML_DOCUMENT_INVALID");
  });

  it("클립보드는 비정규형 data-geul 값을 버리고 tr·table 값을 쓴다", () => {
    const html = table(
      ' style="background-color:#0000ff"',
      ' style="color:#00ff00"',
      ' data-geul-text-color="red" data-geul-background-color="blue"',
    );
    expect(clipboardColors(html)).toEqual([
      [{ textColor: GREEN, backgroundColor: BLUE }],
    ]);
  });
});

describe("기존 셀 색 동작은 그대로다", () => {
  const colorDocument: Document = {
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "t1",
        type: "table",
        columns: [
          { id: "c1", width: 160 },
          { id: "c2", width: 160 },
        ],
        headerRows: 0,
        headerColumns: 0,
        rows: [
          {
            id: "r1",
            cells: [
              {
                id: "a",
                columnId: "c1",
                rowSpan: 1,
                columnSpan: 1,
                content: [{ text: "a" }],
                textColor: "#FF0000",
                backgroundColor: "#00FF00",
              },
              {
                id: "b",
                columnId: "c2",
                rowSpan: 1,
                columnSpan: 1,
                content: [{ text: "b" }],
              },
            ],
          },
        ],
      },
    ],
  };

  it("셀 색이 있는 문서는 경고 없이 같은 결과로 왕복한다", () => {
    const exported = exportHtml(colorDocument);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document: colorDocument, warnings: [] },
    });
  });

  it("셀 style만 있는 클립보드 표는 이전과 같이 읽는다", () => {
    expect(
      clipboardColors(
        table("", "", ' style="background:yellow;color:red;text-align:right"'),
      ),
    ).toEqual([[{ textColor: RED, backgroundColor: "#FFFF00" }]]);
  });

  // align은 이슈 범위 밖이다. td의 text-align만 읽는 기존 동작을 유지한다.
  it("셀 align은 td의 text-align만 읽는다", () => {
    const rows = expectSingleTable(
      parseClipboardTable({
        html: table(
          ' style="text-align:right"',
          ' style="text-align:center"',
          ' style="text-align:left"',
        ),
      }),
    ).rows;
    expect(rows[0]?.cells[0]?.align).toBe("left");
    const noCellAlign = expectSingleTable(
      parseClipboardTable({
        html: table(
          ' style="text-align:right"',
          ' style="text-align:center"',
          "",
        ),
      }),
    ).rows;
    expect(noCellAlign[0]?.cells[0]?.align).toBeUndefined();
  });
});

describe("셀 속성 색과 셀 안 블록 style 마크가 함께 있다", () => {
  it("td 글자색은 셀 속성, 안쪽 p 글자색은 텍스트 마크로 따로 반영된다", () => {
    const html = table("", "", ' style="color:red"').replace(
      ">x<",
      '><p style="color:blue">x</p><',
    );
    const result = importHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    const block = result.value.document.blocks[0];
    if (block?.type !== "table" || !("rows" in block)) {
      throw new Error("표 블록이 아니다");
    }
    expect(block.rows[0]?.cells[0]).toMatchObject({
      textColor: RED,
      content: [{ text: "x", marks: [{ type: "textColor", color: BLUE }] }],
    });

    const clip = expectSingleTable(parseClipboardTable({ html }));
    expect(clip.rows[0]?.cells[0]).toMatchObject({
      textColor: RED,
      content: [{ text: "x", marks: [{ type: "textColor", color: BLUE }] }],
    });
  });

  it("tr 배경은 셀 속성이고 안쪽 p 배경은 마크다", () => {
    const html = table("", ' style="background-color:#00ff00"', "").replace(
      ">x<",
      '><p style="background-color:#ff0000">x</p><',
    );
    const [importedRow] = importedColors(html);
    expect(importedRow).toEqual([{ backgroundColor: GREEN }]);
    const clip = expectSingleTable(parseClipboardTable({ html }));
    expect(clip.rows[0]?.cells[0]).toMatchObject({
      backgroundColor: GREEN,
      content: [
        { text: "x", marks: [{ type: "backgroundColor", color: RED }] },
      ],
    });
  });

  it("셀에 색이 없고 안쪽 p만 색이 있으면 셀 속성은 비고 마크만 남는다", () => {
    const html = table("", "", "").replace(
      ">x<",
      '><p style="color:#ff0000">x</p><',
    );
    expect(sharedColors(html)).toEqual([[{}]]);
  });
});

describe("sanitize 스키마와 경고 계약", () => {
  const readOnlyTags = ["td", "th", "tr", "table"] as const;
  const schemas: Array<[string, Schema]> = [
    ["htmlSanitizeSchema", htmlSanitizeSchema],
    ["htmlImportSanitizeSchema", htmlImportSanitizeSchema],
    ["clipboardSanitizeSchema", clipboardSanitizeSchema],
  ];

  it.each(schemas)(
    "%s는 td·th·tr·table의 style과 bgColor를 남긴다",
    (_name, schema) => {
      for (const tag of readOnlyTags) {
        const allowed = schema.attributes?.[tag] ?? [];
        expect(allowed, `${tag} style`).toContain("style");
        expect(allowed, `${tag} bgColor`).toContain("bgColor");
      }
    },
  );

  it("경고 기준 집합(htmlAllowedAttributes)에는 style·bgColor를 올리지 않는다", () => {
    for (const tag of readOnlyTags) {
      const allowed = htmlAllowedAttributes[tag] ?? [];
      expect(allowed, `${tag} style`).not.toContain("style");
      expect(allowed, `${tag} bgColor`).not.toContain("bgColor");
    }
  });

  it.each([
    [
      "td",
      "style",
      '<table><tbody><tr><td style="color:#ff0000">a</td></tr></tbody></table>',
    ],
    [
      "td",
      "bgColor",
      '<table><tbody><tr><td bgcolor="#ff0000">a</td></tr></tbody></table>',
    ],
    [
      "th",
      "style",
      '<table><tbody><tr><th style="color:#ff0000">a</th></tr></tbody></table>',
    ],
    [
      "th",
      "bgColor",
      '<table><tbody><tr><th bgcolor="#ff0000">a</th></tr></tbody></table>',
    ],
    [
      "tr",
      "style",
      '<table><tbody><tr style="color:#ff0000"><td>a</td></tr></tbody></table>',
    ],
    [
      "tr",
      "bgColor",
      '<table><tbody><tr bgcolor="#ff0000"><td>a</td></tr></tbody></table>',
    ],
    [
      "table",
      "style",
      '<table style="color:#ff0000"><tbody><tr><td>a</td></tr></tbody></table>',
    ],
    [
      "table",
      "bgColor",
      '<table bgcolor="#ff0000"><tbody><tr><td>a</td></tr></tbody></table>',
    ],
  ])(
    "%s의 %s 제거 경고는 색을 읽어도 이전처럼 보고된다",
    (element, attribute, html) => {
      const result = importHtml(html);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.warnings).toContainEqual(
        expect.objectContaining({
          kind: "UNSAFE_ATTRIBUTE_REMOVED",
          element,
          attribute,
        }),
      );
    },
  );

  it("색을 읽은 표도 읽지 않는 속성(width)의 경고는 그대로다", () => {
    const result = importHtml(
      '<table><tbody><tr><td width="10" bgcolor="#ff0000">a</td></tr></tbody></table>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.warnings).toContainEqual(
      expect.objectContaining({
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "td",
        attribute: "width",
      }),
    );
  });
});
