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
    expect(
      resolveIframeEmbedDecision("http://example.com/embed", {}),
    ).toEqual({ allowed: false, reason: "PROTOCOL_NOT_ALLOWED" });
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
    expect(
      resolveIframeEmbedDecision(url, { allowCustomUrl: true }),
    ).toEqual({ allowed: false, reason: "PRIVATE_NETWORK_BLOCKED" });
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
