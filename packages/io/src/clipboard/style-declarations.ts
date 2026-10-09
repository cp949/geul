import { isCanonicalCellAlign, isCanonicalCellColor } from "@cp949/geul-model";

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

const toHexChannel = (value: number): string =>
  Math.min(255, Math.max(0, value)).toString(16).padStart(2, "0").toUpperCase();

// color/background-color 값을 대문자 #RRGGBB로 정규화한다. hex와 rgb()/rgba()
// 두 표기만 지원한다(실제 Excel/Google Sheets 클립보드 HTML이 쓰는 형식) —
// named color나 hsl() 등은 지원 범위 밖이라 undefined로 버린다.
const normalizeColor = (rawValue: string): string | undefined => {
  const trimmed = rawValue.trim();

  const hexMatch = /^#([0-9a-fA-F]{6})$/.exec(trimmed);
  if (hexMatch !== null) {
    const upper = `#${hexMatch[1]?.toUpperCase()}`;
    return isCanonicalCellColor(upper) ? upper : undefined;
  }

  const rgbMatch =
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/.exec(
      trimmed,
    );
  if (rgbMatch !== null) {
    const [, r, g, b] = rgbMatch;
    const hex = `#${toHexChannel(Number(r))}${toHexChannel(Number(g))}${toHexChannel(Number(b))}`;
    return isCanonicalCellColor(hex) ? hex : undefined;
  }

  return undefined;
};

// style 속성 문자열에서 color/background-color/background/text-align 네
// 선언만 읽는다. 나머지 CSS 선언과, 이 네 선언이라도 우리 canonical 형식을
// 통과하지 못하는 값은 조용히 버린다 — 파싱 실패로 전체 붙여넣기를 거절하지
// 않는다. background 축약형은 Excel 클립보드 HTML이 실제로 쓰는 표기라
// 읽되, 값 전체가 순수 색상 리터럴일 때만 반영한다(normalizeColor가 hex와
// rgb()/rgba()만 통째로 매칭하므로 `url(...) #fff` 같은 복합 축약형은
// 자동으로 undefined가 된다).
export const parseStyleDeclarations = (style: string): StyleDeclarations => {
  const result: StyleDeclarations = {};

  for (const declaration of style.split(";")) {
    const read = readDeclaration(declaration);
    if (read === undefined) continue;
    const property = read.property.toLowerCase();
    const rawValue = read.rawValue.trim();

    if (property === "color") {
      const normalized = normalizeColor(rawValue);
      if (normalized !== undefined) result.color = normalized;
    } else if (property === "background-color" || property === "background") {
      const normalized = normalizeColor(rawValue);
      if (normalized !== undefined) result.backgroundColor = normalized;
    } else if (property === "text-align") {
      const value = rawValue.toLowerCase();
      if (isCanonicalCellAlign(value)) result.align = value;
    }
  }

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
