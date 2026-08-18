/**
 * 표 셀 색상 문자열의 정규 형식. 저장 포맷은 대문자 `#RRGGBB` 하나만
 * 인정한다 — 같은 색을 여러 표기로 저장하면 문서 비교와 round-trip이
 * 흔들린다. 이 판정의 권위는 model에 있고 io/core/react는 이 함수를 쓴다.
 */
const CELL_COLOR_PATTERN = /^#[0-9A-F]{6}$/;

export const isCanonicalCellColor = (value: string): boolean =>
  CELL_COLOR_PATTERN.test(value);
