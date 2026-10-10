/**
 * 표 셀의 글자 서식을 `table` → `tr` → `td` 순으로 읽는지 고정한다(Issue #342).
 *
 * - 굵게·기울임은 상속 속성이라 안쪽 값이 이긴다. 끄는 값도 덮는다.
 * - 밑줄·취소선은 전파라 안쪽에서 끄지 못한다.
 * - `importHtml`과 `parseClipboardTable`이 같은 입력에서 같은 서식을 낸다.
 * - 셀의 `tr`은 그 셀이 시작하는 행이다. rowspan 셀도 시작 행 기준이다.
 * - 서식은 `data-geul-*` 색과 독립이다. 색이 `data-geul-*`로 정해져도 서식은
 *   style에서 읽는다.
 * - 표 안은 조상 인라인 마크를 받지 않는다(ADR-0014). `<b><table>`의 셀은
 *   굵지 않다.
 * - `th`의 기본 굵기는 읽지 않는다.
 * - 기대값은 Chromium `getComputedStyle` 실측(2026-10-10, Chromium 153)이다.
 *   각 행의 `td` 글자 `x`를 본다.
 */
import { describe, expect, it } from "vitest";

import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";
import { importHtml } from "../src/index.js";

/** 글자 `x`가 받는 마크 종류다. 정렬된 배열이다. */
type MarkTypes = string[];

/** 모델 노드를 훑어 글자 `x`의 마크 종류와 셀 색을 모은다. */
const findLeaf = (
  node: unknown,
): { marks: MarkTypes; textColor?: string } | undefined => {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findLeaf(child);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (node === null || typeof node !== "object") return undefined;
  const record = node as Record<string, unknown>;
  if (record.text === "x") {
    const marks = (record.marks ?? []) as Array<{ type: string }>;
    return { marks: marks.map((mark) => mark.type).sort() };
  }
  for (const [key, value] of Object.entries(record)) {
    if (key === "marks") continue;
    const found = findLeaf(value);
    if (found === undefined) continue;
    // 가장 가까운 조상의 글자색을 쓴다.
    if (found.textColor === undefined && typeof record.textColor === "string") {
      found.textColor = record.textColor;
    }
    return found;
  }
  return undefined;
};

/** importHtml이 읽은 글자 `x`다. */
const imported = (html: string) => {
  const result = importHtml(html);
  expect(result.ok).toBe(true);
  return result.ok ? findLeaf(result.value.document.blocks) : undefined;
};

/** 클립보드 표 파서가 읽은 글자 `x`다. */
const clipboard = (html: string) => {
  const result = parseClipboardTable({ html });
  expect(result.ok).toBe(true);
  return result.ok ? findLeaf(result.value) : undefined;
};

/** 두 경로가 같은 글자 `x`를 읽는지 확인하고 마크 종류를 돌려준다. */
const shared = (html: string): MarkTypes => {
  const fromImport = imported(html);
  expect(clipboard(html)).toEqual(fromImport);
  return fromImport?.marks ?? [];
};

const BOLD = ["bold"];
const NONE: MarkTypes = [];

/** 한 셀짜리 표를 만든다. 세 단의 속성 문자열은 그대로 붙는다. */
const table = (
  tableAttributes: string,
  rowAttributes: string,
  cellAttributes: string,
  inner = "x",
): string =>
  `<table${tableAttributes}><tbody><tr${rowAttributes}><td${cellAttributes}>${inner}</td></tr></tbody></table>`;

describe("셀 서식은 table → tr → td 순으로 겹친다", () => {
  it.each<[string, string, string, string, MarkTypes]>([
    ["td만", "", "", ' style="font-weight:bold"', BOLD],
    ["tr만", "", ' style="font-weight:bold"', "", BOLD],
    ["table만", ' style="font-weight:bold"', "", "", BOLD],
    [
      "td의 normal이 table의 bold를 끈다",
      ' style="font-weight:bold"',
      "",
      ' style="font-weight:normal"',
      NONE,
    ],
    [
      "tr의 400이 table의 bold를 끈다",
      ' style="font-weight:bold"',
      ' style="font-weight:400"',
      "",
      NONE,
    ],
    [
      "td의 400이 tr의 bold를 끈다",
      "",
      ' style="font-weight:bold"',
      ' style="font-weight:400"',
      NONE,
    ],
    [
      "td의 italic이 table의 normal을 덮는다",
      ' style="font-style:normal"',
      "",
      ' style="font-style:italic"',
      ["italic"],
    ],
    [
      "td의 font-style:normal이 table의 italic을 끈다",
      ' style="font-style:italic"',
      "",
      ' style="font-style:normal"',
      NONE,
    ],
  ])(
    "%s",
    (_name, tableAttributes, rowAttributes, cellAttributes, expected) => {
      expect(
        shared(table(tableAttributes, rowAttributes, cellAttributes)),
      ).toEqual(expected);
    },
  );

  it("밑줄은 전파라 td의 none이 table의 밑줄을 끄지 못한다", () => {
    expect(
      shared(
        table(
          ' style="text-decoration:underline"',
          "",
          ' style="text-decoration:none"',
        ),
      ),
    ).toEqual(["underline"]);
  });

  it("세 단의 서로 다른 서식이 합쳐진다", () => {
    expect(
      shared(
        table(
          ' style="text-decoration:underline"',
          ' style="font-style:italic"',
          ' style="font-weight:bold"',
        ),
      ),
    ).toEqual(["bold", "italic", "underline"]);
  });

  it("font 줄임은 굵기와 기울임을 함께 정한다", () => {
    expect(
      shared(table(' style="font:italic bold 12px Arial"', "", "")),
    ).toEqual(["bold", "italic"]);
    expect(
      shared(
        table(
          ' style="font:italic bold 12px Arial"',
          "",
          ' style="font:12px Arial"',
        ),
      ),
    ).toEqual(NONE);
  });

  it("셀 안 p의 style이 셀 서식을 덮는다", () => {
    expect(
      shared(
        table(
          ' style="font-weight:bold"',
          "",
          "",
          '<p style="font-weight:normal">x</p>',
        ),
      ),
    ).toEqual(NONE);
    expect(
      shared(table(' style="font-weight:bold"', "", "", "<p>x</p>")),
    ).toEqual(BOLD);
  });

  it("셀 안 span의 끄는 값이 셀 서식을 끈다", () => {
    expect(
      shared(
        table(
          "",
          ' style="font-weight:bold"',
          "",
          '<span style="font-weight:normal">x</span>',
        ),
      ),
    ).toEqual(NONE);
  });
});

describe("셀 서식의 행과 열", () => {
  it("행 style은 그 행의 모든 셀에 적용된다", () => {
    const html =
      '<table><tbody><tr style="font-weight:bold"><td>y</td><td>x</td></tr></tbody></table>';
    expect(shared(html)).toEqual(BOLD);
  });

  it("rowspan 셀은 시작 행의 서식을 받는다", () => {
    const html =
      '<table><tbody><tr style="font-weight:bold"><td rowspan="2">x</td><td>b</td></tr><tr><td>c</td></tr></tbody></table>';
    expect(shared(html)).toEqual(BOLD);
  });

  it("다른 행의 style은 번지지 않는다", () => {
    const html =
      '<table><tbody><tr style="font-weight:bold"><td>a</td></tr><tr><td>x</td></tr></tbody></table>';
    expect(shared(html)).toEqual(NONE);
  });
});

describe("셀 서식과 다른 규칙의 경계", () => {
  it("서식은 data-geul-* 색과 독립이다", () => {
    const html = table(
      ' style="font-weight:bold"',
      "",
      ' data-geul-text-color="#112233" data-geul-background-color="#445566"',
    );
    expect(shared(html)).toEqual(BOLD);
  });

  it("계산 스타일 덤프가 붙은 단의 서식은 읽는다", () => {
    const html = table(
      ' style="color:#112233;font-weight:bold;-webkit-text-stroke-width:0px"',
      "",
      "",
    );
    expect(shared(html)).toEqual(BOLD);
  });

  it("표를 감싼 b의 굵게는 셀로 오지 않는다(ADR-0014)", () => {
    expect(
      imported("<b><table><tbody><tr><td>x</td></tr></tbody></table></b>"),
    ).toEqual({
      marks: NONE,
    });
  });

  it("th의 기본 굵기는 읽지 않는다", () => {
    expect(
      imported("<table><tbody><tr><th>x</th></tr></tbody></table>"),
    ).toEqual({ marks: NONE });
  });

  it("서식 선언이 없으면 마크가 없다", () => {
    expect(shared(table(' style="color:red"', "", ""))).toEqual(NONE);
  });
});
