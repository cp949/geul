// GFM autolink literal(맨몸 URL·www·이메일)을 평문으로 되돌린다(Issue #400).
// remark-gfm은 맨몸 글자를 mdast `link`로 바꾼다. 내보내기의 `\:`·`\.`·`\@`
// 이스케이프는 재가져오기에서 풀려 막을 수 없다. 그래서 가져오기에서 끈다.
// - remark-gfm 4.0.1에 literal만 끄는 옵션이 없다. parse 뒤 트리를 후처리한다.
// - 판별은 소스 첫 글자다. 명시 링크는 `[`, `<url>`은 `<`로 시작한다.
//   literal은 그 외 글자로 시작한다.
// - 함정: literal이 `position` 없이 만들어지는 경로가 있다. 이스케이프(`https\://`)나
//   NBSP가 끼면 micromark 토큰이 아니라 mdast-util-gfm-autolink-literal의
//   변환이 text를 쪼개 link를 만든다. 그 link는 `position`이 없다.
//   parser가 만든 명시 링크는 항상 `position`이 있다. 없으면 literal로 본다.
// - literal link의 자식은 text 하나다. link를 자식으로 치환하면 글자는 그대로다.
//   인접 text 병합은 이후 인라인 변환이 맡는다.
// - `source`는 parse에 넣은 문자열과 같아야 한다. offset이 그 문자열 기준이다.
// - 함정: remark는 선두 BOM(U+FEFF)을 떼고 파싱해 offset이 BOM을 뺀 기준이다.
//   BOM을 그대로 두면 `source[offset]`이 한 글자 앞을 읽어 명시 링크가
//   전부 literal로 오판된다. 선두 BOM은 읽기 전에 건너뛴다.
// - 순회는 명시적 스택이다. 깊이 캡 뒤라 트리는 유계지만 재귀를 쓰지 않는다.
import type { MarkdownNode, MarkdownRoot } from "./import-markdown-helpers.js";

const isAutolinkLiteral = (node: MarkdownNode, source: string): boolean => {
  const offset = node.position?.start.offset;
  if (offset === undefined) return true;
  const first = source[offset];
  return first !== undefined && first !== "[" && first !== "<";
};

const BYTE_ORDER_MARK = 0xfeff;

export const stripAutolinkLiterals = (
  root: MarkdownRoot,
  source: string,
): void => {
  const text =
    source.charCodeAt(0) === BYTE_ORDER_MARK ? source.slice(1) : source;
  const stack: MarkdownNode[][] = [root.children];
  for (let nodes = stack.pop(); nodes !== undefined; nodes = stack.pop()) {
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (node === undefined) continue;
      if (node.type === "link" && isAutolinkLiteral(node, text)) {
        const replacement = node.children ?? [];
        nodes.splice(index, 1, ...replacement);
        index += replacement.length - 1;
        continue;
      }
      if (node.children !== undefined && node.children.length > 0) {
        stack.push(node.children);
      }
    }
  }
};
