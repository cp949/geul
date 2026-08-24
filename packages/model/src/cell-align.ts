/**
 * 표 셀 텍스트 정렬의 정규 형식. 저장 포맷은 "left"|"center"|"right"만
 * 인정한다(justify 없음). 이 판정의 권위는 model에 있고 io/core는 이
 * 함수를 쓴다(G-CNV-001).
 */
const CELL_ALIGN_VALUES = ["left", "center", "right"] as const;

export const isCanonicalCellAlign = (
  value: string,
): value is "left" | "center" | "right" =>
  (CELL_ALIGN_VALUES as readonly string[]).includes(value);
