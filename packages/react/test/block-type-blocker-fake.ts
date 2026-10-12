/**
 * 툴바 fake controller가 core 변환 거절 질의를 흉내 내는 규칙이다. fake 기본값이
 * 항상 null이면 소스 타입 쌍 규칙(codeBlock↔목록)이 사라져 표면 테스트가 거짓으로
 * 통과한다. 이 규칙은 실제 core와 같아야 하며 block-type-options.test.ts의
 * parity 표가 소스 9종×대상 9종으로 확인한다. 자식·탭 같은 문서 내용 사유는
 * 여기서 흉내 내지 않고 각 테스트가 mockImplementation으로 정한다.
 */

const LIST_TYPES = new Set([
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
  "toggleListItem",
]);

/** 한 블록의 변환 질의. 소스가 codeBlock이면 목록으로, 목록이면 codeBlock으로 바꾸지 못한다. */
export const fakeBlockTypeBlocker = (
  sourceType: string | undefined,
  targetType: string,
): "LIST_CODE_MISMATCH" | null =>
  sourceType !== undefined &&
  ((sourceType === "codeBlock" && LIST_TYPES.has(targetType)) ||
    (LIST_TYPES.has(sourceType) && targetType === "codeBlock"))
    ? "LIST_CODE_MISMATCH"
    : null;

/** 여러 블록 선택의 변환 질의. 여러 블록을 한 codeBlock으로 합치지 않는다. */
export const fakeBlockTypesBlocker = (
  targetType: string,
): "NOT_APPLICABLE" | null =>
  targetType === "codeBlock" ? "NOT_APPLICABLE" : null;
