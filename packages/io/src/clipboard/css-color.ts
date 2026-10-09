// CSS 색 값을 읽는다(Issue #333). 브라우저가 그리는 색이 의미다.
//
// 결과는 셋이다.
// - color: 불투명 sRGB 색. 대문자 #RRGGBB다.
// - clear: 브라우저가 이 요소에서 색을 정하지 않는다. 투명·반투명·상속
//   키워드·`currentcolor`다. 호출부가 같은 요소의 앞 선언 값을 지운다.
//   바깥 요소의 색은 건드리지 않는다.
// - invalid: 문법 오류다. 호출부가 선언을 버리고 앞 값을 유지한다.
//
// 읽지 않는 값은 invalid다: lab()·lch()·oklab()·oklch()·color()·
// color-mix()·var()·env()·calc()·상대 색·시스템 색. 모델은 alpha를 담지
// 않으므로 반투명 색은 합성하지 않고 clear로 둔다.
//
// 입력은 주석이 이미 걷힌 값이다(style-declarations.ts가 걷는다). 계측 테스트
// (G-TST-004)가 큰 문자열에 대한 String 메서드 호출 횟수를 세므로, 긴 입력을
// 훑는 곳은 글자를 대괄호로 읽고 `+=`로 쌓는다. 큰 문자열에 slice를 반복해
// 부르지 않는다.

export type CssColorResult =
  { kind: "color"; color: string } | { kind: "clear" } | { kind: "invalid" };

const CLEAR: CssColorResult = { kind: "clear" };
const INVALID: CssColorResult = { kind: "invalid" };

// CSS Color 4 색 이름 148개. 값은 Chromium 계산 색이다.
const NAMED_COLORS: ReadonlyMap<string, string> = new Map([
  ["aliceblue", "#F0F8FF"],
  ["antiquewhite", "#FAEBD7"],
  ["aqua", "#00FFFF"],
  ["aquamarine", "#7FFFD4"],
  ["azure", "#F0FFFF"],
  ["beige", "#F5F5DC"],
  ["bisque", "#FFE4C4"],
  ["black", "#000000"],
  ["blanchedalmond", "#FFEBCD"],
  ["blue", "#0000FF"],
  ["blueviolet", "#8A2BE2"],
  ["brown", "#A52A2A"],
  ["burlywood", "#DEB887"],
  ["cadetblue", "#5F9EA0"],
  ["chartreuse", "#7FFF00"],
  ["chocolate", "#D2691E"],
  ["coral", "#FF7F50"],
  ["cornflowerblue", "#6495ED"],
  ["cornsilk", "#FFF8DC"],
  ["crimson", "#DC143C"],
  ["cyan", "#00FFFF"],
  ["darkblue", "#00008B"],
  ["darkcyan", "#008B8B"],
  ["darkgoldenrod", "#B8860B"],
  ["darkgray", "#A9A9A9"],
  ["darkgreen", "#006400"],
  ["darkgrey", "#A9A9A9"],
  ["darkkhaki", "#BDB76B"],
  ["darkmagenta", "#8B008B"],
  ["darkolivegreen", "#556B2F"],
  ["darkorange", "#FF8C00"],
  ["darkorchid", "#9932CC"],
  ["darkred", "#8B0000"],
  ["darksalmon", "#E9967A"],
  ["darkseagreen", "#8FBC8F"],
  ["darkslateblue", "#483D8B"],
  ["darkslategray", "#2F4F4F"],
  ["darkslategrey", "#2F4F4F"],
  ["darkturquoise", "#00CED1"],
  ["darkviolet", "#9400D3"],
  ["deeppink", "#FF1493"],
  ["deepskyblue", "#00BFFF"],
  ["dimgray", "#696969"],
  ["dimgrey", "#696969"],
  ["dodgerblue", "#1E90FF"],
  ["firebrick", "#B22222"],
  ["floralwhite", "#FFFAF0"],
  ["forestgreen", "#228B22"],
  ["fuchsia", "#FF00FF"],
  ["gainsboro", "#DCDCDC"],
  ["ghostwhite", "#F8F8FF"],
  ["gold", "#FFD700"],
  ["goldenrod", "#DAA520"],
  ["gray", "#808080"],
  ["green", "#008000"],
  ["greenyellow", "#ADFF2F"],
  ["grey", "#808080"],
  ["honeydew", "#F0FFF0"],
  ["hotpink", "#FF69B4"],
  ["indianred", "#CD5C5C"],
  ["indigo", "#4B0082"],
  ["ivory", "#FFFFF0"],
  ["khaki", "#F0E68C"],
  ["lavender", "#E6E6FA"],
  ["lavenderblush", "#FFF0F5"],
  ["lawngreen", "#7CFC00"],
  ["lemonchiffon", "#FFFACD"],
  ["lightblue", "#ADD8E6"],
  ["lightcoral", "#F08080"],
  ["lightcyan", "#E0FFFF"],
  ["lightgoldenrodyellow", "#FAFAD2"],
  ["lightgray", "#D3D3D3"],
  ["lightgreen", "#90EE90"],
  ["lightgrey", "#D3D3D3"],
  ["lightpink", "#FFB6C1"],
  ["lightsalmon", "#FFA07A"],
  ["lightseagreen", "#20B2AA"],
  ["lightskyblue", "#87CEFA"],
  ["lightslategray", "#778899"],
  ["lightslategrey", "#778899"],
  ["lightsteelblue", "#B0C4DE"],
  ["lightyellow", "#FFFFE0"],
  ["lime", "#00FF00"],
  ["limegreen", "#32CD32"],
  ["linen", "#FAF0E6"],
  ["magenta", "#FF00FF"],
  ["maroon", "#800000"],
  ["mediumaquamarine", "#66CDAA"],
  ["mediumblue", "#0000CD"],
  ["mediumorchid", "#BA55D3"],
  ["mediumpurple", "#9370DB"],
  ["mediumseagreen", "#3CB371"],
  ["mediumslateblue", "#7B68EE"],
  ["mediumspringgreen", "#00FA9A"],
  ["mediumturquoise", "#48D1CC"],
  ["mediumvioletred", "#C71585"],
  ["midnightblue", "#191970"],
  ["mintcream", "#F5FFFA"],
  ["mistyrose", "#FFE4E1"],
  ["moccasin", "#FFE4B5"],
  ["navajowhite", "#FFDEAD"],
  ["navy", "#000080"],
  ["oldlace", "#FDF5E6"],
  ["olive", "#808000"],
  ["olivedrab", "#6B8E23"],
  ["orange", "#FFA500"],
  ["orangered", "#FF4500"],
  ["orchid", "#DA70D6"],
  ["palegoldenrod", "#EEE8AA"],
  ["palegreen", "#98FB98"],
  ["paleturquoise", "#AFEEEE"],
  ["palevioletred", "#DB7093"],
  ["papayawhip", "#FFEFD5"],
  ["peachpuff", "#FFDAB9"],
  ["peru", "#CD853F"],
  ["pink", "#FFC0CB"],
  ["plum", "#DDA0DD"],
  ["powderblue", "#B0E0E6"],
  ["purple", "#800080"],
  ["rebeccapurple", "#663399"],
  ["red", "#FF0000"],
  ["rosybrown", "#BC8F8F"],
  ["royalblue", "#4169E1"],
  ["saddlebrown", "#8B4513"],
  ["salmon", "#FA8072"],
  ["sandybrown", "#F4A460"],
  ["seagreen", "#2E8B57"],
  ["seashell", "#FFF5EE"],
  ["sienna", "#A0522D"],
  ["silver", "#C0C0C0"],
  ["skyblue", "#87CEEB"],
  ["slateblue", "#6A5ACD"],
  ["slategray", "#708090"],
  ["slategrey", "#708090"],
  ["snow", "#FFFAFA"],
  ["springgreen", "#00FF7F"],
  ["steelblue", "#4682B4"],
  ["tan", "#D2B48C"],
  ["teal", "#008080"],
  ["thistle", "#D8BFD8"],
  ["tomato", "#FF6347"],
  ["turquoise", "#40E0D0"],
  ["violet", "#EE82EE"],
  ["wheat", "#F5DEB3"],
  ["white", "#FFFFFF"],
  ["whitesmoke", "#F5F5F5"],
  ["yellow", "#FFFF00"],
  ["yellowgreen", "#9ACD32"],
]);

// 모든 속성에서 쓰는 CSS 전역 키워드다. 이 요소에서 색을 정하지 않는다.
const GLOBAL_KEYWORDS: ReadonlySet<string> = new Set([
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);

// CSS 공백이다. JS `trim()`과 달리 NBSP 등은 공백이 아니다.
export const isCssSpace = (character: string): boolean =>
  character === " " ||
  character === "\t" ||
  character === "\n" ||
  character === "\r" ||
  character === "\f";

const isDigit = (character: string | undefined): boolean =>
  character !== undefined && character >= "0" && character <= "9";

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

const toHexByte = (value: number): string =>
  value.toString(16).padStart(2, "0").toUpperCase();

const colorFromBytes = (red: number, green: number, blue: number) =>
  ({
    kind: "color",
    color: `#${toHexByte(red)}${toHexByte(green)}${toHexByte(blue)}`,
  }) satisfies CssColorResult;

// Chromium은 alpha를 8비트로 양자화한다. 0.999는 불투명이고 0.998은
// 254/255다. 불투명이 아니면 clear다.
const isOpaque = (alpha: number): boolean => Math.round(alpha * 255) === 255;

export type Numeric = { value: number; unit: string };

// CSS 숫자 토큰 하나를 읽는다. 단위는 `%` 또는 영문 단위(소문자)다. `1.`과
// `1e+`처럼 토큰이 어긋나면 undefined다. font 줄임 속성(style-declarations.ts)도
// 이 함수로 크기·굵기 토큰을 읽는다.
export const readNumeric = (token: string): Numeric | undefined => {
  const length = token.length;
  let index = 0;
  if (token[index] === "+" || token[index] === "-") index += 1;

  const integerStart = index;
  while (index < length && isDigit(token[index])) index += 1;
  let digits = index - integerStart;

  if (token[index] === ".") {
    const fractionStart = index + 1;
    let fractionEnd = fractionStart;
    while (fractionEnd < length && isDigit(token[fractionEnd])) {
      fractionEnd += 1;
    }
    if (fractionEnd === fractionStart) return undefined;
    digits += fractionEnd - fractionStart;
    index = fractionEnd;
  }
  if (digits === 0) return undefined;

  if (token[index] === "e" || token[index] === "E") {
    let exponentEnd = index + 1;
    if (token[exponentEnd] === "+" || token[exponentEnd] === "-") {
      exponentEnd += 1;
    }
    const exponentStart = exponentEnd;
    while (exponentEnd < length && isDigit(token[exponentEnd])) {
      exponentEnd += 1;
    }
    if (exponentEnd > exponentStart) index = exponentEnd;
  }

  const value = Number(token.slice(0, index));
  const unit = token.slice(index);
  if (unit === "" || unit === "%") return { value, unit };
  for (let position = 0; position < unit.length; position += 1) {
    const character = unit[position] as string;
    const isLetter =
      (character >= "a" && character <= "z") ||
      (character >= "A" && character <= "Z");
    if (!isLetter) return undefined;
  }
  return { value, unit: unit.toLowerCase() };
};

// 색 함수 인자 하나다. `none`은 숫자 0으로 읽는다.
const readComponent = (
  token: string,
  allowNone: boolean,
): Numeric | undefined => {
  if (allowNone && token.toLowerCase() === "none") {
    return { value: 0, unit: "" };
  }
  return readNumeric(token);
};

const readAlpha = (
  token: string | undefined,
  allowNone: boolean,
): number | undefined => {
  if (token === undefined) return 1;
  const component = readComponent(token, allowNone);
  if (component === undefined) return undefined;
  if (component.unit === "") return clamp(component.value, 0, 1);
  if (component.unit === "%") return clamp(component.value / 100, 0, 1);
  return undefined;
};

type FunctionArguments = {
  channels: string[];
  alpha: string | undefined;
  // 쉼표 문법이면 true, 공백(`/ alpha`) 문법이면 false다.
  comma: boolean;
};

const hasSeparatorCharacter = (piece: string): boolean => {
  for (let index = 0; index < piece.length; index += 1) {
    const character = piece[index] as string;
    if (character === "/" || isCssSpace(character)) return true;
  }
  return false;
};

// 괄호 안 인자를 쉼표 문법과 공백 문법으로 나눈다. 둘을 섞으면 undefined다.
const splitFunctionArguments = (
  inner: string,
): FunctionArguments | undefined => {
  if (inner.indexOf(",") >= 0) {
    const pieces = inner.split(",");
    if (pieces.length !== 3 && pieces.length !== 4) return undefined;
    const trimmed: string[] = [];
    for (const piece of pieces) {
      const text = piece.trim();
      if (text === "" || hasSeparatorCharacter(text)) return undefined;
      trimmed.push(text);
    }
    return {
      channels: [
        trimmed[0] as string,
        trimmed[1] as string,
        trimmed[2] as string,
      ],
      alpha: trimmed[3],
      comma: true,
    };
  }

  // 공백 문법이다. `/`는 공백 없이 붙어도 별도 토큰이다. 토큰이 다섯을
  // 넘으면 더 읽지 않는다.
  const tokens: string[] = [];
  let token = "";
  for (let index = 0; index < inner.length; index += 1) {
    const character = inner[index] as string;
    if (isCssSpace(character) || character === "/") {
      if (token !== "") {
        tokens.push(token);
        token = "";
      }
      if (character === "/") tokens.push("/");
      if (tokens.length > 5) return undefined;
    } else {
      token += character;
    }
  }
  if (token !== "") tokens.push(token);

  if (tokens.length === 3) {
    return {
      channels: [tokens[0] as string, tokens[1] as string, tokens[2] as string],
      alpha: undefined,
      comma: false,
    };
  }
  if (tokens.length === 5 && tokens[3] === "/") {
    return {
      channels: [tokens[0] as string, tokens[1] as string, tokens[2] as string],
      alpha: tokens[4],
      comma: false,
    };
  }
  return undefined;
};

const channelFromNumber = (value: number): number =>
  Math.round(clamp(value, 0, 255));

const channelFromPercent = (percent: number): number =>
  Math.round((clamp(percent, 0, 100) * 255) / 100);

const readRgb = (parts: FunctionArguments): CssColorResult => {
  const components = parts.channels.map((channel) =>
    readComponent(channel, !parts.comma),
  );
  const [first, second, third] = components;
  if (first === undefined || second === undefined || third === undefined) {
    return INVALID;
  }
  const alpha = readAlpha(parts.alpha, !parts.comma);
  if (alpha === undefined) return INVALID;

  for (const component of components) {
    if (component?.unit !== "" && component?.unit !== "%") return INVALID;
  }
  // 쉼표 문법은 세 채널이 모두 숫자이거나 모두 %여야 한다.
  if (
    parts.comma &&
    !(first.unit === second.unit && second.unit === third.unit)
  ) {
    return INVALID;
  }
  if (!isOpaque(alpha)) return CLEAR;

  const toChannel = (component: Numeric): number =>
    component.unit === "%"
      ? channelFromPercent(component.value)
      : channelFromNumber(component.value);
  return colorFromBytes(toChannel(first), toChannel(second), toChannel(third));
};

const HUE_UNIT_TO_DEGREES: ReadonlyMap<string, number> = new Map([
  ["", 1],
  ["deg", 1],
  ["grad", 0.9],
  ["rad", 180 / Math.PI],
  ["turn", 360],
]);

// 색상을 [0, 360) 도로 맞춘다. 유한하지 않으면 0이다(Chromium도 빨강).
const hueToDegrees = (hue: Numeric): number | undefined => {
  const scale = HUE_UNIT_TO_DEGREES.get(hue.unit);
  if (scale === undefined) return undefined;
  const degrees = hue.value * scale;
  if (!Number.isFinite(degrees)) return 0;
  return ((degrees % 360) + 360) % 360;
};

// s·l·w·b 값을 0–1로 맞춘다. 공백 문법의 숫자는 퍼센트 값으로 본다.
const toUnitRange = (component: Numeric): number =>
  clamp(component.value, 0, 100) / 100;

// 위로 자르지 않는 퍼센트 값을 0 이상 유한한 비율로 맞춘다. 무한대는 NaN 색을
// 만들므로 큰 유한값으로 바꾼다.
const MAX_UNCLAMPED_PERCENT = 1e9;
const toUnclampedRatio = (value: number): number =>
  Math.min(Math.max(0, value), MAX_UNCLAMPED_PERCENT) / 100;

// hue는 [0, 360) 도, saturation·lightness는 0–1이다. 결과도 0–1이다.
// CSS Color 4의 HSL→sRGB 식이다.
const hslToRgb = (
  hue: number,
  saturation: number,
  lightness: number,
): [number, number, number] => {
  const spread = saturation * Math.min(lightness, 1 - lightness);
  const channel = (offset: number): number => {
    const position = (offset + hue / 30) % 12;
    return (
      lightness - spread * Math.max(-1, Math.min(position - 3, 9 - position, 1))
    );
  };
  return [channel(0), channel(8), channel(4)];
};

// 0.5 경계는 올림으로 둔다. 부동소수 오차로 25.5가 25.4999999가 되어 내려가는
// 것을 막는다. Chromium은 정확한 0.5 경계 일부를 내림으로 읽어, hsl()·hwb()
// 일부 값이 채널 하나에서 1 크다(한계).
const TIE_EPSILON = 1e-6;

const colorFromUnitRgb = (
  red: number,
  green: number,
  blue: number,
): CssColorResult =>
  colorFromBytes(
    channelFromNumber(red * 255 + TIE_EPSILON),
    channelFromNumber(green * 255 + TIE_EPSILON),
    channelFromNumber(blue * 255 + TIE_EPSILON),
  );

const readHsl = (parts: FunctionArguments): CssColorResult => {
  const hue = readComponent(parts.channels[0] as string, !parts.comma);
  const saturation = readComponent(parts.channels[1] as string, !parts.comma);
  const lightness = readComponent(parts.channels[2] as string, !parts.comma);
  if (
    hue === undefined ||
    saturation === undefined ||
    lightness === undefined
  ) {
    return INVALID;
  }
  const alpha = readAlpha(parts.alpha, !parts.comma);
  if (alpha === undefined) return INVALID;

  const degrees = hueToDegrees(hue);
  if (degrees === undefined) return INVALID;
  for (const component of [saturation, lightness]) {
    // 쉼표 문법은 s·l이 반드시 %다. 공백 문법은 숫자도 허용한다.
    if (component.unit === "%") continue;
    if (parts.comma || component.unit !== "") return INVALID;
  }
  if (!isOpaque(alpha)) return CLEAR;

  // 채도와 명도는 쉼표 문법에서만 100%로 자른다. 공백 문법은 위로 자르지 않는다.
  // 채도가 100%를 넘으면 명도를 자른 결과가 달라지므로 명도도 같은 규칙이다.
  const [red, green, blue] = hslToRgb(
    degrees,
    parts.comma ? toUnitRange(saturation) : toUnclampedRatio(saturation.value),
    parts.comma ? toUnitRange(lightness) : toUnclampedRatio(lightness.value),
  );
  return colorFromUnitRgb(red, green, blue);
};

// hwb()는 공백 문법만 있다.
const readHwb = (parts: FunctionArguments): CssColorResult => {
  if (parts.comma) return INVALID;
  const hue = readComponent(parts.channels[0] as string, true);
  const whiteness = readComponent(parts.channels[1] as string, true);
  const blackness = readComponent(parts.channels[2] as string, true);
  if (hue === undefined || whiteness === undefined || blackness === undefined) {
    return INVALID;
  }
  const alpha = readAlpha(parts.alpha, true);
  if (alpha === undefined) return INVALID;

  const degrees = hueToDegrees(hue);
  if (degrees === undefined) return INVALID;
  for (const component of [whiteness, blackness]) {
    if (component.unit !== "" && component.unit !== "%") return INVALID;
  }
  if (!isOpaque(alpha)) return CLEAR;

  // w·b는 위로 자르지 않는다. 합이 1 이상이면 w/(w+b) 비율로 회색을 만든다.
  const white = toUnclampedRatio(whiteness.value);
  const black = toUnclampedRatio(blackness.value);
  if (white + black >= 1) {
    const gray = white / (white + black);
    return colorFromUnitRgb(gray, gray, gray);
  }
  const [red, green, blue] = hslToRgb(degrees, 1, 0.5);
  const scale = 1 - white - black;
  return colorFromUnitRgb(
    red * scale + white,
    green * scale + white,
    blue * scale + white,
  );
};

const hexDigitValue = (character: string): number => {
  if (character >= "0" && character <= "9") return character.charCodeAt(0) - 48;
  if (character >= "a" && character <= "f") return character.charCodeAt(0) - 87;
  if (character >= "A" && character <= "F") return character.charCodeAt(0) - 55;
  return -1;
};

// `#rgb`·`#rgba`·`#rrggbb`·`#rrggbbaa`를 읽는다. 5·7자리는 무효다.
const readHex = (value: string): CssColorResult => {
  const digitCount = value.length - 1;
  if (
    digitCount !== 3 &&
    digitCount !== 4 &&
    digitCount !== 6 &&
    digitCount !== 8
  ) {
    return INVALID;
  }
  const digits: number[] = [];
  for (let index = 1; index < value.length; index += 1) {
    const digit = hexDigitValue(value[index] as string);
    if (digit < 0) return INVALID;
    digits.push(digit);
  }

  const short = digitCount <= 4;
  const byteAt = (position: number): number =>
    short
      ? (digits[position] as number) * 17
      : (digits[position * 2] as number) * 16 +
        (digits[position * 2 + 1] as number);
  if (digitCount === 4 || digitCount === 8) {
    if (byteAt(3) !== 255) return CLEAR;
  }
  return colorFromBytes(byteAt(0), byteAt(1), byteAt(2));
};

const readColorFunction = (lower: string): CssColorResult => {
  const open = lower.indexOf("(");
  const name = lower.slice(0, open);
  if (
    name !== "rgb" &&
    name !== "rgba" &&
    name !== "hsl" &&
    name !== "hsla" &&
    name !== "hwb"
  ) {
    return INVALID;
  }
  const inner = lower.slice(open + 1, lower.length - 1);
  // 중첩 함수(calc() 등)는 읽지 않는다.
  if (inner.indexOf("(") >= 0 || inner.indexOf(")") >= 0) return INVALID;
  const parts = splitFunctionArguments(inner);
  if (parts === undefined) return INVALID;
  if (name === "rgb" || name === "rgba") return readRgb(parts);
  if (name === "hwb") return readHwb(parts);
  return readHsl(parts);
};

// 전역 키워드를 뺀 색 값 하나를 읽는다. `background` 줄임 속성의 색 토큰도
// 이 함수로 읽는다.
const readColorValue = (value: string): CssColorResult => {
  if (value === "") return INVALID;
  if (value[0] === "#") return readHex(value);

  const lower = value.toLowerCase();
  if (lower === "transparent" || lower === "currentcolor") return CLEAR;
  const named = NAMED_COLORS.get(lower);
  if (named !== undefined) return { kind: "color", color: named };
  if (lower.endsWith(")")) return readColorFunction(lower);
  return INVALID;
};

// `color`·`background-color` 값 하나를 읽는다. 앞뒤 공백은 걷는다.
export const readCssColor = (value: string): CssColorResult => {
  const trimmed = value.trim();
  if (GLOBAL_KEYWORDS.has(trimmed.toLowerCase())) return CLEAR;
  return readColorValue(trimmed);
};

// 옛 HTML 색 속성(`<font color>`)의 값을 읽는다(Issue #334). 읽는 값은 CSS 색
// 이름, `#rgb`, `#rrggbb`, `#` 없는 6자리 hex다. 앞뒤 ASCII 공백은 걷는다.
// Chromium은 쓰레기 값·`#` 없는 3자리·5자리·함수 표기도 옛 규칙으로 색을
// 만들어 그리지만 읽지 않는다(의도한 불일치). 읽지 않는 값은 undefined다.
export const readLegacyAttributeColor = (value: string): string | undefined => {
  let start = 0;
  let end = value.length;
  while (start < end && isCssSpace(value[start] as string)) start += 1;
  while (end > start && isCssSpace(value[end - 1] as string)) end -= 1;
  const trimmed =
    start === 0 && end === value.length ? value : value.slice(start, end);
  if (trimmed === "") return undefined;

  const named = NAMED_COLORS.get(trimmed.toLowerCase());
  if (named !== undefined) return named;

  const hasHash = trimmed[0] === "#";
  const digitCount = trimmed.length - (hasHash ? 1 : 0);
  if (digitCount === 3 && !hasHash) return undefined;
  if (digitCount !== 3 && digitCount !== 6) return undefined;
  const result = readHex(hasHash ? trimmed : `#${trimmed}`);
  return result.kind === "color" ? result.color : undefined;
};

const BACKGROUND_KEYWORDS: ReadonlySet<string> = new Set([
  "none",
  "repeat",
  "repeat-x",
  "repeat-y",
  "no-repeat",
  "space",
  "round",
  "scroll",
  "fixed",
  "local",
  "border-box",
  "padding-box",
  "content-box",
  "text",
  "left",
  "right",
  "top",
  "bottom",
  "center",
]);

// `/` 뒤(background-size)에서만 쓰는 키워드다.
const BACKGROUND_SIZE_KEYWORDS: ReadonlySet<string> = new Set([
  "cover",
  "contain",
  "auto",
]);

const LENGTH_UNITS: ReadonlySet<string> = new Set([
  "px",
  "em",
  "rem",
  "ex",
  "rex",
  "ch",
  "rch",
  "cap",
  "rcap",
  "ic",
  "ric",
  "lh",
  "rlh",
  "cm",
  "mm",
  "q",
  "in",
  "pt",
  "pc",
  "vw",
  "vh",
  "vi",
  "vb",
  "vmin",
  "vmax",
  "svw",
  "svh",
  "svi",
  "svb",
  "svmin",
  "svmax",
  "lvw",
  "lvh",
  "lvi",
  "lvb",
  "lvmin",
  "lvmax",
  "dvw",
  "dvh",
  "dvi",
  "dvb",
  "dvmin",
  "dvmax",
  "cqw",
  "cqh",
  "cqi",
  "cqb",
  "cqmin",
  "cqmax",
]);

// 최상위 쉼표로 레이어를, 최상위 공백으로 토큰을 나눈다. `/`는 별도 토큰이다.
// 괄호·따옴표 안은 나누지 않고, 함수가 닫히면 토큰이 끝난다
// (`url(x.png)red`는 토큰 둘).
const splitBackgroundLayers = (value: string): string[][] => {
  const layers: string[][] = [[]];
  let token = "";
  let depth = 0;
  let quote = "";

  const flush = (): void => {
    if (token === "") return;
    (layers[layers.length - 1] as string[]).push(token);
    token = "";
  };

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] as string;
    if (quote !== "") {
      token += character;
      if (character === "\\") {
        index += 1;
        token += value[index] ?? "";
      } else if (character === quote) {
        quote = "";
      }
    } else if (character === '"' || character === "'") {
      token += character;
      quote = character;
    } else if (character === "(") {
      token += character;
      depth += 1;
    } else if (character === ")") {
      token += character;
      if (depth > 0) {
        depth -= 1;
        if (depth === 0) flush();
      }
    } else if (depth > 0) {
      token += character;
    } else if (isCssSpace(character)) {
      flush();
    } else if (character === ",") {
      flush();
      layers.push([]);
    } else if (character === "/") {
      flush();
      (layers[layers.length - 1] as string[]).push("/");
    } else {
      token += character;
    }
  }
  flush();
  return layers;
};

// 이미지 토큰이다: url()·image-set()·*-gradient(). 인자는 검증하지 않는다.
const isImageToken = (lower: string): boolean => {
  if (!lower.endsWith(")")) return false;
  const open = lower.indexOf("(");
  if (open <= 0) return false;
  const name = lower.slice(0, open);
  return (
    name === "url" ||
    name === "image-set" ||
    name === "-webkit-image-set" ||
    name.endsWith("-gradient")
  );
};

// 길이 단위 하나인지 본다. 입력은 소문자다.
export const isCssLengthUnit = (unit: string): boolean =>
  LENGTH_UNITS.has(unit);

const isPositionToken = (token: string): boolean => {
  const numeric = readNumeric(token);
  if (numeric === undefined) return false;
  if (numeric.unit === "") return numeric.value === 0;
  return numeric.unit === "%" || LENGTH_UNITS.has(numeric.unit);
};

// `background` 줄임 속성 값을 읽는다. 허용 목록 밖 토큰이 있거나 색 토큰이
// 둘이면 선언 전체가 invalid다. 색 토큰이 없는 유효한 값(`url(x.png)`,
// `none`)은 이 요소의 배경색을 초기화하므로 clear다. 위치 토큰의 순서와
// 개수는 검증하지 않는다(한계).
export const readBackgroundShorthand = (value: string): CssColorResult => {
  const trimmed = value.trim();
  if (GLOBAL_KEYWORDS.has(trimmed.toLowerCase())) return CLEAR;

  const layers = splitBackgroundLayers(trimmed);
  let color: CssColorResult | undefined;

  for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
    const tokens = layers[layerIndex] as string[];
    if (tokens.length === 0) return INVALID;
    let afterSlash = false;
    let layerColor: CssColorResult | undefined;

    for (const token of tokens) {
      if (token === "/") {
        afterSlash = true;
        continue;
      }
      const lower = token.toLowerCase();
      if (BACKGROUND_KEYWORDS.has(lower)) continue;
      if (afterSlash && BACKGROUND_SIZE_KEYWORDS.has(lower)) continue;
      if (isImageToken(lower)) continue;
      if (isPositionToken(token)) continue;

      const tokenColor = readColorValue(token);
      if (tokenColor.kind === "invalid") return INVALID;
      // 색 토큰은 레이어당 하나이고 마지막 레이어에만 둔다.
      if (layerColor !== undefined) return INVALID;
      if (layerIndex !== layers.length - 1) return INVALID;
      layerColor = tokenColor;
    }
    color = layerColor ?? color;
  }

  return color ?? CLEAR;
};
