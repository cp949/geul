/**
 * 컬럼 정렬 판정(computeColumnAlignments) 관련 테스트가 공유하는 극단 표
 * fixture다. 시간 상한 테스트(markdown-column-align-performance.test.ts)와
 * 결정적 복잡도 테스트(markdown-column-align-complexity.test.ts)가 같은 표
 * 모양을 봐야 두 판정이 같은 대상에 대한 것임이 보장된다.
 *
 * 열 내부에서 실제로 값이 갈리는 "mixed" 컬럼을 만들려면 같은 columnId의
 * 셀이 최소 2행에 있어야 하므로(1행 표는 columnId마다 셀이 하나뿐이라
 * 절대 mixed가 될 수 없다), 표는 모두 2행으로 구성하고 열 수로 폭을 늘린다.
 */
import type { Document, TableBlock } from "@cp949/geul-model";

/**
 * 2행 × columnCount열의 극단적으로 넓은 표를 만든다.
 * 3열마다 한 번씩 두 행의 align 값을 다르게(left/right) 줘서 해당 열이
 * "mixed"로 판정되게 하고, 나머지 열은 두 행 모두 같은 값을 줘 일관되게
 * 유지한다 — computeColumnAlignments가 실제로 값을 비교하는 작업을 하도록
 * 만들기 위함이다.
 */
export const buildWideMixedAlignTable = (columnCount: number): TableBlock => {
  const columns = Array.from({ length: columnCount }, (_, index) => ({
    id: `column-${index}`,
    width: 160,
  }));

  const buildRow = (rowIndex: 0 | 1) => ({
    id: `row-${rowIndex}`,
    cells: columns.map((column, index) => {
      const isMixedColumn = index % 3 === 0;
      const align: "left" | "right" =
        !isMixedColumn || rowIndex === 0 ? "left" : "right";
      return {
        id: `${column.id}-cell-${rowIndex}`,
        columnId: column.id,
        rowSpan: 1,
        columnSpan: 1,
        content: [{ text: `${rowIndex}` }],
        align,
      };
    }),
  });

  return {
    id: "wide-table",
    type: "table",
    columns,
    rows: [buildRow(0), buildRow(1)],
    headerRows: 1,
    headerColumns: 0,
  };
};

export const buildWideMixedAlignDocument = (columnCount: number): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [buildWideMixedAlignTable(columnCount)],
});
