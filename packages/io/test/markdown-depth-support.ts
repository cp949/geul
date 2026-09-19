/**
 * markdown 깊이 방어 테스트(Issue #135)가 공유하는 깊은 blockquote·list
 * fixture 생성기와 반복형 Document 깊이·텍스트 측정기를 소유한다. 측정기는
 * 전부 명시적 스택 순회다 — 검증 대상이 own-traversal의 "결정적 깊이
 * 방어"이므로 측정 도구 자신이 재귀로 죽으면 실패 원인을 가려버린다
 * (PIT-0034 — 깊이·구조 단언만 쓰는 계약의 일부). html-depth-support.ts와
 * 같은 패턴이지만 markdown 전용으로 새로 작성한다 — mdast와 HAST는 노드
 * 모양이 달라 파일을 공유하지 않는다.
 */
import { isKnownBlockType, type Block, type Document } from "@cp949/geul-model";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type {
  MarkdownNode,
  MarkdownRoot,
} from "../src/markdown/import-markdown-helpers.js";

/**
 * ">"를 levels번 반복한 한 줄짜리 GFM blockquote 소스를 만든다. remark-gfm은
 * 줄 앞 ">" 개수만큼 blockquote를 재귀적으로 중첩해 해석하므로,
 * own-traversal이 만드는 quote 블록 nesting depth가 levels와 1:1로
 * 대응한다(model의 "blocks 배열 자체가 depth 1" 관례).
 */
export const buildNestedBlockquoteMarkdown = (
  levels: number,
  leafText = "leaf",
): string => `${"> ".repeat(levels)}${leafText}`;

/**
 * `*`를 levels번씩 좌우로 감싼 한 줄짜리 GFM emphasis 소스를 만든다.
 * remark-parse는 `*`를 좌우로 대칭 반복하면 emphasis 노드를 levels번
 * 재귀적으로 중첩해 해석한다 — paragraph.children(phrasing content) 안에서
 * emphasis 체인이 만들어지므로, blockquote/list(둘 다 flow content 위치)와
 * 달리 caps 발동 위치가 phrasing content라는 걸 검증하는 데 쓴다(Issue #135
 * 결함 1 — capMarkdownTreeDepth가 phrasing 위치에서도 flow 전용 치환 노드를
 * 쓰던 결함).
 */
export const buildNestedEmphasisMarkdown = (
  levels: number,
  leafText = "leaf",
): string => `${"*".repeat(levels)}${leafText}${"*".repeat(levels)}`;

/**
 * 각 항목이 바로 앞 항목의 유일한 자식인 GFM 글머리 목록 소스를 만든다.
 * index번째 줄(0-based)은 2*index칸 들여써 앞 항목의 children scope에
 * 들어간다 — levels줄을 다 쌓으면 목록 항목 nesting depth가 levels와
 * 1:1로 대응한다.
 */
export const buildNestedListMarkdown = (
  levels: number,
  itemText: (index: number) => string = (index) => `item-${index + 1}`,
): string =>
  Array.from(
    { length: levels },
    (_, index) => `${"  ".repeat(index)}- ${itemText(index)}`,
  ).join("\n");

/**
 * top-level에만 있을 수 있는 CustomBlock(model)을 제외해 `Document["blocks"]`
 * 원소를 `Block`으로 좁힌다 — html-depth-support.ts의 isBlock과 같은 이유
 * (discriminated union 잔여분기를 호출부 캐스트 없이 우회).
 */
const isBlock = (block: Document["blocks"][number]): block is Block =>
  isKnownBlockType(block.type);

/**
 * children으로 내려갈 수 있는 7종 nestable block(paragraph/heading/quote/
 * 목록 4종)만 그 children을 반환한다 — table/divider/codeBlock·미디어
 * 4종은 children 필드 자체가 없거나(model 계약) 이번 depth 축의 대상이
 * 아니다.
 */
const childrenOf = (block: Block): Block[] | undefined => {
  if (
    block.type === "table" ||
    block.type === "divider" ||
    block.type === "codeBlock" ||
    block.type === "file" ||
    block.type === "image" ||
    block.type === "video" ||
    block.type === "audio" ||
    block.type === "iframe"
  ) {
    return undefined;
  }
  return block.children;
};

/**
 * Document의 blocks 트리를 반복 순회해 최대 nesting depth를 잰다 — model의
 * MAX_NESTING_DEPTH와 같은 축이다(blocks 배열 자체가 depth 1). 명시적 스택
 * 순회라 측정기 자신은 재귀로 크래시하지 않는다(PIT-0034).
 */
export const documentNestingDepth = (document: Document): number => {
  let max = 0;
  const stack: { blocks: Block[]; depth: number }[] = [
    { blocks: document.blocks.filter(isBlock), depth: 1 },
  ];
  for (let frame = stack.pop(); frame !== undefined; frame = stack.pop()) {
    if (frame.depth > max) max = frame.depth;
    for (const block of frame.blocks) {
      const children = childrenOf(block);
      if (children !== undefined && children.length > 0) {
        stack.push({ blocks: children, depth: frame.depth + 1 });
      }
    }
  }
  return max;
};

/**
 * Document의 모든 블록(중첩 children 포함)에서 인라인 텍스트를 모아 이어
 * 붙인다. 캡 초과로 평탄화된 뒤에도 최심부 텍스트가 결과 문서 어딘가에
 * (블록 배치와 무관하게) 살아 있는지 단언하는 데 쓴다.
 */
export const documentVisibleText = (document: Document): string => {
  const parts: string[] = [];
  const stack: Block[][] = [document.blocks.filter(isBlock)];
  for (let blocks = stack.pop(); blocks !== undefined; blocks = stack.pop()) {
    for (const block of blocks) {
      if (
        block.type !== "table" &&
        block.type !== "divider" &&
        block.type !== "file" &&
        block.type !== "image" &&
        block.type !== "video" &&
        block.type !== "audio" &&
        block.type !== "iframe"
      ) {
        for (const item of block.content) {
          if ("text" in item) parts.push(item.text);
        }
      }
      const children = childrenOf(block);
      if (children !== undefined && children.length > 0) {
        stack.push(children);
      }
    }
  }
  return parts.join("");
};

/**
 * import-markdown.ts와 동일한 구성(remark-parse + remark-gfm)의 독립
 * 파서다. capMarkdownTreeDepth(import-markdown-tree-depth.ts) 단위 테스트가
 * own-traversal·own-cap을 거치지 않은 raw mdast 트리를 직접 얻는 데 쓴다 —
 * import-markdown.ts는 이 파서를 export하지 않는다(공개 진입점은
 * importMarkdown 하나뿐이라는 설계, G-CNV-001).
 */
const rawParseProcessor = unified().use(remarkParse).use(remarkGfm);

/**
 * markdown 소스를 raw mdast root로 파싱한다(own-traversal·캡 미적용).
 */
export const parseRawMarkdownTree = (source: string): MarkdownRoot =>
  rawParseProcessor.parse(source) as unknown as MarkdownRoot;

/**
 * raw mdast 트리의 최대 깊이를 잰다 — root 직속 자식이 깊이 1이다(캡 상수
 * MAX_MARKDOWN_TREE_DEPTH와 같은 축이라 측정값을 캡과 바로 비교할 수
 * 있다. html-depth-support.ts의 htmlTreeDepth와 동일한 계약). 명시적 스택
 * 순회라 측정기 자신은 재귀로 크래시하지 않는다(PIT-0034).
 *
 * blockquote N단 중첩(`buildNestedBlockquoteMarkdown(N)`)의 raw 깊이는
 * 항상 N+2다(blockquote 노드 N개 체인 + 그 안의 paragraph + text) — 어림
 * 짐작이 아니라 이 헬퍼로 실측해 확인한 값이다(measure-depth 스크립트로
 * levels=1,63,64,65,254,255,256,257,500 전부 대조). list N단 중첩
 * (`buildNestedListMarkdown(N)`)의 raw 깊이는 2*N+2다(각 단이 list+
 * listItem 두 노드를 추가하고, 가장 안쪽에 paragraph+text가 붙는다).
 */
export const rawMarkdownTreeDepth = (root: MarkdownRoot): number => {
  let max = 0;
  const stack: { nodes: MarkdownNode[]; depth: number }[] = [
    { nodes: root.children, depth: 1 },
  ];
  for (let frame = stack.pop(); frame !== undefined; frame = stack.pop()) {
    for (const node of frame.nodes) {
      if (frame.depth > max) max = frame.depth;
      if (node.children !== undefined && node.children.length > 0) {
        stack.push({ nodes: node.children, depth: frame.depth + 1 });
      }
    }
  }
  return max;
};
