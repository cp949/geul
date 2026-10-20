// `style` 속성의 `width`를 px 숫자로 읽는다(Issue #424 RD-004). 구 에디터가 저장한 이미지
// 폭이 inline style에만 있어서다.
// - 승자는 CSS cascade로 정한다. `!important` 선언이 일반 선언을 이기고 같은 중요도끼리는
//   뒤가 이긴다.
// - 승자가 단일 `px` 길이가 아니면 값 없음이다. 허용값만 후보로 남겨 앞 선언으로 되돌아가면
//   `width: 320px; width: 50%`가 320이 되어 브라우저가 그리는 폭(50%)과 달라진다.
// - CSS 문법상 무효한 선언은 승자 후보에서 뺀다. 저장 가능한 양수인지는 호출부가 검증한다.
import type { CssComponentValue } from "./component-values.js";
import { isCssLengthUnit } from "./css-color.js";
import { parseCssDeclarations } from "./declarations.js";
import type { CssDeclaration } from "./declarations.js";
import { asciiLowerCase } from "./tokens.js";

const WIDTH_KEYWORDS = new Set([
  "auto",
  "min-content",
  "max-content",
  "fit-content",
  "stretch",
  "contain",
  "-webkit-fill-available",
  "-webkit-min-content",
  "-webkit-max-content",
  "-webkit-fit-content",
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);
const WIDTH_FUNCTIONS = new Set([
  "calc",
  "min",
  "max",
  "clamp",
  "var",
  "env",
  "fit-content",
  "anchor-size",
  "calc-size",
]);

// px 외의 유효한 값도 승자가 된다. 함수 인자는 여기서 평가하지 않는다.
const isWidthValue = (parts: readonly CssComponentValue[]): boolean => {
  const values = parts.filter((part) => part.type !== "whitespace");
  const value = values[0];
  if (values.length !== 1 || value === undefined) return false;
  switch (value.type) {
    case "dimension":
      return value.value >= 0 && isCssLengthUnit(asciiLowerCase(value.unit));
    case "percentage":
      return value.value >= 0;
    case "number":
      return value.value === 0;
    case "ident":
      return WIDTH_KEYWORDS.has(asciiLowerCase(value.value));
    case "function":
      return WIDTH_FUNCTIONS.has(asciiLowerCase(value.name));
    default:
      return false;
  }
};

export const readStylePxWidth = (style: string): number | undefined => {
  let winner: CssDeclaration | undefined;
  for (const declaration of parseCssDeclarations(style)) {
    if (declaration.name !== "width" || !isWidthValue(declaration.value))
      continue;
    if (winner?.important === true && !declaration.important) continue;
    winner = declaration;
  }
  if (winner === undefined) return undefined;

  const [length, ...rest] = winner.value;
  if (length === undefined || rest.length > 0 || length.type !== "dimension") {
    return undefined;
  }
  if (asciiLowerCase(length.unit) !== "px") return undefined;
  return Number.isFinite(length.value) ? length.value : undefined;
};
