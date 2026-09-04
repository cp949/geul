/**
 * extract-name-from-url.ts의 순수 함수를 직접 겨냥한 스위트(RD-003
 * DELTA-01). File Panel 오케스트레이션(마운트·이벤트)은
 * file-panel.test.tsx가 검증하고, 이 파일은 그 아래 문자열 파싱 계층만
 * 편집기 마운트 없이 직접 겨냥한다(ADR-0007).
 */

import { describe, expect, it } from "vitest";

import { extractNameFromUrl } from "../src/extract-name-from-url.js";

describe("extractNameFromUrl", () => {
  it("절대 URL의 마지막 path segment를 반환한다", () => {
    expect(extractNameFromUrl("https://example.com/dir/photo.png")).toBe(
      "photo.png",
    );
  });

  it("상대 경로에서도 마지막 segment를 반환한다(new URL이 던지는 입력)", () => {
    expect(extractNameFromUrl("images/photo.png")).toBe("photo.png");
  });

  it("percent-encode된 segment를 decode해서 반환한다", () => {
    expect(extractNameFromUrl("https://example.com/dir/my%20file.pdf")).toBe(
      "my file.pdf",
    );
  });

  it("쿼리스트링과 fragment를 떼고 segment를 추출한다", () => {
    expect(
      extractNameFromUrl("https://example.com/a/b.png?x=1&y=2#section"),
    ).toBe("b.png");
  });

  it("path segment가 없으면(호스트만 또는 trailing slash) null을 반환한다", () => {
    expect(extractNameFromUrl("https://example.com")).toBeNull();
    expect(extractNameFromUrl("https://example.com/")).toBeNull();
  });

  it("잘못된 percent-encoding은 decode 실패로 null을 반환한다", () => {
    expect(extractNameFromUrl("https://example.com/%E0%A4%A")).toBeNull();
  });

  it("trailing slash가 있으면 그 앞 디렉터리 segment를 반환한다", () => {
    expect(extractNameFromUrl("https://example.com/dir/")).toBe("dir");
  });
});
