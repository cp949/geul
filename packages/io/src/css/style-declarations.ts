import { isCanonicalCellAlign, isCanonicalCellColor } from "@cp949/geul-model";

import type { CssComponentValue } from "./component-values.js";
import type { CssDeclaration } from "./declarations.js";
import { asciiLowerCase } from "./tokens.js";
import {
  type CssColorResult,
  isCssLengthUnit,
  readBackgroundShorthand,
  readColorComponent,
  readCssColor,
} from "./css-color.js";

export type StyleDeclarations = {
  color?: string;
  backgroundColor?: string;
  align?: "left" | "center" | "right";
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

type AlignSlot = { value: StyleDeclarations["align"]; important: boolean };

type StyleSlots = {
  color: ColorSlot;
  background: ColorSlot;
  align: AlignSlot;
};

// color·background-color·background·text-align 선언을 읽어 칸 상태로 모은다.
const readStyleSlots = (
  declarations: readonly CssDeclaration[],
): StyleSlots => {
  const color: ColorSlot = { result: undefined, important: false };
  const background: ColorSlot = { result: undefined, important: false };
  const align: AlignSlot = { value: undefined, important: false };

  for (const { name, value, text, important } of declarations) {
    if (name === "color") {
      applyColor(color, readCssColor(value), important);
    } else if (name === "background-color") {
      applyColor(background, readCssColor(value), important);
    } else if (name === "background") {
      applyColor(background, readBackgroundShorthand(value), important);
    } else if (name === "text-align") {
      const value = asciiLowerCase(text);
      if (isCanonicalCellAlign(value) && (important || !align.important)) {
        align.value = value;
        align.important ||= important;
      }
    }
  }

  return { color, background, align };
};

// 텍스트 블록용 `text-align` 판독이다. 브라우저 cascade로 이긴 선언의 값을
// ASCII 소문자로 돌려준다. `!important`가 먼저이고 같은 중요도는 뒤가 이긴다.
// - 이긴 값이 허용값인지는 호출부가 model `isCanonicalTextBlockAlign`으로 판정한다.
//   허용값만 후보로 남기면 `center; start`가 `center`로 읽혀 브라우저가 보여 준
//   정렬과 달라진다. 셀 전용 `align`(readStyleDeclarations)은 그 방식이라 바꾸지 않는다.
// - 선언이 없으면 undefined다.
export const readTextAlignWinner = (
  declarations: readonly CssDeclaration[],
): string | undefined => {
  let winner: string | undefined;
  let winnerImportant = false;
  for (const { name, text, important } of declarations) {
    if (name !== "text-align") continue;
    if (winnerImportant && !important) continue;
    winner = asciiLowerCase(text);
    winnerImportant = important;
  }
  return winner;
};

// 선언 목록에서 color/background-color/background/text-align 네 선언만
// 읽는다. 나머지 선언은 조용히 버린다 — 파싱 실패로 전체 붙여넣기를 거절하지
// 않는다. 선언 목록은 `parseCssDeclarations`(css/declarations.ts)가 만든다.
// 색 값은 CSS 문법대로 읽는다(css-color.ts). 우선순위는 브라우저와 같다.
// - `!important` 선언은 일반 선언을 이긴다. 같은 중요도끼리는 뒤가 이긴다.
//   text-align도 같다(Issue #368).
// - 문법 오류 선언은 버리고 앞 값을 유지한다.
// - 투명·반투명·상속 키워드와 색 토큰 없는 `background`는 같은 요소의 앞
//   값을 지운다. 바깥 요소의 색은 건드리지 않는다.
// - `background-color`와 `background`는 같은 배경색 칸을 순서대로 덮는다.
export const readStyleDeclarations = (
  declarations: readonly CssDeclaration[],
): StyleDeclarations => {
  const { color, background, align } = readStyleSlots(declarations);

  const result: StyleDeclarations = {};
  const textColor = slotColor(color);
  if (textColor !== undefined) result.color = textColor;
  const backgroundColor = slotColor(background);
  if (backgroundColor !== undefined) result.backgroundColor = backgroundColor;
  if (align.value !== undefined) result.align = align.value;
  return result;
};

// readStyleDeclarations와 같은 선언을 읽되 clear와 unset을 구분해 돌려준다
// (Issue #334). 패키지 내부용이다. `mark`의 기본 배경과 `font`의 color 속성이
// "선언이 없음"과 "색을 정하지 않는 값"을 다르게 다룬다.
export const readStyleColorStates = (
  declarations: readonly CssDeclaration[],
): { color: ColorState; backgroundColor: ColorState } => {
  const { color, background } = readStyleSlots(declarations);
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
// 꺼낸다. 선언 이름은 이미 소문자다. 주석·따옴표 안의 이름은 선언이 아니다.
const COMPUTED_STYLE_DUMP_PROPERTY = "-webkit-text-stroke-width";

export const hasComputedStyleDump = (
  declarations: readonly CssDeclaration[],
): boolean =>
  declarations.some(({ name }) => name === COMPUTED_STYLE_DUMP_PROPERTY);

// `text-decoration`과 그 longhand(`text-decoration-color` 등)다.
const isTextDecorationProperty = (property: string): boolean =>
  property === "text-decoration" || property.startsWith("text-decoration-");

// 덤프 style에서 작성자가 쓴 선언만 돌려준다(Issue #341).
// - 덤프 표식이 없으면 undefined다. 호출부가 선언 전체를 읽는다.
// - 표식이 있으면 표식 뒤의 마지막 `text-decoration*` 선언(앵커) 뒤의 선언을
//   돌려준다. 앵커가 없거나 그 뒤에 선언이 없으면 빈 목록이다. 표식이 여러
//   개면 마지막 표식 뒤만 센다.
// Chromium 153의 직렬화 순서에 기댄다.
// - 인라인 style이 준 text-decoration은 표식 뒤에 온다. 테마 color·
//   background-color는 표식 앞뒤에 있고 앵커 앞이다. 요소를 통째로 포함한 복사의
//   작성자 값은 앵커 뒤(맨 끝)에 붙는다. 줄임 `text-decoration`도 같다.
// - 스타일시트가 준 text-decoration은 표식 앞(style 첫 선언)에 온다. 앵커로 보지
//   않으므로 이 요소는 색을 읽지 않는다. 인라인 color를 같이 걸어도 같다.
// - 안쪽만 복사한 요소는 작성자 color가 맨 앞에 와서 테마 color와 구분할 수 없다.
// - u·s·del·strike·a는 `text-decoration*` 선언이 없고 작성자 배경이 테마 배경 자리에 온다.
// 이들은 빈 목록이라 색을 읽지 않는다. 다른 Chromium 버전의 순서는 알 수 없다.
export const readDumpAuthorDeclarations = (
  declarations: readonly CssDeclaration[],
): readonly CssDeclaration[] | undefined => {
  let hasDump = false;
  // 표식 뒤 마지막 text-decoration* 선언의 다음 위치다. -1이면 앵커가 없다.
  let authorStart = -1;
  for (let index = 0; index < declarations.length; index += 1) {
    const { name } = declarations[index] as CssDeclaration;
    if (name === COMPUTED_STYLE_DUMP_PROPERTY) {
      hasDump = true;
      // 표식 앞의 text-decoration*은 앵커가 아니다.
      authorStart = -1;
    } else if (isTextDecorationProperty(name)) {
      authorStart = index + 1;
    }
  }
  if (!hasDump) return undefined;
  return authorStart < 0 ? [] : declarations.slice(authorStart);
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

const LIGHT_WEIGHT_KEYWORDS: ReadonlySet<string> = new Set([
  "lighter",
  "initial",
]);

// 숫자 굵기(1–1000)를 분류한다.
const classifyWeightNumber = (weight: number): InlineFontWeight => {
  if (weight === 400) return "normal";
  return weight >= MIN_BOLD_WEIGHT ? "bold" : "light";
};

// 1–1000 숫자 굵기를 분류한다. 범위 밖이면 undefined다.
const readWeightNumber = (weight: number): InlineFontWeight | undefined =>
  weight < MIN_FONT_WEIGHT || weight > MAX_FONT_WEIGHT
    ? undefined
    : classifyWeightNumber(weight);

// font-weight 값(component value 목록)을 읽는다. 값 전체가 문법이다: 키워드 하나
// 또는 1–1000 숫자 하나다. 무효하면 undefined다. 키워드는 이스케이프를 푼
// 이름의 ASCII 소문자로 비교한다.
const readFontWeight = (
  value: readonly CssComponentValue[],
): InlineFontWeight | undefined => {
  const parts = value.filter((node) => node.type !== "whitespace");
  const part = parts[0];
  if (parts.length !== 1 || part === undefined) return undefined;
  if (part.type === "number") return readWeightNumber(part.value);
  if (part.type !== "ident") return undefined;

  const keyword = asciiLowerCase(part.value);
  if (keyword === "bold" || keyword === "bolder") return "bold";
  if (keyword === "normal") return "normal";
  if (LIGHT_WEIGHT_KEYWORDS.has(keyword)) return "light";
  if (keyword === "inherit" || keyword === "unset") return "inherit";
  if (keyword === "revert" || keyword === "revert-layer") return "other";
  return undefined;
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
const RESERVED_FAMILY_KEYWORDS: ReadonlySet<string> = new Set([
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
  "default",
]);

// font 줄임 속성의 앞 슬롯은 네 개다: style·variant·weight·stretch.
const MAX_FONT_PREFIX_TOKENS = 4;

const isSlash = (node: CssComponentValue | undefined): boolean =>
  node?.type === "delim" && node.value === "/";

// calc()·min()·max()·clamp() 함수다. 안쪽은 검증하지 않는다.
const isMathFunction = (node: CssComponentValue): boolean =>
  node.type === "function" && MATH_FUNCTIONS.has(asciiLowerCase(node.name));

// 0 이상의 길이·백분율이다. 단위 없는 숫자는 0만 길이다. `-0`은 0이다.
const isNonNegativeLengthPercentage = (node: CssComponentValue): boolean => {
  if (node.type === "number") return node.value === 0;
  if (node.type === "percentage") return node.value >= 0;
  return (
    node.type === "dimension" &&
    node.value >= 0 &&
    isCssLengthUnit(asciiLowerCase(node.unit))
  );
};

const isFontSize = (node: CssComponentValue): boolean =>
  (node.type === "ident" &&
    FONT_SIZE_KEYWORDS.has(asciiLowerCase(node.value))) ||
  isMathFunction(node) ||
  isNonNegativeLengthPercentage(node);

// `/` 뒤 line-height 값이다: normal·0 이상의 숫자·길이·백분율·수식 함수.
const isLineHeight = (node: CssComponentValue): boolean =>
  (node.type === "ident" && asciiLowerCase(node.value) === "normal") ||
  isMathFunction(node) ||
  (node.type === "number" && node.value >= 0) ||
  isNonNegativeLengthPercentage(node);

// parts[from]부터 끝까지가 쉼표로 나눈 글꼴 목록 문법에 맞는지 본다. 항목은
// 문자열 하나이거나 식별자 하나 이상이다(`a b`). 식별자 사이의 공백·주석은 보지
// 않는다. 빈 항목(앞뒤·연속 쉼표)은 무효다. 식별자 하나뿐인 항목이 예약 낱말이면
// 무효다. 닫히지 않은 문자열은 입력 끝에서 닫힌 문자열 토큰이다.
const isFamilyNameList = (
  parts: readonly CssComponentValue[],
  from: number,
): boolean => {
  let index = from;
  for (;;) {
    const first = parts[index];
    if (first === undefined) return false;

    if (first.type === "string") {
      index += 1;
    } else {
      let identCount = 0;
      let reserved = false;
      for (
        let part = parts[index];
        part?.type === "ident";
        part = parts[index]
      ) {
        reserved = RESERVED_FAMILY_KEYWORDS.has(asciiLowerCase(part.value));
        identCount += 1;
        index += 1;
      }
      if (identCount === 0 || (identCount === 1 && reserved)) return false;
    }

    const next = parts[index];
    if (next === undefined) return true;
    if (next.type !== "comma") return false;
    index += 1;
  }
};

// font 줄임 앞 슬롯의 굵기 낱말이다. bold·bolder·lighter와 1–1000 숫자다. 굵기
// 낱말이 아니면 undefined다.
const readFontWeightPart = (
  part: CssComponentValue,
  word: string | undefined,
): InlineFontWeight | undefined => {
  if (word === "bold" || word === "bolder") return "bold";
  if (word === "lighter") return "light";
  return part.type === "number" ? readWeightNumber(part.value) : undefined;
};

// font 줄임 속성 값(component value 목록)에서 굵기와 기울임을 읽는다.
// 문법: `[style || variant || weight || stretch]? size[/line-height] family`.
// - 앞 슬롯은 최대 네 낱말이고, `normal`은 어느 슬롯이든 채운다. style·
//   variant·weight·stretch는 각각 한 번만 쓴다.
// - 크기가 없거나 글꼴 목록이 문법에 맞지 않으면 선언 전체가 무효라 undefined다.
// - 시스템 글꼴 키워드 하나(`caption` 등)는 normal·normal이다. 전역 키워드
//   하나는 부모를 따르거나(inherit·unset) 정하지 않거나(revert) normal로
//   돌아간다(initial).
// - 굵기 낱말이 없으면 normal이고 기울임 낱말이 없으면 normal이다.
// - 낱말은 component 하나다. 공백과 주석은 낱말을 가르지만 보지 않는다.
// 값을 한 번 걸러 낱말 목록을 만들고 앞에서 한 번 훑는다. 낱말마다 일정한 일만
// 한다.
const readFontShorthand = (
  value: readonly CssComponentValue[],
): FontShorthand | undefined => {
  const parts = value.filter((node) => node.type !== "whitespace");
  const first = parts[0];
  if (first === undefined) return undefined;
  if (parts.length === 1 && first.type === "ident") {
    const keyword = asciiLowerCase(first.value);
    if (keyword === "inherit" || keyword === "unset") {
      return { weight: "inherit", fontStyle: "inherit" };
    }
    if (keyword === "initial") return { weight: "normal", fontStyle: "normal" };
    if (keyword === "revert" || keyword === "revert-layer") {
      return { weight: "other", fontStyle: undefined };
    }
    if (FONT_SYSTEM_KEYWORDS.has(keyword)) {
      return { weight: "normal", fontStyle: "normal" };
    }
  }

  let weight: InlineFontWeight = "normal";
  let italic = false;
  let sawStyle = false;
  let sawVariant = false;
  let sawWeight = false;
  let sawStretch = false;
  let prefixCount = 0;
  let index = 0;
  let part: CssComponentValue;

  for (;;) {
    const current = parts[index];
    if (current === undefined) return undefined;
    part = current;
    if (prefixCount >= MAX_FONT_PREFIX_TOKENS) break;

    const word = part.type === "ident" ? asciiLowerCase(part.value) : undefined;
    if (word === "normal") {
      // 어느 슬롯이든 채운다. 굵기·기울임은 바꾸지 않는다.
    } else if (word === "italic") {
      if (sawStyle) return undefined;
      sawStyle = true;
      italic = true;
    } else if (word === "oblique") {
      if (sawStyle) return undefined;
      sawStyle = true;
      italic = true;
      // 각도가 따라오면 함께 읽는다.
      const angle = parts[index + 1];
      if (
        angle?.type === "dimension" &&
        ANGLE_UNITS.has(asciiLowerCase(angle.unit))
      ) {
        index += 1;
      }
    } else if (word === "small-caps") {
      if (sawVariant) return undefined;
      sawVariant = true;
    } else if (word !== undefined && FONT_STRETCH_KEYWORDS.has(word)) {
      if (sawStretch) return undefined;
      sawStretch = true;
    } else {
      const slotWeight = readFontWeightPart(part, word);
      if (slotWeight === undefined) break;
      if (sawWeight) return undefined;
      sawWeight = true;
      weight = slotWeight;
    }
    prefixCount += 1;
    index += 1;
  }

  // 여기서 part는 크기 후보다.
  if (!isFontSize(part)) return undefined;
  index += 1;
  if (isSlash(parts[index])) {
    const lineHeight = parts[index + 1];
    if (lineHeight === undefined || !isLineHeight(lineHeight)) {
      return undefined;
    }
    index += 2;
  }
  if (!isFamilyNameList(parts, index)) return undefined;
  return { weight, fontStyle: italic ? "italic" : "normal" };
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

// font-style 값(component value 목록)을 읽는다. 값 전체가 문법이다: 한 낱말
// (normal·italic·oblique·전역 키워드)이거나 `oblique <angle>`이다. 각도는
// deg·grad·rad·turn 단위가 있어야 하고 범위는 검사하지 않는다. 무효면
// undefined다. 유효하면 분류를 담아 돌려준다. revert·revert-layer는 유효하지만
// 기울임을 정하지 않아 분류가 undefined다.
type FontStyleRead = { fontStyle: InlineFontStyle | undefined };

const readFontStyle = (
  value: readonly CssComponentValue[],
): FontStyleRead | undefined => {
  const parts = value.filter((node) => node.type !== "whitespace");
  const first = parts[0];
  if (first?.type !== "ident") return undefined;
  const keyword = asciiLowerCase(first.value);

  if (keyword === "oblique") {
    if (parts.length === 1) return { fontStyle: "italic" };
    const angle = parts[1];
    return parts.length === 2 &&
      angle?.type === "dimension" &&
      ANGLE_UNITS.has(asciiLowerCase(angle.unit))
      ? { fontStyle: "italic" }
      : undefined;
  }
  if (parts.length !== 1) return undefined;

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
// 숫자는 0만 길이다. 수식 함수는 호출부가 이름으로 본다.
const isThicknessToken = (node: CssComponentValue): boolean => {
  if (node.type === "ident") {
    const word = asciiLowerCase(node.value);
    return word === "auto" || word === "from-font";
  }
  if (node.type === "number") return node.value === 0;
  if (node.type === "percentage") return true;
  return (
    node.type === "dimension" && isCssLengthUnit(asciiLowerCase(node.unit))
  );
};

// 장식 값이 이름만 보고 받는 토큰의 이름 목록이다(Chromium 153 실측). 함수
// 안쪽 인자는 검증하지 않는다. `MATH_FUNCTIONS`는 font 경로가 써서 건드리지
// 않고 장식 전용 목록을 따로 둔다.
const DECORATION_COLOR_FUNCTIONS: ReadonlySet<string> = new Set([
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "color",
  "color-mix",
  "light-dark",
  "contrast-color",
  "alpha",
]);

const DECORATION_THICKNESS_FUNCTIONS: ReadonlySet<string> = new Set([
  "calc",
  "min",
  "max",
  "clamp",
  "round",
  "mod",
  "rem",
  "abs",
  "hypot",
  "-webkit-calc",
]);

// 색 식별자다. CSS Color 4 시스템 색 19개, 폐기된 시스템 색 23개와 WebKit
// 색 3개다. `currentcolor`·`transparent`·이름 색은 `readColorComponent`가 읽는다.
const DECORATION_COLOR_IDENTIFIERS: ReadonlySet<string> = new Set([
  "accentcolor",
  "accentcolortext",
  "activetext",
  "buttonborder",
  "buttonface",
  "buttontext",
  "canvas",
  "canvastext",
  "field",
  "fieldtext",
  "graytext",
  "highlight",
  "highlighttext",
  "linktext",
  "mark",
  "marktext",
  "selecteditem",
  "selecteditemtext",
  "visitedtext",
  "activeborder",
  "activecaption",
  "appworkspace",
  "background",
  "buttonhighlight",
  "buttonshadow",
  "captiontext",
  "inactiveborder",
  "inactivecaption",
  "inactivecaptiontext",
  "infobackground",
  "infotext",
  "menu",
  "menutext",
  "scrollbar",
  "threeddarkshadow",
  "threedface",
  "threedhighlight",
  "threedlightshadow",
  "threedshadow",
  "window",
  "windowframe",
  "windowtext",
  "-webkit-link",
  "-webkit-activelink",
  "-webkit-focus-ring-color",
]);

// 색 토큰인지 본다. 함수는 이름만 보고 안쪽은 읽지 않는다. 식별자와 `#`
// 토큰은 `readColorComponent`에 묻는다(`#\66 00`은 `#f00`).
const isDecorationColor = (
  node: CssComponentValue,
  word: string | undefined,
  functionName: string | undefined,
): boolean => {
  if (functionName !== undefined) {
    return DECORATION_COLOR_FUNCTIONS.has(functionName);
  }
  if (word !== undefined) {
    return (
      DECORATION_COLOR_IDENTIFIERS.has(word) ||
      readColorComponent(node).kind !== "invalid"
    );
  }
  return node.type === "hash" && readColorComponent(node).kind !== "invalid";
};

// 치환 함수다. 값 어디에 있든 Chromium은 선언을 파싱 단계에서 버리지 않고,
// 치환 결과로 계산 시점에 장식 여부를 정한다.
const SUBSTITUTION_FUNCTIONS: ReadonlySet<string> = new Set([
  "var",
  "env",
  "attr",
  "if",
]);

// 사용자 정의 함수 호출은 이름이 `--`로 시작하고 길이가 3 이상이다. `--(`는
// 호출이 아니다.
const isCustomFunctionName = (name: string): boolean =>
  name.length >= 3 && name[0] === "-" && name[1] === "-";

// 값 안(함수와 블록 안쪽 포함)에 사용자 정의 함수 호출과 치환 함수가 있는지
// 한 번 훑는다. 명시 스택으로 읽어 깊은 중첩에서도 호출 스택이 넘치지 않는다.
// 문자열 토큰은 구조가 아니라 보지 않는다. 함수마다 이름을 한 번 읽는다.
const findNestedFunctions = (
  value: readonly CssComponentValue[],
): { customCall: boolean; substitution: boolean } => {
  let customCall = false;
  let substitution = false;
  const stack: (readonly CssComponentValue[])[] = [value];
  while (stack.length > 0) {
    for (const node of stack.pop() as readonly CssComponentValue[]) {
      if (node.type === "function") {
        const name = asciiLowerCase(node.name);
        if (isCustomFunctionName(name)) customCall = true;
        else if (SUBSTITUTION_FUNCTIONS.has(name)) substitution = true;
        stack.push(node.value);
      } else if (node.type === "block") {
        stack.push(node.value);
      }
    }
  }
  return { customCall, substitution };
};

// text-decoration 줄임 또는 text-decoration-line 값(component value 목록)을
// 읽는다. 무효면 undefined다. 문법(Chromium 실측)은 이렇다.
// - 전역 키워드는 값 하나로만 쓴다.
// - line 낱말(underline·overline·line-through·blink)은 각각 한 번이고 서로
//   붙어 있어야 한다. none·spelling-error·grammar-error는 다른 line 값과 못
//   섞인다.
// - 줄임은 style 낱말·thickness·색을 종류마다 한 번 더 받는다. 순서는 자유다.
//   line 값이 없으면 line이 none이라 장식을 끈다.
// - thickness는 auto·from-font·길이·백분율과 수식 함수(calc·min·max·clamp·
//   round·mod·rem·abs·hypot·-webkit-calc)다. 색은 css-color.ts가 읽는 색,
//   색 함수 14개와 색 식별자 45개(시스템 색 등)다. 함수 토큰은 이름만 보고
//   안쪽은 검증하지 않는다. Chromium은 `calc(1)`·`lab(foo)`를 무효로 보지만
//   여기서는 받는다. 닫히지 않은 함수는 값 끝에서 닫은 것으로 읽는다.
// - 최상위 `{}` 블록이 있으면 안쪽이 무엇이든 무효다. 소괄호·함수·대괄호 안의
//   `{}`는 안쪽 호출·치환 함수를 아래 규칙대로 찾는다.
// - 사용자 정의 함수 호출(`--f(…)`)이 값 어디에 있든 꺼짐이다. 호출 앞뒤
//   토큰의 유효 여부를 보지 않는다.
// - 치환 함수(var·env·attr·if)는 닫혔을 때만 치환 토큰이다. 칸을 차지하지
//   않고 건너뛴다. line 낱말 연속을 끊는다. Chromium은 값 어디에든 인자가
//   정상인 치환 함수가 있으면 선언을 버리지 않고 항상 앞 선언을 덮는다.
//   인자가 비었거나 잘못된 호출은 Chromium이 버리지만 여기서는 이름만 본다.
//   치환 결과를 알 수 없으므로 무효를 만났을 때 값에 치환 함수가 있으면
//   장식을 끈다. 끝까지 유효해도 line 낱말도 단독 낱말도 못 봤다면 line 값을
//   알 수 없어 선언을 버린다.
// 무효를 찾는 즉시 끝낸다. 함수 탐색은 값마다 한 번이고 component마다 일정한
// 일만 하므로 값 길이에 선형이다.
const readDecoration = (
  value: readonly CssComponentValue[],
  lineOnly: boolean,
): LineMarks | undefined => {
  if (value.some((node) => node.type === "block" && node.open === "{")) {
    return undefined;
  }
  const nested = findNestedFunctions(value);
  if (nested.customCall) return NO_LINE_MARKS;

  // 무효를 만났을 때의 결과다. 치환 함수가 있으면 치환 결과를 알 수 없어 꺼짐이다.
  const invalid = (): LineMarks | undefined =>
    nested.substitution ? NO_LINE_MARKS : undefined;

  let seenWords = 0;
  // 0은 line 낱말을 아직 못 봤고, 1은 line 낱말이 이어지는 중이고, 2는 line
  // 값이 끝났다는 표시다.
  let lineState = 0;
  let sawAlone = false;
  let sawStyle = false;
  let sawThickness = false;
  let sawColor = false;
  let sawSubstitution = false;
  const nodes = value.filter((node) => node.type !== "whitespace");

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index] as CssComponentValue;

    // 치환 토큰은 칸을 차지하지 않는다. 전역 키워드와 겹치지 않아 먼저 본다.
    const functionName =
      node.type === "function" ? asciiLowerCase(node.name) : undefined;
    if (
      node.type === "function" &&
      node.closed &&
      SUBSTITUTION_FUNCTIONS.has(functionName as string)
    ) {
      sawSubstitution = true;
      if (lineState === 1) lineState = 2;
      continue;
    }

    const word = node.type === "ident" ? asciiLowerCase(node.value) : undefined;
    if (word !== undefined && CSS_WIDE_KEYWORDS.has(word)) {
      return nodes.length === 1 ? NO_LINE_MARKS : invalid();
    }

    const wordBit = word === undefined ? undefined : LINE_WORD_BITS.get(word);
    if (wordBit !== undefined) {
      if (lineState === 2 || sawAlone || (seenWords & wordBit) !== 0) {
        return invalid();
      }
      seenWords |= wordBit;
      lineState = 1;
      continue;
    }
    if (lineState === 1) lineState = 2;

    if (word !== undefined && LINE_ALONE_KEYWORDS.has(word)) {
      if (lineState !== 0 || sawAlone) return invalid();
      sawAlone = true;
    } else if (lineOnly) {
      return invalid();
    } else if (word !== undefined && DECORATION_STYLES.has(word)) {
      if (sawStyle) return invalid();
      sawStyle = true;
    } else if (
      isThicknessToken(node) ||
      (functionName !== undefined &&
        DECORATION_THICKNESS_FUNCTIONS.has(functionName))
    ) {
      if (sawThickness) return invalid();
      sawThickness = true;
    } else if (isDecorationColor(node, word, functionName)) {
      if (sawColor) return invalid();
      sawColor = true;
    } else {
      return invalid();
    }
  }

  if (nodes.length === 0) return undefined;
  if (sawSubstitution && seenWords === 0 && !sawAlone) return undefined;
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

// 선언 목록에서 인라인 서식 마크(굵게·기울임·밑줄·취소선) 판정에 쓰는
// font-weight·font-style·text-decoration(-line)·font 줄임 선언만 읽는다.
// 색 경로(readStyleDeclarations)와 같은 선언 목록(`parseCssDeclarations`)을
// 받아 칸에 쓴다.
// - 칸은 굵기·기울임·장식 셋이다. font 줄임은 굵기·기울임 칸에, text-decoration
//   과 text-decoration-line은 장식 칸 하나를 함께 쓴다.
// - `!important` 선언이 칸을 차지하면 일반 선언은 못 덮는다. 같은 중요도끼리는
//   뒤가 이긴다.
// - 문법에 맞지 않는 선언은 통째로 버린다. 칸을 건드리지 않는다(`!important`가
//   붙어도 같다). revert·revert-layer는 유효 값이라 칸을 비운다.
// - font-weight·font 줄임·font-style과 text-decoration(-line)은 값 전체를 문법대로
//   읽는다. 값은 component value다. 키워드와 글꼴 이름은 이스케이프를 푼 이름으로
//   읽는다. text-decoration(-line)은 색 함수·수식 함수·시스템 색을 이름만 보고
//   받고 치환 함수(`var()` 등)는 건너뛴다(`readDecoration`). 남은 한계가 있다.
//   - 함수 안쪽 인자를 검증하지 않는다(Chromium은 `calc(1)`을 무효로 본다).
//   - 치환 결과를 추적하지 않는다. `<style>`과 조상의 `--x` 정의를 읽지 않는다.
//   - font 경로의 수식 함수는 `calc`·`min`·`max`·`clamp` 넷뿐이다.
//   - `oblique` 각도 범위를 검사하지 않는다.
//   - 글꼴 목록의 `serif a`처럼 일반 글꼴 키워드와 다른 식별자가 한 항목에 있는
//     값을 유효로 읽는다(Chromium은 무효). font 줄임에 `--f()` 호출이 있으면
//     무효로 읽는다(Chromium은 유효).
// 값이 꺼짐(normal, none)이어도 이 함수는 그 선언만 반영한다 — 바깥 요소가
// 만든 마크를 지우는 일은 없다. 끄는 값은 normal로 돌려주고 겹치기는 호출부가
// 정한다.
export const readInlineStyleMarks = (
  declarations: readonly CssDeclaration[],
): InlineStyleMarks => {
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

  for (const { name: property, value: components, important } of declarations) {
    if (!INLINE_MARK_PROPERTIES.has(property)) continue;

    if (property === "font-weight") {
      const classified = readFontWeight(components);
      if (classified !== undefined) applyMark(weight, classified, important);
    } else if (property === "font") {
      // 줄임은 굵기와 기울임을 함께 정한다. 굵기 토큰이 없으면 normal로 덮는다.
      const shorthand = readFontShorthand(components);
      if (shorthand !== undefined) {
        applyMark(weight, shorthand.weight, important);
        applyMark(fontStyle, shorthand.fontStyle, important);
      }
    } else if (property === "font-style") {
      const styleRead = readFontStyle(components);
      if (styleRead !== undefined) {
        applyMark(fontStyle, styleRead.fontStyle, important);
      }
    } else {
      const lines = readDecoration(
        components,
        property === "text-decoration-line",
      );
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

// 값(component value 목록)의 낱말이다. 낱말은 ident 하나나 둘이고, 이스케이프를
// 푼 이름의 ASCII 소문자다. ident가 아닌 component가 있거나 낱말이 셋 이상이면
// undefined다. 낱말이 셋째에서 끝나므로 값이 길어도 읽기는 상수다.
const readWhiteSpaceWords = (
  value: readonly CssComponentValue[],
): string[] | undefined => {
  const words: string[] = [];
  for (const node of value) {
    if (node.type === "whitespace") continue;
    if (node.type !== "ident" || words.length === 2) return undefined;
    words.push(asciiLowerCase(node.value));
  }
  return words.length === 0 ? undefined : words;
};

// 유효한 낱말이면 모드를, 아니면 undefined를 돌려준다.
const readWhiteSpaceValue = (
  words: readonly string[],
): WhiteSpaceMode | undefined => {
  const [first = "", second] = words;
  if (second === undefined) return WHITE_SPACE_KEYWORDS.get(first);
  if (COLLAPSE_KEYWORDS.has(first) && WRAP_KEYWORDS.has(second)) {
    return WHITE_SPACE_KEYWORDS.get(first);
  }
  if (WRAP_KEYWORDS.has(first) && COLLAPSE_KEYWORDS.has(second)) {
    return WHITE_SPACE_KEYWORDS.get(second);
  }
  return undefined;
};

// 선언 목록의 `white-space` 선언을 소스 공백 모드로 읽는다(Issue #361).
// 색 경로·`readInlineStyleMarks`와 같은 선언 목록을 받아 칸에 쓴다.
// - 칸 규칙은 `applyMark`와 같다. `!important` 선언이 칸을 차지하면 일반
//   선언은 못 덮는다. 같은 중요도끼리는 뒤가 이긴다.
// - 무효 값은 칸을 건드리지 않는다. `!important`가 붙어도 같다.
// - 상속 키워드(inherit·initial·unset·revert·revert-layer)는 유효 값이다.
//   칸을 비운다.
// 칸이 비면 undefined다. 호출부가 부모 모드를 상속한다.
export const readWhiteSpaceMode = (
  declarations: readonly CssDeclaration[],
): WhiteSpaceMode | undefined => {
  const slot: MarkSlot<WhiteSpaceMode | undefined> = {
    value: undefined,
    important: false,
  };

  for (const { name, value, important } of declarations) {
    if (name !== "white-space") continue;
    const words = readWhiteSpaceWords(value);
    if (words === undefined) continue;
    if (
      words.length === 1 &&
      WHITE_SPACE_RESET_KEYWORDS.has(words[0] as string)
    ) {
      applyMark(slot, undefined, important);
      continue;
    }
    const mode = readWhiteSpaceValue(words);
    if (mode !== undefined) applyMark(slot, mode, important);
  }

  return slot.value;
};
