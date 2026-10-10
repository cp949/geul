// 외부 HTML 요소의 표현(style의 색·서식, 옛 속성, 태그 기본값)을 읽는
// module이다(Issue #342). 이 module 밖은 style 선언과 덤프 표식을 직접 읽지
// 않는다. 표면마다 투영 하나를 쓴다.
// - 인라인 요소: inlineElementPresentation
// - 블록 요소: blockPresentation
// - 표 셀: cellPresentation
//
// 투영은 요소 하나가 정하는 값만 돌려준다. 바깥 요소와의 겹치기는
// inheritInlinePresentation이 정한다. 안쪽 값이 이긴다. 정하지 않은 필드는
// 바깥 값이 비친다.
//
// `data-geul-*` 우선순위는 호출부가 갖는다. 저장 원본의 에코라 요소 표현이
// 아니다.
import type { TextMark } from "@cp949/geul-model";

import { readLegacyAttributeColor } from "../clipboard/css-color.js";
import {
  type ColorState,
  type InlineStyleMarks,
  parseInlineStyleMarks,
  parseStyleColorStates,
  readDumpAuthorDeclarations,
} from "../clipboard/style-declarations.js";
import { propertyString } from "./hast-properties.js";
import type { HtmlElementNode } from "./inline-content.js";

// 굵기·기울임의 상태다. 켬/끔이고, 정하지 않았으면 필드가 없다. 굵기와 기울임은
// 상속 속성이라 안쪽 값이 바깥 값을 덮는다. 끄는 값(`font-weight:400`,
// `font-style:normal`)도 덮는다.
export type Toggle = "on" | "off";

// 글자 서식이다. 밑줄·취소선은 전파라 켬만 있다.
export type TextFormat = {
  bold?: Toggle;
  italic?: Toggle;
  underline?: true;
  strike?: true;
};

export type ElementPresentation = TextFormat & {
  textColor?: string;
  backgroundColor?: string;
};

// 인라인 요소 하나가 글자에 싣는 값이다. presentation은 겹치기 규칙이 있는
// 서식·색이다. marks는 겹치기 규칙이 없는 마크(link, code)다. 바깥이 앞이다.
export type InlinePresentation = {
  presentation: ElementPresentation;
  marks: readonly TextMark[];
};

export const EMPTY_INLINE_PRESENTATION: InlinePresentation = {
  presentation: {},
  marks: [],
};

export type BlockPresentation = {
  // 블록 속성이 되는 색이다. 호출부가 data-geul-*와 합친다.
  colors: { textColor?: string; backgroundColor?: string };
  // 안쪽 텍스트가 받는 서식이다. 블록 속성이 없어 마크가 유일한 표현이다.
  format: TextFormat;
};

type ColorStates = ReturnType<typeof parseStyleColorStates>;

const UNSET_COLOR_STATES: ColorStates = {
  color: { kind: "unset" },
  backgroundColor: { kind: "unset" },
};

// style의 색·배경 선언을 읽는다. 브라우저 복사의 계산 스타일 덤프가 붙은 style은
// 표식 뒤의 마지막 `text-decoration*` 선언(앵커) 뒤의 작성자 선언만 읽는다.
// 덤프 안쪽의 테마 색은 작성자가 쓴 색이 아니다. 앵커가 없으면 색을 읽지 않는다.
// 서식 선언은 시각 값이라 호출부가 style 전체에서 읽는다. 덤프 판정은 이 한
// 곳이다(Issue #334, #338, #341, #342).
const colorStatesOf = (style: string): ColorStates =>
  parseStyleColorStates(readDumpAuthorDeclarations(style) ?? style);

// `mark`의 기본 배경이다. 브라우저가 `mark`에 칠하는 노랑이다.
const MARK_DEFAULT_BACKGROUND = "#FFFF00";

// 선언이 정한 색 상태를 색으로 바꾼다. unset(선언이 없거나 모두 문법 오류)이면
// 요소 기본값(`font`의 color 속성, `mark`의 노랑)을 쓰고, clear(투명·반투명·
// 상속)이면 기본값도 쓰지 않는다.
const resolveColor = (
  state: ColorState | undefined,
  fallback: string | undefined,
): string | undefined => {
  if (state?.kind === "color") return state.color;
  if (state?.kind === "clear") return undefined;
  return fallback;
};

// font-weight 분류가 정하는 굵기 상태다. bold는 켬, normal·light는 끔이다.
// inherit(부모를 따른다)와 other(굵기를 정하지 않는다)는 정하지 않는다.
const boldOfWeight = (
  weight: InlineStyleMarks["fontWeight"],
): Toggle | undefined => {
  if (weight === "bold") return "on";
  if (weight === "normal" || weight === "light") return "off";
  return undefined;
};

const italicOfStyle = (
  fontStyle: InlineStyleMarks["fontStyle"],
): Toggle | undefined => {
  if (fontStyle === "italic") return "on";
  if (fontStyle === "normal") return "off";
  return undefined;
};

// 밑줄·취소선은 전파라 안쪽에서 끄지 못한다. 켬만 읽는다.
const formatFromStyle = (parsed: InlineStyleMarks): TextFormat => {
  const bold = boldOfWeight(parsed.fontWeight);
  const italic = italicOfStyle(parsed.fontStyle);
  return {
    ...(bold === undefined ? {} : { bold }),
    ...(italic === undefined ? {} : { italic }),
    ...(parsed.underline ? { underline: true as const } : {}),
    ...(parsed.strike ? { strike: true as const } : {}),
  };
};

// style 속성 하나에서 색·서식을 읽는다. bold는 font-weight가 bold일 때만 낸다.
// 굵기를 끄는 쪽(b·strong의 normal·light)은 호출부가 fontWeight로 판정한다.
const presentationFromStyle = (
  style: unknown,
  defaults: {
    textColor?: string | undefined;
    backgroundColor?: string | undefined;
  } = {},
): {
  presentation: ElementPresentation;
  parsed: InlineStyleMarks | undefined;
} => {
  const text = typeof style === "string" ? style : undefined;
  const states = text === undefined ? undefined : colorStatesOf(text);
  const presentation: ElementPresentation = {};
  const textColor = resolveColor(states?.color, defaults.textColor);
  if (textColor !== undefined) presentation.textColor = textColor;
  const backgroundColor = resolveColor(
    states?.backgroundColor,
    defaults.backgroundColor,
  );
  if (backgroundColor !== undefined) {
    presentation.backgroundColor = backgroundColor;
  }
  if (text === undefined) return { presentation, parsed: undefined };
  const parsed = parseInlineStyleMarks(text);
  return {
    presentation: { ...presentation, ...formatFromStyle(parsed) },
    parsed,
  };
};

// 태그 자신의 서식은 UA 기본값이라 style이 정한 값이 이긴다.
// `<em style="font-style:normal">`은 기울임이 아니다. style이 정하지 않았거나
// 부모를 따르는 값(inherit·unset)이면 UA 기본값이 남는다. 밑줄·취소선은
// 전파라 `text-decoration:none`이 태그의 서식을 끄지 못한다.
const withTag = (
  node: HtmlElementNode,
  tagFormat: TextFormat,
  marks: readonly TextMark[] = [],
): InlinePresentation => {
  const { presentation } = presentationFromStyle(node.properties.style);
  return {
    presentation: { ...tagFormat, ...presentation },
    marks,
  };
};

const styleOnly = (
  node: HtmlElementNode,
  defaults?: Parameters<typeof presentationFromStyle>[1],
): InlinePresentation => ({
  presentation: presentationFromStyle(node.properties.style, defaults)
    .presentation,
  marks: [],
});

// em·i의 UA 기본값은 기울임이다. style의 font-style이 normal이면 끄고,
// inherit·unset이면 부모를 따른다.
const withEmphasis = (node: HtmlElementNode): InlinePresentation => {
  const { presentation, parsed } = presentationFromStyle(node.properties.style);
  if (parsed?.fontStyle === "inherit") {
    return { presentation, marks: [] };
  }
  return { presentation: { italic: "on", ...presentation }, marks: [] };
};

// 변환기가 마크로 보존하는 인라인 태그다(Issue #342, #337). inlineElementPresentation의
// case와 같은 목록이다. 경고 수집기가 이 목록으로 "지원 경계 안에서 보존되는
// 인라인"을 판정한다. 공유하는 것은 태그 이름뿐이다. 경고 수집기는 raw HAST를
// 읽고 sanitize 허용 목록과 결합하지 않는다(ADR-0003). br은 줄바꿈이라 목록에
// 없다.
export const INLINE_PRESENTATION_TAG_NAMES: ReadonlySet<string> = new Set([
  "a",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "strike",
  "code",
  "span",
  "font",
  "mark",
]);

// 인라인 요소 하나가 정하는 값이다. style을 읽는 요소는 선언 하나에 여러 값
// (color·background-color·font-weight 등)이 동시에 있을 수 있다.
export const inlineElementPresentation = (
  node: HtmlElementNode,
): InlinePresentation => {
  switch (node.tagName) {
    case "a": {
      const href = node.properties.href;
      return typeof href === "string"
        ? { presentation: {}, marks: [{ type: "link", href }] }
        : EMPTY_INLINE_PRESENTATION;
    }
    case "strong":
    case "b": {
      // Google Docs 복사 래퍼 `<b style="font-weight:normal">`는 굵지 않다
      // (Issue #316). 유효하지만 굵지 않은 값(normal·400·lighter·100–599·
      // initial)은 UA 굵기를 덮고, 바깥 굵게도 끈다(Issue #334, #342).
      // 무효한 값은 선언이 무시돼 UA 굵기(bold)가 남고, revert도 UA 굵기다.
      // font 줄임에 굵기가 없으면 normal이다. 색·배경·기울임·밑줄·취소선은
      // 더해 읽는다(Issue #320, #334).
      const { presentation, parsed } = presentationFromStyle(
        node.properties.style,
      );
      // inherit·unset은 UA 굵기를 덮고 부모를 따른다. 끄지도 켜지도 않는다.
      if (parsed?.fontWeight === "inherit") {
        return { presentation, marks: [] };
      }
      return { presentation: { bold: "on", ...presentation }, marks: [] };
    }
    case "em":
    case "i":
      return withEmphasis(node);
    case "u":
      return withTag(node, { underline: true });
    // del·strike는 s와 같은 취소선이다. ins는 읽지 않는다.
    case "s":
    case "del":
    case "strike":
      return withTag(node, { strike: true });
    case "code":
      return withTag(node, {}, [{ type: "code" }]);
    case "span":
      return styleOnly(node);
    case "font": {
      // color 속성은 옛 HTML 글자색이다. style의 color가 이긴다. size·face는
      // 읽지 않는다.
      const attribute = node.properties.color;
      return styleOnly(node, {
        textColor:
          typeof attribute === "string"
            ? readLegacyAttributeColor(attribute)
            : undefined,
      });
    }
    case "mark":
      // 기본 배경은 노랑이다. style 배경이 있으면 그 값이 이기고, 배경이
      // clear(투명·반투명·none)면 기본 노랑도 없다. 기본 글자색(검정)은
      // 읽지 않는다.
      return styleOnly(node, { backgroundColor: MARK_DEFAULT_BACKGROUND });
    default:
      return EMPTY_INLINE_PRESENTATION;
  }
};

// 블록 요소 style의 색과 서식이다. 블록 요소의 기본 굵기(`h1`)는 읽지 않고
// style이 정한 굵기만 읽는다.
export const blockPresentation = (node: HtmlElementNode): BlockPresentation => {
  const style = node.properties.style;
  if (typeof style !== "string") return { colors: {}, format: {} };
  const states = colorStatesOf(style);
  return {
    colors: {
      ...(states.color.kind === "color"
        ? { textColor: states.color.color }
        : {}),
      ...(states.backgroundColor.kind === "color"
        ? { backgroundColor: states.backgroundColor.color }
        : {}),
    },
    format: formatFromStyle(parseInlineStyleMarks(style)),
  };
};

export type CellPresentation = {
  textColor?: string;
  backgroundColor?: string;
  // 셀 안 글자가 받는 서식이다. td·tr·table의 style에서 읽는다.
  format: TextFormat;
};

type CellTier = { states: ColorStates; format: TextFormat };

// 요소마다 style을 한 번만 읽는다. tr·table은 셀마다 다시 오므로 같은 문자열을
// 셀 수만큼 훑지 않게 한다. 키는 파싱한 HAST 요소라 문서가 끝나면 풀린다.
const cellTierByElement = new WeakMap<HtmlElementNode, CellTier>();

const cellTierOf = (element: HtmlElementNode): CellTier => {
  const cached = cellTierByElement.get(element);
  if (cached !== undefined) return cached;
  const style = propertyString(element, "style");
  // 덤프가 붙은 단은 표식 뒤 마지막 text-decoration* 선언 뒤의 작성자 선언만
  // 색으로 읽는다(colorStatesOf). 그 단의 bgcolor 속성은 style 배경 선언이
  // 없으면 읽는다. 서식은 덤프와 무관하게 style 전체에서 읽는다.
  const tier: CellTier =
    style === undefined
      ? { states: UNSET_COLOR_STATES, format: {} }
      : {
          states: colorStatesOf(style),
          format: formatFromStyle(parseInlineStyleMarks(style)),
        };
  cellTierByElement.set(element, tier);
  return tier;
};

const cellStatesOf = (element: HtmlElementNode): ColorStates =>
  cellTierOf(element).states;

const colorOf = (state: ColorState): string | undefined =>
  state.kind === "color" ? state.color : undefined;

// 한 단의 배경이다. style이 색이면 그 값이고, 색을 정하지 않는 값이면 bgcolor도
// 쓰지 않는다. style 선언이 없을 때만 bgcolor를 읽는다.
const cellBackgroundOf = (element: HtmlElementNode): string | undefined => {
  const state = cellStatesOf(element).backgroundColor;
  if (state.kind === "color") return state.color;
  if (state.kind === "clear") return undefined;
  const attribute = propertyString(element, "bgColor");
  return attribute === undefined
    ? undefined
    : readLegacyAttributeColor(attribute);
};

// 표 셀의 글자색·배경색을 td·th → tr → table 순으로 읽는다(Issue #334).
// importHtml(import-html-table.ts)과 클립보드 파서(clipboard-table-parser.ts)가
// 같은 함수를 쓴다. cell은 td·th, row는 그 셀이 시작하는 tr(rowspan 셀도 시작
// 행)이다. 대문자 #RRGGBB만 돌려준다.
//
// 읽는 규칙은 Chromium 계산 스타일 실측이다(2026-10-10).
// - 글자색은 세 단의 style color다. 윗단 값이 없을 때만 아랫단을 쓴다.
// - 배경은 단마다 style이 bgcolor 속성을 이기고, 윗단 값이 없을 때만 아랫단을
//   쓴다.
// - 색을 정하지 않는 값(투명·반투명·상속 키워드)은 그 단에서 색이 정해지지
//   않은 것이다. 아랫단이 비친다. 배경 style이 이 값이면 같은 단의 bgcolor도
//   지운다(작성자 style이 표현 속성을 덮는다). 문법 오류 style은 선언이 없는
//   것과 같아 같은 단의 bgcolor를 쓴다.
// - bgcolor는 색 이름과 hex만 읽는다(readLegacyAttributeColor).
//   Chromium이 쓰레기 값도 색으로 바꿔 그리는 불일치는 의도한 것이다.
// - 덤프가 붙은 단은 표식 뒤 마지막 text-decoration* 선언 뒤의 작성자 선언만
//   style 색·배경으로 읽는다. 그 단의 bgcolor는 읽는다.
// - 서식(굵게·기울임·밑줄·취소선)은 table → tr → td 순으로 겹친다. 굵기·기울임은
//   안쪽 값이 이기고 끄는 값도 덮는다. 밑줄·취소선은 전파라 합집합이다
//   (Issue #342). th의 기본 굵기는 읽지 않는다.
//
// data-geul-* 우선순위는 호출부가 갖는다. importHtml은 원시 문자열을
// 통과시키고 클립보드는 정규형만 쓴다.
export const cellPresentation = (
  cell: HtmlElementNode,
  row: HtmlElementNode,
  table: HtmlElementNode,
): CellPresentation => {
  let textColor: string | undefined;
  let backgroundColor: string | undefined;
  for (const tier of [cell, row, table]) {
    textColor ??= colorOf(cellStatesOf(tier).color);
    backgroundColor ??= cellBackgroundOf(tier);
  }
  const format: TextFormat = {
    ...cellTierOf(table).format,
    ...cellTierOf(row).format,
    ...cellTierOf(cell).format,
  };
  return {
    ...(textColor === undefined ? {} : { textColor }),
    ...(backgroundColor === undefined ? {} : { backgroundColor }),
    format,
  };
};

// 안쪽 요소의 값이 바깥 값을 덮는다. 브라우저는 중첩 span 중 안쪽 색으로
// 그린다. 안쪽이 정하지 않은 필드(inherit·transparent·읽지 못하는 값)는 바깥
// 값을 유지한다. link·code 마크는 쌓이고, 같은 종류가 겹치면 바깥이 남는다
// (canonicalizeTextMarks).
export const inheritInlinePresentation = (
  outer: InlinePresentation,
  own: InlinePresentation,
): InlinePresentation => ({
  presentation: { ...outer.presentation, ...own.presentation },
  marks: [...outer.marks, ...own.marks],
});

// 글자에 붙일 마크로 바꾼다. 순서는 canonicalizeTextMarks가 정한다.
export const inlinePresentationMarks = (
  inline: InlinePresentation,
): TextMark[] => {
  const { presentation } = inline;
  const marks: TextMark[] = [...inline.marks];
  if (presentation.bold === "on") marks.push({ type: "bold" });
  if (presentation.italic === "on") marks.push({ type: "italic" });
  if (presentation.underline === true) marks.push({ type: "underline" });
  if (presentation.strike === true) marks.push({ type: "strike" });
  if (presentation.textColor !== undefined) {
    marks.push({ type: "textColor", color: presentation.textColor });
  }
  if (presentation.backgroundColor !== undefined) {
    marks.push({
      type: "backgroundColor",
      color: presentation.backgroundColor,
    });
  }
  return marks;
};
