const KNOWN_LANGUAGE_IDS = new Map<string, string>([
  ["plain text", "text"],
  ["none", "text"],
  ["js", "javascript"],
  ["ts", "typescript"],
  ["sh", "bash"],
  ["shell", "bash"],
  ["py", "python"],
  ["md", "markdown"],
]);

const hasInvalidSurrogate = (codePoint: number): boolean =>
  codePoint >= 0xd800 && codePoint <= 0xdfff;

const hasDisallowedCodePoint = (
  value: string,
  allowedC0: ReadonlySet<number>,
): boolean => {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      (codePoint <= 0x1f && !allowedC0.has(codePoint)) ||
      codePoint === 0x7f ||
      hasInvalidSurrogate(codePoint)
    ) {
      return true;
    }
  }
  return false;
};

const CODE_SOURCE_ALLOWED_C0 = new Set([0x09, 0x0a]);
const NO_ALLOWED_C0 = new Set<number>();

export const isValidCodeBlockSource = (source: string): boolean =>
  !hasDisallowedCodePoint(source, CODE_SOURCE_ALLOWED_C0);

export const isValidCodeBlockLanguage = (language: string): boolean =>
  language.length > 0 && !hasDisallowedCodePoint(language, NO_ALLOWED_C0);

export const canonicalizeCodeBlockLanguage = (language: string): string => {
  const known = KNOWN_LANGUAGE_IDS.get(language.trim().toLowerCase());
  return known ?? language;
};

export const isSafeCodeBlockLanguageClassToken = (language: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(language);
