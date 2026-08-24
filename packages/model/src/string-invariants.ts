const hasInvalidSurrogate = (codePoint: number): boolean =>
  codePoint >= 0xd800 && codePoint <= 0xdfff;

// LF를 제외한 C0 제어문자, DEL, 짝 없는 surrogate — isValidInlineText·
// isValidDocumentId·sanitizeInlineText가 공유하는 단일 predicate.
const isDisallowedCodePoint = (
  codePoint: number,
  allowLineFeed: boolean,
): boolean => {
  if (allowLineFeed && codePoint === 0x0a) return false;
  return (
    codePoint <= 0x1f || codePoint === 0x7f || hasInvalidSurrogate(codePoint)
  );
};

const hasDisallowedCodePoint = (
  value: string,
  allowLineFeed: boolean,
): boolean => {
  for (const character of value) {
    if (isDisallowedCodePoint(character.codePointAt(0) ?? 0, allowLineFeed)) {
      return true;
    }
  }
  return false;
};

export const isValidInlineText = (value: string): boolean =>
  !hasDisallowedCodePoint(value, true);

export const isValidDocumentId = (value: string): boolean =>
  value.length > 0 && !hasDisallowedCodePoint(value, false);

// isValidInlineText가 거절하는 코드포인트를 제거해 인라인 텍스트를
// sanitize한다. HTML import·clipboard import 등 외부 입력을 문서 텍스트로
// 만드는 모든 경로가 이 단일 정책을 재사용한다(G-CNV-001). for...of는
// 코드포인트 단위로 순회하므로 정상 surrogate pair는 그대로 통과하고 짝
// 없는 surrogate만 제거된다.
export const sanitizeInlineText = (value: string): string => {
  let result = "";
  for (const character of value) {
    if (isDisallowedCodePoint(character.codePointAt(0) ?? 0, true)) continue;
    result += character;
  }
  return result;
};
