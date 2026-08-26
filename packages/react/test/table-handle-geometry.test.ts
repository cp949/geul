// @vitest-environment jsdom

/**
 * table-handle-geometry.ts의 순수 판독 함수를 직접 겨냥한 스위트.
 * table-handles.test.tsx는 hover·드래그·리사이즈 오케스트레이션을
 * mountTableEditor로 실 편집기 위에서 검증하고(G-TST-001), 이 파일은 그
 * 아래 geometry 계층(readColumnBounds의 병합-셀 보간, readTableGeometry의
 * DOM→좌표 변환)을 편집기 마운트 없이 직접 겨냥한다 — 어느 계층이 무엇을
 * 증명하는지는 ADR-0007(가장 낮은 증명 계층이 소유한다)을 따른다.
 * readColumnBounds는 DOM조차 필요 없는 순수 함수라 stubRect도 쓰지 않는다.
 *
 * 여기서 새로 채운 케이스: readColumnBounds의 보간 분기(known[index]===null,
 * 이웃 경계 사이로 메우는 경로)는 table-handles.test.tsx의 병합-셀
 * fixture로도 실제로는 한 번도 실행되지 않았다 — 그 fixture는 병합된
 * 첫 행이 아니라 둘째 행의 비병합 셀에서 두 열 모두를 직접 찾아내므로
 * 보간이 필요 없다(그릴링에서 확인). 이 파일이 그 분기의 첫 테스트다.
 */

import { serializeTableColumns } from "@cp949/geul-core";
import { describe, expect, it } from "vitest";

import {
  readColumnBounds,
  readTableColumnIds,
  readTableGeometry,
  type RowBox,
} from "../src/table-handle-geometry.js";
import { stubRect } from "./mount-editor.js";

type Rect = { left: number; top: number; width: number; height: number };

type CellSpec = { columnId: string; colspan?: number; rect: Rect };
type RowSpec = { rowId: string; rect: Rect; cells: CellSpec[] };

/**
 * readTableGeometry가 읽는 data-be-* 속성만 갖춘 표 DOM을 편집기 마운트
 * 없이 직접 조립한다. innerHTML 파싱이 아니라 createElement/appendChild로
 * 만들어 브라우저의 암묵적 tbody 삽입을 거치지 않는다(G-TST-001과 같은
 * "손으로 만든 DOM은 프로덕션과 갈라진다" 위험은, 여기서는 프로덕션이
 * 실제로 읽는 속성 4종(data-be-block-id/columns/row-id/column-id)만
 * 최소로 다루므로 낮다 — 렌더링 자체는 검증 대상이 아니다).
 */
const buildTable = (options: {
  blockId: string | null;
  columnIds: string[];
  headerRows?: number;
  headerColumns?: number;
  rect: Rect;
  rows: RowSpec[];
}): HTMLTableElement => {
  const table = document.createElement("table");
  if (options.blockId !== null) {
    table.setAttribute("data-be-block-id", options.blockId);
  }
  table.setAttribute(
    "data-be-columns",
    serializeTableColumns(options.columnIds.map((id) => ({ id, width: 100 }))),
  );
  if (options.headerRows !== undefined) {
    table.setAttribute("data-be-header-rows", String(options.headerRows));
  }
  if (options.headerColumns !== undefined) {
    table.setAttribute("data-be-header-columns", String(options.headerColumns));
  }
  stubRect(table, options.rect);

  for (const rowSpec of options.rows) {
    const row = document.createElement("tr");
    row.setAttribute("data-be-row-id", rowSpec.rowId);
    stubRect(row, rowSpec.rect);
    for (const cellSpec of rowSpec.cells) {
      const cell = document.createElement("td");
      cell.setAttribute("data-be-column-id", cellSpec.columnId);
      if (cellSpec.colspan !== undefined) {
        cell.setAttribute("colspan", String(cellSpec.colspan));
      }
      stubRect(cell, cellSpec.rect);
      row.appendChild(cell);
    }
    table.appendChild(row);
  }
  return table;
};

const asDOMRect = (rect: {
  left: number;
  top: number;
  right: number;
  bottom: number;
}): DOMRect =>
  ({
    ...rect,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  }) as DOMRect;

describe("readColumnBounds", () => {
  it("모든 열에 비병합 셀이 있으면 그 셀의 rect를 그대로 열 경계로 쓴다", () => {
    const rowBoxes: RowBox[] = [
      {
        rowId: "r1",
        top: 0,
        height: 30,
        cells: [
          {
            columnId: "c1",
            spansColumns: false,
            left: 0,
            right: 100,
            width: 100,
          },
          {
            columnId: "c2",
            spansColumns: false,
            left: 100,
            right: 200,
            width: 100,
          },
        ],
      },
    ];

    const bounds = readColumnBounds(
      ["c1", "c2"],
      rowBoxes,
      asDOMRect({ left: 0, top: 0, right: 200, bottom: 30 }),
    );

    expect(bounds).toEqual([
      { left: 0, width: 100 },
      { left: 100, width: 100 },
    ]);
  });

  it("모든 행에서 병합돼 비병합 셀이 없는 가운데 열은 이웃 두 열 경계 사이로 보간한다", () => {
    // c2는 두 행 모두에서 병합 셀(spansColumns: true)로만 나타난다 —
    // known 목록에 c2 자리는 끝까지 null로 남아 이웃(c1·c3) 사이로
    // 보간되는 경로를 직접 겨냥한다.
    const rowBoxes: RowBox[] = [
      {
        rowId: "r1",
        top: 0,
        height: 30,
        cells: [
          {
            columnId: "c1",
            spansColumns: false,
            left: 0,
            right: 100,
            width: 100,
          },
          {
            columnId: "c2",
            spansColumns: true,
            left: 100,
            right: 300,
            width: 200,
          },
        ],
      },
      {
        rowId: "r2",
        top: 30,
        height: 30,
        cells: [
          {
            columnId: "c1",
            spansColumns: false,
            left: 0,
            right: 100,
            width: 100,
          },
          {
            columnId: "c3",
            spansColumns: false,
            left: 200,
            right: 300,
            width: 100,
          },
        ],
      },
    ];

    const bounds = readColumnBounds(
      ["c1", "c2", "c3"],
      rowBoxes,
      asDOMRect({ left: 0, top: 0, right: 300, bottom: 60 }),
    );

    // c1의 오른쪽 끝(100)에서 c3의 왼쪽 끝(200) 사이를 c2가 채운다.
    expect(bounds).toEqual([
      { left: 0, width: 100 },
      { left: 100, width: 100 },
      { left: 200, width: 100 },
    ]);
  });

  it("표 오른쪽 끝 열이 모든 행에서 병합되면 이웃이 없는 쪽은 표 경계까지 넓힌다", () => {
    const rowBoxes: RowBox[] = [
      {
        rowId: "r1",
        top: 0,
        height: 30,
        cells: [
          {
            columnId: "c1",
            spansColumns: false,
            left: 0,
            right: 100,
            width: 100,
          },
          {
            columnId: "c2",
            spansColumns: true,
            left: 100,
            right: 250,
            width: 150,
          },
        ],
      },
    ];

    const bounds = readColumnBounds(
      ["c1", "c2"],
      rowBoxes,
      // 표 자체는 병합 셀(250)보다 넓다(300) — 보간 결과가 병합 셀
      // 자신의 rect가 아니라 tableRect.right를 쓴다는 것을 이 어긋남으로
      // 구분한다.
      asDOMRect({ left: 0, top: 0, right: 300, bottom: 30 }),
    );

    expect(bounds[1]).toEqual({ left: 100, width: 200 });
  });

  it("같은 열이 여러 행에서 비병합 셀로 나타나면 먼저 찾은 rect를 쓴다", () => {
    const rowBoxes: RowBox[] = [
      {
        rowId: "r1",
        top: 0,
        height: 30,
        cells: [
          {
            columnId: "c1",
            spansColumns: false,
            left: 0,
            right: 100,
            width: 100,
          },
        ],
      },
      {
        rowId: "r2",
        top: 30,
        height: 30,
        cells: [
          // 실제로는 같은 열의 rect가 행마다 달라질 이유가 없지만, 값을
          // 다르게 둬 "먼저 찾은 값이 이긴다"는 불변식을 구분해서 본다.
          {
            columnId: "c1",
            spansColumns: false,
            left: 5,
            right: 105,
            width: 100,
          },
        ],
      },
    ];

    const bounds = readColumnBounds(
      ["c1"],
      rowBoxes,
      asDOMRect({ left: 0, top: 0, right: 100, bottom: 60 }),
    );

    expect(bounds).toEqual([{ left: 0, width: 100 }]);
  });
});

describe("readTableColumnIds", () => {
  it("data-be-columns 값을 순서대로 id 배열로 돌려준다", () => {
    const table = document.createElement("table");
    table.setAttribute(
      "data-be-columns",
      serializeTableColumns([
        { id: "c1", width: 100 },
        { id: "c2", width: 120 },
      ]),
    );

    expect(readTableColumnIds(table)).toEqual(["c1", "c2"]);
  });

  it("속성이 없으면 빈 배열을 돌려준다", () => {
    const table = document.createElement("table");

    expect(readTableColumnIds(table)).toEqual([]);
  });

  it("JSON이 깨졌으면 예외 대신 빈 배열로 접는다", () => {
    const table = document.createElement("table");
    table.setAttribute("data-be-columns", "{not json");

    expect(readTableColumnIds(table)).toEqual([]);
  });
});

describe("readTableGeometry", () => {
  it("data-be-block-id가 없으면 null을 반환한다", () => {
    const table = buildTable({
      blockId: null,
      columnIds: ["col-0", "col-1"],
      rect: { left: 0, top: 0, width: 200, height: 60 },
      rows: [],
    });

    expect(readTableGeometry(table)).toBeNull();
  });

  it("표 경계·헤더 플래그를 표 rect와 data-be-header-* 속성에서 그대로 읽는다", () => {
    const table = buildTable({
      blockId: "table-1",
      columnIds: ["col-0"],
      headerRows: 1,
      headerColumns: 0,
      rect: { left: 10, top: 20, width: 100, height: 30 },
      rows: [
        {
          rowId: "row-0",
          rect: { left: 10, top: 20, width: 100, height: 30 },
          cells: [
            {
              columnId: "col-0",
              rect: { left: 10, top: 20, width: 100, height: 30 },
            },
          ],
        },
      ],
    });

    const geometry = readTableGeometry(table);

    expect(geometry?.tableBlockId).toBe("table-1");
    expect(geometry?.headerRows).toBe(1);
    expect(geometry?.headerColumns).toBe(0);
    expect(geometry).toMatchObject({
      left: 10,
      top: 20,
      right: 110,
      bottom: 50,
    });
    expect(geometry?.rows).toEqual([
      { rowId: "row-0", index: 0, top: 20, height: 30 },
    ]);
  });

  // 아래 두 테스트는 table-handles.test.tsx의 "첫 행이 병합된 표의 열
  // geometry" fixture와 같은 좌표를 쓴다 — 그 describe가 렌더된 핸들
  // 위치로 간접 증명하던 것을 여기서는 readTableGeometry 반환값으로
  // 직접 증명한다(ADR-0007, 그릴링 라운드 1 Q3).
  const mergedFirstRowTable = () =>
    buildTable({
      blockId: "table-1",
      columnIds: ["col-0", "col-1"],
      rect: { left: 100, top: 100, width: 200, height: 60 },
      rows: [
        {
          rowId: "row-0",
          rect: { left: 100, top: 100, width: 200, height: 30 },
          cells: [
            {
              columnId: "col-0",
              colspan: 2,
              rect: { left: 100, top: 100, width: 200, height: 30 },
            },
          ],
        },
        {
          rowId: "row-1",
          rect: { left: 100, top: 130, width: 200, height: 30 },
          cells: [
            {
              columnId: "col-0",
              rect: { left: 100, top: 130, width: 100, height: 30 },
            },
            {
              columnId: "col-1",
              rect: { left: 200, top: 130, width: 100, height: 30 },
            },
          ],
        },
      ],
    });

  it("첫 행이 colspan으로 병합돼도 둘째 행의 비병합 셀에서 둘째 열 경계를 복구한다", () => {
    const geometry = readTableGeometry(mergedFirstRowTable());

    expect(geometry?.columns[1]).toMatchObject({
      columnId: "col-1",
      left: 200,
      width: 100,
    });
  });

  it("병합 셀이 가로지르는 행에는 리사이즈 strip을 만들지 않는다", () => {
    const geometry = readTableGeometry(mergedFirstRowTable());

    // col-0의 오른쪽 경계(x=200)는 병합된 row-0에서는 셀 경계가
    // 아니다(병합 셀이 200을 가로지른다) — row-1 구간만 남아야 한다.
    expect(geometry?.columns[0]?.resizeSegments).toEqual([
      { rowId: "row-1", top: 130, height: 30 },
    ]);
    // col-1의 오른쪽 경계(x=300)는 두 행 모두에서 셀 경계다.
    expect(geometry?.columns[1]?.resizeSegments).toEqual([
      { rowId: "row-0", top: 100, height: 30 },
      { rowId: "row-1", top: 130, height: 30 },
    ]);
  });
});
