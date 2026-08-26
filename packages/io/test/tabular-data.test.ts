/**
 * `validateTabularData`가 공개 명령 경계에서 TabularData를 거르는지, 그리고
 * `withParagraphsMergedIntoCells`가 표를 감싼 문단/heading의 인라인 콘텐츠를
 * 표 가장자리 셀에 정확히 병합하는지 검증한다.
 */
import type { InlineContent } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import {
  type TabularCell,
  type TabularData,
  validateTabularData,
  withParagraphsMergedIntoCells,
} from "../src/clipboard/tabular-data.js";

/**
 * 통과해야 정상인 기준 데이터(1행 2열, 서식 없음)를 만든다.
 * 거부 케이스와 대비해 검증기가 무조건 거부하지 않음을 보인다.
 */
const gridData = (): TabularData => ({
  columnCount: 2,
  rows: [
    {
      cells: [
        { columnIndex: 0, rowSpan: 1, columnSpan: 1, content: [] },
        { columnIndex: 1, rowSpan: 1, columnSpan: 1, content: [] },
      ],
    },
  ],
});

/**
 * 서식 필드만 바꿔가며 검증하기 위한 1x1 데이터를 만든다.
 * 각 테스트는 검사 대상 서식 필드만 넘긴다.
 */
const styledCell = (fields: Partial<TabularCell>): TabularData => ({
  columnCount: 1,
  rows: [
    {
      cells: [
        { columnIndex: 0, rowSpan: 1, columnSpan: 1, content: [], ...fields },
      ],
    },
  ],
});

describe("validateTabularData", () => {
  it("직사각형 커버리지는 허용한다", () => {
    expect(validateTabularData(gridData())).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("빈 데이터는 CLIPBOARD_TABLE_INVALID로 거부한다", () => {
    expect(validateTabularData({ columnCount: 0, rows: [] })).toMatchObject({
      ok: false,
      error: { code: "CLIPBOARD_TABLE_INVALID" },
    });
  });

  it("NaN·비정수·음수 columnCount는 커버리지 계산 전에 거부한다", () => {
    // NaN은 `=== 0`도 `< 1`도 false라 기존 빈 데이터 가드를 통과하고,
    // validateGridCoverage의 new Array(rowCount * columnCount)가
    // RangeError를 던져 Result 계약 밖으로 예외가 새어나갔다.
    for (const columnCount of [Number.NaN, 2.5, -1]) {
      expect(validateTabularData({ ...gridData(), columnCount })).toMatchObject(
        {
          ok: false,
          error: {
            code: "CLIPBOARD_TABLE_INVALID",
            message: "columnCount must be a positive integer",
          },
        },
      );
    }
  });

  it("model 인라인 텍스트 계약을 어기는 셀은 CLIPBOARD_TABLE_INVALID로 거부한다", () => {
    const data: TabularData = {
      columnCount: 1,
      rows: [
        {
          cells: [
            {
              columnIndex: 0,
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "a\tb" }],
            },
          ],
        },
      ],
    };
    expect(validateTabularData(data)).toMatchObject({
      ok: false,
      error: { code: "CLIPBOARD_TABLE_INVALID" },
    });
  });

  it("겹치는 셀은 CLIPBOARD_TABLE_INVALID로 거부한다", () => {
    const data: TabularData = {
      columnCount: 2,
      rows: [
        {
          cells: [
            { columnIndex: 0, rowSpan: 1, columnSpan: 2, content: [] },
            { columnIndex: 1, rowSpan: 1, columnSpan: 1, content: [] },
          ],
        },
      ],
    };
    expect(validateTabularData(data)).toMatchObject({
      ok: false,
      error: { code: "CLIPBOARD_TABLE_INVALID" },
    });
  });

  it("정규 형식이 아닌 textColor는 CLIPBOARD_TABLE_INVALID로 거부한다", () => {
    expect(validateTabularData(styledCell({ textColor: "red" }))).toMatchObject(
      {
        ok: false,
        error: { code: "CLIPBOARD_TABLE_INVALID" },
      },
    );
  });

  it("소문자 hex textColor는 CLIPBOARD_TABLE_INVALID로 거부한다", () => {
    expect(
      validateTabularData(styledCell({ textColor: "#ff0000" })),
    ).toMatchObject({
      ok: false,
      error: { code: "CLIPBOARD_TABLE_INVALID" },
    });
  });

  it("정규 형식이 아닌 backgroundColor는 CLIPBOARD_TABLE_INVALID로 거부한다", () => {
    expect(
      validateTabularData(styledCell({ backgroundColor: "rgb(255,0,0)" })),
    ).toMatchObject({
      ok: false,
      error: { code: "CLIPBOARD_TABLE_INVALID" },
    });
  });

  it("정규 형식이 아닌 align은 CLIPBOARD_TABLE_INVALID로 거부한다", () => {
    expect(
      validateTabularData(
        styledCell({ align: "justify" as NonNullable<TabularCell["align"]> }),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "CLIPBOARD_TABLE_INVALID" },
    });
  });

  it("정규 형식 서식 값은 허용한다", () => {
    expect(
      validateTabularData(
        styledCell({
          textColor: "#FF0000",
          backgroundColor: "#00FF00",
          align: "center",
        }),
      ),
    ).toEqual({ ok: true, value: undefined });
  });

  it("음수 columnIndex는 CLIPBOARD_TABLE_INVALID로 거부한다", () => {
    const data: TabularData = {
      columnCount: 1,
      rows: [
        {
          cells: [{ columnIndex: -1, rowSpan: 1, columnSpan: 2, content: [] }],
        },
      ],
    };
    expect(validateTabularData(data)).toMatchObject({
      ok: false,
      error: { code: "CLIPBOARD_TABLE_INVALID" },
    });
  });

  it("cells가 columnIndex 오름차순이 아니면 CLIPBOARD_TABLE_INVALID로 거부한다", () => {
    const data: TabularData = {
      columnCount: 2,
      rows: [
        {
          cells: [
            { columnIndex: 1, rowSpan: 1, columnSpan: 1, content: [] },
            { columnIndex: 0, rowSpan: 1, columnSpan: 1, content: [] },
          ],
        },
      ],
    };
    expect(validateTabularData(data)).toMatchObject({
      ok: false,
      error: { code: "CLIPBOARD_TABLE_INVALID" },
    });
  });
});

/**
 * columnIndex가 오름차순이 아닌(배열 순서 ≠ 열 순서) 행을 만든다 —
 * extremeCellIndex가 배열 위치가 아니라 columnIndex로 판정하는지 보려면
 * validateTabularData가 정상적으로 거부할 이 순서를 일부러 써야 한다.
 */
const unsortedRow = (cells: TabularCell[]) => ({ cells });

const cell = (columnIndex: number, content: InlineContent): TabularCell => ({
  columnIndex,
  rowSpan: 1,
  columnSpan: 1,
  content,
});

describe("withParagraphsMergedIntoCells", () => {
  it("leading·trailing이 모두 비어 있으면 원본을 그대로 돌려준다", () => {
    const data: TabularData = {
      columnCount: 1,
      rows: [unsortedRow([cell(0, [])])],
    };

    expect(withParagraphsMergedIntoCells(data, [], [])).toBe(data);
  });

  it("leading은 첫 행에서 columnIndex가 가장 작은 셀 앞에 합쳐진다(배열 순서 무관)", () => {
    const data: TabularData = {
      columnCount: 2,
      rows: [
        // 배열 순서는 columnIndex 1이 먼저다 — 정렬 여부와 무관하게
        // columnIndex 0 셀을 찾아야 한다.
        unsortedRow([
          cell(1, [{ text: "right" }]),
          cell(0, [{ text: "left" }]),
        ]),
      ],
    };

    const result = withParagraphsMergedIntoCells(
      data,
      [[{ text: "lead" }]],
      [],
    );
    const cells = result.rows[0]?.cells ?? [];

    // 배열 순서(0: columnIndex 1)가 아니라 columnIndex 0 셀이 병합 대상이다.
    expect(cells.find((c) => c.columnIndex === 0)?.content).toEqual([
      { text: "lead\nleft" },
    ]);
    expect(cells.find((c) => c.columnIndex === 1)?.content).toEqual([
      { text: "right" },
    ]);
  });

  it("trailing은 마지막 행에서 columnIndex가 가장 큰 셀 뒤에 합쳐진다(배열 순서 무관)", () => {
    const data: TabularData = {
      columnCount: 2,
      rows: [
        unsortedRow([
          cell(0, [{ text: "left" }]),
          cell(1, [{ text: "right" }]),
        ]),
        unsortedRow([
          cell(1, [{ text: "right2" }]),
          cell(0, [{ text: "left2" }]),
        ]),
      ],
    };

    const result = withParagraphsMergedIntoCells(
      data,
      [],
      [[{ text: "outro" }]],
    );
    const lastRowCells = result.rows[1]?.cells ?? [];

    // 배열 순서(0: columnIndex 1)가 아니라 columnIndex 1(최대) 셀이 병합
    // 대상이다.
    expect(lastRowCells.find((c) => c.columnIndex === 1)?.content).toEqual([
      { text: "right2\noutro" },
    ]);
    expect(lastRowCells.find((c) => c.columnIndex === 0)?.content).toEqual([
      { text: "left2" },
    ]);
    // 안 건드린 행의 셀 객체는 원본과 참조를 공유한다(행 wrapper 자체는
    // 모든 행에 새로 만들어지지만 손대지 않은 셀은 그대로 재사용된다).
    expect(result.rows[0]?.cells[0]).toBe(data.rows[0]?.cells[0]);
    expect(result.rows[0]?.cells[1]).toBe(data.rows[0]?.cells[1]);
  });

  it("인접한 동일 mark 런은 구분자(LF)까지 포함해 하나로 합쳐진다", () => {
    const data: TabularData = {
      columnCount: 1,
      rows: [unsortedRow([cell(0, [{ text: "cell" }])])],
    };

    const result = withParagraphsMergedIntoCells(
      data,
      [],
      [[{ text: "outro" }]],
    );

    // "cell" + LF + "outro"가 전부 mark 없음이라 런 하나로 병합된다.
    expect(result.rows[0]?.cells[0]?.content).toEqual([
      { text: "cell\noutro" },
    ]);
  });

  it("mark가 다른 인접 런은 합쳐지지 않고 별도 런으로 남는다", () => {
    const data: TabularData = {
      columnCount: 1,
      rows: [unsortedRow([cell(0, [{ text: "cell" }])])],
    };

    const result = withParagraphsMergedIntoCells(
      data,
      [],
      [[{ text: "outro", marks: [{ type: "bold" }] }]],
    );

    expect(result.rows[0]?.cells[0]?.content).toEqual([
      { text: "cell\n" },
      { text: "outro", marks: [{ type: "bold" }] },
    ]);
  });

  it("빈 세그먼트는 건너뛰어 구분자만 남기지 않는다", () => {
    const data: TabularData = {
      columnCount: 1,
      rows: [unsortedRow([cell(0, [])])],
    };

    const result = withParagraphsMergedIntoCells(
      data,
      [[{ text: "" }], [{ text: "real" }]],
      [],
    );

    expect(result.rows[0]?.cells[0]?.content).toEqual([{ text: "real" }]);
  });

  it("1×1 표에서는 leading·trailing이 같은 셀에 순서대로 쌓인다", () => {
    const data: TabularData = {
      columnCount: 1,
      rows: [unsortedRow([cell(0, [{ text: "mid" }])])],
    };

    const result = withParagraphsMergedIntoCells(
      data,
      [[{ text: "lead" }]],
      [[{ text: "trail" }]],
    );

    expect(result.rows[0]?.cells[0]?.content).toEqual([
      { text: "lead\nmid\ntrail" },
    ]);
  });
});
