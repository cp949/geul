const supportedLinkProtocol = /^(https?:|mailto:|tel:)/;
// media url 전용(ADR-0017) — 텍스트 link href와 달리 data:/blob:도 허용한다.
const supportedMediaUrlProtocol = /^(https?:|mailto:|tel:|data:|blob:)/;
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

const isSupportedUrl = (url: string, protocol: RegExp): boolean =>
  url.length > 0 &&
  !hasUnsafeUrlCharacter(url) &&
  !url.includes("\\") &&
  (protocol.test(url) || (!anyProtocol.test(url) && !url.startsWith("//")));

// link mark의 `target` 허용값이다(Issue #424 D3). HTML browsing context 키워드 4종만
// 저장형으로 인정하고, 이름 지정 browsing context(`frame1` 등)는 받지 않는다.
export const LINK_TARGETS = ["_blank", "_self", "_parent", "_top"] as const;

export type LinkTarget = (typeof LINK_TARGETS)[number];

// 저장형 판정이다. 대소문자를 접지 않는다 — 정규화는 입력 경로가 normalizeLinkTarget으로 한다.
export const isCanonicalLinkTarget = (target: string): target is LinkTarget =>
  (LINK_TARGETS as readonly string[]).includes(target);

// ASCII 대문자만 소문자로 접는다. `toLowerCase()`는 켈빈 기호(U+212A)를 `k`로 바꿔
// `_blan\u212A`가 `_blank`로 통과한다. 허용 밖이면 undefined다.
export const normalizeLinkTarget = (target: string): LinkTarget | undefined => {
  const folded = target.replace(/[A-Z]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) + 0x20),
  );
  return isCanonicalLinkTarget(folded) ? folded : undefined;
};

export const isSupportedLinkHref = (href: string): boolean =>
  isSupportedUrl(href, supportedLinkProtocol);

// 4종 미디어 블록(file/image/video/audio)의 url 전용 정책(spec §3.2
// 2026-09-11 개정, ADR-0017). 종전엔 isSupportedLinkHref를 그대로
// 재사용했으나(spec §3.2 원안 — "새 정책을 만들지 않음"), 업로드 콜백
// 없이 파일 내용을 문서에 직접 담거나(data:) 브라우저 세션 내 임시
// 참조를 쓰는(blob:) 소비자 시나리오를 막지 않기로 결정했다. link
// mark href/HTML import href는 이 정책을 쓰지 않고 isSupportedLinkHref를
// 그대로 유지한다 — data:/blob:는 텍스트 하이퍼링크에 허용할 이유가
// 없다. blob: url의 세션 스코프·revoke 수명 관리는 소비자 책임이다.
export const isSupportedMediaUrl = (url: string): boolean =>
  isSupportedUrl(url, supportedMediaUrlProtocol);
