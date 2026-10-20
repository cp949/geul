// `style` 속성의 `width`를 px 숫자로 읽는다(Issue #424 RD-004). 구 에디터가 저장한 이미지
// 폭이 inline style에만 있어서다.
// - 승자는 CSS cascade로 정한다. `!important` 선언이 일반 선언을 이기고 같은 중요도끼리는
//   뒤가 이긴다.
// - 승자가 단일 `px` 길이가 아니면 값 없음이다. 허용값만 후보로 남겨 앞 선언으로 되돌아가면
//   `width: 320px; width: 50%`가 320이 되어 브라우저가 그리는 폭(50%)과 달라진다.
// - 숫자 범위(양수 등)는 호출부가 model 검증으로 거른다. 여기서는 유한한 px 길이만 판정한다.
import { parseCssDeclarations } from "./declarations.js";
import type { CssDeclaration } from "./declarations.js";
import { asciiLowerCase } from "./tokens.js";

export const readStylePxWidth = (style: string): number | undefined => {
  let winner: CssDeclaration | undefined;
  for (const declaration of parseCssDeclarations(style)) {
    if (declaration.name !== "width") continue;
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
