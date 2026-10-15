// text 노드의 값(`value`)을 소스 조각(`raw`)과 글자 단위로 맞춘다(Issue #422).
// remark는 text 값을 소스에서 바꿔 만든다. 그래서 둘을 통째로 비교할 수 없다.
// - 줄마다 끼는 컨테이너 접두사(`> `, 목록 들여쓰기)는 값에 없다.
// - 줄머리·줄끝 공백은 파서가 지운다.
// - `\X` 이스케이프와 문자 참조(`&amp;`)는 값에서 풀린다.
// 결과는 마스크 문자열이다.
// - 길이가 `value`와 같다.
// - 소스에 글자 그대로 있던 글자는 그대로 둔다.
// - 이스케이프나 문자 참조에서 온 글자는 표식(U+E000)으로 바꾼다.
// - 표식은 `!`, `[`, `]`, `\n`이 아니다. 마스크 위에서 구조 문자를 찾으면
//   이스케이프된 `!`, `]`가 구조로 읽히지 않는다.
// - 소스에 U+E000이 있어도 구조 문자가 아니므로 표식과 구별할 필요가 없다.
// 정렬 규칙(`raw` -> `value`):
// - 같은 글자: 글자 그대로. 마스크에 유지한다.
// - `\` 다음이 ASCII 구두점이고 값 글자와 같다: 이스케이프. 표식 한 자리다.
// - `&...;` 모양: 문자 참조. 표식 1~2 코드포인트 자리다.
//   - 숫자형은 파서와 같은 규칙으로 풀어 값과 같을 때만 후보다.
//     유효하지 않은 코드포인트는 파서가 U+FFFD로 바꾼다.
//   - 이름형은 사전 없이 1~2 코드포인트로 가정한다. HTML 사양의 최대가 2다.
//   - 알려지지 않은 이름(`&foo;`)은 글자 그대로도 후보다.
//   - 뒤 글자가 맞는 후보를 고른다. 안 맞으면 되돌린다.
// - 값의 `\n`은 소스 줄바꿈이거나 문자 참조(`&#10;`, `&NewLine;`)다. 참조면 표식 자리다.
// - 값의 `\n` 직전: 소스의 공백·탭을 건너뛴다(줄끝 공백).
// - 값의 `\n` 직후: 소스의 공백·탭·`>`를 건너뛴다(컨테이너 접두사, 줄머리 공백).
//   값의 글자 `>`는 `\>`나 `&gt;`로만 소스에 온다. 둘 다 `>`로 시작하지 않는다.
// - 그 밖은 정렬 불능이다. 소스나 값이 남아도 정렬 불능이다. `undefined`를 낸다.
// 구현 메모:
// - 갈래는 `&` 한 곳뿐이다. 되돌림은 명시적 스택이다. 재귀를 쓰지 않는다.
// - 갈래 상태 (소스 위치, 값 위치)는 한 번만 탐색한다. 실패한 상태를 다시 보지 않는다.
// - 그래도 어긋난 갈래가 끝까지 이어지면 탐색이 입력 길이의 제곱에 가까워진다.
//   (예: 두 코드포인트 참조 `&NotEqualTilde;`만 수만 번 이은 입력)
//   그래서 걸음 수 예산을 둔다. 넘으면 정렬 불능으로 본다.
// - 마스크는 걸어온 길의 모든 자리를 다시 쓴다. 되돌린 갈래의 표식이 남지 않는다.

/** 소스에 글자 그대로 없던 자리를 나타내는 표식. */
export const SOURCE_ALIGNMENT_MARKER = String.fromCharCode(0xe000);

const CHARACTER_REFERENCE_PATTERN =
  /&(?:(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7})|([A-Za-z][A-Za-z0-9]{1,31}));/y;

/** 소스·값 길이 한 단위당 허용 걸음 수. 정상 입력의 한 줄 걷기와 국소 되돌림을 넉넉히 덮는다. */
const STEP_BUDGET_PER_UNIT = 8;

const ASCII_PUNCTUATION = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

const isAsciiPunctuation = (char: string): boolean =>
  char !== "" && ASCII_PUNCTUATION.includes(char);

/** `value`의 `index`에서 시작하는 코드포인트가 차지하는 UTF-16 단위 수. */
const codePointLength = (value: string, index: number): number => {
  const high = value.charCodeAt(index);
  if (high >= 0xd800 && high <= 0xdbff && index + 1 < value.length) {
    const low = value.charCodeAt(index + 1);
    if (low >= 0xdc00 && low <= 0xdfff) return 2;
  }
  return 1;
};

/** micromark-util-decode-numeric-character-reference와 같은 규칙으로 숫자 참조를 푼다. */
const decodeNumericReference = (digits: string): string => {
  const hex = digits.charAt(1) === "x" || digits.charAt(1) === "X";
  const code = Number.parseInt(digits.slice(hex ? 2 : 1), hex ? 16 : 10);
  if (
    code < 9 ||
    code === 11 ||
    (code > 13 && code < 32) ||
    (code > 126 && code < 160) ||
    (code > 55295 && code < 57344) ||
    (code > 64975 && code < 65008) ||
    (code & 65535) === 65535 ||
    (code & 65535) === 65534 ||
    code > 1114111
  ) {
    return "\uFFFD";
  }
  return String.fromCodePoint(code);
};

type ReferenceCandidates = {
  /** 소스에서 참조 표기가 차지하는 길이. 참조가 아니면 0이다. */
  rawLength: number;
  /** 참조가 먹을 수 있는 값 길이 후보. 짧은 쪽부터다. */
  lengths: number[];
};

const referenceCandidates = (
  raw: string,
  rawIndex: number,
  value: string,
  valueIndex: number,
): ReferenceCandidates => {
  CHARACTER_REFERENCE_PATTERN.lastIndex = rawIndex;
  const match = CHARACTER_REFERENCE_PATTERN.exec(raw);
  if (match === null) return { rawLength: 0, lengths: [] };
  if (match[1] !== undefined) {
    // 숫자형은 풀린 값이 value와 같을 때만 후보다.
    const decoded = decodeNumericReference(match[1]);
    const matches = value.startsWith(decoded, valueIndex);
    return {
      rawLength: match[0].length,
      lengths: matches ? [decoded.length] : [],
    };
  }
  const first = codePointLength(value, valueIndex);
  const lengths = [first];
  if (valueIndex + first < value.length) {
    lengths.push(first + codePointLength(value, valueIndex + first));
  }
  return { rawLength: match[0].length, lengths };
};

type Branch = { rawIndex: number; valueIndex: number; option: number };

const skipWhile = (raw: string, from: number, chars: string): number => {
  let index = from;
  while (index < raw.length && chars.includes(raw.charAt(index))) index += 1;
  return index;
};

export const alignTextToSource = (
  value: string,
  raw: string,
): string | undefined => {
  const mask = value.split("");
  const branches: Branch[] = [];
  const explored = new Set<number>();
  const stride = value.length + 1;
  let rawIndex = 0;
  let valueIndex = 0;
  let option = 0;
  let budget = STEP_BUDGET_PER_UNIT * (raw.length + value.length) + 64;

  for (;;) {
    budget -= 1;
    if (budget < 0) return undefined;
    let failed = false;

    if (valueIndex === value.length) {
      if (rawIndex === raw.length) return mask.join("");
      failed = true;
    } else if (rawIndex >= raw.length) {
      failed = true;
    } else {
      const valueChar = value.charAt(valueIndex);
      const rawChar = raw.charAt(rawIndex);

      // 값의 `\n`은 소스 줄바꿈이거나 문자 참조(`&#10;`, `&NewLine;`)다.
      const lineEnd =
        valueChar === "\n" ? skipWhile(raw, rawIndex, " \t") : rawIndex;
      if (valueChar === "\n" && raw.charAt(lineEnd) === "\n") {
        rawIndex = skipWhile(raw, lineEnd + 1, " \t>");
        mask[valueIndex] = valueChar;
        valueIndex += 1;
        option = 0;
      } else if (
        rawChar === "\\" &&
        isAsciiPunctuation(raw.charAt(rawIndex + 1)) &&
        raw.charAt(rawIndex + 1) === valueChar
      ) {
        mask[valueIndex] = SOURCE_ALIGNMENT_MARKER;
        rawIndex += 2;
        valueIndex += 1;
        option = 0;
      } else if (rawChar === "&") {
        const stateKey = rawIndex * stride + valueIndex;
        if (option === 0 && explored.has(stateKey)) {
          failed = true;
        } else {
          explored.add(stateKey);
          const { rawLength, lengths } = referenceCandidates(
            raw,
            rawIndex,
            value,
            valueIndex,
          );
          // 마지막 후보는 글자 그대로다. `&`가 값에 그대로 있을 때만 성립한다.
          const total = lengths.length + (valueChar === "&" ? 1 : 0);
          if (option >= total) {
            failed = true;
          } else {
            if (option + 1 < total) {
              branches.push({ rawIndex, valueIndex, option: option + 1 });
            }
            const length = lengths[option];
            if (length === undefined) {
              mask[valueIndex] = valueChar;
              rawIndex += 1;
              valueIndex += 1;
            } else {
              for (let k = 0; k < length; k += 1) {
                mask[valueIndex + k] = SOURCE_ALIGNMENT_MARKER;
              }
              rawIndex += rawLength;
              valueIndex += length;
            }
            option = 0;
          }
        }
      } else if (rawChar === valueChar) {
        mask[valueIndex] = valueChar;
        rawIndex += 1;
        valueIndex += 1;
        option = 0;
      } else {
        failed = true;
      }
    }

    if (failed) {
      const branch = branches.pop();
      if (branch === undefined) return undefined;
      rawIndex = branch.rawIndex;
      valueIndex = branch.valueIndex;
      option = branch.option;
    }
  }
};
