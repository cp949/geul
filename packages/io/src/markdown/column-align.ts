import type { TableBlock } from "@cp949/geul-model";

export type ColumnAlignment = "left" | "center" | "right" | null;

/**
 * 표의 모든 행을 단 한 번만 순회하며 컬럼별 정렬 값을 계산한다.
 * 컬럼마다 표 전체를 재순회하던 기존 columnAlign/columnAlignAgrees의
 * O(columns * cells)를 O(cells) 단일 패스로 낮추기 위한 공유 헬퍼다.
 *
 * columnId별로 처음 본 align 값을 기록하고, 이후 다른 값이 나오면 그 열만
 * "mixed"로 표시한다(한번 mixed가 되면 되돌리지 않는다). 어떤 columnId에
 * 매칭되는 셀이 하나도 없으면 그 columnId는 반환 Map에 없다.
 */
export const computeColumnAlignments = (
  table: TableBlock,
): Map<string, ColumnAlignment | "mixed"> => {
  const alignments = new Map<string, ColumnAlignment | "mixed">();

  for (const row of table.rows) {
    for (const cell of row.cells) {
      const cellAlign: ColumnAlignment = cell.align ?? null;
      const current = alignments.get(cell.columnId);
      if (current === undefined) {
        alignments.set(cell.columnId, cellAlign);
        continue;
      }
      if (current !== "mixed" && current !== cellAlign) {
        alignments.set(cell.columnId, "mixed");
      }
    }
  }

  return alignments;
};
