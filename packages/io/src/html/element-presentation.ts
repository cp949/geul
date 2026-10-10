// 외부 HTML 요소의 표현(style의 색·서식, 옛 속성, 태그 기본값)을 읽는
// module이다(Issue #342). 이 module 밖은 style 선언과 덤프 표식을 직접 읽지
// 않는다. 표면마다 투영 하나를 쓴다.
// - 인라인 요소: inlineElementPresentation
// - 블록 요소: blockPresentation
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
  hasComputedStyleDump,
  parseInlineStyleMarks,
  parseStyleColorStates,
} from "../clipboard/style-declarations.js";
import type { HtmlElementNode } from "./inline-content.js";

// 굵기·기울임의 상태다. 켬/끔이고, 정하지 않았으면 필드가 없다. 지금은 켬만
// 만든다.
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

// 브라우저 복사의 계산 스타일 덤프가 붙은 style의 색·배경은 읽지 않는다.
// 페이지 테마의 계산 값이라 작성자가 쓴 색이 아니다. 서식 선언은 시각 값이라
// 그대로 읽는다. 덤프 판정은 이 한 곳이다(Issue #334, #338, #342).
const colorStatesOf = (style: string): ColorStates =>
  hasComputedStyleDump(style)
    ? UNSET_COLOR_STATES
    : parseStyleColorStates(style);

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

const formatFromStyle = (parsed: InlineStyleMarks): TextFormat => ({
  ...(parsed.fontWeight === "bold" ? { bold: "on" as const } : {}),
  ...(parsed.italic ? { italic: "on" as const } : {}),
  ...(parsed.underline ? { underline: true as const } : {}),
  ...(parsed.strike ? { strike: true as const } : {}),
});

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
  fontWeight: InlineStyleMarks["fontWeight"];
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
  if (text === undefined) return { presentation, fontWeight: undefined };
  const parsed = parseInlineStyleMarks(text);
  return {
    presentation: { ...presentation, ...formatFromStyle(parsed) },
    fontWeight: parsed.fontWeight,
  };
};

// 태그 자신의 서식 뒤에 style에서 읽은 값을 잇는다. 같은 필드가 겹쳐도
// (`<em style="font-style:italic">`) 결과가 같다. 안에서 자기 태그 서식을 끄는
// 값(`<em style="font-style:normal">`)은 읽지 않는다. 태그 서식은 그대로다.
const withTag = (
  node: HtmlElementNode,
  tagFormat: TextFormat,
  marks: readonly TextMark[] = [],
): InlinePresentation => ({
  presentation: {
    ...presentationFromStyle(node.properties.style).presentation,
    ...tagFormat,
  },
  marks,
});

const styleOnly = (
  node: HtmlElementNode,
  defaults?: Parameters<typeof presentationFromStyle>[1],
): InlinePresentation => ({
  presentation: presentationFromStyle(node.properties.style, defaults)
    .presentation,
  marks: [],
});

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
      // inherit·initial·unset)은 UA 굵기를 덮어 굵게가 아니다(Issue #334).
      // 무효한 값은 선언이 무시돼 UA 굵기(bold)가 남고, revert도 UA 굵기다.
      // font 줄임에 굵기가 없으면 normal이다. 색·배경·기울임·밑줄·취소선은
      // 더해 읽는다(Issue #320, #334).
      const { presentation, fontWeight } = presentationFromStyle(
        node.properties.style,
      );
      return {
        presentation:
          fontWeight === "normal" || fontWeight === "light"
            ? presentation
            : { ...presentation, bold: "on" },
        marks: [],
      };
    }
    case "em":
    case "i":
      return withTag(node, { italic: "on" });
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
