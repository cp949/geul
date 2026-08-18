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
