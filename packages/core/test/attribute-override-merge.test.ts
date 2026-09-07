/**
 * `mergeAttributeOverrides` 계약 테스트(spec §7, R4 슬라이스5
 * RD-002-DELTA-02, EXT-008). `attributeOverrides.blockContainer`/`blockGroup`
 * 역할이 공유하는 병합 규칙 — `class`는 공백 join, 그 외 키는 core가 이미
 * 채운 값이나 예약 `data-geul-*` 접두어와 겹치면 무시하고 개발 모드
 * `console.warn`을 낸다(roadmap.md "결정" — attribute 병합·충돌 규칙).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mergeAttributeOverrides } from "../src/attribute-override-merge.js";

describe("mergeAttributeOverrides", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("overrides가 없으면 base를 그대로 반환한다", () => {
    const base = { "data-geul-block-id": "b-1" };
    expect(mergeAttributeOverrides(base, undefined)).toEqual(base);
  });

  it("충돌 없는 키는 base에 그대로 추가된다", () => {
    const base = { "data-geul-block-id": "b-1" };
    const merged = mergeAttributeOverrides(base, {
      "data-color-scheme": "dark",
    });

    expect(merged).toEqual({
      "data-geul-block-id": "b-1",
      "data-color-scheme": "dark",
    });
  });

  it("class는 base와 overrides 양쪽 값이 있으면 공백으로 join한다", () => {
    const merged = mergeAttributeOverrides(
      { class: "geul-block" },
      { class: "consumer-block" },
    );
    expect(merged.class).toBe("geul-block consumer-block");
  });

  it("class는 base가 비어 있으면 overrides 값만 쓴다(선행 공백 없음)", () => {
    const merged = mergeAttributeOverrides({}, { class: "consumer-block" });
    expect(merged.class).toBe("consumer-block");
  });

  it("base에 이미 있는 키(class 제외)는 overrides 값을 무시하고 경고한다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const base = { "data-geul-block-id": "b-1" };
    const merged = mergeAttributeOverrides(base, {
      "data-geul-block-id": "hacked",
    });

    expect(merged["data-geul-block-id"]).toBe("b-1");
    expect(warn).toHaveBeenCalledOnce();
  });

  it("base에 없어도 data-geul- 접두 키는 예약이라 무시하고 경고한다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const merged = mergeAttributeOverrides({}, { "data-geul-custom": "x" });

    expect(merged["data-geul-custom"]).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });
});
