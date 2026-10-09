import { isCanonicalCellAlign, isCanonicalCellColor } from "@cp949/geul-model";

import {
  type CssColorResult,
  isCssSpace,
  readBackgroundShorthand,
  readCssColor,
} from "./css-color.js";

export type StyleDeclarations = {
  color?: string;
  backgroundColor?: string;
  align?: "left" | "center" | "right";
};

// 정규식 `\s`와 같은 집합이다. 문자 하나를 정규식 없이 판정하려고 둔다.
const REGEX_WHITESPACE = new Set([
  "\t",
  "\n",
  "\v",
  "\f",
  "\r",
  " ",
  "\u00a0",
  "\u1680",
  "\u2000",
  "\u2001",
  "\u2002",
  "\u2003",
  "\u2004",
  "\u2005",
  "\u2006",
  "\u2007",
  "\u2008",
  "\u2009",
  "\u200a",
  "\u2028",
  "\u2029",
  "\u202f",
  "\u205f",
  "\u3000",
  "\ufeff",
]);

const isPropertyCharacter = (character: string): boolean =>
  (character >= "a" && character <= "z") ||
  (character >= "A" && character <= "Z") ||
  character === "-";

// `;`로 자른 선언 하나에서 속성 이름과 값을 읽는다. 옛 정규식
// `([a-zA-Z-]+)\s*:\s*([^;]+)`과 결과가 같다.
// - 속성은 `:` 직전(공백은 건너뜀)의 [a-zA-Z-] run이다. 그 앞의 다른 글자는
//   무시한다.
// - 앞에 속성 run이 없는 `:`는 건너뛰고 다음 `:`를 본다.
// - 속성 run이 있는 첫 `:`가 선언의 유일한 매칭이다. 값은 그 뒤 끝까지다.
// - 그 `:`가 선언의 마지막 글자면 값이 비어 매칭이 없다. 뒤에 `:`도 없다.
// 정규식은 시작 위치마다 끝까지 매칭했다가 되돌아가 알파벳 run에서 이차
// 시간이었다. 여기서는 선언을 한 번 훑고 각 글자를 상수 번만 본다. 글자는
// 대괄호로 읽는다 — String 메서드를 선언마다 부르지 않는다.
const readDeclaration = (
  declaration: string,
): { property: string; rawValue: string } | undefined => {
  // 현재 속성 후보 run의 [start, end). start가 -1이면 후보가 없다.
  let runStart = -1;
  let runEnd = -1;
  // 후보 run이 아직 열려 있는지(글자가 이어지는 중)다. 닫힌 뒤에는 공백만
  // 와야 후보가 유지된다.
  let inRun = false;

  for (let index = 0; index < declaration.length; index += 1) {
    const character = declaration[index] as string;
    if (isPropertyCharacter(character)) {
      if (!inRun) runStart = index;
      inRun = true;
      runEnd = index + 1;
    } else if (REGEX_WHITESPACE.has(character)) {
      inRun = false;
    } else if (character === ":" && runStart >= 0) {
      if (index === declaration.length - 1) return undefined;
      return {
        property: declaration.slice(runStart, runEnd),
        rawValue: declaration.slice(index + 1),
      };
    } else {
      inRun = false;
      runStart = -1;
    }
  }

  return undefined;
};

// `;`로 선언을 자르고 `/* */` 주석을 공백 하나로 바꾼다. 괄호 `()`와 따옴표
// 안의 `;`에서는 자르지 않는다(`url(data:image/png;base64,...)`). 닫히지 않은
// 괄호·따옴표는 입력 끝까지 한 선언이고, 닫히지 않은 주석은 끝까지 주석이다.
// 계측 테스트(G-TST-004)가 큰 문자열의 String 메서드 호출을 세므로 큰 문자열
// 메서드는 `split(";")` 한 번만 부른다. 이어 붙일 조각과 주석 치환은 조각
// 단위로, 글자를 대괄호로 읽고 `+=`로 쌓는다.
// escaped는 조각이 따옴표 밖 `\\`로 끝났다는 표시다. 다음 `;`가 이스케이프된다.
type ScanState = {
  quote: string;
  depth: number;
  inComment: boolean;
  escaped: boolean;
};

const scanPiece = (piece: string, state: ScanState): string => {
  // 주석을 만나기 전에는 조각을 그대로 쓴다. out이 정해지면 글자를 쌓는다.
  let out: string | undefined = state.inComment ? "" : undefined;
  state.escaped = false;
  const keep = (character: string): void => {
    if (out !== undefined) out += character;
  };

  for (let index = 0; index < piece.length; index += 1) {
    const character = piece[index] as string;
    if (state.inComment) {
      if (character === "*" && piece[index + 1] === "/") {
        state.inComment = false;
        index += 1;
      }
    } else if (state.quote !== "") {
      keep(character);
      if (character === "\\") {
        index += 1;
        keep(piece[index] ?? "");
      } else if (character === state.quote) {
        state.quote = "";
      }
    } else if (character === "/" && piece[index + 1] === "*") {
      if (out === undefined) {
        out = "";
        for (let copy = 0; copy < index; copy += 1) out += piece[copy];
      }
      out += " ";
      state.inComment = true;
      index += 1;
    } else if (character === "\\") {
      // 따옴표 밖 백슬래시도 다음 글자를 이스케이프한다. `\\(`는 괄호를 열지
      // 않고, 조각 끝의 `\\`는 잘려 나간 `;`를 이스케이프한다.
      keep(character);
      index += 1;
      keep(piece[index] ?? "");
      if (index >= piece.length) state.escaped = true;
    } else {
      keep(character);
      if (character === '"' || character === "'") state.quote = character;
      else if (character === "(") state.depth += 1;
      else if (character === ")" && state.depth > 0) state.depth -= 1;
    }
  }

  return out ?? piece;
};

const splitDeclarations = (style: string): string[] => {
  const declarations: string[] = [];
  const state: ScanState = {
    quote: "",
    depth: 0,
    inComment: false,
    escaped: false,
  };
  let pending: string | undefined;

  for (const piece of style.split(";")) {
    // 앞 조각이 주석 안에서 끝났으면 그 `;`는 주석 내용이라 버린다.
    const joiner = state.inComment ? "" : ";";
    const scanned = scanPiece(piece, state);
    pending = pending === undefined ? scanned : pending + joiner + scanned;
    if (
      state.quote === "" &&
      state.depth === 0 &&
      !state.inComment &&
      !state.escaped
    ) {
      declarations.push(pending);
      pending = undefined;
    }
  }
  if (pending !== undefined) declarations.push(pending);

  return declarations;
};

const IMPORTANT_KEYWORD = "important";

// 값 끝의 `!important`(`!`와 낱말 사이 공백, 대소문자 허용)를 떼어 낸다.
const splitImportant = (
  rawValue: string,
): { value: string; important: boolean } => {
  const trimmed = rawValue.trimEnd();
  const wordStart = trimmed.length - IMPORTANT_KEYWORD.length;
  if (
    wordStart < 1 ||
    trimmed.slice(wordStart).toLowerCase() !== IMPORTANT_KEYWORD
  ) {
    return { value: rawValue, important: false };
  }
  let bang = wordStart;
  while (bang > 0 && isCssSpace(trimmed[bang - 1] as string)) bang -= 1;
  if (bang === 0 || trimmed[bang - 1] !== "!") {
    return { value: rawValue, important: false };
  }
  return { value: trimmed.slice(0, bang - 1), important: true };
};

// 색 하나가 받는 칸이다. 중요도가 높은 선언이 칸을 차지하면 일반 선언은 못
// 덮는다. 같은 중요도끼리는 뒤가 이긴다. invalid는 칸을 건드리지 않는다.
type ColorSlot = { result: CssColorResult | undefined; important: boolean };

const applyColor = (
  slot: ColorSlot,
  result: CssColorResult,
  important: boolean,
): void => {
  if (result.kind === "invalid") return;
  if (slot.important && !important) return;
  slot.result = result;
  slot.important ||= important;
};

// 칸의 최종 결과를 모델 정규 형식 색으로 돌려준다. clear·무선언은 undefined다.
const slotColor = (slot: ColorSlot): string | undefined =>
  slot.result?.kind === "color" && isCanonicalCellColor(slot.result.color)
    ? slot.result.color
    : undefined;

// style 속성 문자열에서 color/background-color/background/text-align 네
// 선언만 읽는다. 나머지 CSS 선언은 조용히 버린다 — 파싱 실패로 전체
// 붙여넣기를 거절하지 않는다.
// 색 값은 CSS 문법대로 읽는다(css-color.ts). 우선순위는 브라우저와 같다.
// - `!important` 선언은 일반 선언을 이긴다. 같은 중요도끼리는 뒤가 이긴다.
// - 문법 오류 선언은 버리고 앞 값을 유지한다.
// - 투명·반투명·상속 키워드와 색 토큰 없는 `background`는 같은 요소의 앞
//   값을 지운다. 바깥 요소의 색은 건드리지 않는다.
// - `background-color`와 `background`는 같은 배경색 칸을 순서대로 덮는다.
// text-align은 `!important`를 읽지 않는다(옛 동작 유지).
export const parseStyleDeclarations = (style: string): StyleDeclarations => {
  const color: ColorSlot = { result: undefined, important: false };
  const background: ColorSlot = { result: undefined, important: false };
  let align: StyleDeclarations["align"];

  for (const declaration of splitDeclarations(style)) {
    const read = readDeclaration(declaration);
    if (read === undefined) continue;
    const property = read.property.toLowerCase();

    if (property === "color") {
      const { value, important } = splitImportant(read.rawValue);
      applyColor(color, readCssColor(value), important);
    } else if (property === "background-color") {
      const { value, important } = splitImportant(read.rawValue);
      applyColor(background, readCssColor(value), important);
    } else if (property === "background") {
      const { value, important } = splitImportant(read.rawValue);
      applyColor(background, readBackgroundShorthand(value), important);
    } else if (property === "text-align") {
      const value = read.rawValue.trim().toLowerCase();
      if (isCanonicalCellAlign(value)) align = value;
    }
  }

  const result: StyleDeclarations = {};
  const textColor = slotColor(color);
  if (textColor !== undefined) result.color = textColor;
  const backgroundColor = slotColor(background);
  if (backgroundColor !== undefined) result.backgroundColor = backgroundColor;
  if (align !== undefined) result.align = align;
  return result;
};

// font-weight 선언 하나의 분류다. bold는 bold·bolder·600 이상, normal은
// normal·400이다. 그 밖의 값(500, lighter, 알 수 없는 값)은 other다.
export type InlineFontWeight = "bold" | "normal" | "other";

export type InlineStyleMarks = {
  // 마지막 font-weight 선언의 분류. 선언이 없으면 undefined다. span은 bold일
  // 때만 굵게 읽고, b·strong은 normal이 아니면 굵게 읽는다(기존 규칙).
  fontWeight: InlineFontWeight | undefined;
  italic: boolean;
  underline: boolean;
  strike: boolean;
};

const MIN_BOLD_WEIGHT = 600;
const MAX_FONT_WEIGHT = 1000;
const NUMERIC_WEIGHT_PATTERN = /^[0-9]+(?:\.[0-9]+)?$/;
const IMPORTANT_SUFFIX = "!important";
const WHITESPACE_RUN = /\s+/;

const classifyFontWeight = (value: string): InlineFontWeight => {
  if (value === "bold" || value === "bolder") return "bold";
  if (value === "normal") return "normal";
  if (NUMERIC_WEIGHT_PATTERN.test(value)) {
    const weight = Number(value);
    if (weight === 400) return "normal";
    if (weight >= MIN_BOLD_WEIGHT && weight <= MAX_FONT_WEIGHT) return "bold";
  }
  return "other";
};

// 선언 값의 `!important`와 양끝 공백을 걷고 소문자로 맞춘다. `!important`
// 제거에 정규식을 쓰지 않는다 — `\s*!important\s*$`는 공백이 긴 입력에서
// 시작 위치마다 끝까지 훑어 이차 시간이 된다.
const normalizeDeclarationValue = (rawValue: string): string => {
  const value = rawValue.trim().toLowerCase();
  return value.endsWith(IMPORTANT_SUFFIX)
    ? value.slice(0, value.length - IMPORTANT_SUFFIX.length).trimEnd()
    : value;
};

// style 속성에서 인라인 서식 마크(굵게·기울임·밑줄·취소선) 판정에 쓰는 네
// 선언만 읽는다. `;`로 자르고 선언마다 첫 `:` 위치로 이름과 값을 나눈다 —
// 입력 길이에 선형이다. 같은 선언이 여럿이면 마지막이 이기고(text-decoration
// 과 text-decoration-line은 합쳐서 마지막), `!important`·대소문자·공백은
// 무시한다. 읽지 않는 선언과 `:`가 없는 조각은 버린다. 값이 꺼짐(normal,
// none)이어도 이 함수는 그 선언만 반영한다 — 바깥 요소가 만든 마크를 지우는
// 일은 없고, 마크는 누적만 한다(호출부 계약).
export const parseInlineStyleMarks = (style: string): InlineStyleMarks => {
  const result: InlineStyleMarks = {
    fontWeight: undefined,
    italic: false,
    underline: false,
    strike: false,
  };

  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();

    if (property === "font-weight") {
      result.fontWeight = classifyFontWeight(
        normalizeDeclarationValue(declaration.slice(colon + 1)),
      );
    } else if (property === "font-style") {
      const keyword = normalizeDeclarationValue(
        declaration.slice(colon + 1),
      ).split(WHITESPACE_RUN, 1)[0];
      result.italic = keyword === "italic" || keyword === "oblique";
    } else if (
      property === "text-decoration" ||
      property === "text-decoration-line"
    ) {
      const tokens = normalizeDeclarationValue(
        declaration.slice(colon + 1),
      ).split(WHITESPACE_RUN);
      result.underline = tokens.includes("underline");
      result.strike = tokens.includes("line-through");
    }
  }

  return result;
};

// 소스 공백을 다루는 방식이다. preserve는 공백과 개행을 그대로 두고, pre-line은
// 공백 run을 접되 개행을 남기며, normal은 공백과 개행을 모두 접는다.
export type WhiteSpaceMode = "normal" | "pre-line" | "preserve";

// 한 낱말로 쓰는 값이다. CSS Text 3의 white-space 값과 CSS Text 4가 더한 낱말
// (collapse·preserve·preserve-breaks·wrap)이다.
const WHITE_SPACE_KEYWORDS: ReadonlyMap<string, WhiteSpaceMode> = new Map([
  ["pre", "preserve"],
  ["pre-wrap", "preserve"],
  ["break-spaces", "preserve"],
  ["preserve", "preserve"],
  ["pre-line", "pre-line"],
  ["preserve-breaks", "pre-line"],
  ["normal", "normal"],
  ["nowrap", "normal"],
  ["wrap", "normal"],
  ["collapse", "normal"],
]);

// CSS Text 4 축약형은 white-space-collapse 낱말과 text-wrap-mode 낱말을 한
// 번씩 짝지어 쓴다(`preserve nowrap`). 모드는 앞쪽 낱말이 정한다.
const COLLAPSE_KEYWORDS: ReadonlySet<string> = new Set([
  "collapse",
  "preserve",
  "preserve-breaks",
  "break-spaces",
]);
const WRAP_KEYWORDS: ReadonlySet<string> = new Set(["wrap", "nowrap"]);

// 부모 모드를 따르게 하는 CSS 전역 키워드다.
const WHITE_SPACE_RESET_KEYWORDS: ReadonlySet<string> = new Set([
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);

// 유효한 값이면 모드를, 아니면 undefined를 돌려준다.
const readWhiteSpaceValue = (value: string): WhiteSpaceMode | undefined => {
  const tokens = value.split(WHITESPACE_RUN);
  if (tokens.length === 1) return WHITE_SPACE_KEYWORDS.get(value);
  if (tokens.length !== 2) return undefined;

  const [first = "", second = ""] = tokens;
  if (COLLAPSE_KEYWORDS.has(first) && WRAP_KEYWORDS.has(second)) {
    return WHITE_SPACE_KEYWORDS.get(first);
  }
  if (WRAP_KEYWORDS.has(first) && COLLAPSE_KEYWORDS.has(second)) {
    return WHITE_SPACE_KEYWORDS.get(second);
  }
  return undefined;
};

// style 속성의 `white-space` 선언을 소스 공백 모드로 읽는다. 브라우저처럼
// 무효 선언은 버리고 앞의 유효 선언을 유지하며, 유효 선언 중 마지막이 이긴다.
// 선언이 없거나 마지막 유효 선언이 상속 키워드(inherit·initial·unset·revert·
// revert-layer)이면 undefined다 — 호출부가 부모 모드를 상속한다.
// parseInlineStyleMarks와 같은 선형 방식(`;`로 자르고 선언마다 첫 `:`로 나눔)
// 이고 `!important`·대소문자·공백은 무시한다. `/* */` 주석과 `url()` 안의 `;`는
// 읽지 않는다.
export const parseWhiteSpaceMode = (
  style: string,
): WhiteSpaceMode | undefined => {
  let mode: WhiteSpaceMode | undefined;

  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    if (declaration.slice(0, colon).trim().toLowerCase() !== "white-space") {
      continue;
    }
    const value = normalizeDeclarationValue(declaration.slice(colon + 1));
    if (WHITE_SPACE_RESET_KEYWORDS.has(value)) {
      mode = undefined;
      continue;
    }
    mode = readWhiteSpaceValue(value) ?? mode;
  }

  return mode;
};
