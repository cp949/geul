/**
 * `readStylePxWidth`가 `style` 속성의 `width`를 px 숫자로 읽는 규칙을 검증한다(Issue #424,
 * RD-004-DELTA-02).
 *
 * - 승자는 CSS cascade로 정한다. `!important` 선언이 일반 선언을 이기고 같은 중요도끼리는 뒤가
 *   이긴다.
 * - 승자가 단일 `px` 길이가 아니면 값 없음이다. 허용값만 후보로 남겨 앞 선언으로 되돌아가지
 *   않는다(`width: 320px; width: 50%` → 값 없음).
 * - CSS 길이는 음수를 받지 않는다. 0과 유한한 양수 px 길이를 돌려주고 저장형 양수 검증은 model
 *   `isValidMediaPreviewWidth`로 한다(G-CNV-001).
 */
import { describe, expect, it } from "vitest";

import { readStylePxWidth } from "../src/css/width-declaration.js";

describe("readStylePxWidth 값", () => {
  it.each([
    ["width: 320px", 320],
    ["width:320px", 320],
    ["width: 320.5px", 320.5],
    ["width: 0.5px", 0.5],
    ["width: .5px", 0.5],
    ["width: +320px", 320],
    ["WIDTH: 320PX", 320],
    ["width: 3.2e2px", 320],
    ["width: 320px;", 320],
    ["height: 10px; width: 320px; color: red", 320],
    ["width: /* 주석 */ 320px", 320],
    ["width: 320px /* 주석 */", 320],
    ["wid\\74 h: 320px", 320],
    ["width: 0px", 0],
  ])("%j는 %s px로 읽는다", (style, expected) => {
    expect(readStylePxWidth(style)).toBe(expected);
  });
});

describe("readStylePxWidth cascade", () => {
  it.each([
    ["width: 100px; width: 320px", 320],
    ["width: 320px; width: 100px", 100],
    ["width: 320px !important; width: 100px", 320],
    ["width: 100px; width: 320px !important", 320],
    ["width: 320px !important; width: 100px !important", 100],
    ["width: 320px ! important; width: 100px", 320],
    ["width: 320px !IMPORTANT; width: 100px", 320],
  ])("%j는 %s로 정해진다", (style, expected) => {
    expect(readStylePxWidth(style)).toBe(expected);
  });

  it.each([
    "width: 320px; width: 50%",
    "width: 320px; width: auto",
    "width: 320px; width: calc(100% - 10px)",
    "width: 320px; width: 10em",
    "width: 320px !important; width: 50% !important",
    "width: 320px; width: inherit",
  ])(
    "%j는 승자가 허용값이 아니라 앞 선언으로 되돌아가지 않고 값 없음이다",
    (style) => {
      expect(readStylePxWidth(style)).toBeUndefined();
    },
  );
});

describe("readStylePxWidth 값 없음", () => {
  it.each([
    "",
    "color: red",
    "max-width: 320px",
    "min-width: 320px",
    "border-width: 320px",
    "--width: 320px",
    "width: -5px",
    "width: 50%",
    "width: calc(320px)",
    "width: calc(100px + 220px)",
    "width: auto",
    "width: 10em",
    "width: 10rem",
    "width: 10vw",
    "width: 10pt",
    "width: 320",
    "width: 320 px",
    "width: 320px 100px",
    "width: 0",
    "width: 1e999px",
    "width: var(--w)",
    "width: 320px 5",
    "width:",
    "width: ;",
    "width: 320px !",
  ])("%j는 값 없음이다", (style) => {
    expect(readStylePxWidth(style)).toBeUndefined();
  });
});

describe("무효 width 선언은 앞의 폭을 지우지 않는다", () => {
  it.each(["bogus", "-5px", "320 px", "320px 100px", "10unknown", "-1%"])(
    "%s를 건너뛴다",
    (invalid) => {
      expect(readStylePxWidth(`width:320px;width:${invalid} !important`)).toBe(
        320,
      );
    },
  );
});
