const hasInvalidSurrogate = (codePoint: number): boolean =>
  codePoint >= 0xd800 && codePoint <= 0xdfff;

const hasDisallowedCodePoint = (
  value: string,
  allowLineFeed: boolean,
): boolean => {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (allowLineFeed && codePoint === 0x0a) continue;
    if (
      codePoint <= 0x1f ||
      codePoint === 0x7f ||
      hasInvalidSurrogate(codePoint)
    ) {
      return true;
    }
  }
  return false;
};

export const isValidInlineText = (value: string): boolean =>
  !hasDisallowedCodePoint(value, true);

export const isValidDocumentId = (value: string): boolean =>
  value.length > 0 && !hasDisallowedCodePoint(value, false);
