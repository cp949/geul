/**
 * `validateTabularData`가 공개 명령 경계에서 TabularData를 거르는지 검증한다.
 * 구조(직사각형/겹침), model 인라인 텍스트 계약, 셀 서식 값의 정규 형식을
 * 함께 다룬다.
 */
import { describe, expect, it } from "vitest";
import {
  type TabularCell,
  type TabularData,
  validateTabularData,
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
