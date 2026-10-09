import { isCanonicalCellAlign, isCanonicalCellColor } from "@cp949/geul-model";

export type StyleDeclarations = {
  color?: string;
  backgroundColor?: string;
  align?: "left" | "center" | "right";
};

const DECLARATION_PATTERN = /([a-zA-Z-]+)\s*:\s*([^;]+)/g;

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

  for (const match of style.matchAll(DECLARATION_PATTERN)) {
    const property = match[1]?.trim().toLowerCase();
    const rawValue = match[2]?.trim();
    if (property === undefined || rawValue === undefined) continue;

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
