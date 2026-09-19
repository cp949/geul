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
const extractAuthority = (url: string, schemeLength: number): string | undefined => {
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
    return closeIndex === -1 ? hostAndPort : hostAndPort.slice(0, closeIndex + 1);
  }
  const colonIndex = hostAndPort.indexOf(":");
  return colonIndex === -1 ? hostAndPort : hostAndPort.slice(0, colonIndex);
};

const isIPv4PrivateOrLoopback = (host: string): boolean => {
  const match = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (!match) return false;
  const a = Number(match[1]);
  const b = Number(match[2]);
  return (
    a === 127 || // loopback
    a === 10 || // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 169 && b === 254) || // link-local
    a === 0 // 0.0.0.0/8
  );
};

// bracketed는 URL.hostname이 IPv6 리터럴일 때의 형태("[::1]" 등, 대괄호
// 포함)다.
const isIPv6PrivateOrLoopback = (bracketed: string): boolean => {
  const inner = bracketed.slice(1, -1).toLowerCase();
  return inner === "::1" || /^f[cd][0-9a-f]{2}:/.test(inner);
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
  const suffix = pattern.startsWith("*.") ? pattern.slice(1) : pattern;
  const bareDomain = suffix.startsWith(".") ? suffix.slice(1) : suffix;
  return host === bareDomain || host.endsWith(suffix);
};

// 스킴 없는 상대 URL(예: "/relative/embed", "#section")은 항상 같은
// origin을 가리킨다 — protocol 제한·화이트리스트 매칭·private network
// 차단이 막으려는 위협(임의 외부 origin)이 원천적으로 적용되지 않는다.
// custom URL opt-in 게이트만 통과하면 허용한다.
export const resolveIframeEmbedDecision = (
  url: string,
  config: IframeEmbedConfig,
): IframeEmbedDecision => {
  const schemeMatch = SCHEME_PATTERN.exec(url);
  // schemeMatch[0](전체 매치, "https:"처럼 콜론 포함)을 쓴다 —
  // schemeMatch[1](캡처 그룹)은 noUncheckedIndexedAccess 아래서
  // string | undefined로 잡혀 불필요한 널 체크가 필요해진다.
  const protocol = schemeMatch === null ? undefined : schemeMatch[0].toLowerCase();

  if (protocol !== undefined) {
    const allowedProtocols = (
      config.allowedProtocols ?? DEFAULT_ALLOWED_PROTOCOLS
    ).map((value) => value.toLowerCase());
    if (!allowedProtocols.includes(protocol)) {
      return { allowed: false, reason: "PROTOCOL_NOT_ALLOWED" };
    }
  }

  const authority =
    schemeMatch === null
      ? undefined
      : extractAuthority(url, schemeMatch[0].length);
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
