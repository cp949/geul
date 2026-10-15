// GFM autolink literal(맨몸 URL·www·이메일)을 평문으로 되돌린다(Issue #400).
// remark-gfm은 맨몸 글자를 mdast `link`로 바꾼다. 내보내기의 `\:`·`\.`·`\@`
// 이스케이프는 재가져오기에서 풀려 막을 수 없다. 그래서 가져오기에서 끈다.
// - remark-gfm 4.0.1에 literal만 끄는 옵션이 없다. parse 뒤 트리를 후처리한다.
// - 판별은 소스 첫 글자다. 명시 링크는 `[`, `<url>`은 `<`로 시작한다.
//   literal은 그 외 글자로 시작한다.
// - 이스케이프(`https\://`)나 NBSP가 낀 literal은 파서 변환이 아니라 평문 text로 남는다.
//   gfm-parse-processor.ts가 mdast-util-gfm-autolink-literal의 `transforms`를 끈다(Issue #423).
//   그 변환이 만든 link와 쪼개진 text는 `position`이 없었다.
// - 파서가 만든 link는 항상 `position`이 있다. 없으면 literal로 보는 분기는 안전망으로 둔다.
// - literal link의 자식은 text 하나다. link를 자식으로 치환하면 글자는 그대로다.
//   인접 text 병합은 이후 인라인 변환이 맡는다.
// - `source`는 parse에 넣은 문자열과 같아야 한다. offset이 그 문자열 기준이다.
// - 순회는 명시적 스택이다. 깊이 캡 뒤라 트리는 유계지만 재귀를 쓰지 않는다.
import type { MarkdownNode, MarkdownRoot } from "./import-markdown-helpers.js";

const isAutolinkLiteral = (node: MarkdownNode, source: string): boolean => {
  const offset = node.position?.start.offset;
  if (offset === undefined) return true;
  const first = source[offset];
  return first !== undefined && first !== "[" && first !== "<";
};

export const stripAutolinkLiterals = (
  root: MarkdownRoot,
  source: string,
): void => {
  const stack: MarkdownNode[][] = [root.children];
  for (let nodes = stack.pop(); nodes !== undefined; nodes = stack.pop()) {
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (node === undefined) continue;
      if (node.type === "link" && isAutolinkLiteral(node, source)) {
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
