// mdast 트리 깊이 캡(Issue #135 §9). own-traversal(import-markdown-blocks.ts의
// blocksFromNodes/blockquoteToBlocks/listBlocksFromNode 상호재귀)에는 이미
// model 깊이 상한(MAX_NESTING_DEPTH=64)을 쓰는 own-cap이 있다(커밋
// ee9b9c6). 하지만 이것만으로는 부족하다 — own-cap은 "만들어지는 문서
// 구조 깊이"만 64로 묶을 뿐, 캡에 도달한 뒤에도 남은 서브트리를 여전히
// blocksFromNodes 재귀 호출로 순회한다(depth 인자만 그대로 두고 실제 함수
// 재귀는 계속된다). 즉 JS 콜스택 사용량은 depth 카운터가 아니라 입력의
// 실제 중첩 단수에 비례해 계속 쌓인다. 실측: own-cap만 있는 상태로 depth
// 1370(JIT 상태에 따라 비결정)·2000·3000+ blockquote/list 중첩을
// importMarkdown에 넣으면 여전히 `RangeError: Maximum call stack size
// exceeded`가 나고, 기존 최외곽 catch가 이를 MARKDOWN_PARSE_FAILED로
// 오분류한다. HTML(Issue #130)이 own-cap(64, import-html-blocks.ts)과
// 별개로 parse5 트리 자체에 사전 캡(256, parse-html.ts의
// capParse5TreeDepth)을 건 이유가 정확히 이것이다 — own-traversal에
// 도달하는 트리 자체의 깊이를 미리 유계로 만들어야 재귀 호출 횟수 자체가
// 유계가 된다. 이 파일은 그 패턴을 mdast 트리에 그대로 적용한다.
import type { MarkdownNode, MarkdownRoot } from "./import-markdown-helpers.js";

// HTML의 MAX_HTML_TREE_DEPTH(parse-html.ts)와 같은 값·마진이다. model
// 중첩 축의 MAX_NESTING_DEPTH(64)와는 별개 상수다 — own-cap(64)을 재사용해
// 사전 캡까지 64로 걸면 65~250단대의 "own-cap이 이미 안전하게 flatten해
// 보존하는" 입력까지 사전 캡이 앞질러 절단해버려 own-cap의 세분화된
// warning(NESTED_BLOCKS_FLATTENED)이 가려진다.
export const MAX_MARKDOWN_TREE_DEPTH = 256;

// 캡 깊이에 도달한 노드의 서브트리에서 value가 string인 리터럴 노드(text/
// inlineCode/code/html 등 mdast literal 전종)의 값을 문서 순서대로 모아
// 공백으로 이어 붙인다. mdast literal 노드 종류를 전부 나열하지 않고
// "value가 string인 노드는 전부 수집" 방식으로 일반화한다. 순회는 명시적
// 스택이다 — 캡이 막으려는 것과 같은 종류의 재귀를 여기서 다시 쓰면 캡을
// 우회하게 된다.
const collectFlattenedText = (node: MarkdownNode): string => {
  const parts: string[] = [];
  const stack: MarkdownNode[] = [node];
  for (
    let current = stack.pop();
    current !== undefined;
    current = stack.pop()
  ) {
    if (typeof current.value === "string" && current.value.length > 0) {
      parts.push(current.value);
    }
    const children = current.children;
    if (children !== undefined && children.length > 0) {
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];
        if (child !== undefined) stack.push(child);
      }
    }
  }
  return parts.join(" ");
};

// mdast는 위치별로 서로 다른 content model을 강제한다 — paragraph/heading과
// emphasis/strong/delete/link/linkReference/tableCell의 children은 phrasing
// content(text/emphasis/strong/... 인라인 노드)만 허용하고, root/blockquote/
// listItem의 children은 flow content(paragraph/heading/list/blockquote/...
// 블록 노드)만 허용한다. 캡 절단 노드를 위치 구분 없이 항상 flow 전용
// placeholder(paragraph wrapper)로 바꾸면, phrasing 위치(예: emphasis 중첩)
// 에서 캡이 발동할 때 paragraph가 phrasing 부모의 자식이 되는 구조 위반이
// 생긴다 — readInlineNodes(import-markdown-inline.ts)가 "paragraph" case를
// 모르고 default 분기로 떨어져 실제 원인(깊이 캡)과 무관한
// UNSUPPORTED_INLINE_DOWNGRADED를 오보고한다(리뷰 결함 1, Issue #135). 이
// 집합은 캡이 지금 순회 중인 children 배열이 phrasing content 위치인지
// 판정하는 데만 쓴다 — 노드 자신의 종류가 아니라 "그 노드의 children이
// 담긴 위치"가 기준이다.
const PHRASING_CONTAINER_TYPES = new Set([
  "paragraph",
  "heading",
  "emphasis",
  "strong",
  "delete",
  "link",
  "linkReference",
  "tableCell",
]);

// parse-html.ts의 capParse5TreeDepth와 같은 패턴 — 명시적 스택으로 mdast
// 트리를 순회하며, children 배열을 가진 노드가 depth MAX_MARKDOWN_TREE_DEPTH
// 에 도달하면 그 서브트리를 명시적 스택으로 순회해 모은 텍스트로 치환한다
// (비어 있으면 제거). 치환/제거로 결과 트리 깊이는 항상 캡 이하다. 순회도
// 치환 대상 탐색도 전부 명시적 스택이라 이 함수 자신은 재귀로 크래시하지
// 않는다. 각 프레임의 nodes를 index 루프로 순회하는 이유는 부모 children
// 배열 참조를 유지한 채 in-place로 교체·삭제해야 하기 때문이다(for...of는
// splice 중 인덱스가 어긋난다). list.children(listItem 전용) 위치에서
// 캡이 발동해도 문제 없다 — listBlocksFromNode가 listItem 아닌 자식을
// 이미 "일반 블록"으로 graceful downgrade한다(import-markdown-blocks.ts).
export const capMarkdownTreeDepth = (root: MarkdownRoot): boolean => {
  let truncated = false;
  const stack: { nodes: MarkdownNode[]; depth: number; phrasing: boolean }[] = [
    { nodes: root.children, depth: 1, phrasing: false },
  ];
  for (let frame = stack.pop(); frame !== undefined; frame = stack.pop()) {
    const { nodes, depth, phrasing } = frame;
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const children = node?.children;
      if (
        node === undefined ||
        children === undefined ||
        children.length === 0
      ) {
        continue;
      }

      if (depth < MAX_MARKDOWN_TREE_DEPTH) {
        stack.push({
          nodes: children,
          depth: depth + 1,
          phrasing: PHRASING_CONTAINER_TYPES.has(node.type),
        });
        continue;
      }

      truncated = true;
      const text = collectFlattenedText(node);
      if (text.length === 0) {
        nodes.splice(index, 1);
        index -= 1;
        continue;
      }
      nodes[index] = phrasing
        ? { type: "text", value: text }
        : { type: "paragraph", children: [{ type: "text", value: text }] };
    }
  }
  return truncated;
};
