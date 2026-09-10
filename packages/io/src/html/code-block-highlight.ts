// spec(docs/specs/2026-09-08-blk-017-code-highlighting-seam-design.md) §10 —
// exportHtml이 codeBlock을 강조 span 포함 HTML로 내보내는 계약. exportHtml
// 자신은 완전 동기라(export-html.ts) syntaxHighlighter가 Promise를 반환하면
// 그 결과를 기다리지 않고 해당 코드 블록만 plain으로 남긴다(ADR-0016) —
// core의 구문 강조 seam(code-block-highlight-extension.ts)이 이미 쓰는
// "비동기 실패는 console.warn만 내고 plain으로 남긴다" 관례와 같은 결이다.
import type {
  SyntaxHighlighter,
  SyntaxHighlightToken,
} from "@cp949/geul-model";

import {
  type HtmlElementContent,
  type HtmlElementNode,
  type HtmlRawNode,
  htmlElement,
} from "./inline-content.js";

// export-html.ts의 HtmlExportRoot.children은 HtmlElementContent 외에
// customBlockToHtml(spec §4.5)이 낸 raw 노드도 섞여 있을 수 있다 — 이
// 순회는 raw를 그대로 통과시킨다(원소가 아니므로 codeBlock일 수 없다).
type HtmlExportNode = HtmlElementContent | HtmlRawNode;

// io는 DOM·Node 전역 타입을 가정하지 않는다(ADR-0002, tsconfig `types:
// []`) — console은 사실상 모든 JS 런타임(Node·브라우저·엣지)에 있지만
// 타입 레벨로 보장되지 않으므로 globalThis를 통해 방어적으로만 참조한다.
const warn = (message: string): void => {
  (
    globalThis as { console?: { warn?: (message: string) => void } }
  ).console?.warn?.(message);
};

// source를 token의 from/to/className 기준으로 강조 span과 일반 텍스트로
// 분할한다. §4(라이브 에디터의 겹치는 token 규칙 — 우선순위 없이 두 class를
// 함께 렌더)와 달리 HTML span은 겹치는 두 구간을 그대로 표현할 수 없다 —
// 여기서는 먼저 온 token이 그 구간을 차지하고, 뒤 token은 겹치지 않는
// 나머지만 적용한다(겹침 자체가 소비자 하이라이터 쪽 신호이지 geul이 풀
// 문제가 아니다 — 크래시 없는 결정론적 동작만 보장한다). from/to는 §4와
// 같은 방식으로 [0, source.length] 안으로 clamp한다(단, export는 별도
// 완료 기준이 없어 console.warn을 내지 않는다 — 라이브 렌더의 clamp 경고와
// 다른 점).
export const codeBlockHighlightNodes = (
  source: string,
  tokens: readonly SyntaxHighlightToken[],
): HtmlElementContent[] => {
  if (tokens.length === 0) {
    return source.length === 0 ? [] : [{ type: "text", value: source }];
  }

  const segments: Array<{
    from: number;
    to: number;
    className: string | undefined;
  }> = [];
  let cursor = 0;
  for (const token of tokens) {
    const clampedFrom = Math.min(Math.max(token.from, 0), source.length);
    const clampedTo = Math.max(Math.min(token.to, source.length), clampedFrom);
    const from = Math.max(clampedFrom, cursor);
    if (from >= clampedTo) continue; // 이전 token에 완전히 덮이거나 zero-width
    segments.push({ from, to: clampedTo, className: token.className });
    cursor = clampedTo;
  }

  const nodes: HtmlElementContent[] = [];
  const pushText = (text: string): void => {
    if (text.length > 0) nodes.push({ type: "text", value: text });
  };
  let pos = 0;
  for (const segment of segments) {
    pushText(source.slice(pos, segment.from));
    const text = source.slice(segment.from, segment.to);
    if (segment.className === undefined) {
      pushText(text);
    } else {
      nodes.push(
        htmlElement("span", { className: [segment.className] }, [
          { type: "text", value: text },
        ]),
      );
    }
    pos = segment.to;
  }
  pushText(source.slice(pos));
  return nodes;
};

// export-html.ts가 blockNodes()로 다 만든 트리를 순회하며 codeBlock이 낸
// pre[data-geul-block-id] 자리만 다시 쓴다. codeBlockNode()가 이미 유일한
// pre 생성처라(export-html.ts) 8곳 넘는 재귀 함수(blockNode/blockNodes/
// knownBlockNodes/listItemNode/detailsNode 등)에 새 파라미터를 threading할
// 필요가 없다 — 완성된 트리에서 마커·code의 text 자식·language 속성을 그대로
// 읽어 그 자리만 교체하는 별도 pass로 충분하다(RD-002-DELTA-01 "계획" 참고).
export const applyCodeBlockHighlighting = (
  nodes: readonly HtmlExportNode[],
  highlighter: SyntaxHighlighter,
): HtmlExportNode[] =>
  nodes.map((node) => {
    if (node.type !== "element") return node;
    if (
      node.tagName === "pre" &&
      node.properties.dataGeulBlockId !== undefined
    ) {
      return highlightedPreNode(node, highlighter);
    }
    return {
      ...node,
      children: applyCodeBlockHighlighting(
        node.children,
        highlighter,
      ) as HtmlElementContent[],
    };
  });

const highlightedPreNode = (
  pre: HtmlElementNode,
  highlighter: SyntaxHighlighter,
): HtmlElementNode => {
  const code = pre.children.find(
    (child): child is HtmlElementNode =>
      child.type === "element" && child.tagName === "code",
  );
  if (code === undefined) return pre;

  const sourceNode = code.children.find(
    (child): child is { type: "text"; value: string } => child.type === "text",
  );
  const source = sourceNode?.value ?? "";
  const language =
    typeof code.properties.dataLanguage === "string"
      ? code.properties.dataLanguage
      : undefined;

  const result = highlighter({ source, language });
  if (result instanceof Promise) {
    // exportHtml은 완전 동기다(ADR-0016) — Promise를 기다리지 않고 이
    // 코드 블록만 plain(원래 트리 그대로)으로 남긴다.
    warn(
      `[geul] exportHtml: 코드 블록 ${String(pre.properties.dataGeulBlockId)}의 syntaxHighlighter가 비동기 결과(Promise)를 반환해 강조 없이 plain으로 export합니다.`,
    );
    return pre;
  }

  const highlightedCode: HtmlElementContent = {
    ...code,
    children: codeBlockHighlightNodes(source, result),
  };
  return {
    ...pre,
    children: pre.children.map((child) =>
      child === code ? highlightedCode : child,
    ),
  };
};
