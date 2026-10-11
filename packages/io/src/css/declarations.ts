// `style` 속성 문자열을 선언 목록으로 나눈다(CSS 선언 읽기, ADR-0019).
// 규칙은 Chromium 153 실측이다(`css-declarations.test.ts` 머리 주석).
// - 선언은 ident 이름, 공백·주석, `:`, 값이다. 이름이 ident가 아니거나 `:`가
//   없으면 다음 최상위 `;`까지 버린다.
// - at-rule은 최상위 `;`나 최상위 `{}` 블록의 끝에서 끝난다. 버린다.
// - 값 끝의 최상위 `!`와 `important`가 중요도다.
// - 값에 bad-string·bad-url이 있거나, 짝 없는 닫는 토큰이 있거나, 중요도를 뗀
//   뒤 최상위 `!`가 남으면 그 선언을 버린다(CSS Syntax 3 `<declaration-value>`).
// - 빈 값 선언은 버린다. 표준 속성은 빈 값을 받지 않는다.
// - 이름·값 문법은 모른다. 모르는 속성도 남긴다. 같은 이름의 우선순위도 정하지
//   않는다. 판독기가 정한다.
// 토큰을 앞에서 뒤로 한 번 훑고 선언마다 그 범위만 다시 본다. 입력 길이에
// 선형이다.
import {
  type CssComponentValue,
  parseCssComponentValues,
} from "./component-values.js";
import { asciiLowerCase, type CssToken, tokenizeCss } from "./tokens.js";

export type CssDeclaration = {
  // 이스케이프를 푼 속성 이름이다. 표준 속성은 ASCII 소문자로 바꾼다.
  // 사용자 정의 속성(`--`로 시작)은 대소문자를 지킨다.
  name: string;
  // `!important`와 양끝 공백을 뺀 값이다.
  value: CssComponentValue[];
  important: boolean;
  // 값 원문이다. 이스케이프를 풀지 않는다. 주석은 공백 하나로 바꾸고 양끝
  // 공백·주석과 `!important`는 뺀다. 아직 문자열을 읽는 판독기가 쓴다.
  text: string;
};

const CLOSER_OF: Partial<Record<CssToken["type"], CssToken["type"]>> = {
  function: ")",
  "(": ")",
  "[": "]",
  "{": "}",
};

const isClosingToken = (token: CssToken): boolean =>
  token.type === ")" || token.type === "]" || token.type === "}";

const isBlank = (token: CssToken): boolean =>
  token.type === "whitespace" || token.type === "comment";

// `from`부터 블록 밖 첫 `;`의 위치다. 없으면 `tokens.length`다.
const statementEnd = (tokens: readonly CssToken[], from: number): number => {
  const closers: CssToken["type"][] = [];
  for (let index = from; index < tokens.length; index += 1) {
    const token = tokens[index] as CssToken;
    const closer = CLOSER_OF[token.type];
    if (closer !== undefined) {
      closers.push(closer);
    } else if (token.type === closers[closers.length - 1]) {
      closers.pop();
    } else if (token.type === "semicolon" && closers.length === 0) {
      return index;
    }
  }
  return tokens.length;
};

// at-rule 다음 위치다. 블록 밖 `;` 다음이나 블록 밖 `{}` 블록 다음이다.
const atRuleEnd = (tokens: readonly CssToken[], from: number): number => {
  const closers: CssToken["type"][] = [];
  let inBlock = false;
  for (let index = from + 1; index < tokens.length; index += 1) {
    const token = tokens[index] as CssToken;
    const closer = CLOSER_OF[token.type];
    if (closer !== undefined) {
      if (closers.length === 0 && token.type === "{") inBlock = true;
      closers.push(closer);
    } else if (token.type === closers[closers.length - 1]) {
      closers.pop();
      if (closers.length === 0 && inBlock) return index + 1;
    } else if (token.type === "semicolon" && closers.length === 0) {
      return index + 1;
    }
  }
  return tokens.length;
};

const isImportantKeyword = (token: CssToken | undefined): boolean =>
  token !== undefined &&
  token.type === "ident" &&
  token.value.length === 9 &&
  asciiLowerCase(token.value) === "important";

// tokens[from, to)를 선언 하나로 읽는다. 선언이 아니거나 버릴 선언이면
// undefined다.
const readDeclaration = (
  tokens: readonly CssToken[],
  from: number,
  to: number,
): CssDeclaration | undefined => {
  const nameToken = tokens[from];
  if (nameToken?.type !== "ident") return undefined;
  let index = from + 1;
  while (index < to && isBlank(tokens[index] as CssToken)) index += 1;
  if (index >= to || tokens[index]?.type !== "colon") return undefined;

  let start = index + 1;
  let end = to;
  while (start < end && isBlank(tokens[start] as CssToken)) start += 1;
  while (end > start && isBlank(tokens[end - 1] as CssToken)) end -= 1;

  // 값을 한 번 훑어 깊이를 센다. 버릴 토큰을 찾고, 블록 밖 마지막 두 토큰을
  // 기억한다.
  const closers: CssToken["type"][] = [];
  let lastTop = -1;
  let beforeLastTop = -1;
  for (let cursor = start; cursor < end; cursor += 1) {
    const token = tokens[cursor] as CssToken;
    if (token.type === "bad-string" || token.type === "bad-url") {
      return undefined;
    }
    if (isBlank(token)) continue;
    const depth = closers.length;
    const closer = CLOSER_OF[token.type];
    if (closer !== undefined) {
      closers.push(closer);
    } else if (isClosingToken(token)) {
      if (token.type !== closers[closers.length - 1]) return undefined;
      closers.pop();
    }
    // 블록 밖에서 연 함수·블록도 블록 밖 토큰이다. 블록을 닫는 토큰은 아니다.
    if (depth === 0) {
      beforeLastTop = lastTop;
      lastTop = cursor;
    }
  }

  // 마지막 블록 밖 토큰이 값의 마지막 토큰이어야 중요도다. 열린 채 끝난
  // 블록 안의 `!important`는 블록 밖이 아니다.
  let important = false;
  const lastTopToken = tokens[lastTop];
  const beforeLastTopToken = tokens[beforeLastTop];
  if (
    lastTop === end - 1 &&
    closers.length === 0 &&
    isImportantKeyword(lastTopToken) &&
    beforeLastTopToken?.type === "delim" &&
    beforeLastTopToken.value === "!"
  ) {
    important = true;
    end = beforeLastTop;
    while (end > start && isBlank(tokens[end - 1] as CssToken)) end -= 1;
  }
  if (start >= end) return undefined;

  // 중요도를 뗀 뒤 블록 밖 `!`가 남으면 버린다.
  let depth = 0;
  let text = "";
  for (let cursor = start; cursor < end; cursor += 1) {
    const token = tokens[cursor] as CssToken;
    text += token.type === "comment" ? " " : token.text;
    if (CLOSER_OF[token.type] !== undefined) depth += 1;
    else if (isClosingToken(token)) depth -= 1;
    else if (depth === 0 && token.type === "delim" && token.value === "!") {
      return undefined;
    }
  }

  const name = nameToken.value;
  const isCustomProperty = name[0] === "-" && name[1] === "-";
  return {
    name: isCustomProperty ? name : asciiLowerCase(name),
    value: parseCssComponentValues(tokens, start, end),
    important,
    text,
  };
};

/**
 * `style` 속성 값을 선언 목록으로 나눈다. 원문 순서대로 모두 준다.
 */
export const parseCssDeclarations = (style: string): CssDeclaration[] => {
  const tokens = tokenizeCss(style);
  const declarations: CssDeclaration[] = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index] as CssToken;
    if (isBlank(token) || token.type === "semicolon") {
      index += 1;
    } else if (token.type === "at-keyword") {
      index = atRuleEnd(tokens, index);
    } else {
      const end = statementEnd(tokens, index);
      const declaration = readDeclaration(tokens, index, end);
      if (declaration !== undefined) declarations.push(declaration);
      index = end + 1;
    }
  }
  return declarations;
};
