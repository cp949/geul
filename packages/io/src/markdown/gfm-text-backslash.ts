import type { Options } from "remark-stringify";

// text 직렬화 핸들러다. 라이브러리 핸들러 결과 끝의 `\`+글자에서 `\`를 하나 더한다.
//
// 라이브러리가 `\`를 같이 처리하지 않는 이유:
// - mdast-util-to-markdown 2.2.0의 `containerPhrasing`은 구분자(`**`·`_`·`~~`) 옆 글자를
//   문자 참조로 바꾼다. 예: `a` -> `&#x61;`.
// - 이때 바꾸는 것은 글자 하나뿐이다. 그 앞의 `\`는 그대로 남는다.
// - `\a`는 이스케이프가 아니라 글자 그대로다. 그런데 `a`가 바뀌면 `\&#x61;`가 된다.
// - 파서는 `\&`를 이스케이프된 `&`로 읽는다. 참조가 글자 `&#x61;`로 남는다.
// - 바깥 글자(구분자 앞 text의 끝)와 안쪽 끝 글자(mark 안 text의 끝)가 같은 원인이다.
//
// `\\`가 항상 안전한 이유:
// - 파서는 `\\`를 `\` 하나로 읽는다.
// - 라이브러리가 뒤 글자를 바꾸든 안 바꾸든 `\\` 뒤는 이스케이프 없는 자리다.
// - `\\a`는 `\a`로, `\\&#x61;`는 `\a`로 읽힌다. 두 경우 모두 같다.
//
// 보정 규칙:
// - `state.safe` 결과 끝이 `\`가 홀수 개 + 한 글자이고, 그 글자가 ASCII 구두점이 아니면 `\`를 더한다.
// - 안전한 결과는 `\`가 이미 이스케이프된 상태다. 텍스트 `\\a`의 결과는 `\\\a`(3개)다.
// - 홀수 개는 마지막 `\`가 홀로 이스케이프 없이 남았다는 뜻이다.
// - 짝수 개는 이미 쌍을 이뤘으므로 건드리지 않는다.
// - 마지막 글자가 ASCII 구두점이면 라이브러리가 바꾸지 않는다. `\`+구두점은 이미 이스케이프다.
// - 마지막 글자가 서로게이트 쌍(이모지)이어도 `u` 플래그로 한 코드 포인트를 잡는다.
//
// `info.after` 조건을 둔 이유:
// - 첫 글자가 `*`·`_`·`~`일 때만 보정한다. 라이브러리가 글자를 바꾸는 자리는 구분자 옆뿐이다.
// - 항상 보정하면 `x\a` 같은 평범한 끝도 `x\\a`로 바뀐다. 기존 출력이 바뀐다.
// - `info.after`는 구분자 sibling이면 그 `peek`의 첫 글자다(strike는 `~`).
// - mark 안 마지막 text이면 구분자 시퀀스의 글자다.
// - 라이브러리가 실제로 글자를 바꾸는지는 이 핸들러가 알 수 없다. 바꾸지 않는 자리에서도 보정한다.
//   예: `\a**b**`는 `\\a**b**`가 된다. 읽기 결과는 같다. 퍼저에서 변경의 대부분이 이런 자리였다.
//
// strike 옆 `_` 이스케이프(Issue #403):
// - 라이브러리 `util/safe.js`의 intraword `_` 예외 정규식은 `/[*_]/`다. `~`가 빠져 있다.
// - 이 예외는 구분자 옆 글자가 문자 참조로 바뀔 수 있어 intraword로 치지 않는다는 뜻이다.
// - 앞쪽: strike 뒤 평문의 첫 글자가 문자 참조로 바뀌면(`&#x61;`) 둘째 글자 `_`가 이스케이프되지 않는다.
//   - `~~)~~&#x61;_b.**_(_**`에서 `;_b`의 `_`가 여는 구분자로 읽힌다.
// - 뒤쪽: strike 앞 평문의 마지막 글자가 문자 참조로 바뀌면 끝에서 둘째 글자 `_`가 이스케이프되지 않는다.
//   - strike가 italic 안쪽에 있어야 한다. 앞에 닫히지 않은 `_` 여는 자리가 필요하기 때문이다.
//   - `**_xa_&#x62;~~\~~~_**`에서 `a_&`의 `_`가 닫는 구분자로 읽혀 italic 범위가 어긋난다.
// - `info.before`·`info.after`가 `~`이면 `*`로 바꿔 `state.safe`에 넘긴다. 라이브러리의 기존 예외를 `~`에도 태운다.
// - `unsafe` 패턴 중 `~`·`*`를 구분하는 `before`·`after` 패턴은 없다. 치환은 이들에 영향이 없다.
//   - 라이브러리 기본 패턴은 `[\r\n]`·`\]`·`\d+`를 본다.
//   - remark-gfm autolink literal 패턴은 `[+\-.\w]`·`[Ww]`·`[ps]`를 본다.
// - 첫·끝 글자가 문자 참조로 안 바뀌는 `~~a~~b_c`도 `b\_c`로 나간다. 재가져오기는 같다.
//
// astral 글자 옆 `_` 이스케이프(Issue #414):
// - 위 intraword `_` 예외는 `position - 1 === offset`(앞쪽)과 `sequenceEnd === end - 1`(뒤쪽)로 판정한다.
// - 두 인덱스가 UTF-16 코드 유닛이다. astral 글자(U+10000 이상)는 2유닛이다.
// - astral 글자가 text의 첫·끝에 오면 예외 판정을 비껴가 `_`가 이스케이프되지 않는다.
//   - `~~)~~&#x1D41A;_b.**_(_**`에서 `;_b`의 `_`가 여는 구분자로 읽힌다. 재가져오기에서 글자와 mark가 달라진다.
//   - 거울 방향도 같다. `**_xa_&#x1D41B;~~\~~~_**`에서 `a_&`의 `_`가 닫는 구분자로 읽힌다.
// - `state.safe`에 넘기는 값의 astral 글자를 BMP 사설 영역 글자 U+E000으로 바꾼다.
//   - 결과에서 U+E000을 원래 astral 글자로 순서대로 되돌린다. 글자는 바뀌지 않는다.
//   - U+E000은 micromark `classifyCharacter`에서 서로게이트 코드 유닛과 같다. 구두점도 공백도 아니다.
//   - `safe`의 판정이 BMP 글자와 같아진다. 예외가 맞게 적용돼 `_`가 `\_`로 나간다.
//   - 치환은 `state.safe` 호출 안에서만 한다. 되돌린 뒤에 위 `\` 보정을 적용한다.
// - 한계: 입력에 U+E000이 있으면 치환을 건너뛴다.
//   - 되돌릴 때 원래 U+E000과 치환한 글자를 구분하지 못하기 때문이다.
//   - 이 text는 #414가 남는다. U+E000과 구분자 옆 astral 뒤 `_`가 겹치는 글은 드물어 받아들였다.
//
// #414 조사 입력 공간(G-PRC-002):
// - 공통: 수정 전(9944688e)과 수정 후를 비교했다. 판정은 strict 내보내기 뒤 재가져온 글자·mark가 원본과 같은지다.
//   인접 같은 종류는 제외한다. 호스트 p는 문단이다. 수정 전에 맞던 입력이 수정 후 깨지는 경우는 아래 모든 공간에서 0건이다.
//   mark 약어는 N(mark 없음), B(bold), I(italic), X(bold·italic), S(strike), C(code)다. 4개를 병렬로 돌려 약 370초 걸렸다.
// - 전수: 런 수 1~4개다. 런마다 아래 글자 집합의 원소 정확히 하나와 mark 종류 하나를 고른다. 모든 조합을 센다.
//   | 호스트 | 최대 런 수 | 글자 | mark 종류 | 건수 | 실패 전→후 | 출력 변경 |
//   | p | 4 | `ab` `.a` `a.` `a_` `한` `😀` | N B I X | 148,200 | 160→0 | 4,117 |
//   | p | 4 | `a` `.` `_` `😀` `!` | N B I X | 72,320 | 48→0 | 2,275 |
//   | p | 4 | `.` `a` `😀` | N B I X S계 4종 C계 4종 | 1,334,160 | 222→0 | 42,633 |
//   | p | 4 | `𝐚` `😀` `a` `_` `.` | N B I X | 72,320 | 84→0 | 3,362 |
//   S계는 B·I·X에 strike를 더한 4종, C계는 code를 더한 4종이다. 마지막 공간이 구분자 옆 astral의 앞쪽·뒤쪽을 모두 덮는다.
// - 무작위: 수정 전후 각 20만 건 × 시드 2개(1, 2)다. 약 100초 걸렸다. 호스트는 문단 75%, 표 셀 25%다.
//   런 글자는 집합에서 1~2개를 이은 것이다. 글자는 `a` `.` `_` `!` `😀` `한` `ab_😀` `a.` `𝐚`다.
//   mark 종류는 N B I X S BS IS XS C BC IC XC L BL IL XL(L은 link) 16종이다.
//   - 샌드위치 편향 75%: 60% 확률로 mark 종류 하나를 앞에 두고(런 0–1개), `I X I`를 1~3번 반복한다. 반복 안 각 자리는 15% 확률로 16종 중 아무 종류가 된다. 런은 3~10개다.
//   - 균등 25%: 런 2~10개이고 종류는 16종에서 고른다.
//   - 인접 같은 종류는 건너뛴다. 시드는 선형 합동 생성기(곱 1664525, 더 1013904223)에 1, 2를 넣었다.
//   - 실패: 수정 전 10,229건·10,243건이 수정 후 0건·0건이다. 퇴행 0건이다.
//   - #416이 남긴 가드 창 밖 astral 퇴행(27·28건)과 7런 `I X I` 연쇄도 같이 해소됐다.
// - 출력이 바뀌는 입력은 구분자 옆 astral 글자 뒤·앞 `_`가 이스케이프되는 입력이다. 샌드위치 가드 제거로 끌어올림이 늘어난 입력도 있다.
//
// 본문 출처: mdast-util-to-markdown@2.2.0 `handle/text.js`. `state.safe` 호출을 옮겼다.
// 달라진 점은 `before`·`after` 치환(#403)과 astral 글자 치환(#414) 둘이다.
// io의 직접 의존이 아니라 import하지 않았다.
//
// 라이브러리 업그레이드 시 확인할 것:
// - 새 버전이 글자를 바꿀 때 앞 `\`도 같이 처리하면 이 파일을 지운다.
// - `markdown-backslash-char-reference.test.ts`가 이 파일 없이 통과하는지 본다.
// - 라이브러리 `text` 핸들러 본문이 바뀌었으면 이 복사본을 맞춘다.
// - 새 버전의 intraword `_` 예외가 `~`를 포함하면 `~`->`*` 치환(before·after 둘 다)을 지운다.
// - `markdown-strike-char-reference-underscore.test.ts`가 치환 없이 통과하는지 본다.
// - 새 버전의 `safe`가 코드 포인트 단위로 판정하면 astral 치환을 지운다.
// - `markdown-astral-underscore.test.ts`가 치환 없이 통과하는지 본다.
//
// 연결: remark-stringify의 `handlers`는 확장 핸들러보다 뒤에 적용된다.
// `use` 순서와 무관하게 이 핸들러가 라이브러리 것을 덮어쓴다.

type Handle = NonNullable<NonNullable<Options["handlers"]>["text"]>;

// 구분자 첫 글자다. `info.after`가 이 글자로 시작할 때만 보정한다.
const DELIMITER_START = /^[*_~]/u;

// 결과 끝의 `\` 연속과 그 뒤 한 코드 포인트다.
const TRAILING_BACKSLASH_CHAR = /(\\+)([^\\])$/u;

// ASCII 구두점이다. `\`+구두점은 이미 이스케이프라 보정하지 않는다.
const ASCII_PUNCTUATION = /^[!-/:-@[-`{-~]$/u;

// astral 글자(U+10000 이상) 하나다. 전역 플래그라 `match`·`replace`에만 쓴다.
const ASTRAL = /[\u{10000}-\u{10FFFF}]/gu;

// astral 글자를 대신하는 BMP 사설 영역 글자다(#414).
const PLACEHOLDER = "\uE000";
const PLACEHOLDER_PATTERN = /\uE000/gu;

type State = Parameters<Handle>[2];

/**
 * `state.safe`를 부른다. astral 글자는 U+E000으로 바꿔 넘기고 결과에서 원래 글자로 되돌린다(#414).
 * astral 글자가 없거나 입력에 U+E000이 이미 있으면 바꾸지 않는다.
 */
const safeKeepingAstral = (
  state: State,
  value: string,
  config: Parameters<State["safe"]>[1],
): string => {
  const astrals = value.match(ASTRAL) ?? [];
  if (astrals.length === 0 || value.includes(PLACEHOLDER)) {
    return state.safe(value, config);
  }
  const result = state.safe(value.replace(ASTRAL, PLACEHOLDER), config);
  return result.replace(PLACEHOLDER_PATTERN, () => astrals.shift() ?? "");
};

/**
 * text를 직렬화한다. 구분자 앞에서 `\`+글자로 끝나면 `\`를 하나 더한다.
 * strike 옆 text는 `_` 이스케이프 판정에서 `~`를 `*`로 취급한다.
 * astral 글자는 `state.safe` 안에서만 U+E000으로 바꿔 구분자 옆 `_`를 이스케이프하게 한다.
 */
export const handleText = (
  node: Parameters<Handle>[0],
  parent: Parameters<Handle>[1],
  state: Parameters<Handle>[2],
  info: Parameters<Handle>[3],
): string => {
  const siblings = parent ? parent.children : [];
  const index = siblings.indexOf(node);
  const safe = safeKeepingAstral(state, node.value, {
    ...info,
    before: info.before === "~" ? "*" : info.before,
    after: info.after === "~" ? "*" : info.after,
    afterNode: siblings[index + 1],
    beforeNode: siblings[index - 1],
  });

  if (!DELIMITER_START.test(info.after)) return safe;
  const match = TRAILING_BACKSLASH_CHAR.exec(safe);
  if (match === null) return safe;
  const [matched, backslashes, last] = match;
  if (backslashes === undefined || last === undefined) return safe;
  if (backslashes.length % 2 === 0) return safe;
  if (ASCII_PUNCTUATION.test(last)) return safe;
  return `${safe.slice(0, safe.length - matched.length)}${backslashes}\\${last}`;
};
