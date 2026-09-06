/**
 * TableGrid 단위 테스트가 공유하는 표·셀 fixture를 제공한다.
 * 각 관심사 테스트는 병합 상태와 속성만 선언해 논리 격자 계약에 집중한다.
 */
import type { TableBlock } from "@cp949/geul-model";

import { projectTableGrid, type TableGrid } from "../src/table-grid.js";

type Cell = TableBlock["rows"][number]["cells"][number];

/**
 * 기본 span과 빈 콘텐츠를 가진 셀 fixture를 만든다.
 * 호출부는 검증하려는 셀 속성만 덮어쓴다.
 */
export const cell = (
  id: string,
  columnId: string,
  overrides: Partial<
    Pick<
      Cell,
      | "rowSpan"
      | "columnSpan"
      | "content"
      | "textColor"
      | "backgroundColor"
      | "align"
    >
  > = {},
): Cell => ({
  id,
  columnId,
  rowSpan: 1,
  columnSpan: 1,
  content: [],
  ...overrides,
});

/**
 * 열 id와 행별 셀 목록으로 최소 TableBlock fixture를 만든다.
 * 표 구조 연산 테스트의 기본 열 너비와 header 상태를 한곳에서 고정한다.
 */
export const table = (columnIds: string[], rows: Cell[][]): TableBlock => ({
  id: "table",
  type: "table",
  columns: columnIds.map((id) => ({ id, width: 160 })),
  rows: rows.map((cells, index) => ({ id: `row-${index}`, cells })),
  headerRows: 0,
  headerColumns: 0,
});

/**
 * 유효한 fixture 표를 TableGrid로 투영한다.
 * fixture 자체가 유효하지 않으면 개별 assertion 대신 즉시 실패시킨다.
 */
export const buildGrid = (tableBlock: TableBlock): TableGrid => {
  const result = projectTableGrid(tableBlock);
  if (!result.ok) throw new Error("fixture table must be valid");
  return result.value;
};
