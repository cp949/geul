/**
 * 텍스트 블록(`TextBlockProps.textAlignment`) 정렬의 정규 형식이다. 표 셀 `align`·미디어
 * `textAlignment`가 쓰는 `isCanonicalCellAlign`(left/center/right)과 별개로, 저장 포맷은
 * `justify`까지 인정한다(Issue #424). 이 판정의 권위는 model에 있고 io/core는 이 함수를
 * 쓴다(G-CNV-001).
 */
export const TEXT_BLOCK_ALIGNMENTS = [
  "left",
  "center",
  "right",
  "justify",
] as const;

export type TextBlockAlignment = (typeof TEXT_BLOCK_ALIGNMENTS)[number];

export const isCanonicalTextBlockAlign = (
  value: string,
): value is TextBlockAlignment =>
  (TEXT_BLOCK_ALIGNMENTS as readonly string[]).includes(value);
