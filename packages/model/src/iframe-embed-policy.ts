// iframe 블록(CUS-001~004, spec docs/specs/2026-09-19-iframe-block-design.md
// §2)의 host 설정 기반 런타임 정책이다. document-structure-validation.ts의
// 정적 url 검증(isSupportedLinkHref 재사용)과 달리, 이 정책은 host가
// EditorController 생성 시 주입하는 설정(화이트리스트·custom URL opt-in·
// private network opt-in·허용 protocol)에 좌우된다 — 그래서 문서 parse
// 시점(parseDocument)에는 적용하지 않는다. 저장된 문서는 host 설정이
// 바뀌어도 계속 load돼야 하고, 이 정책은 core의 setIframeSrc 커맨드가
// EditorController의 살아있는 설정을 갖고 있을 때만 호출한다.
//
// sandbox/allow/referrerPolicy(렌더링 시 iframe 태그에 실릴 기본값)는 이
// 타입에 없다 — 그건 URL 허용 여부 판정과 무관한 렌더링 옵션이라 core의
// EditorController 공개 옵션(IframeBlockExtension.options)이 별도로 갖는다
// (spec §3). model은 URL 허용 여부만 안다.

export type IframeProviderWhitelistEntry = {
  name: string;
  match: { type: "exact" | "wildcard"; pattern: string };
};

export type IframeEmbedConfig = {
  providers?: IframeProviderWhitelistEntry[];
  allowCustomUrl?: boolean;
  allowPrivateNetwork?: boolean;
  allowedProtocols?: string[];
};

export type IframeEmbedDecision =
  | { allowed: true; provider?: string }
  | {
      allowed: false;
      reason:
        | "PROTOCOL_NOT_ALLOWED"
        | "PRIVATE_NETWORK_BLOCKED"
        | "NOT_WHITELISTED_AND_CUSTOM_DISABLED";
    };

// 반환값은 콜론을 포함한다("https:") — URL.protocol과 같은 형태로
// 맞췄다. model은 DOM lib을 쓰지 않으므로(ADR-0002, G-WKS-001) URL
// 생성자를 쓸 수 없다 — link-policy.ts와 같은 이유로 정규식 기반이다.
const DEFAULT_ALLOWED_PROTOCOLS = ["https:"];

const SCHEME_PATTERN = /^([a-zA-Z][a-zA-Z\d+.-]*):/;

// scheme "//" 뒤, 다음 "/"·"?"·"#" 앞까지가 authority(userinfo@host:port)다.
const extractAuthority = (
  url: string,
  schemeLength: number,
): string | undefined => {
  const afterScheme = url.slice(schemeLength);
  if (!afterScheme.startsWith("//")) return undefined;
  const rest = afterScheme.slice(2);
  const end = rest.search(/[/?#]/);
  return end === -1 ? rest : rest.slice(0, end);
};

// userinfo("user:pass@")가 있으면 마지막 "@" 뒤가 host:port다 — 처음
// 나온 "@"에서 자르면 "https://real-host@evil.com/"류 입력에서
// "real-host"를 host로 오인해 화이트리스트를 우회시킬 수 있다(고전적
// URL 파서 혼동 버그, userinfo는 실제 host 앞이 아니라 뒤에 온다는 점을
// 놓치는 실수). host가 IPv6 리터럴("[::1]")이면 대괄호를 유지한 채
// 반환한다.
const extractHostname = (authority: string): string => {
  const atIndex = authority.lastIndexOf("@");
  const hostAndPort = atIndex === -1 ? authority : authority.slice(atIndex + 1);
  if (hostAndPort.startsWith("[")) {
    const closeIndex = hostAndPort.indexOf("]");
    return closeIndex === -1
      ? hostAndPort
      : hostAndPort.slice(0, closeIndex + 1);
  }
  const colonIndex = hostAndPort.indexOf(":");
  return colonIndex === -1 ? hostAndPort : hostAndPort.slice(0, colonIndex);
};

// WHATWG URL "IPv4 number parser" — 8진수("0" 접두)·16진수("0x"/"0X"
// 접두) 표기를 허용한다. 브라우저가 "0177"을 127로, "0x7f"를 127로
// 해석하는 표기를 우리도 같이 인식해야 host 문자열 검사가 실제 브라우저
// 동작과 어긋나지 않는다 — 그렇지 않으면 "0177.0.0.1"처럼 정규식
// \d{1,3}에는 안 걸리지만 브라우저는 127.0.0.1로 로드하는 표기로
// private-network 차단을 우회할 수 있다.
const parseIPv4Number = (input: string): number | undefined => {
  if (input === "") return undefined;
  let radix = 10;
  let digits = input;
  if (digits.length > 1 && /^0[xX]/.test(digits)) {
    radix = 16;
    digits = digits.slice(2);
  } else if (digits.length > 1 && digits.startsWith("0")) {
    radix = 8;
    digits = digits.slice(1);
  }
  if (digits === "") return 0;
  const validDigits =
    radix === 16 ? /^[0-9a-fA-F]+$/ : radix === 8 ? /^[0-7]+$/ : /^[0-9]+$/;
  if (!validDigits.test(digits)) return undefined;
  return parseInt(digits, radix);
};

// WHATWG URL "IPv4 parser" — 4개보다 적은 "."-분리 파트("127.1")도
// 허용한다. 마지막 파트가 남은 바이트를 모두 흡수한다("127.1" ==
// "127.0.0.1"). 파트 하나가 숫자로 해석되지 않으면(도메인 이름이면
// 항상 이 경우다) undefined를 반환한다 — 그러면 호출부는 도메인
// 이름으로 취급하고 IPv4 사설망 검사를 건너뛴다.
const parseIPv4 = (host: string): number | undefined => {
  const rawParts = host.split(".");
  const parts =
    rawParts.length > 1 && rawParts[rawParts.length - 1] === ""
      ? rawParts.slice(0, -1) // 끝에 붙은 "."(trailing dot)는 무시한다
      : rawParts;
  if (parts.length === 0 || parts.length > 4) return undefined;

  const numbers: number[] = [];
  for (const part of parts) {
    const value = parseIPv4Number(part);
    if (value === undefined || !Number.isFinite(value)) return undefined;
    numbers.push(value);
  }

  for (let i = 0; i < numbers.length - 1; i += 1) {
    const value = numbers[i];
    if (value === undefined || value > 255) return undefined;
  }
  const last = numbers[numbers.length - 1];
  if (last === undefined) return undefined;
  const maxLast = 256 ** (5 - numbers.length) - 1;
  if (last > maxLast) return undefined;

  let ipv4 = last;
  for (let i = 0; i < numbers.length - 1; i += 1) {
    const value = numbers[i];
    if (value === undefined) return undefined;
    ipv4 += value * 256 ** (3 - i);
  }
  return ipv4 >>> 0;
};

const isPrivateIPv4Number = (ipv4: number): boolean => {
  const a = (ipv4 >>> 24) & 0xff;
  const b = (ipv4 >>> 16) & 0xff;
  return (
    a === 127 || // loopback
    a === 10 || // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 169 && b === 254) || // link-local
    a === 0 // 0.0.0.0/8
  );
};

const isIPv4PrivateOrLoopback = (host: string): boolean => {
  const ipv4 = parseIPv4(host);
  return ipv4 !== undefined && isPrivateIPv4Number(ipv4);
};

// "::"(zero-run 압축)을 8개 16bit group으로 펼친다. 마지막 group이
// dotted-decimal("127.0.0.1")이면 IPv4-mapped/compat 표기("::ffff:a.b.c.d")로
// 보고 두 16bit group으로 변환한다. 유효하지 않으면 undefined다.
const expandIPv6Groups = (address: string): string[] | undefined => {
  const sides = address.split("::");
  if (sides.length > 2) return undefined; // "::"는 주소당 최대 1번만 허용된다

  const withIPv4Tail = (groups: string[]): string[] | undefined => {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup === undefined || !lastGroup.includes(".")) return groups;
    const ipv4 = parseIPv4(lastGroup);
    if (ipv4 === undefined) return undefined;
    return [
      ...groups.slice(0, -1),
      (((ipv4 >>> 16) & 0xffff) >>> 0).toString(16),
      ((ipv4 & 0xffff) >>> 0).toString(16),
    ];
  };

  if (sides.length === 1) {
    const single = sides[0];
    if (single === undefined) return undefined;
    const groups = withIPv4Tail(single === "" ? [] : single.split(":"));
    return groups !== undefined && groups.length === 8 ? groups : undefined;
  }

  const headRaw = sides[0];
  const tailRaw = sides[1];
  if (headRaw === undefined || tailRaw === undefined) return undefined;
  const head = headRaw === "" ? [] : headRaw.split(":");
  const tailParts = tailRaw === "" ? [] : tailRaw.split(":");
  const tail = withIPv4Tail(tailParts);
  if (tail === undefined) return undefined;
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return undefined;
  return [...head, ...Array<string>(missing).fill("0"), ...tail];
};

const toIPv6GroupNumbers = (groups: string[]): number[] | undefined => {
  const numbers: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return undefined;
    numbers.push(parseInt(group, 16));
  }
  return numbers;
};

// bracketed는 URL.hostname이 IPv6 리터럴일 때의 형태("[::1]" 등, 대괄호
// 포함)다. 압축("::")과 IPv4-mapped 표기("[::ffff:127.0.0.1]")까지
// 정규화한 뒤 검사한다 — 그렇지 않으면 "[::1]"만 걸리고
// "[0:0:0:0:0:0:0:1]"이나 "[::ffff:127.0.0.1]"(사설 IPv4를 IPv6로 감싼
// 표기, 브라우저는 실제로 127.0.0.1로 접속한다)은 정규식을 통과해
// private-network 차단을 우회한다.
const isIPv6PrivateOrLoopback = (bracketed: string): boolean => {
  const inner = bracketed.slice(1, -1).toLowerCase();
  const groups = expandIPv6Groups(inner);
  if (groups === undefined) return false;
  const numbers = toIPv6GroupNumbers(groups);
  if (numbers === undefined || numbers.length !== 8) return false;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = numbers;
  if (
    g0 === undefined ||
    g1 === undefined ||
    g2 === undefined ||
    g3 === undefined ||
    g4 === undefined ||
    g5 === undefined ||
    g6 === undefined ||
    g7 === undefined
  ) {
    return false;
  }

  if (
    g0 === 0 &&
    g1 === 0 &&
    g2 === 0 &&
    g3 === 0 &&
    g4 === 0 &&
    g5 === 0 &&
    g6 === 0 &&
    g7 === 1
  ) {
    return true; // ::1 loopback
  }
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if (
    g0 === 0 &&
    g1 === 0 &&
    g2 === 0 &&
    g3 === 0 &&
    g4 === 0 &&
    g5 === 0xffff
  ) {
    // ::ffff:0:0/96 IPv4-mapped — 내장된 IPv4가 사설망인지 재검사한다.
    return isPrivateIPv4Number(((g6 << 16) | g7) >>> 0);
  }
  return false;
};

const isPrivateNetworkHostname = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  if (host === "localhost") return true;
  if (host.startsWith("[")) return isIPv6PrivateOrLoopback(host);
  if (isIPv4PrivateOrLoopback(host)) return true;
  // 단일 라벨 호스트명(예: "intranet")은 흔히 내부 DNS로만 해석된다 —
  // 점이 없으면 사설망으로 취급한다.
  return !host.includes(".");
};

const matchesWhitelistEntry = (
  hostname: string,
  entry: IframeProviderWhitelistEntry,
): boolean => {
  const host = hostname.toLowerCase();
  const pattern = entry.match.pattern.toLowerCase();
  if (entry.match.type === "exact") return host === pattern;
  // pattern이 "*." 접두를 빠뜨려도("youtube.com"처럼) 항상 "."로 경계를
  // 앵커한다 — endsWith(suffix)를 접두 유무에 따라 그대로 쓰면
  // "evilyoutube.com"처럼 접두 없는 접미사 일치만으로 화이트리스트를
  // 우회하는 hostname suffix spoofing이 가능해진다.
  const bareDomain = pattern.startsWith("*.") ? pattern.slice(2) : pattern;
  return host === bareDomain || host.endsWith(`.${bareDomain}`);
};

// 스킴 없는 상대 URL(예: "/relative/embed", "#section")은 항상 같은
// origin을 가리킨다 — protocol 제한·화이트리스트 매칭·private network
// 차단이 막으려는 위협(임의 외부 origin)이 원천적으로 적용되지 않는다.
// custom URL opt-in 게이트만 통과하면 허용한다. protocol-relative URL(예:
// "//evil.com/x")은 다르다 — authority는 있지만 scheme이 없을 뿐이라
// 브라우저는 현재 페이지의 protocol을 그대로 붙여 외부 origin으로
// 해석한다. authority가 없는 진짜 상대 URL과 달리 hostname을 추출해
// 화이트리스트·private network 검사를 그대로 적용한다(protocol 자체는
// 알 수 없으니 protocol 검사만 생략).
export const resolveIframeEmbedDecision = (
  url: string,
  config: IframeEmbedConfig,
): IframeEmbedDecision => {
  const schemeMatch = SCHEME_PATTERN.exec(url);
  // schemeMatch[0](전체 매치, "https:"처럼 콜론 포함)을 쓴다 —
  // schemeMatch[1](캡처 그룹)은 noUncheckedIndexedAccess 아래서
  // string | undefined로 잡혀 불필요한 널 체크가 필요해진다.
  const protocol =
    schemeMatch === null ? undefined : schemeMatch[0].toLowerCase();

  if (protocol !== undefined) {
    const allowedProtocols = (
      config.allowedProtocols ?? DEFAULT_ALLOWED_PROTOCOLS
    ).map((value) => value.toLowerCase());
    if (!allowedProtocols.includes(protocol)) {
      return { allowed: false, reason: "PROTOCOL_NOT_ALLOWED" };
    }
  }

  const authority =
    schemeMatch !== null
      ? extractAuthority(url, schemeMatch[0].length)
      : url.startsWith("//")
        ? extractAuthority(url, 0)
        : undefined;
  const hostname =
    authority === undefined ? undefined : extractHostname(authority);

  const matchedProvider =
    hostname === undefined
      ? undefined
      : (config.providers ?? []).find((entry) =>
          matchesWhitelistEntry(hostname, entry),
        );
  if (matchedProvider !== undefined) {
    return { allowed: true, provider: matchedProvider.name };
  }

  if (config.allowCustomUrl !== true) {
    return { allowed: false, reason: "NOT_WHITELISTED_AND_CUSTOM_DISABLED" };
  }

  if (
    hostname !== undefined &&
    config.allowPrivateNetwork !== true &&
    isPrivateNetworkHostname(hostname)
  ) {
    return { allowed: false, reason: "PRIVATE_NETWORK_BLOCKED" };
  }

  return { allowed: true };
};
