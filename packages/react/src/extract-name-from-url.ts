// File Panel(RD-003 DELTA-01)이 URL 제출 직후 media 블록의 `name` 초깃값을
// 추출하는 데 쓴다(spec §6.1 "URL 삽입 시 마지막 path segment(percent-decode)로
// name 초깃값을 추출하고, 추출 실패 시 URL 자체를 표시한다"). 절대 URL은
// `new URL().pathname`으로 authority(scheme://host)를 경로에서 분리하고,
// `new URL()`이 던지는 상대 경로(예: "images/pic.png", model의
// `isSupportedLinkHref`가 허용하는 형태)는 원본 문자열을 그대로 경로로 쓴다
// — 문자열을 곧바로 "/"로 쪼개면 절대 URL의 "https:"/host가 segment로
// 잘못 섞인다(실측: `extract-name-from-url.test.ts`의 RED).

/** 쿼리스트링·fragment를 뗀 마지막 `/` 구간을 percent-decode해 돌려준다. 세그먼트가 없거나 decode가 실패하면 null이다(호출부가 URL 자체로 폴백). */
export const extractNameFromUrl = (url: string): string | null => {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url.split("#")[0]?.split("?")[0] ?? url;
  }
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  const lastSegment = segments[segments.length - 1];
  if (lastSegment === undefined) return null;
  try {
    const decoded = decodeURIComponent(lastSegment);
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
};
