/**
 * 미디어 블록(image/video) previewWidth 검증 정책을 확인한다. spec §5.3 —
 * 양의 유한수만 검증하고 상한을 두지 않는다(컨테이너 폭은 레이아웃
 * 종속이라 문서 불변식이 아님). 표 열 너비(정수·상한 강제)와는 다른
 * 계약이라 그 헬퍼를 재사용하지 않는다(RD-001.md "## 결정" 참고).
 */
import { describe, expect, it } from "vitest";

import { isValidMediaPreviewWidth } from "../src/index.js";

describe("isValidMediaPreviewWidth", () => {
  it.each([1, 0.5, 320, 1_000_000])("양의 유한수 %s를 허용한다", (value) => {
    expect(isValidMediaPreviewWidth(value)).toBe(true);
  });

  it.each([
    0,
    -1,
    -0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])("0·음수·유한하지 않은 값 %s를 거부한다", (value) => {
    expect(isValidMediaPreviewWidth(value)).toBe(false);
  });
});
