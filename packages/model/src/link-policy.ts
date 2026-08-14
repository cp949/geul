const supportedLinkProtocol = /^(https?:|mailto:|tel:)/;
const anyProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

const hasUnsafeUrlCharacter = (href: string): boolean => {
  for (const character of href) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      /\s/u.test(character) ||
      codePoint <= 0x1f ||
      codePoint === 0x7f ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      return true;
    }
  }
  return false;
};

export const isSupportedLinkHref = (href: string): boolean =>
  href.length > 0 &&
  !hasUnsafeUrlCharacter(href) &&
  !href.includes("\\") &&
  (supportedLinkProtocol.test(href) ||
    (!anyProtocol.test(href) && !href.startsWith("//")));
