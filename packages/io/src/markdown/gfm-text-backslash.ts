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
// 본문 출처: mdast-util-to-markdown@2.2.0 `handle/text.js`. `state.safe` 호출을 그대로 옮겼다.
// io의 직접 의존이 아니라 import하지 않았다.
//
// 라이브러리 업그레이드 시 확인할 것:
// - 새 버전이 글자를 바꿀 때 앞 `\`도 같이 처리하면 이 파일을 지운다.
// - `markdown-backslash-char-reference.test.ts`가 이 파일 없이 통과하는지 본다.
// - 라이브러리 `text` 핸들러 본문이 바뀌었으면 이 복사본을 맞춘다.
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

/**
 * text를 직렬화한다. 구분자 앞에서 `\`+글자로 끝나면 `\`를 하나 더한다.
 */
export const handleText = (
  node: Parameters<Handle>[0],
  parent: Parameters<Handle>[1],
  state: Parameters<Handle>[2],
  info: Parameters<Handle>[3],
): string => {
  const siblings = parent ? parent.children : [];
  const index = siblings.indexOf(node);
  const safe = state.safe(node.value, {
    ...info,
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
