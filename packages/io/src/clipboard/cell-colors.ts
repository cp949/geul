// 표 셀의 글자색·배경색을 td·th → tr → table 순으로 읽는다(Issue #334).
// importHtml(import-html-table.ts)과 클립보드 파서(clipboard-table-parser.ts)가
// 같은 함수를 쓴다. `data-geul-*` 우선순위는 호출부가 갖는다 — importHtml은
// 원시 문자열을 통과시키고 클립보드는 정규형만 쓴다. 이 함수는 style과
// bgcolor에서 얻은 대문자 #RRGGBB만 돌려준다.
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
// - 계산 스타일 덤프(`-webkit-text-stroke-width` 선언)가 붙은 단의 style
//   색·배경은 읽지 않는다. 그 단의 bgcolor는 읽는다(hasComputedStyleDump).
import { propertyString } from "../html/hast-properties.js";
import type { HtmlElementNode } from "../html/inline-content.js";
import { readLegacyAttributeColor } from "./css-color.js";
import {
  type ColorState,
  hasComputedStyleDump,
  parseStyleColorStates,
} from "./style-declarations.js";

export type CellColors = { textColor?: string; backgroundColor?: string };

type StyleColorStates = ReturnType<typeof parseStyleColorStates>;

// 요소마다 style을 한 번만 읽는다. tr·table은 셀마다 다시 오므로 같은 문자열을
// 셀 수만큼 훑지 않게 한다. 키는 파싱한 HAST 요소라 문서가 끝나면 풀린다.
const statesByElement = new WeakMap<HtmlElementNode, StyleColorStates>();

const NO_STATES: StyleColorStates = {
  color: { kind: "unset" },
  backgroundColor: { kind: "unset" },
};

const statesOf = (element: HtmlElementNode): StyleColorStates => {
  const cached = statesByElement.get(element);
  if (cached !== undefined) return cached;
  const style = propertyString(element, "style");
  // 계산 스타일 덤프(브라우저 복사)가 붙은 단의 style 색·배경은 테마 색이라
  // 건너뛴다. 그 단의 bgcolor 속성은 style 선언이 없는 것처럼 읽는다.
  const states =
    style === undefined || hasComputedStyleDump(style)
      ? NO_STATES
      : parseStyleColorStates(style);
  statesByElement.set(element, states);
  return states;
};

const colorOf = (state: ColorState): string | undefined =>
  state.kind === "color" ? state.color : undefined;

// 한 단의 배경이다. style이 색이면 그 값이고, 색을 정하지 않는 값이면 bgcolor도
// 쓰지 않는다. style 선언이 없을 때만 bgcolor를 읽는다.
const backgroundOf = (element: HtmlElementNode): string | undefined => {
  const state = statesOf(element).backgroundColor;
  if (state.kind === "color") return state.color;
  if (state.kind === "clear") return undefined;
  const attribute = propertyString(element, "bgColor");
  return attribute === undefined
    ? undefined
    : readLegacyAttributeColor(attribute);
};

// cell은 td·th, row는 그 셀이 시작하는 tr(rowspan 셀도 시작 행)이다.
export const readCellColors = (
  cell: HtmlElementNode,
  row: HtmlElementNode,
  table: HtmlElementNode,
): CellColors => {
  const tiers = [cell, row, table];
  let textColor: string | undefined;
  let backgroundColor: string | undefined;
  for (const tier of tiers) {
    textColor ??= colorOf(statesOf(tier).color);
    backgroundColor ??= backgroundOf(tier);
  }
  return {
    ...(textColor === undefined ? {} : { textColor }),
    ...(backgroundColor === undefined ? {} : { backgroundColor }),
  };
};
