// CSS Syntax Level 3 토크나이저다(CSS 선언 읽기, ADR-0019).
// - 규칙은 명세 §4를 따른다. 명세와 Chromium이 갈리면 Chromium을 따른다.
// - Chromium 차이: U+0080 이상 글자는 모두 이름 글자다. 명세의 좁은 목록
//   (non-ASCII ident code point)이 아니다. Chromium 153 실측:
//   `font-family:a`(U+00A0)`b`가 글꼴 이름 하나다.
// - 주석은 명세상 토큰이 아니다. 선언 값 원문에서 공백 하나로 바꿔야 해서
//   comment 토큰으로 낸다. component value 묶기는 주석을 버린다.
// - 전처리(§3.3)는 사본 없이 읽는 자리에서 한다. CR·FF는 LF, CRLF는 LF 하나,
//   NUL과 짝 없는 surrogate는 U+FFFD다.
// - 입력은 대괄호로만 읽는다. 큰 입력에 String 메서드를 부르지 않는다.
//   복잡도 계측(G-TST-004)이 String 메서드 호출마다 입력 길이를 더하기 때문이다.
//   앞보기는 최대 네 글자다. 그래서 입력 길이에 선형이다.

type TokenPosition = {
  // 입력 원문에서 토큰이 시작하는 위치다.
  start: number;
  // 토큰 다음 글자의 위치다.
  end: number;
  // 전처리한 토큰 원문이다. 이스케이프를 풀지 않는다.
  text: string;
};

type TokenKind =
  | { type: "ident"; value: string }
  | { type: "function"; value: string }
  | { type: "at-keyword"; value: string }
  | { type: "hash"; value: string; id: boolean }
  | { type: "string"; value: string }
  | { type: "bad-string" }
  | { type: "url"; value: string }
  | { type: "bad-url" }
  | { type: "delim"; value: string }
  | { type: "number"; value: number; integer: boolean }
  | { type: "percentage"; value: number }
  | { type: "dimension"; value: number; integer: boolean; unit: string }
  | { type: "whitespace" }
  | { type: "comment" }
  | { type: "CDO" }
  | { type: "CDC" }
  | { type: "colon" }
  | { type: "semicolon" }
  | { type: "comma" }
  | { type: "[" }
  | { type: "]" }
  | { type: "(" }
  | { type: ")" }
  | { type: "{" }
  | { type: "}" };

export type CssToken = TokenPosition & TokenKind;

const REPLACEMENT_CHARACTER = "�";
const MAX_CODE_POINT = 0x10ffff;

const isHighSurrogate = (character: string | undefined): boolean =>
  character !== undefined && character >= "\ud800" && character <= "\udbff";

const isLowSurrogate = (character: string | undefined): boolean =>
  character !== undefined && character >= "\udc00" && character <= "\udfff";

const isDigit = (character: string | undefined): boolean =>
  character !== undefined && character >= "0" && character <= "9";

const isHexDigit = (character: string | undefined): boolean =>
  isDigit(character) ||
  (character !== undefined &&
    ((character >= "a" && character <= "f") ||
      (character >= "A" && character <= "F")));

const isWhitespace = (character: string | undefined): boolean =>
  character === " " || character === "\t" || character === "\n";

const isIdentStart = (character: string | undefined): boolean =>
  character !== undefined &&
  ((character >= "a" && character <= "z") ||
    (character >= "A" && character <= "Z") ||
    character === "_" ||
    character >= "\u0080");

const isIdentCharacter = (character: string | undefined): boolean =>
  isIdentStart(character) || isDigit(character) || character === "-";

const isNonPrintable = (character: string): boolean =>
  character <= "\u0008" ||
  character === "\u000b" ||
  (character >= "\u000e" && character <= "\u001f") ||
  character === "\u007f";

// §4.3.8. 두 번째 글자가 입력 끝이어도 유효하다(이스케이프가 U+FFFD가 된다).
const isValidEscape = (
  first: string | undefined,
  second: string | undefined,
): boolean => first === "\\" && second !== "\n";

// §4.3.9.
const startsIdentSequence = (
  first: string | undefined,
  second: string | undefined,
  third: string | undefined,
): boolean => {
  if (first === "-") {
    return (
      isIdentStart(second) || second === "-" || isValidEscape(second, third)
    );
  }
  if (isIdentStart(first)) return true;
  return isValidEscape(first, second);
};

// §4.3.10.
const startsNumber = (
  first: string | undefined,
  second: string | undefined,
  third: string | undefined,
): boolean => {
  if (first === "+" || first === "-") {
    return isDigit(second) || (second === "." && isDigit(third));
  }
  if (first === ".") return isDigit(second);
  return isDigit(first);
};

// ASCII 글자만 소문자로 바꾼다. CSS 키워드 비교는 ASCII 대소문자 무시다.
// 유니코드 소문자 변환은 `İ` 같은 글자를 두 글자로 바꿔 비교가 어긋난다.
export const asciiLowerCase = (value: string): string => {
  let lower = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] as string;
    lower +=
      character >= "A" && character <= "Z"
        ? String.fromCharCode(character.charCodeAt(0) + 32)
        : character;
  }
  return lower;
};

/**
 * CSS 문자열 하나를 토큰 목록으로 바꾼다. 입력 끝 토큰(EOF)은 내지 않는다.
 * 실패하지 않는다. 문법 오류는 bad-string·bad-url·delim 토큰으로 남는다.
 */
export const tokenizeCss = (input: string): CssToken[] => {
  const length = input.length;
  let position = 0;

  // 원문 위치의 전처리한 글자다. 입력 끝이면 undefined다.
  const characterAt = (index: number): string | undefined => {
    if (index >= length) return undefined;
    const character = input[index] as string;
    if (character === "\r" || character === "\f") return "\n";
    if (character === "\0") return REPLACEMENT_CHARACTER;
    if (isHighSurrogate(character)) {
      return isLowSurrogate(input[index + 1])
        ? character
        : REPLACEMENT_CHARACTER;
    }
    if (isLowSurrogate(character)) {
      return index > 0 && isHighSurrogate(input[index - 1])
        ? character
        : REPLACEMENT_CHARACTER;
    }
    return character;
  };

  // 원문 위치의 다음 글자 위치다. CRLF는 글자 하나다.
  const nextIndex = (index: number): number =>
    input[index] === "\r" && input[index + 1] === "\n" ? index + 2 : index + 1;

  // 지금 위치에서 offset 글자 뒤의 전처리한 글자다.
  const peek = (offset: number): string | undefined => {
    let index = position;
    for (let step = 0; step < offset; step += 1) index = nextIndex(index);
    return characterAt(index);
  };

  const consume = (): string | undefined => {
    if (position >= length) return undefined;
    const character = characterAt(position);
    position = nextIndex(position);
    return character;
  };

  // §4.3.7. 앞의 `\`는 이미 읽었다.
  const consumeEscape = (): string => {
    const first = consume();
    if (first === undefined) return REPLACEMENT_CHARACTER;
    if (!isHexDigit(first)) return first;
    let hex = first;
    while (hex.length < 6 && isHexDigit(peek(0))) hex += consume() as string;
    if (isWhitespace(peek(0))) consume();
    const codePoint = parseInt(hex, 16);
    if (
      codePoint === 0 ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
      codePoint > MAX_CODE_POINT
    ) {
      return REPLACEMENT_CHARACTER;
    }
    return String.fromCodePoint(codePoint);
  };

  // §4.3.11.
  const consumeIdentSequence = (): string => {
    let value = "";
    for (;;) {
      const character = peek(0);
      if (isIdentCharacter(character)) {
        value += consume() as string;
      } else if (isValidEscape(character, peek(1))) {
        consume();
        value += consumeEscape();
      } else {
        return value;
      }
    }
  };

  // §4.3.14. 나쁜 url의 남은 글자를 `)`나 입력 끝까지 버린다.
  const consumeBadUrlRemnants = (): void => {
    for (;;) {
      const character = consume();
      if (character === undefined || character === ")") return;
      if (isValidEscape(character, peek(0))) consumeEscape();
    }
  };

  // §4.3.6. `url(`과 그 뒤 공백 일부는 이미 읽었다.
  const consumeUrl = (): TokenKind => {
    let value = "";
    while (isWhitespace(peek(0))) consume();
    for (;;) {
      const character = consume();
      if (character === undefined || character === ")") {
        return { type: "url", value };
      }
      if (isWhitespace(character)) {
        while (isWhitespace(peek(0))) consume();
        const next = peek(0);
        if (next === undefined || next === ")") {
          consume();
          return { type: "url", value };
        }
        consumeBadUrlRemnants();
        return { type: "bad-url" };
      }
      if (
        character === '"' ||
        character === "'" ||
        character === "(" ||
        isNonPrintable(character)
      ) {
        consumeBadUrlRemnants();
        return { type: "bad-url" };
      }
      if (character === "\\") {
        if (isValidEscape(character, peek(0))) {
          value += consumeEscape();
        } else {
          consumeBadUrlRemnants();
          return { type: "bad-url" };
        }
      } else {
        value += character;
      }
    }
  };

  // §4.3.4.
  const consumeIdentLike = (): TokenKind => {
    const value = consumeIdentSequence();
    if (
      value.length === 3 &&
      asciiLowerCase(value) === "url" &&
      peek(0) === "("
    ) {
      consume();
      while (isWhitespace(peek(0)) && isWhitespace(peek(1))) consume();
      const first = peek(0);
      const second = peek(1);
      const isQuote = (character: string | undefined): boolean =>
        character === '"' || character === "'";
      if (isQuote(first) || (isWhitespace(first) && isQuote(second))) {
        return { type: "function", value };
      }
      return consumeUrl();
    }
    if (peek(0) === "(") {
      consume();
      return { type: "function", value };
    }
    return { type: "ident", value };
  };

  // §4.3.5. 여는 따옴표는 이미 읽었다.
  const consumeString = (ending: string): TokenKind => {
    let value = "";
    for (;;) {
      const character = peek(0);
      if (character === undefined) return { type: "string", value };
      if (character === ending) {
        consume();
        return { type: "string", value };
      }
      // 개행은 읽지 않고 남긴다. 다음 토큰이 공백이 된다.
      if (character === "\n") return { type: "bad-string" };
      if (character === "\\") {
        const next = peek(1);
        consume();
        if (next === undefined) continue;
        if (next === "\n") {
          consume();
          continue;
        }
        value += consumeEscape();
        continue;
      }
      value += consume() as string;
    }
  };

  // §4.3.12.
  const consumeNumber = (): { value: number; integer: boolean } => {
    let representation = "";
    let integer = true;
    const sign = peek(0);
    if (sign === "+" || sign === "-") representation += consume() as string;
    while (isDigit(peek(0))) representation += consume() as string;
    if (peek(0) === "." && isDigit(peek(1))) {
      integer = false;
      representation += consume() as string;
      while (isDigit(peek(0))) representation += consume() as string;
    }
    const exponent = peek(0);
    if (exponent === "e" || exponent === "E") {
      const next = peek(1);
      const hasSign = next === "+" || next === "-";
      if (isDigit(next) || (hasSign && isDigit(peek(2)))) {
        integer = false;
        representation += consume() as string;
        if (hasSign) representation += consume() as string;
        while (isDigit(peek(0))) representation += consume() as string;
      }
    }
    return { value: Number(representation), integer };
  };

  // §4.3.3.
  const consumeNumeric = (): TokenKind => {
    const { value, integer } = consumeNumber();
    if (startsIdentSequence(peek(0), peek(1), peek(2))) {
      return {
        type: "dimension",
        value,
        integer,
        unit: consumeIdentSequence(),
      };
    }
    if (peek(0) === "%") {
      consume();
      return { type: "percentage", value };
    }
    return { type: "number", value, integer };
  };

  const consumeDelim = (): TokenKind => ({
    type: "delim",
    value: consume() as string,
  });

  // §4.3.1. 입력 끝이 아니어야 한다.
  const consumeToken = (): TokenKind => {
    const character = peek(0) as string;

    if (character === "/" && peek(1) === "*") {
      consume();
      consume();
      while (position < length) {
        if (consume() === "*" && peek(0) === "/") {
          consume();
          break;
        }
      }
      return { type: "comment" };
    }
    if (isWhitespace(character)) {
      while (isWhitespace(peek(0))) consume();
      return { type: "whitespace" };
    }
    switch (character) {
      case '"':
      case "'":
        consume();
        return consumeString(character);
      case "#":
        if (isIdentCharacter(peek(1)) || isValidEscape(peek(1), peek(2))) {
          consume();
          const id = startsIdentSequence(peek(0), peek(1), peek(2));
          return { type: "hash", value: consumeIdentSequence(), id };
        }
        return consumeDelim();
      case "(":
      case ")":
      case "[":
      case "]":
      case "{":
      case "}":
        consume();
        return { type: character };
      case ",":
        consume();
        return { type: "comma" };
      case ":":
        consume();
        return { type: "colon" };
      case ";":
        consume();
        return { type: "semicolon" };
      case "+":
      case ".":
        return startsNumber(character, peek(1), peek(2))
          ? consumeNumeric()
          : consumeDelim();
      case "-":
        if (startsNumber(character, peek(1), peek(2))) return consumeNumeric();
        if (peek(1) === "-" && peek(2) === ">") {
          consume();
          consume();
          consume();
          return { type: "CDC" };
        }
        if (startsIdentSequence(character, peek(1), peek(2))) {
          return consumeIdentLike();
        }
        return consumeDelim();
      case "<":
        if (peek(1) === "!" && peek(2) === "-" && peek(3) === "-") {
          consume();
          consume();
          consume();
          consume();
          return { type: "CDO" };
        }
        return consumeDelim();
      case "@":
        if (startsIdentSequence(peek(1), peek(2), peek(3))) {
          consume();
          return { type: "at-keyword", value: consumeIdentSequence() };
        }
        return consumeDelim();
      case "\\":
        return isValidEscape(character, peek(1))
          ? consumeIdentLike()
          : consumeDelim();
      default:
        if (isDigit(character)) return consumeNumeric();
        if (isIdentStart(character)) return consumeIdentLike();
        return consumeDelim();
    }
  };

  const tokens: CssToken[] = [];
  while (position < length) {
    const start = position;
    const kind = consumeToken();
    let text = "";
    for (let index = start; index < position; index = nextIndex(index)) {
      text += characterAt(index) as string;
    }
    tokens.push({ ...kind, start, end: position, text });
  }
  return tokens;
};
