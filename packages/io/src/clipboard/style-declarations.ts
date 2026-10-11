import { isCanonicalCellAlign, isCanonicalCellColor } from "@cp949/geul-model";

import {
  type CssColorResult,
  isCssLengthUnit,
  isCssSpace,
  readBackgroundShorthand,
  readCssColor,
  readNumeric,
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

// 색 칸의 최종 상태다. unset은 이 요소가 색을 정하는 선언이 없거나 모두 문법
// 오류라는 뜻이다. clear는 선언이 있었지만 색을 정하지 않는 값(투명·반투명·
// 상속 키워드·색 토큰 없는 background)이 이겼다는 뜻이다. 호출부가 둘을
// 구분한다: `mark`는 clear일 때 기본 노랑을 내지 않고, `font`는 clear일 때
// color 속성을 쓰지 않는다.
export type ColorState =
  { kind: "unset" } | { kind: "clear" } | { kind: "color"; color: string };

const UNSET: ColorState = { kind: "unset" };
const CLEAR_STATE: ColorState = { kind: "clear" };

const slotState = (slot: ColorSlot): ColorState => {
  if (slot.result === undefined) return UNSET;
  if (slot.result.kind === "clear") return CLEAR_STATE;
  const color = slotColor(slot);
  return color === undefined ? UNSET : { kind: "color", color };
};

type StyleSlots = {
  color: ColorSlot;
  background: ColorSlot;
  align: StyleDeclarations["align"];
};

// color·background-color·background·text-align 선언을 읽어 칸 상태로 모은다.
const readStyleSlots = (style: string): StyleSlots => {
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

  return { color, background, align };
};

// style 속성에서 color/background-color/background/text-align 네
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
  const { color, background, align } = readStyleSlots(style);

  const result: StyleDeclarations = {};
  const textColor = slotColor(color);
  if (textColor !== undefined) result.color = textColor;
  const backgroundColor = slotColor(background);
  if (backgroundColor !== undefined) result.backgroundColor = backgroundColor;
  if (align !== undefined) result.align = align;
  return result;
};

// parseStyleDeclarations와 같은 선언을 읽되 clear와 unset을 구분해 돌려준다
// (Issue #334). 패키지 내부용이다. `mark`의 기본 배경과 `font`의 color 속성이
// "선언이 없음"과 "색을 정하지 않는 값"을 다르게 다룬다.
export const parseStyleColorStates = (
  style: string,
): { color: ColorState; backgroundColor: ColorState } => {
  const { color, background } = readStyleSlots(style);
  return {
    color: slotState(color),
    backgroundColor: slotState(background),
  };
};

// 브라우저 복사의 계산 스타일 덤프 표식이다(Issue #334). Chromium은 복사할 때
// 요소에 color·background-color와 함께 font-family·orphans·widows 등 계산 스타일
// 전체를 style로 싣고, 그 안에 항상 `-webkit-text-stroke-width`가 있다. 덤프
// 안쪽의 테마 color·background-color는 작성자가 쓴 색이 아니다. 작성자 색은
// 표식 뒤 `text-decoration*` 선언 뒤에서만 `readDumpAuthorDeclarations`가
// 꺼낸다. 속성 이름은 대소문자를 구분하지
// 않는다. 기존 선언 분할기를 쓰므로 주석·따옴표 안의 이름은 선언이 아니다.
// 선언을 한 번만 훑는다.
const COMPUTED_STYLE_DUMP_PROPERTY = "-webkit-text-stroke-width";

export const hasComputedStyleDump = (style: string): boolean => {
  for (const declaration of splitDeclarations(style)) {
    const read = readDeclaration(declaration);
    if (
      read !== undefined &&
      read.property.toLowerCase() === COMPUTED_STYLE_DUMP_PROPERTY
    ) {
      return true;
    }
  }
  return false;
};

// `text-decoration`과 그 longhand(`text-decoration-color` 등)다.
const isTextDecorationProperty = (property: string): boolean =>
  property === "text-decoration" || property.startsWith("text-decoration-");

// 덤프 style에서 작성자가 쓴 선언 부분을 문자열로 돌려준다(Issue #341).
// - 덤프 표식이 없으면 undefined다. 호출부가 style 전체를 읽는다.
// - 표식이 있으면 표식 뒤의 마지막 `text-decoration*` 선언(앵커) 뒤의 선언을
//   `;`로 이어 돌려준다. 앵커가 없거나 그 뒤에 선언이 없으면 빈 문자열이다.
//   표식이 여러 개면 마지막 표식 뒤만 센다.
// Chromium 153의 직렬화 순서에 기댄다.
// - 인라인 style이 준 text-decoration은 표식 뒤에 온다. 테마 color·
//   background-color는 표식 앞뒤에 있고 앵커 앞이다. 요소를 통째로 포함한 복사의
//   작성자 값은 앵커 뒤(맨 끝)에 붙는다. 줄임 `text-decoration`도 같다.
// - 스타일시트가 준 text-decoration은 표식 앞(style 첫 선언)에 온다. 앵커로 보지
//   않으므로 이 요소는 색을 읽지 않는다. 인라인 color를 같이 걸어도 같다.
// - 안쪽만 복사한 요소는 작성자 color가 맨 앞에 와서 테마 color와 구분할 수 없다.
// - u·s·del·strike·a는 `text-decoration*` 선언이 없고 작성자 배경이 테마 배경 자리에 온다.
// 이들은 빈 문자열이라 색을 읽지 않는다. 다른 Chromium 버전의 순서는 알 수 없다.
export const readDumpAuthorDeclarations = (
  style: string,
): string | undefined => {
  const declarations = splitDeclarations(style);
  let hasDump = false;
  // 표식 뒤 마지막 text-decoration* 선언의 다음 위치다. -1이면 앵커가 없다.
  let authorStart = -1;
  for (let index = 0; index < declarations.length; index += 1) {
    const read = readDeclaration(declarations[index] as string);
    if (read === undefined) continue;
    const property = read.property.toLowerCase();
    if (property === COMPUTED_STYLE_DUMP_PROPERTY) {
      hasDump = true;
      // 표식 앞의 text-decoration*은 앵커가 아니다.
      authorStart = -1;
    } else if (isTextDecorationProperty(property)) {
      authorStart = index + 1;
    }
  }
  if (!hasDump) return undefined;
  return authorStart < 0 ? "" : declarations.slice(authorStart).join(";");
};

// font-weight 선언 하나의 분류다.
// - bold: bold·bolder·600 이상이다.
// - normal: normal·400이다.
// - light: 유효하지만 굵지 않은 값이다. 1–599(400 제외)·lighter·initial이다.
//   안쪽 요소가 UA 굵기를 덮어 굵게를 끈다.
// - inherit: 부모 굵기를 따른다. inherit·unset이다(font-weight는 상속 속성이다).
//   끄지도 켜지도 않는다.
// - other: 굵기를 정하지 않는다. revert·revert-layer(UA 굵기로 돌아간다)다.
//   무효한 값(`foo`·`0`·`1001`·`calc()`)은 선언이 버려져 분류가 없다.
export type InlineFontWeight =
  "bold" | "normal" | "light" | "inherit" | "other";

// font-style 선언 하나의 분류다. 선언이 없거나 UA 값으로 돌아가는
// revert·revert-layer면 undefined다.
// - italic: italic·oblique다.
// - normal: normal·initial이다. 안쪽 요소가 바깥 기울임을 끈다.
// - inherit: inherit·unset이다. 부모 기울임을 따른다.
export type InlineFontStyle = "italic" | "normal" | "inherit";

export type InlineStyleMarks = {
  // 칸을 차지한 font-weight 선언(font 줄임 포함)의 분류. 유효한 선언이 없으면
  // undefined다. 무효한 선언은 버린다. span과 새로 읽는 요소는 bold일 때만
  // 굵게 읽고, b·strong은 normal·light가 아니면 굵게 읽는다.
  fontWeight: InlineFontWeight | undefined;
  fontStyle: InlineFontStyle | undefined;
  underline: boolean;
  strike: boolean;
};

const MIN_BOLD_WEIGHT = 600;
const MIN_FONT_WEIGHT = 1;
const MAX_FONT_WEIGHT = 1000;
const WHITESPACE_RUN = /\s+/;

const LIGHT_WEIGHT_KEYWORDS: ReadonlySet<string> = new Set([
  "lighter",
  "initial",
]);

// 숫자 굵기(1–1000)를 분류한다.
const classifyWeightNumber = (weight: number): InlineFontWeight => {
  if (weight === 400) return "normal";
  return weight >= MIN_BOLD_WEIGHT ? "bold" : "light";
};

// 유효한 font-weight 값이면 분류를, 무효하면 undefined를 돌려준다. 입력은
// 소문자로 정규화된 값이다.
const classifyFontWeight = (value: string): InlineFontWeight | undefined => {
  if (value === "bold" || value === "bolder") return "bold";
  if (value === "normal") return "normal";
  if (LIGHT_WEIGHT_KEYWORDS.has(value)) return "light";
  if (value === "inherit" || value === "unset") return "inherit";
  if (value === "revert" || value === "revert-layer") return "other";
  const numeric = readNumeric(value);
  if (numeric === undefined || numeric.unit !== "") return undefined;
  if (numeric.value < MIN_FONT_WEIGHT || numeric.value > MAX_FONT_WEIGHT) {
    return undefined;
  }
  return classifyWeightNumber(numeric.value);
};

// font 줄임 속성의 선언 하나가 정하는 굵기와 기울임이다.
type FontShorthand = {
  weight: InlineFontWeight;
  fontStyle: InlineFontStyle | undefined;
};

const FONT_SYSTEM_KEYWORDS: ReadonlySet<string> = new Set([
  "caption",
  "icon",
  "menu",
  "message-box",
  "small-caption",
  "status-bar",
]);

const FONT_STRETCH_KEYWORDS: ReadonlySet<string> = new Set([
  "ultra-condensed",
  "extra-condensed",
  "condensed",
  "semi-condensed",
  "semi-expanded",
  "expanded",
  "extra-expanded",
  "ultra-expanded",
]);

const FONT_SIZE_KEYWORDS: ReadonlySet<string> = new Set([
  "xx-small",
  "x-small",
  "small",
  "medium",
  "large",
  "x-large",
  "xx-large",
  "xxx-large",
  "larger",
  "smaller",
  "math",
]);

const MATH_FUNCTIONS: ReadonlySet<string> = new Set([
  "calc",
  "min",
  "max",
  "clamp",
]);

const ANGLE_UNITS: ReadonlySet<string> = new Set([
  "deg",
  "grad",
  "rad",
  "turn",
]);

// 글꼴 이름 하나로 쓸 수 없는 낱말이다. 이 낱말 하나만 있는 항목은 무효다.
const RESERVED_FAMILY_KEYWORDS: readonly string[] = [
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
  "default",
];

// font 줄임 속성의 앞 슬롯은 네 개다: style·variant·weight·stretch.
const MAX_FONT_PREFIX_TOKENS = 4;

const skipCssSpace = (value: string, from: number): number => {
  let index = from;
  while (index < value.length && isCssSpace(value[index] as string)) {
    index += 1;
  }
  return index;
};

// 토큰의 끝 위치다. 괄호 밖 공백이나 `/`에서 끝난다. 괄호 안은 공백·`/`가
// 있어도 한 토큰이다(`calc(1px + 2px)`).
const fontTokenEnd = (value: string, from: number): number => {
  let depth = 0;
  let index = from;
  while (index < value.length) {
    const character = value[index] as string;
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      if (depth > 0) depth -= 1;
    } else if (depth === 0 && (character === "/" || isCssSpace(character))) {
      break;
    }
    index += 1;
  }
  return index;
};

// calc()·min()·max()·clamp() 토큰이다. 안쪽은 검증하지 않는다.
const isMathFunctionToken = (token: string): boolean => {
  if (!token.endsWith(")")) return false;
  const open = token.indexOf("(");
  return open > 0 && MATH_FUNCTIONS.has(token.slice(0, open));
};

// 0 이상의 길이·백분율이다. 단위 없는 숫자는 0만 길이다. `-0`은 0이다.
const isNonNegativeLengthPercentage = (token: string): boolean => {
  const numeric = readNumeric(token);
  if (numeric === undefined || !(numeric.value >= 0)) return false;
  if (numeric.unit === "") return numeric.value === 0;
  return numeric.unit === "%" || isCssLengthUnit(numeric.unit);
};

const isFontSizeToken = (token: string): boolean =>
  FONT_SIZE_KEYWORDS.has(token) ||
  isMathFunctionToken(token) ||
  isNonNegativeLengthPercentage(token);

// `/` 뒤 line-height 토큰이다: normal·0 이상의 숫자·길이·백분율.
const isLineHeightToken = (token: string): boolean => {
  if (token === "normal" || isMathFunctionToken(token)) return true;
  const numeric = readNumeric(token);
  if (numeric !== undefined && numeric.unit === "") return numeric.value >= 0;
  return isNonNegativeLengthPercentage(token);
};

const isFamilyLetter = (character: string): boolean =>
  (character >= "a" && character <= "z") ||
  (character >= "A" && character <= "Z");

// ASCII 밖 글자는 이름 글자다. DEL(0x7f)도 한 글자로 받아 들이는 사소한 차이는
// 둔다.
const isFamilyNameStart = (character: string): boolean =>
  isFamilyLetter(character) || character === "_" || character > "~";

const isFamilyNameCharacter = (character: string): boolean =>
  isFamilyNameStart(character) ||
  character === "-" ||
  (character >= "0" && character <= "9");

// value[start, end)가 예약 낱말인지 본다. 큰 문자열에 slice를 반복해 부르지
// 않으려고 글자를 대괄호로 비교한다(G-TST-004).
const isReservedFamilyKeyword = (
  value: string,
  start: number,
  end: number,
): boolean => {
  for (const keyword of RESERVED_FAMILY_KEYWORDS) {
    if (keyword.length !== end - start) continue;
    let same = true;
    for (let offset = 0; offset < keyword.length && same; offset += 1) {
      same = value[start + offset] === keyword[offset];
    }
    if (same) return true;
  }
  return false;
};

// `from`에서 시작하는 CSS 식별자의 끝 위치다. 식별자가 아니면 -1이다.
// 숫자로 시작하거나 `-` 뒤에 숫자가 오면 식별자가 아니다. 백슬래시는 다음 한
// 글자를 이스케이프한다.
const scanFamilyIdent = (value: string, from: number): number => {
  const length = value.length;
  let index = from;
  if (value[index] === "-") {
    index += 1;
    const next = value[index];
    if (next === undefined) return -1;
    if (next === "-") {
      index += 1;
    } else if (!isFamilyNameStart(next) && next !== "\\") {
      return -1;
    }
  } else {
    const first = value[index] as string;
    if (!isFamilyNameStart(first) && first !== "\\") return -1;
  }

  while (index < length) {
    const character = value[index] as string;
    if (character === "\\") {
      if (index + 1 >= length) return -1;
      index += 2;
    } else if (isFamilyNameCharacter(character)) {
      index += 1;
    } else {
      break;
    }
  }
  return index;
};

// 쉼표로 나눈 글꼴 목록이 문법에 맞는지 본다. 항목은 따옴표 문자열 하나이거나
// 공백으로 이은 식별자들이다. 빈 항목(앞뒤 쉼표)은 무효다. 닫히지 않은
// 따옴표는 입력 끝에서 닫힌 것으로 본다. 한 낱말만 있는 항목이 예약 낱말이면
// 무효다.
const isFamilyList = (value: string, from: number): boolean => {
  const length = value.length;
  let index = from;

  for (;;) {
    index = skipCssSpace(value, index);
    if (index >= length) return false;

    const first = value[index] as string;
    if (first === '"' || first === "'") {
      index += 1;
      while (index < length && value[index] !== first) {
        index += value[index] === "\\" ? 2 : 1;
      }
      index += 1;
    } else {
      let identCount = 0;
      let firstStart = index;
      let firstEnd = index;
      for (;;) {
        const end = scanFamilyIdent(value, index);
        if (end < 0) return false;
        if (identCount === 0) {
          firstStart = index;
          firstEnd = end;
        }
        identCount += 1;
        const next = skipCssSpace(value, end);
        if (next >= length || value[next] === ",") {
          index = next;
          break;
        }
        // 식별자 바로 뒤에 식별자가 아닌 글자가 붙으면 무효다.
        if (next === end) return false;
        index = next;
      }
      if (
        identCount === 1 &&
        isReservedFamilyKeyword(value, firstStart, firstEnd)
      ) {
        return false;
      }
    }

    index = skipCssSpace(value, index);
    if (index >= length) return true;
    if (value[index] !== ",") return false;
    index += 1;
  }
};

// font 줄임 속성 값(소문자·`!important` 제거 후)에서 굵기와 기울임을 읽는다.
// 문법: `[style || variant || weight || stretch]? size[/line-height] family`.
// - 앞 슬롯은 최대 네 토큰이고, `normal`은 어느 슬롯이든 채운다. style·
//   variant·weight·stretch는 각각 한 번만 쓴다.
// - 크기가 없거나 글꼴 목록이 문법에 맞지 않으면 선언 전체가 무효라 undefined다.
// - 시스템 글꼴 키워드 하나(`caption` 등)는 normal·normal이다. 전역 키워드
//   하나는 부모를 따르거나(inherit·unset) 정하지 않거나(revert) normal로
//   돌아간다(initial).
// - 굵기 토큰이 없으면 normal이고 기울임 토큰이 없으면 normal이다.
// 값을 앞에서 한 번 훑고 토큰마다 일정한 일만 한다. 정규식을 쓰지 않는다.
// export는 복잡도 테스트 전용이다. 테스트가 대괄호 읽기를 세려고 Proxy 값을
// 직접 넘긴다. 공개 API가 아니다.
export const parseFontShorthand = (
  value: string,
): FontShorthand | undefined => {
  if (value === "") return undefined;
  if (value === "inherit" || value === "unset") {
    return { weight: "inherit", fontStyle: "inherit" };
  }
  if (value === "initial") return { weight: "normal", fontStyle: "normal" };
  if (value === "revert" || value === "revert-layer") {
    return { weight: "other", fontStyle: undefined };
  }
  if (FONT_SYSTEM_KEYWORDS.has(value)) {
    return { weight: "normal", fontStyle: "normal" };
  }

  let weight: InlineFontWeight = "normal";
  let italic = false;
  let sawStyle = false;
  let sawVariant = false;
  let sawWeight = false;
  let sawStretch = false;
  let prefixCount = 0;
  let index = 0;
  let token: string;
  let tokenEnd: number;

  for (;;) {
    index = skipCssSpace(value, index);
    if (index >= value.length) return undefined;
    tokenEnd = fontTokenEnd(value, index);
    token = value.slice(index, tokenEnd);
    if (prefixCount >= MAX_FONT_PREFIX_TOKENS) break;

    if (token === "normal") {
      // 어느 슬롯이든 채운다. 굵기·기울임은 바꾸지 않는다.
    } else if (token === "italic") {
      if (sawStyle) return undefined;
      sawStyle = true;
      italic = true;
    } else if (token === "oblique") {
      if (sawStyle) return undefined;
      sawStyle = true;
      italic = true;
      // 각도가 따라오면 함께 읽는다.
      const angleStart = skipCssSpace(value, tokenEnd);
      const angleEnd = fontTokenEnd(value, angleStart);
      const angle = readNumeric(value.slice(angleStart, angleEnd));
      if (angle !== undefined && ANGLE_UNITS.has(angle.unit)) {
        tokenEnd = angleEnd;
      }
    } else if (token === "small-caps") {
      if (sawVariant) return undefined;
      sawVariant = true;
    } else if (FONT_STRETCH_KEYWORDS.has(token)) {
      if (sawStretch) return undefined;
      sawStretch = true;
    } else {
      const slotWeight = readFontWeightToken(token);
      if (slotWeight === undefined) break;
      if (sawWeight) return undefined;
      sawWeight = true;
      weight = slotWeight;
    }
    prefixCount += 1;
    index = tokenEnd;
  }

  // 여기서 token은 크기 후보다.
  if (!isFontSizeToken(token)) return undefined;
  index = skipCssSpace(value, tokenEnd);
  if (value[index] === "/") {
    index = skipCssSpace(value, index + 1);
    const lineEnd = fontTokenEnd(value, index);
    if (!isLineHeightToken(value.slice(index, lineEnd))) return undefined;
    index = lineEnd;
  }
  if (!isFamilyList(value, index)) return undefined;
  return { weight, fontStyle: italic ? "italic" : "normal" };
};

// font 줄임 앞 슬롯의 굵기 토큰이다. bold·bolder·lighter와 1–1000 숫자다.
// 굵기 토큰이 아니면 undefined다.
const readFontWeightToken = (token: string): InlineFontWeight | undefined => {
  if (token === "bold" || token === "bolder") return "bold";
  if (token === "lighter") return "light";
  const numeric = readNumeric(token);
  if (
    numeric === undefined ||
    numeric.unit !== "" ||
    numeric.value < MIN_FONT_WEIGHT ||
    numeric.value > MAX_FONT_WEIGHT
  ) {
    return undefined;
  }
  return classifyWeightNumber(numeric.value);
};

// 인라인 서식 칸이 받는 속성이다.
const INLINE_MARK_PROPERTIES: ReadonlySet<string> = new Set([
  "font-weight",
  "font-style",
  "font",
  "text-decoration",
  "text-decoration-line",
]);

// 모든 속성에서 쓰는 CSS 전역 키워드다.
const CSS_WIDE_KEYWORDS: ReadonlySet<string> = new Set([
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);

// 한 값 안에서 괄호 밖 공백까지가 토큰이다. 괄호 안은 공백이 있어도 한
// 토큰이다(`rgb(0, 0, 0)`). `from`은 공백이 아닌 글자를 가리켜야 하고, 토큰은
// 글자를 하나 이상 먹는다. `fontTokenEnd`와 달리 `/`에서 끊지 않는다.
const valueTokenEnd = (value: string, from: number): number => {
  let depth = 0;
  let index = from;
  while (index < value.length) {
    const character = value[index] as string;
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      if (depth > 0) depth -= 1;
    } else if (depth === 0 && isCssSpace(character)) {
      break;
    }
    index += 1;
  }
  return index;
};

// font-style 값 하나(소문자·양끝 공백 걷음)를 읽는다. 값 전체가 문법이다:
// 한 낱말(normal·italic·oblique·전역 키워드)이거나 `oblique <angle>`이다.
// 각도는 deg·grad·rad·turn 단위가 있어야 하고 범위는 검사하지 않는다.
// 무효면 undefined다. 유효하면 분류를 담아 돌려준다. revert·revert-layer는
// 유효하지만 기울임을 정하지 않아 분류가 undefined다.
type FontStyleRead = { fontStyle: InlineFontStyle | undefined };

const readFontStyle = (value: string): FontStyleRead | undefined => {
  let index = skipCssSpace(value, 0);
  if (index >= value.length) return undefined;
  let end = valueTokenEnd(value, index);
  const keyword = value.slice(index, end);
  index = skipCssSpace(value, end);

  if (keyword === "oblique") {
    if (index < value.length) {
      end = valueTokenEnd(value, index);
      const angle = readNumeric(value.slice(index, end));
      if (angle === undefined || !ANGLE_UNITS.has(angle.unit)) return undefined;
      index = skipCssSpace(value, end);
    }
    return index >= value.length ? { fontStyle: "italic" } : undefined;
  }
  if (index < value.length) return undefined;

  if (keyword === "italic") return { fontStyle: "italic" };
  if (keyword === "normal" || keyword === "initial") {
    return { fontStyle: "normal" };
  }
  if (keyword === "inherit" || keyword === "unset") {
    return { fontStyle: "inherit" };
  }
  if (keyword === "revert" || keyword === "revert-layer") {
    return { fontStyle: undefined };
  }
  return undefined;
};

// 장식 칸의 값이다. 밑줄과 취소선만 마크가 된다.
type LineMarks = { underline: boolean; strike: boolean };

const NO_LINE_MARKS: LineMarks = { underline: false, strike: false };

// line 낱말이다. 값은 본 낱말을 기록하는 비트다.
const LINE_WORD_BITS: ReadonlyMap<string, number> = new Map([
  ["underline", 1],
  ["overline", 2],
  ["line-through", 4],
  ["blink", 8],
]);
const UNDERLINE_BIT = 1;
const LINE_THROUGH_BIT = 4;

// 다른 line 낱말과 못 섞이는 line 값이다.
const LINE_ALONE_KEYWORDS: ReadonlySet<string> = new Set([
  "none",
  "spelling-error",
  "grammar-error",
]);

const DECORATION_STYLES: ReadonlySet<string> = new Set([
  "solid",
  "double",
  "dotted",
  "dashed",
  "wavy",
]);

// thickness 토큰이다: auto·from-font·길이·백분율. 음수도 받는다. 단위 없는
// 숫자는 0만 길이다.
const isThicknessToken = (token: string): boolean => {
  if (token === "auto" || token === "from-font") return true;
  const numeric = readNumeric(token);
  if (numeric === undefined) return false;
  if (numeric.unit === "") return numeric.value === 0;
  return numeric.unit === "%" || isCssLengthUnit(numeric.unit);
};

// text-decoration 줄임 또는 text-decoration-line 값 하나(소문자)를 읽는다.
// 무효면 undefined다. 문법(Chromium 실측)은 이렇다.
// - 전역 키워드는 값 하나로만 쓴다.
// - line 낱말(underline·overline·line-through·blink)은 각각 한 번이고 서로
//   붙어 있어야 한다. none·spelling-error·grammar-error는 다른 line 값과 못
//   섞인다.
// - 줄임은 style 낱말·thickness·색을 종류마다 한 번 더 받는다. 순서는 자유다.
//   line 값이 없으면 line이 none이라 장식을 끈다.
// 무효를 찾는 즉시 끝낸다. 토큰마다 일정한 일만 하므로 값 길이에 선형이다.
const readDecoration = (
  value: string,
  lineOnly: boolean,
): LineMarks | undefined => {
  let seenWords = 0;
  // 0은 line 낱말을 아직 못 봤고, 1은 line 낱말이 이어지는 중이고, 2는 line
  // 값이 끝났다는 표시다.
  let lineState = 0;
  let sawAlone = false;
  let sawStyle = false;
  let sawThickness = false;
  let sawColor = false;
  let tokenCount = 0;
  let index = skipCssSpace(value, 0);

  while (index < value.length) {
    const end = valueTokenEnd(value, index);
    const token = value.slice(index, end);
    tokenCount += 1;
    index = skipCssSpace(value, end);

    if (CSS_WIDE_KEYWORDS.has(token)) {
      return tokenCount === 1 && index >= value.length
        ? NO_LINE_MARKS
        : undefined;
    }

    const wordBit = LINE_WORD_BITS.get(token);
    if (wordBit !== undefined) {
      if (lineState === 2 || sawAlone || (seenWords & wordBit) !== 0) {
        return undefined;
      }
      seenWords |= wordBit;
      lineState = 1;
      continue;
    }
    if (lineState === 1) lineState = 2;

    if (LINE_ALONE_KEYWORDS.has(token)) {
      if (lineState !== 0 || sawAlone) return undefined;
      sawAlone = true;
    } else if (lineOnly) {
      return undefined;
    } else if (DECORATION_STYLES.has(token)) {
      if (sawStyle) return undefined;
      sawStyle = true;
    } else if (isThicknessToken(token)) {
      if (sawThickness) return undefined;
      sawThickness = true;
    } else if (readCssColor(token).kind !== "invalid") {
      if (sawColor) return undefined;
      sawColor = true;
    } else {
      return undefined;
    }
  }

  if (tokenCount === 0) return undefined;
  return {
    underline: (seenWords & UNDERLINE_BIT) !== 0,
    strike: (seenWords & LINE_THROUGH_BIT) !== 0,
  };
};

// 인라인 서식 하나가 받는 칸이다. 색 칸(ColorSlot)과 같은 규칙이다. 중요도가
// 높은 선언이 칸을 차지하면 일반 선언은 못 덮는다. 같은 중요도끼리는 뒤가
// 이긴다. 무효 선언은 이 함수를 부르지 않아 칸을 건드리지 않는다.
type MarkSlot<T> = { value: T; important: boolean };

const applyMark = <T>(
  slot: MarkSlot<T>,
  value: T,
  important: boolean,
): void => {
  if (slot.important && !important) return;
  slot.value = value;
  slot.important ||= important;
};

// style 속성에서 인라인 서식 마크(굵게·기울임·밑줄·취소선) 판정에 쓰는
// font-weight·font-style·text-decoration(-line)·font 줄임 선언만 읽는다.
// 색 경로(parseStyleDeclarations)와 같은 흐름이다: `splitDeclarations`로
// 선언을 자르고(따옴표·괄호 안 `;`, `/* */` 주석, 닫히지 않은 따옴표·괄호),
// `readDeclaration`으로 이름과 값을 나누고, `splitImportant`로 중요도를
// 떼어 칸에 쓴다. 입력 길이에 선형이다.
// - 칸은 굵기·기울임·장식 셋이다. font 줄임은 굵기·기울임 칸에, text-decoration
//   과 text-decoration-line은 장식 칸 하나를 함께 쓴다.
// - `!important` 선언이 칸을 차지하면 일반 선언은 못 덮는다. 같은 중요도끼리는
//   뒤가 이긴다.
// - 문법에 맞지 않는 선언은 통째로 버린다. 칸을 건드리지 않는다(`!important`가
//   붙어도 같다). revert·revert-layer는 유효 값이라 칸을 비운다.
// - font-style과 text-decoration(-line)은 값 전체를 문법대로 읽는다. 각도
//   범위, `calc()` 같은 수식과 `var()`, css-color.ts가 못 읽는 색(`color-mix()`
//   ·`lab()`·`color()`·`windowtext` 같은 시스템 색)은 읽지 않아 무효로 본다.
//   그 값이 든 `text-decoration`은 밑줄·취소선도 켜지 못한다.
// - 속성 이름 앞의 쓰레기 글자는 무시한다(`readDeclaration`의 규칙).
// 값이 꺼짐(normal, none)이어도 이 함수는 그 선언만 반영한다 — 바깥 요소가
// 만든 마크를 지우는 일은 없다. 끄는 값은 normal로 돌려주고 겹치기는 호출부가
// 정한다.
export const parseInlineStyleMarks = (style: string): InlineStyleMarks => {
  const weight: MarkSlot<InlineFontWeight | undefined> = {
    value: undefined,
    important: false,
  };
  const fontStyle: MarkSlot<InlineFontStyle | undefined> = {
    value: undefined,
    important: false,
  };
  const decoration: MarkSlot<LineMarks> = {
    value: NO_LINE_MARKS,
    important: false,
  };

  for (const declaration of splitDeclarations(style)) {
    const read = readDeclaration(declaration);
    if (read === undefined) continue;
    const property = read.property.toLowerCase();
    if (!INLINE_MARK_PROPERTIES.has(property)) continue;
    const split = splitImportant(read.rawValue);
    const value = split.value.trim().toLowerCase();
    const important = split.important;

    if (property === "font-weight") {
      const classified = classifyFontWeight(value);
      if (classified !== undefined) applyMark(weight, classified, important);
    } else if (property === "font") {
      // 줄임은 굵기와 기울임을 함께 정한다. 굵기 토큰이 없으면 normal로 덮는다.
      const shorthand = parseFontShorthand(value);
      if (shorthand !== undefined) {
        applyMark(weight, shorthand.weight, important);
        applyMark(fontStyle, shorthand.fontStyle, important);
      }
    } else if (property === "font-style") {
      const styleRead = readFontStyle(value);
      if (styleRead !== undefined) {
        applyMark(fontStyle, styleRead.fontStyle, important);
      }
    } else {
      const lines = readDecoration(value, property === "text-decoration-line");
      if (lines !== undefined) applyMark(decoration, lines, important);
    }
  }

  return {
    fontWeight: weight.value,
    fontStyle: fontStyle.value,
    underline: decoration.value.underline,
    strike: decoration.value.strike,
  };
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

// style 속성의 `white-space` 선언을 소스 공백 모드로 읽는다(Issue #361).
// 색 경로·`parseInlineStyleMarks`와 같은 흐름이다. `splitDeclarations`로
// 선언을 자르고(따옴표·괄호 안 `;`, `/* */` 주석, 이스케이프된 `;`),
// `readDeclaration`으로 이름과 값을 나누고, `splitImportant`로 중요도를 떼어
// 칸에 쓴다. 입력 길이에 선형이다.
// - 칸 규칙은 `applyMark`와 같다. `!important` 선언이 칸을 차지하면 일반
//   선언은 못 덮는다. 같은 중요도끼리는 뒤가 이긴다.
// - 무효 값은 칸을 건드리지 않는다. `!important`가 붙어도 같다.
// - 상속 키워드(inherit·initial·unset·revert·revert-layer)는 유효 값이다.
//   칸을 비운다.
// 칸이 비면 undefined다. 호출부가 부모 모드를 상속한다.
// 한계: 공유 헬퍼의 차이를 그대로 받는다. 아래는 옛 `split(";")` 구현이
// Chromium과 같게 읽던 입력이다.
// - 속성 이름 앞의 쓰레기 글자는 무시한다(`readDeclaration`의 규칙).
//   `x white-space:pre`·`_white-space:pre`·`*white-space:pre`를 preserve로
//   읽는다. `white-space:pre;_white-space:normal`은 normal이다. Chromium은
//   이런 선언을 버린다.
// - 닫히지 않은 따옴표가 개행을 넘는다(#362). 따옴표 없는 `url(` 안의 `'`와
//   `/*`도 따옴표·주석으로 읽는다. 둘 다 뒤 선언을 삼킨다.
export const parseWhiteSpaceMode = (
  style: string,
): WhiteSpaceMode | undefined => {
  const slot: MarkSlot<WhiteSpaceMode | undefined> = {
    value: undefined,
    important: false,
  };

  for (const declaration of splitDeclarations(style)) {
    const read = readDeclaration(declaration);
    if (read === undefined) continue;
    if (read.property.toLowerCase() !== "white-space") continue;
    const split = splitImportant(read.rawValue);
    const value = split.value.trim().toLowerCase();
    if (WHITE_SPACE_RESET_KEYWORDS.has(value)) {
      applyMark(slot, undefined, split.important);
      continue;
    }
    const mode = readWhiteSpaceValue(value);
    if (mode !== undefined) applyMark(slot, mode, split.important);
  }

  return slot.value;
};
