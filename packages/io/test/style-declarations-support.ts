/**
 * `style-declarations.ts` 판독기를 `style` 문자열로 부르는 테스트 래퍼다
 * (Issue #368).
 *
 * 판독기는 `parseCssDeclarations`가 만든 선언 목록을 받는다. 테스트는 이전처럼
 * `style` 문자열을 넣는다. 래퍼가 선언 목록을 만들어 넘긴다. 이름은 바꾸기 전
 * 판독기 이름을 그대로 쓴다.
 */
import {
  hasComputedStyleDump as hasComputedStyleDumpIn,
  readDumpAuthorDeclarations as readDumpAuthorDeclarationsIn,
  readInlineStyleMarks,
  readStyleColorStates,
  readStyleDeclarations,
  readWhiteSpaceMode,
} from "../src/css/style-declarations.js";
import {
  type CssDeclaration,
  parseCssDeclarations,
} from "../src/css/declarations.js";

export const parseStyleDeclarations = (style: string) =>
  readStyleDeclarations(parseCssDeclarations(style));

export const parseStyleColorStates = (style: string) =>
  readStyleColorStates(parseCssDeclarations(style));

export const parseInlineStyleMarks = (style: string) =>
  readInlineStyleMarks(parseCssDeclarations(style));

export const parseWhiteSpaceMode = (style: string) =>
  readWhiteSpaceMode(parseCssDeclarations(style));

export const hasComputedStyleDump = (style: string): boolean =>
  hasComputedStyleDumpIn(parseCssDeclarations(style));

/** 선언 하나를 `이름:값`(중요하면 ` !important`)으로 쓴다. */
const serialize = ({ name, text, important }: CssDeclaration): string =>
  `${name}:${text}${important ? " !important" : ""}`;

/**
 * 덤프 style의 작성자 선언을 `;`로 이은 문자열로 돌려준다. 표식이 없으면
 * undefined, 작성자 선언이 없으면 빈 문자열이다. 다시 `style`로 넣을 수 있다.
 */
export const readDumpAuthorDeclarations = (
  style: string,
): string | undefined => {
  const author = readDumpAuthorDeclarationsIn(parseCssDeclarations(style));
  return author === undefined ? undefined : author.map(serialize).join(";");
};
