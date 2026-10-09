import { isWhitespacePreservingStyle } from "../clipboard/style-declarations.js";
import type {
  HtmlElementNode,
  HtmlNode,
  HtmlRoot,
  HtmlTextNode,
} from "./inline-content.js";
import { flattenBlockBoundaryTagNames } from "./parse-html.js";

// 외부 HTML의 소스 공백을 브라우저 렌더링 규칙(white-space: normal)대로
// 접는다(Issue #320). sanitize된 HAST만 읽고 고친다(G-CNV-002) — 공백만
// 바꾸고 보이는 텍스트와 블록 경계는 그대로다. 접는 문자는 HTML 공백(탭·LF·
// FF·CR·스페이스)이고 NBSP는 접지도 자르지도 않는다.
//
// 규칙:
// - 공백 run은 스페이스 하나가 된다. 요소 경계를 넘어 접고, 남는 공백은
//   앞쪽 텍스트에 있다(`<b>a </b> b` → `a ` + `b`).
// - 블록 경계 태그의 시작과 끝, `<br>` 앞뒤는 줄 경계다. 줄 시작의 공백은
//   버리고 줄 끝 공백은 이미 낸 텍스트 노드에서 되돌려 지운다.
// - `<pre>` 하위와 `white-space`가 pre·pre-wrap·break-spaces인 `span` 하위는
//   건드리지 않는다. 보호 구간 앞 공백 run은 접는다.
// - 접은 결과가 빈 텍스트 노드는 트리에서 뺀다. 공백뿐인 노드가 블록이나
//   의미 있는 텍스트로 취급되지 않게 한다.
//
// 입력 크기에 선형이다. 텍스트 노드는 정규식 한 번(run 단위 콜백)으로 접고,
// 트리는 명시적 스택으로 한 번 훑는다(깊이 제한이 필요한 재귀가 없다).

// 줄 경계로 보는 태그는 parse-html.ts의 절단 텍스트 수집기와 같은 집합이다.
const lineBoundaryTagNames = flattenBlockBoundaryTagNames;

const HTML_WHITESPACE_RUN = /[\t\n\f\r ]+/g;
const SPACE_CODE = 0x20;

type ExitAction = "none" | "boundary" | "protected";

type Frame = {
  nodes: HtmlNode[];
  index: number;
  exit: ExitAction;
  hasText: boolean;
};

const isNonEmptyString = (value: unknown): boolean =>
  typeof value === "string" && value.length > 0;

// 우리 export가 낸 조각인지 보는 표식이다. 블록은 `data-geul-block-id`, 표
// 셀은 `data-geul-cell-id`를 갖는다. 하나라도 있으면 입력 전체가 우리 형식
// 이다. export는 공백을 그대로 내므로 접으면 왕복이 깨진다. 호출부(import-
// html.ts)가 접기 호출 여부를 정한다.
export const hasGeulIdentityAttribute = (root: HtmlRoot): boolean => {
  const stack: HtmlNode[] = [...root.children];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    if (node.type !== "element") continue;
    if (
      isNonEmptyString(node.properties.dataGeulBlockId) ||
      isNonEmptyString(node.properties.dataGeulCellId)
    ) {
      return true;
    }
    for (const child of node.children) stack.push(child);
  }
  return false;
};

const isProtectedSpan = (element: HtmlElementNode): boolean => {
  if (element.tagName !== "span") return false;
  const style = element.properties.style;
  return typeof style === "string" && isWhitespacePreservingStyle(style);
};

// 접은 결과가 빈 텍스트 노드를 children에서 뺀다. 자리에서 압축한다.
const dropEmptyTextNodes = (nodes: HtmlNode[]): void => {
  let write = 0;
  for (const node of nodes) {
    if (node.type === "text" && node.value.length === 0) continue;
    nodes[write] = node;
    write += 1;
  }
  nodes.length = write;
};

export const collapseSourceWhitespace = (root: HtmlRoot): void => {
  // 직전 글자가 접히는 공백이거나 줄 시작이면 true다. 다음 공백 run은 버린다.
  let atCollapsedSpace = true;
  // 마지막으로 낸 텍스트 노드 중 값이 접힌 공백으로 끝나고 그 공백이 지금
  // 줄의 마지막 글자인 노드다. 줄이 끝나면 그 공백을 지운다.
  let trailingSpaceNode: HtmlTextNode | undefined;
  let protectedDepth = 0;
  const parentsWithText: HtmlNode[][] = [];

  const endLine = (): void => {
    if (trailingSpaceNode !== undefined) {
      trailingSpaceNode.value = trailingSpaceNode.value.slice(0, -1);
      trailingSpaceNode = undefined;
    }
    atCollapsedSpace = true;
  };

  const stack: Frame[] = [
    { nodes: root.children, index: 0, exit: "none", hasText: false },
  ];
  for (
    let frame = stack[stack.length - 1];
    frame !== undefined;
    frame = stack[stack.length - 1]
  ) {
    const node = frame.nodes[frame.index];
    if (node === undefined) {
      stack.pop();
      if (frame.exit === "boundary") endLine();
      else if (frame.exit === "protected") protectedDepth -= 1;
      if (frame.hasText) parentsWithText.push(frame.nodes);
      continue;
    }
    frame.index += 1;

    if (node.type === "text") {
      frame.hasText = true;
      if (protectedDepth > 0) {
        // 보호 구간 안 텍스트는 그대로 둔다. 줄 끝 공백 되돌리기 대상도
        // 아니다. 보호 구간 끝이 개행이면 다음은 줄 시작이다.
        if (node.value.length > 0) {
          trailingSpaceNode = undefined;
          atCollapsedSpace = node.value.endsWith("\n");
        }
        continue;
      }
      // run마다 한 번 콜백이 돈다. 앞 글자와 이어지는 run은 텍스트의 첫
      // run(offset 0)뿐이다.
      const collapsed = node.value.replace(
        HTML_WHITESPACE_RUN,
        (_run: string, offset: number) =>
          offset === 0 && atCollapsedSpace ? "" : " ",
      );
      node.value = collapsed;
      if (collapsed.length > 0) {
        const endsWithSpace =
          collapsed.charCodeAt(collapsed.length - 1) === SPACE_CODE;
        atCollapsedSpace = endsWithSpace;
        trailingSpaceNode = endsWithSpace ? node : undefined;
      }
      continue;
    }
    if (node.type !== "element") continue;

    if (node.tagName === "br") {
      endLine();
      continue;
    }
    if (node.tagName === "pre") {
      // 하위는 건드리지 않는다. pre 앞뒤는 줄 경계다.
      endLine();
      continue;
    }

    let exit: ExitAction = "none";
    if (lineBoundaryTagNames.has(node.tagName)) {
      endLine();
      exit = "boundary";
    } else if (isProtectedSpan(node)) {
      protectedDepth += 1;
      exit = "protected";
    }
    stack.push({ nodes: node.children, index: 0, exit, hasText: false });
  }

  for (const nodes of parentsWithText) dropEmptyTextNodes(nodes);
};
