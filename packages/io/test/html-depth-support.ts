/**
 * 깊이 방어 테스트(Issue #130·#132)가 공유하는 깊은 HTML 생성기와 반복형
 * 트리·문서 텍스트 측정기를 소유한다. 측정기는 전부 명시적 스택 순회다 —
 * 검증 대상이 "재귀 크래시가 없다"이므로 측정 도구 자신이 재귀로 터지면
 * 실패 원인을 가려버린다(PIT-0034 — 깊이·구조 단언만 사용하는 계약의 일부).
 */
import type { Document } from "@cp949/geul-model";

import type { HtmlNode, HtmlRoot } from "../src/html/inline-content.js";

/**
 * exportHtml(blockNode)이 내는 children wrapper(<div data-be-block-id><p/>
 * <div data-be-children>...) 체인을 levels 단으로 만든다. exportHtml은
 * parseDocument가 문서 생성 단계에서 깊이를 막아 65단 이상인 Document를
 * 애초에 만들 수 없으므로, 이 헬퍼는 손으로 조작한(정상 exportHtml로는
 * 나올 수 없는) 매우 깊은 wrapper 체인 HTML 문자열로 documentFromRoot를
 * 직접 공격하는 시나리오를 재현한다. 가장 안쪽은 내용을 비워(children
 * 없음) wrapper 레벨 수가 곧 만들어지는 blocks 배열 중첩 깊이(model 기준
 * depth)와 1:1로 맞도록 한다.
 */
export const buildNestedWrapperHtml = (levels: number): string => {
  let html = "";
  for (let level = levels; level >= 1; level -= 1) {
    html = `<div data-be-block-id="b${level}"><p data-be-block-id="p${level}">t${level}</p><div data-be-children="1">${html}</div></div>`;
  }
  return html;
};

/**
 * 같은 태그를 depth 단으로 중첩하고 가장 안쪽에 innerHtml을 담는다.
 * innerHtml 자신의 태그는 depth에 포함되지 않는다 — 최심부 텍스트 노드는
 * 트리 깊이 depth + 1(innerHtml이 순수 텍스트일 때)에 놓인다.
 */
export const buildDeepChainHtml = (
  tagName: string,
  depth: number,
  innerHtml: string,
): string =>
  `${`<${tagName}>`.repeat(depth)}${innerHtml}${`</${tagName}>`.repeat(depth)}`;

/**
 * HAST 트리의 최대 깊이를 잰다. root 직속 자식이 깊이 1이다 — 깊이-캡
 * 상수(MAX_HTML_TREE_DEPTH)와 같은 축이라 측정값을 캡과 바로 비교할 수
 * 있다.
 */
export const htmlTreeDepth = (root: HtmlRoot): number => {
  let max = 0;
  const stack: { nodes: HtmlNode[]; depth: number }[] = [
    { nodes: root.children, depth: 1 },
  ];
  for (let frame = stack.pop(); frame !== undefined; frame = stack.pop()) {
    for (const node of frame.nodes) {
      if (frame.depth > max) max = frame.depth;
      if (node.type === "element" && node.children.length > 0) {
        stack.push({ nodes: node.children, depth: frame.depth + 1 });
      }
    }
  }
  return max;
};

/**
 * HAST 트리의 모든 텍스트 노드 값을 문서 순서로 이어 붙인다. 절단 후
 * "보이는 텍스트가 보존된다"(G-CNV-002)를 위치와 무관하게 단언하는 데
 * 쓴다.
 */
export const htmlVisibleText = (root: HtmlRoot): string => {
  const parts: string[] = [];
  const stack: HtmlNode[] = [...root.children].reverse();
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    if (node.type === "text") {
      parts.push(node.value);
      continue;
    }
    if (node.type !== "element") continue;
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];
      if (child !== undefined) stack.push(child);
    }
  }
  return parts.join("");
};

/**
 * Document의 모든 블록(중첩 children·표 셀 포함)에서 인라인 텍스트를 모아
 * 이어 붙인다. 깊은 입력이 평탄화된 뒤에도 특정 텍스트가 결과 문서 어딘가에
 * 살아 있는지(블록 배치와 무관하게) 단언하는 데 쓴다.
 */
export const documentVisibleText = (document: Document): string => {
  const parts: string[] = [];
  const stack: Document["blocks"][] = [document.blocks];
  for (let blocks = stack.pop(); blocks !== undefined; blocks = stack.pop()) {
    for (const block of blocks) {
      if (block.type === "table") {
        // TableBlock에는 children이 없다(표 셀은 InlineContent만 담는다).
        for (const row of block.rows) {
          for (const cell of row.cells) {
            for (const item of cell.content) parts.push(item.text);
          }
        }
        continue;
      }
      // DividerBlock에는 content·children이 없다(리프 블록).
      if (block.type === "divider") continue;
      // 4종 미디어 블록(RD-003)도 content가 없다 — plain string
      // prop(name/caption)뿐이라 인라인 텍스트 수집 대상이 아니다.
      if (
        block.type === "file" ||
        block.type === "image" ||
        block.type === "video" ||
        block.type === "audio"
      )
        continue;
      for (const item of block.content) parts.push(item.text);
      // CodeBlock은 source content만 있고 children은 없는 리프 블록이다.
      if (block.type === "codeBlock") continue;
      if (block.children !== undefined && block.children.length > 0) {
        stack.push(block.children);
      }
    }
  }
  return parts.join("");
};
