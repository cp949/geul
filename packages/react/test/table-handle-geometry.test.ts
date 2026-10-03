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
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readColumnBounds,
  readPageRect,
  readTableColumnIds,
  readTableGeometry,
  readTableRowIds,
  type RowBox,
} from "../src/table-handle-geometry.js";
import { stubRect } from "./mount-editor.js";

type Rect = { left: number; top: number; width: number; height: number };

type CellSpec = {
  columnId: string;
  colspan?: number;
  rowspan?: number;
  rect: Rect;
};
type RowSpec = { rowId: string; rect: Rect; cells: CellSpec[] };

/**
 * readTableGeometry가 읽는 data-geul-* 속성만 갖춘 표 DOM을 편집기 마운트
 * 없이 직접 조립한다. innerHTML 파싱이 아니라 createElement/appendChild로
 * 만들어 브라우저의 암묵적 tbody 삽입을 거치지 않는다(G-TST-001과 같은
 * "손으로 만든 DOM은 프로덕션과 갈라진다" 위험은, 여기서는 프로덕션이
 * 실제로 읽는 속성 4종(data-geul-block-id/columns/row-id/column-id)만
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
    table.setAttribute("data-geul-block-id", options.blockId);
  }
  table.setAttribute(
    "data-geul-columns",
    serializeTableColumns(options.columnIds.map((id) => ({ id, width: 100 }))),
  );
  if (options.headerRows !== undefined) {
    table.setAttribute("data-geul-header-rows", String(options.headerRows));
  }
  if (options.headerColumns !== undefined) {
    table.setAttribute(
      "data-geul-header-columns",
      String(options.headerColumns),
    );
  }
  stubRect(table, options.rect);

  for (const rowSpec of options.rows) {
    const row = document.createElement("tr");
    row.setAttribute("data-geul-row-id", rowSpec.rowId);
    stubRect(row, rowSpec.rect);
    for (const cellSpec of rowSpec.cells) {
      const cell = document.createElement("td");
      cell.setAttribute("data-geul-column-id", cellSpec.columnId);
      if (cellSpec.colspan !== undefined) {
        cell.setAttribute("colspan", String(cellSpec.colspan));
      }
      if (cellSpec.rowspan !== undefined) {
        cell.setAttribute("rowspan", String(cellSpec.rowspan));
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
  it("data-geul-columns 값을 순서대로 id 배열로 돌려준다", () => {
    const table = document.createElement("table");
    table.setAttribute(
      "data-geul-columns",
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
    table.setAttribute("data-geul-columns", "{not json");

    expect(readTableColumnIds(table)).toEqual([]);
  });
});

describe("readTableRowIds", () => {
  // G-TBL-001: 행의 권위 있는 DOM 순서는 data-geul-row-id다(열의
  // data-geul-columns와 대칭). Issue #65의 메뉴 재조준 effect가 이 배열에서
  // targetId의 현재 위치를 찾으므로, DOM 순서를 그대로 보존하는지가 핵심이다.
  it("data-geul-row-id가 붙은 요소를 DOM 순서대로 id 배열로 돌려준다", () => {
    const table = document.createElement("table");
    const row1 = document.createElement("tr");
    row1.setAttribute("data-geul-row-id", "row-1");
    const row2 = document.createElement("tr");
    row2.setAttribute("data-geul-row-id", "row-2");
    table.appendChild(row2);
    table.appendChild(row1);

    // appendChild 순서(row2 먼저)가 아니라 DOM 트리 순서(row2가 앞)를
    // 그대로 반영하는지 본다 — querySelectorAll은 항상 문서 순서다.
    expect(readTableRowIds(table)).toEqual(["row-2", "row-1"]);
  });

  it("행이 없으면 빈 배열을 돌려준다", () => {
    const table = document.createElement("table");

    expect(readTableRowIds(table)).toEqual([]);
  });

  it("속성 값이 빈 문자열인 행도 그대로(빈 문자열로) 포함한다", () => {
    // table-handles.tsx의 다른 getAttribute(...) ?? "" 폴백과 같은 결의
    // fail-open이다 — 빈 rowId는 위 계층(재조준 effect)이 별도로 걸러낸다.
    const table = document.createElement("table");
    const row = document.createElement("tr");
    row.setAttribute("data-geul-row-id", "");
    table.appendChild(row);

    expect(readTableRowIds(table)).toEqual([""]);
  });
});

describe("readTableGeometry", () => {
  it("data-geul-block-id가 없으면 null을 반환한다", () => {
    const table = buildTable({
      blockId: null,
      columnIds: ["col-0", "col-1"],
      rect: { left: 0, top: 0, width: 200, height: 60 },
      rows: [],
    });

    expect(readTableGeometry(table)).toBeNull();
  });

  it("표 경계·헤더 플래그를 표 rect와 data-geul-header-* 속성에서 그대로 읽는다", () => {
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

  // G-UI-003/ADR-0012: 오버레이 6종이 position:fixed 대신 absolute +
  // page-relative 좌표를 쓰려면, 이 계층(readTableGeometry)이 반환하는
  // 좌표부터 getBoundingClientRect()(viewport-relative)가 아니라
  // rect + window.scrollX/scrollY(page-relative)여야 한다. scrollX/Y를
  // 되돌리지 않으면 다음 테스트가 오염되므로 afterEach로 0을 복원한다.
  describe("페이지 스크롤 오프셋", () => {
    afterEach(() => {
      Object.defineProperty(window, "scrollX", {
        configurable: true,
        value: 0,
      });
      Object.defineProperty(window, "scrollY", {
        configurable: true,
        value: 0,
      });
    });

    it("표·행·열 경계에 window.scrollX/scrollY를 더해 page-relative로 반환한다", () => {
      Object.defineProperty(window, "scrollX", {
        configurable: true,
        value: 40,
      });
      Object.defineProperty(window, "scrollY", {
        configurable: true,
        value: 70,
      });

      const table = buildTable({
        blockId: "table-1",
        columnIds: ["col-0"],
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

      // getBoundingClientRect 스텁은 그대로 (10, 20)이다 — scrollX/Y를
      // 더하지 않는 원래 구현이면 아래 기대값(50, 90)이 아니라 (10, 20)이
      // 나와 이 테스트가 실패한다.
      expect(geometry).toMatchObject({
        left: 50,
        top: 90,
        right: 150,
        bottom: 120,
      });
      expect(geometry?.rows[0]).toMatchObject({ top: 90 });
      expect(geometry?.columns[0]).toMatchObject({ left: 50 });
    });
  });
});

// Issue #239: 병합 셀이 없는 표는 셀 rect를 첫 행만 읽고 열마다 resize
// segment를 한 구간으로 합친다. 10,000셀(100x100) 표에서 geometry 판독 한
// 번이 getBoundingClientRect ~10,100회와 JSX 요소 10,000개를 만들던 비용을
// 줄이는 최적화다. G-TST-004에 따라 wall-clock이 아니라 결정적 작업량
// (rect 호출 수, segment 수, 병합 판별 querySelector 호출 수)을 두 크기에서
// 비교한다. 병합 표는 현행 경로 그대로여야 하므로 같은 값을 단언한다.
describe("readTableGeometry 판독 작업량 (Issue #239)", () => {
  const CELL_WIDTH = 100;
  // 행 높이를 균일하게 두면 "마지막 행 bottom"과 "행 수 x 높이"를 구분하지
  // 못한다 — 행마다 높이를 달리 둬 합친 구간의 끝이 마지막 행의 bottom인지
  // 값으로 본다.
  const rowHeight = (rowIndex: number): number => 30 + (rowIndex % 3) * 10;
  const rowTop = (rowIndex: number): number => {
    let top = 0;
    for (let index = 0; index < rowIndex; index += 1) top += rowHeight(index);
    return top;
  };

  const columnIdsOf = (size: number): string[] =>
    Array.from({ length: size }, (_, index) => `col-${index}`);

  const gridRows = (size: number): RowSpec[] =>
    Array.from({ length: size }, (_, rowIndex) => ({
      rowId: `row-${rowIndex}`,
      rect: {
        left: 0,
        top: rowTop(rowIndex),
        width: size * CELL_WIDTH,
        height: rowHeight(rowIndex),
      },
      cells: columnIdsOf(size).map((columnId, columnIndex) => ({
        columnId,
        rect: {
          left: columnIndex * CELL_WIDTH,
          top: rowTop(rowIndex),
          width: CELL_WIDTH,
          height: rowHeight(rowIndex),
        },
      })),
    }));

  const buildGridTable = (size: number): HTMLTableElement =>
    buildTable({
      blockId: "table-1",
      columnIds: columnIdsOf(size),
      rect: {
        left: 0,
        top: 0,
        width: size * CELL_WIDTH,
        height: rowTop(size),
      },
      rows: gridRows(size),
    });

  /**
   * buildTable이 노드마다 심은 rect stub을 떼어 Element.prototype의
   * getBoundingClientRect spy로 옮긴다. 값은 그대로 돌려주고 호출 수만 센다.
   * 복원은 afterEach의 vi.restoreAllMocks가 맡는다.
   */
  const countRectReads = (table: HTMLElement) => {
    const rects = new Map<Element, DOMRect>();
    for (const element of [table, ...table.querySelectorAll("*")]) {
      rects.set(element, element.getBoundingClientRect());
      delete (element as { getBoundingClientRect?: unknown })
        .getBoundingClientRect;
    }
    return vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: Element) {
        const rect = rects.get(this);
        if (rect === undefined) throw new Error("rect를 준비하지 않은 노드");
        return rect;
      });
  };

  // 같은 테스트에서 크기를 바꿔 두 번 부르므로 spy를 호출마다 복원한다 —
  // 복원하지 않으면 prototype spy가 호출 수를 누적한다.
  const measureWork = (size: number) => {
    const table = buildGridTable(size);
    const rectSpy = countRectReads(table);
    const querySpy = vi.spyOn(table, "querySelector");
    try {
      const geometry = readTableGeometry(table);
      const spanScans = querySpy.mock.calls.filter(
        ([selector]) => selector === "[colspan],[rowspan]",
      ).length;
      const segmentCount = (geometry?.columns ?? []).reduce(
        (total, column) => total + column.resizeSegments.length,
        0,
      );
      return {
        geometry,
        rectReads: rectSpy.mock.calls.length,
        segmentCount,
        spanScans,
      };
    } finally {
      rectSpy.mockRestore();
      querySpy.mockRestore();
    }
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("병합 셀이 없는 표", () => {
    it("rect 읽기와 resize segment 수가 셀 수(N^2)가 아니라 N에 비례해 늘어난다", () => {
      const small = measureWork(10);
      const large = measureWork(40);

      // 표 1 + 행 N + 첫 행 셀 N. 셀 전체를 읽으면 1 + N + N^2이다.
      expect(small.rectReads).toBeLessThanOrEqual(2 * 10 + 1);
      expect(large.rectReads).toBeLessThanOrEqual(2 * 40 + 1);
      // 크기가 4배면 선형은 약 4배, 제곱은 약 15배다.
      expect(large.rectReads / small.rectReads).toBeLessThan(5);
      expect(small.segmentCount).toBe(10);
      expect(large.segmentCount).toBe(40);
      expect(large.segmentCount / small.segmentCount).toBeLessThan(5);
    });

    it("병합 판별 querySelector를 geometry 판독 한 번에 정확히 한 번만 부른다", () => {
      // 열마다 부르면 N^2 셀 스캔이 열 수만큼 반복된다(프로토타입 실측: 선택 +90ms).
      expect(measureWork(10).spanScans).toBe(1);
      expect(measureWork(40).spanScans).toBe(1);
    });

    it("열 경계는 셀을 모두 읽던 현행 계산과 같다", () => {
      const geometry = measureWork(5).geometry;

      expect(
        geometry?.columns.map(({ columnId, index, left, width }) => ({
          columnId,
          index,
          left,
          width,
        })),
      ).toEqual(
        columnIdsOf(5).map((columnId, index) => ({
          columnId,
          index,
          left: index * CELL_WIDTH,
          width: CELL_WIDTH,
        })),
      );
      expect(geometry?.rows).toEqual(
        Array.from({ length: 5 }, (_, index) => ({
          rowId: `row-${index}`,
          index,
          top: rowTop(index),
          height: rowHeight(index),
        })),
      );
    });

    it("열마다 resize segment 하나가 첫 행 top부터 마지막 행 bottom까지 덮고 rowId는 첫 행이다", () => {
      const geometry = measureWork(5).geometry;

      for (const column of geometry?.columns ?? []) {
        expect(column.resizeSegments).toEqual([
          { rowId: "row-0", top: 0, height: rowTop(5) },
        ]);
      }
    });

    it("셀 rect를 모두 읽는 병합 경로의 열 경계와 segment 덮개가 같다", () => {
      // rowspan="1" 표식 하나로 같은 격자를 병합 경로로 돌려, 최적화 경로의
      // 결과가 현행 계산과 같은 구간을 덮는지 비교한다.
      const optimized = readTableGeometry(buildGridTable(6));
      const legacyTable = buildGridTable(6);
      legacyTable
        .querySelector("[data-geul-column-id]")
        ?.setAttribute("rowspan", "1");
      const legacy = readTableGeometry(legacyTable);

      expect(
        optimized?.columns.map(({ left, width }) => ({ left, width })),
      ).toEqual(legacy?.columns.map(({ left, width }) => ({ left, width })));
      for (const [index, column] of (optimized?.columns ?? []).entries()) {
        const legacySegments = legacy?.columns[index]?.resizeSegments ?? [];
        const first = legacySegments[0];
        const last = legacySegments[legacySegments.length - 1];
        // 병합 경로는 병합 표식이 든 행을 따로 두고 나머지 연속 행을 합친다
        // (Issue #240). 개수는 고정하지 않고, 틈 없이 첫 행 top부터 마지막
        // 행 bottom까지 덮는지만 본다.
        legacySegments.forEach((segment, position) => {
          const previous = legacySegments[position - 1];
          if (previous !== undefined) {
            expect(segment.top).toBe(previous.top + previous.height);
          }
        });
        expect(column.resizeSegments).toEqual([
          {
            rowId: first?.rowId,
            top: first?.top,
            height: (last?.top ?? 0) + (last?.height ?? 0) - (first?.top ?? 0),
          },
        ]);
      }
    });

    it("행이 없으면 열은 있어도 resize segment를 만들지 않는다", () => {
      const table = buildTable({
        blockId: "table-1",
        columnIds: ["col-0", "col-1"],
        rect: { left: 0, top: 0, width: 200, height: 0 },
        rows: [],
      });

      const geometry = readTableGeometry(table);

      expect(geometry?.columns.map((column) => column.resizeSegments)).toEqual([
        [],
        [],
      ]);
    });
  });

  describe("병합 셀이 있는 표", () => {
    it("colspan 표식 표는 병합 경로를 타서 rect를 1 + R + C + M회만 읽고 병합 표식이 없는 연속 행을 합친다", () => {
      const table = buildGridTable(6);
      const mergedCell = table.querySelector("[data-geul-column-id]");
      mergedCell?.setAttribute("colspan", "2");
      const rectSpy = countRectReads(table);

      const geometry = readTableGeometry(table);

      // 표 1 + 행 6 + 열마다 첫 비병합 셀 6 + 병합 셀 1. 셀 36개를 모두 읽지 않는다.
      expect(rectSpy.mock.calls.length).toBe(1 + 6 + 6 + 1);
      // 표식만 붙였고 셀 rect는 그대로(0..100)라 모든 열 경계가 모든 행에서
      // 셀 경계로 읽힌다. 병합 표식이 든 첫 행은 따로 두고 나머지 5행을 하나로
      // 합친다 — 열마다 segment 2개다(행 단위 6개가 아니다).
      expect(
        geometry?.columns.map((column) => column.resizeSegments.length),
      ).toEqual([2, 2, 2, 2, 2, 2]);
      expect(geometry?.columns[0]?.resizeSegments).toEqual([
        { rowId: "row-0", top: 0, height: rowHeight(0) },
        { rowId: "row-1", top: rowTop(1), height: rowTop(6) - rowTop(1) },
      ]);
    });

    it("rowspan 표도 병합 경로를 타서 rowspan이 가린 행을 resize segment에서 뺀다", () => {
      // col-0이 row-0과 row-1에 걸쳐 병합된다. row-1에는 col-0 셀이 없다.
      const table = buildTable({
        blockId: "table-1",
        columnIds: ["col-0", "col-1"],
        rect: { left: 0, top: 0, width: 200, height: 90 },
        rows: [
          {
            rowId: "row-0",
            rect: { left: 0, top: 0, width: 200, height: 30 },
            cells: [
              {
                columnId: "col-0",
                rect: { left: 0, top: 0, width: 100, height: 60 },
              },
              {
                columnId: "col-1",
                rect: { left: 100, top: 0, width: 100, height: 30 },
              },
            ],
          },
          {
            rowId: "row-1",
            rect: { left: 0, top: 30, width: 200, height: 30 },
            cells: [
              {
                columnId: "col-1",
                rect: { left: 100, top: 30, width: 100, height: 30 },
              },
            ],
          },
          {
            rowId: "row-2",
            rect: { left: 0, top: 60, width: 200, height: 30 },
            cells: [
              {
                columnId: "col-0",
                rect: { left: 0, top: 60, width: 100, height: 30 },
              },
              {
                columnId: "col-1",
                rect: { left: 100, top: 60, width: 100, height: 30 },
              },
            ],
          },
        ],
      });
      table.querySelector("td")?.setAttribute("rowspan", "2");

      const geometry = readTableGeometry(table);

      expect(
        geometry?.columns.map(({ left, width }) => ({ left, width })),
      ).toEqual([
        { left: 0, width: 100 },
        { left: 100, width: 100 },
      ]);
      // col-0의 오른쪽 경계(x=100)는 row-1에서 셀 경계가 아니다(col-1 셀의
      // right는 200이다).
      expect(geometry?.columns[0]?.resizeSegments).toEqual([
        { rowId: "row-0", top: 0, height: 30 },
        { rowId: "row-2", top: 60, height: 30 },
      ]);
      expect(geometry?.columns[1]?.resizeSegments).toEqual([
        { rowId: "row-0", top: 0, height: 30 },
        { rowId: "row-1", top: 30, height: 30 },
        { rowId: "row-2", top: 60, height: 30 },
      ]);
    });
  });

  // Issue #240: 병합 표 경로도 셀 수에 비례해 rect를 읽지 않는다. 병합 셀(M)과
  // 열마다 처음 만나는 비병합 셀(C), 행(R), 표(1)만 읽고 나머지 셀은 열
  // 경계에서 도출한다. 일반 행(병합 셀이 없고 열마다 셀이 있는 행)의 연속
  // 구간은 resize segment 하나로 합친다. 병합 셀이 든 행과 rowspan으로 셀이
  // 빠진 행은 열 경계가 셀 경계인지 행마다 달라 행 단위로 둔다.
  describe("병합 표 작업량과 동등성 (Issue #240)", () => {
    type Merge = {
      row: number;
      column: number;
      rowSpan: number;
      columnSpan: number;
    };

    const spannedWidth = (column: number): number => 100 + (column % 3) * 20;
    const spannedLeft = (column: number): number => {
      let left = 0;
      for (let index = 0; index < column; index += 1) {
        left += spannedWidth(index);
      }
      return left;
    };

    /**
     * rows x columns 격자에 병합 사각형을 얹은 표를 만든다. 병합 셀은 앵커
     * 행에만 나오고 덮인 자리의 셀은 만들지 않는다(실 DOM과 같다). 열 폭과
     * 행 높이를 달리 둬 도출한 값이 우연히 맞는 일을 막는다.
     */
    const buildSpannedTable = (
      rowCount: number,
      columnCount: number,
      merges: Merge[],
    ): HTMLTableElement => {
      const columnIds = Array.from(
        { length: columnCount },
        (_, index) => `col-${index}`,
      );
      const anchors = new Map(
        merges.map((merge) => [`${merge.row},${merge.column}`, merge]),
      );
      const covered = new Set<string>();
      for (const merge of merges) {
        for (let r = merge.row; r < merge.row + merge.rowSpan; r += 1) {
          for (
            let c = merge.column;
            c < merge.column + merge.columnSpan;
            c += 1
          ) {
            if (r !== merge.row || c !== merge.column) covered.add(`${r},${c}`);
          }
        }
      }
      const tableWidth = spannedLeft(columnCount);
      const rowHeightAt = (rowIndex: number): number =>
        30 + (rowIndex % 3) * 10;
      const rowTopAt = (rowIndex: number): number => {
        let top = 0;
        for (let index = 0; index < rowIndex; index += 1) {
          top += rowHeightAt(index);
        }
        return top;
      };
      const rows: RowSpec[] = Array.from({ length: rowCount }, (_, r) => {
        const cells: CellSpec[] = [];
        for (let c = 0; c < columnCount; c += 1) {
          const key = `${r},${c}`;
          if (covered.has(key)) continue;
          const merge = anchors.get(key);
          const columnSpan = merge?.columnSpan ?? 1;
          const rowSpan = merge?.rowSpan ?? 1;
          let height = 0;
          for (let index = r; index < r + rowSpan; index += 1) {
            height += rowHeightAt(index);
          }
          cells.push({
            columnId: columnIds[c] as string,
            ...(columnSpan > 1 ? { colspan: columnSpan } : {}),
            ...(rowSpan > 1 ? { rowspan: rowSpan } : {}),
            rect: {
              left: spannedLeft(c),
              top: rowTopAt(r),
              width: spannedLeft(c + columnSpan) - spannedLeft(c),
              height,
            },
          });
        }
        return {
          rowId: `row-${r}`,
          rect: {
            left: 0,
            top: rowTopAt(r),
            width: tableWidth,
            height: rowHeightAt(r),
          },
          cells,
        };
      });
      return buildTable({
        blockId: "table-1",
        columnIds,
        rect: {
          left: 0,
          top: 0,
          width: tableWidth,
          height: rowTopAt(rowCount),
        },
        rows,
      });
    };

    const readWork = (
      rowCount: number,
      columnCount: number,
      merges: Merge[],
    ) => {
      const table = buildSpannedTable(rowCount, columnCount, merges);
      const rectSpy = countRectReads(table);
      try {
        const geometry = readTableGeometry(table);
        const perColumn = (geometry?.columns ?? []).map(
          (column) => column.resizeSegments.length,
        );
        return {
          geometry,
          rectReads: rectSpy.mock.calls.length,
          perColumn,
          segmentCount: perColumn.reduce((total, count) => total + count, 0),
        };
      } finally {
        rectSpy.mockRestore();
      }
    };

    // 2x2 병합 하나. 열·행 모두 병합이 가장자리에 닿지 않게 (1,1)에 둔다.
    const ONE_MERGE: Merge[] = [
      { row: 1, column: 1, rowSpan: 2, columnSpan: 2 },
    ];

    it("병합 셀 M개 표의 rect 읽기는 같은 크기 병합 없는 표보다 정확히 M개 많다", () => {
      for (const size of [10, 40]) {
        const plain = readWork(size, size, []);
        const merged = readWork(size, size, ONE_MERGE);

        // 병합 없는 표: 표 1 + 행 N + 첫 행 셀 N. 병합 표는 거기에 병합 셀 M.
        expect(plain.rectReads).toBe(1 + size + size);
        expect(merged.rectReads).toBe(plain.rectReads + ONE_MERGE.length);
      }
    });

    it("병합 셀이 여러 개여도 rect 읽기는 병합 없는 표 + M이다", () => {
      const merges: Merge[] = [
        { row: 1, column: 1, rowSpan: 2, columnSpan: 2 },
        { row: 5, column: 3, rowSpan: 1, columnSpan: 3 },
        { row: 7, column: 0, rowSpan: 3, columnSpan: 1 },
      ];

      expect(readWork(12, 10, merges).rectReads).toBe(
        readWork(12, 10, []).rectReads + merges.length,
      );
    });

    it("resize segment 수가 행 수와 무관하고 열마다 2A+1개 이하다(A는 병합 셀이 걸친 행 수)", () => {
      const columnCount = 10;
      // 2x2 병합은 앵커 행과 덮인 행, 두 행에 걸친다.
      const touchedRows = 2;
      for (const rowCount of [10, 40]) {
        const work = readWork(rowCount, columnCount, ONE_MERGE);

        for (const count of work.perColumn) {
          expect(count).toBeLessThanOrEqual(2 * touchedRows + 1);
        }
        expect(work.segmentCount).toBeLessThanOrEqual(
          columnCount * (2 * touchedRows + 1),
        );
      }
    });

    it("병합 셀이 가로지르는 경계와 rowspan이 가린 행은 행 단위로 남기고 나머지 연속 행은 합친다", () => {
      // 6행 x 4열, (1,1)에서 2x2 병합. 행 높이는 30,40,50,30,40,50.
      const geometry = readWork(6, 4, [
        { row: 1, column: 1, rowSpan: 2, columnSpan: 2 },
      ]).geometry;
      const tops = [0, 30, 70, 120, 150, 190, 240];
      const seg = (from: number, to: number) => ({
        rowId: `row-${from}`,
        top: tops[from],
        height: (tops[to + 1] as number) - (tops[from] as number),
      });

      // col-0 오른쪽 경계: 병합 셀 왼쪽이라 모든 행이 셀 경계. row-1(병합 셀이
      // 든 행)과 row-2(셀이 빠진 행)는 행 단위, 일반 행 row-0과 row-3..5는 합친다.
      expect(geometry?.columns[0]?.resizeSegments).toEqual([
        seg(0, 0),
        seg(1, 1),
        seg(2, 2),
        seg(3, 5),
      ]);
      // col-1 오른쪽 경계는 병합 셀 한가운데다. row-1, row-2에는 없다.
      expect(geometry?.columns[1]?.resizeSegments).toEqual([
        seg(0, 0),
        seg(3, 5),
      ]);
      // col-2 오른쪽 경계는 병합 셀의 오른쪽 끝이라 row-1은 셀 경계다. row-2는
      // 셀이 빠졌지만 col-3 셀 right와 같지 않아 제외.
      expect(geometry?.columns[2]?.resizeSegments).toEqual([
        seg(0, 0),
        seg(1, 1),
        seg(3, 5),
      ]);
      expect(geometry?.columns[3]?.resizeSegments).toEqual([
        seg(0, 0),
        seg(1, 1),
        seg(2, 2),
        seg(3, 5),
      ]);
    });

    // 구 알고리즘(모든 셀 rect를 읽고 행마다 segment를 만드는 병합 경로)을
    // oracle로 둔다. 열 경계는 같아야 하고, segment가 덮는 세로 영역(합집합)도
    // 같아야 한다. segment 개수는 새 쪽이 같거나 적다.
    describe("구 알고리즘 oracle", () => {
      const legacyGeometry = (table: HTMLElement) => {
        const tableRect = readPageRect(table);
        const columnIds = readTableColumnIds(table);
        const rowBoxes: RowBox[] = Array.from(
          table.querySelectorAll<HTMLElement>("[data-geul-row-id]"),
        ).map((rowElement) => {
          const rowRect = readPageRect(rowElement);
          return {
            rowId: rowElement.getAttribute("data-geul-row-id") ?? "",
            top: rowRect.top,
            height: rowRect.height,
            cells: Array.from(
              rowElement.querySelectorAll<HTMLElement>("[data-geul-column-id]"),
            ).map((cellElement) => {
              const rect = readPageRect(cellElement);
              return {
                columnId: cellElement.getAttribute("data-geul-column-id") ?? "",
                spansColumns: cellElement.hasAttribute("colspan"),
                left: rect.left,
                right: rect.right,
                width: rect.width,
              };
            }),
          };
        });
        const bounds = readColumnBounds(columnIds, rowBoxes, tableRect);
        return bounds.map((bound) => ({
          left: bound.left,
          width: bound.width,
          segments: rowBoxes
            .filter((rowBox) =>
              rowBox.cells.some(
                (cellBox) =>
                  Math.abs(cellBox.right - (bound.left + bound.width)) <= 1,
              ),
            )
            .map((rowBox) => ({
              rowId: rowBox.rowId,
              top: rowBox.top,
              height: rowBox.height,
            })),
        }));
      };

      /** 맞닿거나 겹친 구간을 합쳐 [top, bottom] 목록으로 만든다. */
      const unionOf = (
        segments: ReadonlyArray<{ top: number; height: number }>,
      ): Array<[number, number]> => {
        const sorted = [...segments]
          .map((segment): [number, number] => [
            segment.top,
            segment.top + segment.height,
          ])
          .sort((a, b) => a[0] - b[0]);
        const merged: Array<[number, number]> = [];
        for (const [top, bottom] of sorted) {
          const last = merged[merged.length - 1];
          if (last !== undefined && top <= last[1]) {
            last[1] = Math.max(last[1], bottom);
          } else {
            merged.push([top, bottom]);
          }
        }
        return merged;
      };

      const expectSameAsLegacy = (table: HTMLTableElement) => {
        const geometry = readTableGeometry(table);
        const legacy = legacyGeometry(table);

        expect(geometry?.columns.length).toBe(legacy.length);
        for (const [index, column] of (geometry?.columns ?? []).entries()) {
          const expected = legacy[index];
          expect({ left: column.left, width: column.width }).toEqual({
            left: expected?.left,
            width: expected?.width,
          });
          expect(unionOf(column.resizeSegments)).toEqual(
            unionOf(expected?.segments ?? []),
          );
          expect(column.resizeSegments.length).toBeLessThanOrEqual(
            expected?.segments.length ?? 0,
          );
        }
      };

      /** 시드 고정 의사 난수(mulberry32). 실패 시 같은 fixture로 재현된다. */
      const random = (seed: number) => {
        let state = seed >>> 0;
        return () => {
          state = (state + 0x6d2b79f5) >>> 0;
          let t = state;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      };

      const randomMerges = (
        next: () => number,
        rowCount: number,
        columnCount: number,
      ): Merge[] => {
        const merges: Merge[] = [];
        const taken = new Set<string>();
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const rowSpan = 1 + Math.floor(next() * 3);
          const columnSpan = 1 + Math.floor(next() * 3);
          if (rowSpan === 1 && columnSpan === 1) continue;
          const row = Math.floor(next() * rowCount);
          const column = Math.floor(next() * columnCount);
          if (row + rowSpan > rowCount || column + columnSpan > columnCount) {
            continue;
          }
          const cells: string[] = [];
          for (let r = row; r < row + rowSpan; r += 1) {
            for (let c = column; c < column + columnSpan; c += 1) {
              cells.push(`${r},${c}`);
            }
          }
          if (cells.some((cell) => taken.has(cell))) continue;
          for (const cell of cells) taken.add(cell);
          merges.push({ row, column, rowSpan, columnSpan });
        }
        return merges;
      };

      it("시드 고정 랜덤 병합 fixture 200개에서 열 경계와 strip 영역이 같다", () => {
        let withMerges = 0;
        for (let seed = 1; seed <= 200; seed += 1) {
          const next = random(seed);
          const rowCount = 2 + Math.floor(next() * 9);
          const columnCount = 2 + Math.floor(next() * 7);
          const merges = randomMerges(next, rowCount, columnCount);
          if (merges.length > 0) withMerges += 1;

          expectSameAsLegacy(buildSpannedTable(rowCount, columnCount, merges));
        }
        // 병합 없는 fixture만 돌려 아무것도 검증하지 못하는 일을 막는다.
        expect(withMerges).toBeGreaterThan(100);
      });

      it("모든 행이 colspan으로 덮인 열은 이웃 경계 사이로 보간하고 구 알고리즘과 같다", () => {
        // col-1에는 어느 행에도 셀이 없다.
        const merges: Merge[] = Array.from({ length: 4 }, (_, row) => ({
          row,
          column: 0,
          rowSpan: 1,
          columnSpan: 2,
        }));

        expectSameAsLegacy(buildSpannedTable(4, 3, merges));
      });
    });
  });
});
