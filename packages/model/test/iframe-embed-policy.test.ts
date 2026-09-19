/**
 * iframe 블록(CUS-001~004) URL 허용 정책을 확인한다(설계
 * `docs/specs/2026-09-19-iframe-block-design.md` §2, Issue #212 RD-001).
 * document-structure-validation.ts의 정적 검증과 달리 이 정책은 host가
 * 주입하는 런타임 설정(화이트리스트/custom URL opt-in/private network
 * opt-in/허용 protocol)에 좌우된다 — core의 setIframeSrc 커맨드(RD-002)가
 * EditorController의 살아있는 설정으로 호출한다.
 */
import { describe, expect, it } from "vitest";

import {
  type IframeEmbedConfig,
  resolveIframeEmbedDecision,
} from "../src/index.js";

const YOUTUBE_WHITELIST: IframeEmbedConfig["providers"] = [
  { name: "YouTube", match: { type: "wildcard", pattern: "*.youtube.com" } },
  { name: "Figma", match: { type: "exact", pattern: "www.figma.com" } },
];

describe("protocol 제한", () => {
  it("기본값(https:만 허용) 상태에서 http:는 PROTOCOL_NOT_ALLOWED다", () => {
    expect(resolveIframeEmbedDecision("http://example.com/embed", {})).toEqual({
      allowed: false,
      reason: "PROTOCOL_NOT_ALLOWED",
    });
  });

  it("javascript:는 화이트리스트·custom 설정과 무관하게 PROTOCOL_NOT_ALLOWED다", () => {
    expect(
      resolveIframeEmbedDecision("javascript:alert(1)", {
        allowCustomUrl: true,
      }),
    ).toEqual({ allowed: false, reason: "PROTOCOL_NOT_ALLOWED" });
  });

  it("host가 allowedProtocols를 override하면 http:도 허용한다", () => {
    expect(
      resolveIframeEmbedDecision("http://example.com/embed", {
        allowCustomUrl: true,
        allowedProtocols: ["https:", "http:"],
      }),
    ).toEqual({ allowed: true });
  });
});

describe("화이트리스트 매칭", () => {
  it("wildcard 패턴이 서브도메인과 apex 도메인 모두와 매치한다", () => {
    expect(
      resolveIframeEmbedDecision("https://www.youtube.com/embed/x", {
        providers: YOUTUBE_WHITELIST,
      }),
    ).toEqual({ allowed: true, provider: "YouTube" });
    expect(
      resolveIframeEmbedDecision("https://youtube.com/embed/x", {
        providers: YOUTUBE_WHITELIST,
      }),
    ).toEqual({ allowed: true, provider: "YouTube" });
  });

  it("exact 패턴은 정확히 같은 host만 매치한다", () => {
    expect(
      resolveIframeEmbedDecision("https://www.figma.com/embed", {
        providers: YOUTUBE_WHITELIST,
      }),
    ).toEqual({ allowed: true, provider: "Figma" });
    expect(
      resolveIframeEmbedDecision("https://figma.com/embed", {
        providers: YOUTUBE_WHITELIST,
      }),
    ).toMatchObject({ allowed: false });
  });

  it("화이트리스트 밖 + custom URL 비활성이면 NOT_WHITELISTED_AND_CUSTOM_DISABLED다", () => {
    expect(
      resolveIframeEmbedDecision("https://vimeo.com/embed/x", {
        providers: YOUTUBE_WHITELIST,
      }),
    ).toEqual({
      allowed: false,
      reason: "NOT_WHITELISTED_AND_CUSTOM_DISABLED",
    });
  });

  it("화이트리스트 밖이어도 custom URL opt-in이면 허용한다(provider 없이)", () => {
    expect(
      resolveIframeEmbedDecision("https://vimeo.com/embed/x", {
        providers: YOUTUBE_WHITELIST,
        allowCustomUrl: true,
      }),
    ).toEqual({ allowed: true });
  });

  it("wildcard 패턴에 '*.' 접두가 빠져 있어도 접미사만 같은 다른 호스트(hostname suffix spoofing)와 매치하지 않는다", () => {
    const noPrefixWildcard: IframeEmbedConfig["providers"] = [
      { name: "YouTube", match: { type: "wildcard", pattern: "youtube.com" } },
    ];
    expect(
      resolveIframeEmbedDecision("https://evilyoutube.com/embed/x", {
        providers: noPrefixWildcard,
      }),
    ).toMatchObject({ allowed: false });
    expect(
      resolveIframeEmbedDecision("https://notyoutube.com/embed/x", {
        providers: noPrefixWildcard,
      }),
    ).toMatchObject({ allowed: false });
    // 접두 없는 패턴도 apex·서브도메인 자체와는 여전히 매치해야 한다.
    expect(
      resolveIframeEmbedDecision("https://youtube.com/embed/x", {
        providers: noPrefixWildcard,
      }),
    ).toEqual({ allowed: true, provider: "YouTube" });
    expect(
      resolveIframeEmbedDecision("https://www.youtube.com/embed/x", {
        providers: noPrefixWildcard,
      }),
    ).toEqual({ allowed: true, provider: "YouTube" });
  });
});

describe("private network 차단 — custom URL opt-in 상태에서만 적용", () => {
  it.each([
    "https://localhost/admin",
    "https://127.0.0.1/admin",
    "https://10.0.0.5/admin",
    "https://172.16.0.5/admin",
    "https://192.168.1.1/admin",
    "https://169.254.1.1/admin",
    "https://intranet/admin",
    "https://[::1]/admin",
    "https://[fd00::1]/admin",
  ])("%s는 custom URL opt-in 상태에서 PRIVATE_NETWORK_BLOCKED다", (url) => {
    expect(resolveIframeEmbedDecision(url, { allowCustomUrl: true })).toEqual({
      allowed: false,
      reason: "PRIVATE_NETWORK_BLOCKED",
    });
  });

  it("allowPrivateNetwork opt-in이면 private 호스트도 허용한다", () => {
    expect(
      resolveIframeEmbedDecision("https://localhost:3000/admin", {
        allowCustomUrl: true,
        allowPrivateNetwork: true,
      }),
    ).toEqual({ allowed: true });
  });

  it("공인 호스트는 custom URL opt-in 상태에서 차단되지 않는다", () => {
    expect(
      resolveIframeEmbedDecision("https://example.com/page", {
        allowCustomUrl: true,
      }),
    ).toEqual({ allowed: true });
  });

  it.each([
    "https://0177.0.0.1/admin", // 8진수 표기(127.0.0.1)
    "https://0x7f.0.0.1/admin", // 16진수 표기(127)
    "https://0x7f000001/admin", // 16진수 표기(127.0.0.1 전체, 32bit 단일 숫자)
    "https://127.1/admin", // 축약 표기(127.0.0.1)
    "https://127.0.1/admin", // 축약 표기(127.0.0.1)
    "https://2130706433/admin", // 10진수 표기(127.0.0.1 전체, 32bit 단일 숫자)
  ])(
    "%s는 브라우저가 loopback으로 해석하는 비표준 IPv4 표기라도 PRIVATE_NETWORK_BLOCKED다(Issue #215)",
    (url) => {
      expect(resolveIframeEmbedDecision(url, { allowCustomUrl: true })).toEqual(
        { allowed: false, reason: "PRIVATE_NETWORK_BLOCKED" },
      );
    },
  );

  it.each([
    "https://[::ffff:127.0.0.1]/admin", // IPv4-mapped IPv6(loopback)
    "https://[::ffff:169.254.169.254]/admin", // IPv4-mapped IPv6(link-local metadata)
    "https://[0:0:0:0:0:0:0:1]/admin", // 압축하지 않은 ::1
    "https://[fe80::1]/admin", // link-local
  ])(
    "%s는 IPv4-mapped·압축 해제·link-local IPv6 표기라도 PRIVATE_NETWORK_BLOCKED다(Issue #215)",
    (url) => {
      expect(resolveIframeEmbedDecision(url, { allowCustomUrl: true })).toEqual(
        { allowed: false, reason: "PRIVATE_NETWORK_BLOCKED" },
      );
    },
  );

  it("공인 IPv4 리터럴(점 표기)은 사설망 범위 밖이면 허용한다 — 새 파서가 공인 IP를 오탐하지 않는다", () => {
    expect(
      resolveIframeEmbedDecision("https://8.8.8.8/admin", {
        allowCustomUrl: true,
      }),
    ).toEqual({ allowed: true });
  });

  it("점이 없는 숫자 단일 라벨은(예: '8.8.8.8'의 32bit 표기 '134744072') 공인 IP 값이어도 단일 라벨 호스트명 규칙으로 차단한다", () => {
    // 134744072 === 8.8.8.8이지만 "."가 없어 isPrivateNetworkHostname의
    // 단일 라벨 호스트명(예: "intranet") 휴리스틱에 먼저 걸린다 — 오탐
    // 방향이 안전(차단)하므로 기존 동작을 유지한다.
    expect(
      resolveIframeEmbedDecision("https://134744072/admin", {
        allowCustomUrl: true,
      }),
    ).toEqual({ allowed: false, reason: "PRIVATE_NETWORK_BLOCKED" });
  });

  it("화이트리스트 매칭 항목은 private network 검사 대상이 아니다(host가 이미 vetting했다고 본다)", () => {
    expect(
      resolveIframeEmbedDecision("https://internal.example.com/embed", {
        providers: [
          {
            name: "Internal",
            match: { type: "exact", pattern: "internal.example.com" },
          },
        ],
      }),
    ).toEqual({ allowed: true, provider: "Internal" });
  });
});

describe("스킴 없는 상대 URL — 항상 같은 origin이라 protocol·화이트리스트·private network 검사가 적용되지 않는다", () => {
  it("custom URL 비활성이면 그래도 NOT_WHITELISTED_AND_CUSTOM_DISABLED다(같은 이유로)", () => {
    expect(resolveIframeEmbedDecision("/relative/embed", {})).toEqual({
      allowed: false,
      reason: "NOT_WHITELISTED_AND_CUSTOM_DISABLED",
    });
  });

  it("custom URL opt-in이면 허용한다 — protocol·private network 검사를 건너뛴다", () => {
    expect(
      resolveIframeEmbedDecision("/relative/embed", { allowCustomUrl: true }),
    ).toEqual({ allowed: true });
    expect(
      resolveIframeEmbedDecision("#section", { allowCustomUrl: true }),
    ).toEqual({ allowed: true });
  });
});

describe("protocol-relative URL(//host) — authority가 있어 스킴 없는 상대 URL과 다르게 취급한다", () => {
  it("private network 호스트를 가리키면 custom URL opt-in 상태에서도 PRIVATE_NETWORK_BLOCKED다", () => {
    expect(
      resolveIframeEmbedDecision("//169.254.169.254/latest/meta-data", {
        allowCustomUrl: true,
      }),
    ).toEqual({ allowed: false, reason: "PRIVATE_NETWORK_BLOCKED" });
    expect(
      resolveIframeEmbedDecision("//localhost/admin", {
        allowCustomUrl: true,
      }),
    ).toEqual({ allowed: false, reason: "PRIVATE_NETWORK_BLOCKED" });
  });

  it("화이트리스트 밖 + custom URL 비활성이면 NOT_WHITELISTED_AND_CUSTOM_DISABLED다", () => {
    expect(resolveIframeEmbedDecision("//evil.com/x", {})).toEqual({
      allowed: false,
      reason: "NOT_WHITELISTED_AND_CUSTOM_DISABLED",
    });
  });

  it("공인 호스트는 custom URL opt-in 상태에서 허용한다", () => {
    expect(
      resolveIframeEmbedDecision("//example.com/page", {
        allowCustomUrl: true,
      }),
    ).toEqual({ allowed: true });
  });

  it("화이트리스트에 매치하면 provider로 허용한다", () => {
    expect(
      resolveIframeEmbedDecision("//www.youtube.com/embed/x", {
        providers: YOUTUBE_WHITELIST,
      }),
    ).toEqual({ allowed: true, provider: "YouTube" });
  });
});
