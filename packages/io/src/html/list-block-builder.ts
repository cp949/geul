import { isParagraphTag } from "./block-segmenter.js";
import { propertyInteger } from "./hast-properties.js";
import type { HtmlElementNode, HtmlNode } from "./inline-content.js";
import { hasSubstantialText } from "./table-layout.js";

// clipboard-table-parser.ts가 kind: "list" 세그먼트(ul/ol 원본 노드)를
// li마다 content/children으로 나눌 때 쓰는 독립 순수 helper 묶음이다.
// import-html.ts의 HtmlImportWarning·dataBeBlockId·IdFactory 같은 import
// 전용 관심사는 담지 않는다 — 이 파일은 clipboard-table-parser.ts와도
// import-html.ts와도 코드를 공유하지 않는 신규 모듈이다. 단
// splitListItemChildren의 알고리즘 자체는 import-html.ts:438-475의
// splitListItemChildren과 완전히 같은 정책을 복제한다(DELTA-01, Issue
// #143 (b)) — "block-level" 판정만 매개변수로 주입받아 소비자가 정한다.

// ul→bulletListItem, ol→numberedListItem. isListTag 정책을 통과한 kind:
// "list" 세그먼트의 node.tagName만 넘어오므로 그 외 태그는 고려하지 않는다.
export const markerTypeFromTag = (
  tagName: string,
): "bulletListItem" | "numberedListItem" =>
  tagName === "ul" ? "bulletListItem" : "numberedListItem";

// ol[start]만 읽는다 — ul이거나 start가 없거나 정수가 아니면 undefined다.
// 명시적 start가 없는 연속 <ol> 형제 scope의 번호 재시작 로직은 만들지
// 않는다(범위 밖, DELTA-01) — 그 로직이 필요해지면 별도 DELTA에서 다룬다.
export const parseExplicitStartNumber = (
  node: HtmlElementNode,
): number | undefined => {
  if (node.tagName !== "ol") return undefined;
  const value = propertyInteger(node, "start", Number.NaN);
  return Number.isInteger(value) ? value : undefined;
};

const isElementNode = (node: HtmlNode): node is HtmlElementNode =>
  node.type === "element";

// import-html.ts의 textValue(438-475행이 참조하는 헬퍼)와 완전히 같은
// 알고리즘의 독립 복제본이다 — br을 개행으로 취급해 실질 텍스트 판정에
// 넣는다.
const textValue = (nodes: HtmlNode[]): string =>
  nodes
    .map((node) =>
      node.type === "text"
        ? node.value
        : node.type === "element"
          ? node.tagName === "br"
            ? "\n"
            : textValue(node.children)
          : "",
    )
    .join("");

// li가 목록 항목의 content와 children을 직접 나눈다(RD-003 HTML 정규형과
// 동일한 정책 — import-html.ts:438-475 splitListItemChildren을 그대로
// 복제). 첫 실질 자식이 p면 그 p의 내용만 content로 승격하고 나머지는
// 전부 children이다. 첫 실질 자식이 block-level이면(p가 아닌) content는
// 비고 전부 children이다. 그 외(직접 inline run으로 시작)에는 첫
// block-level 자식 전까지가 content이고, 그 지점부터 끝까지가 children이다.
//
// isBlockLevelNode는 import-html.ts처럼 하드코딩하지 않고 매개변수로
// 주입받는다 — clipboard-table-parser.ts는 자신이 인식하는 표·중첩 경계
// 집합(isTableNode, isTransparentListTag, NESTED_BOUNDARY_TAG_NAMES)을
// 그대로 조립해 넘긴다.
export const splitListItemChildren = (
  node: HtmlElementNode,
  isBlockLevelNode: (node: HtmlElementNode) => boolean,
): { contentNodes: HtmlNode[]; childrenNodes: HtmlNode[] } => {
  const firstSubstantialIndex = node.children.findIndex(
    (child) => isElementNode(child) || hasSubstantialText(textValue([child])),
  );
  if (firstSubstantialIndex < 0) {
    return { contentNodes: [], childrenNodes: [] };
  }

  const first = node.children[firstSubstantialIndex];
  if (first === undefined) {
    return { contentNodes: [], childrenNodes: [] };
  }
  if (isElementNode(first) && isParagraphTag(first.tagName)) {
    return {
      contentNodes: first.children,
      childrenNodes: node.children.filter((child) => child !== first),
    };
  }
  if (isElementNode(first) && isBlockLevelNode(first)) {
    return { contentNodes: [], childrenNodes: node.children };
  }

  const firstBoundaryIndex = node.children.findIndex(
    (child, index) =>
      index >= firstSubstantialIndex &&
      isElementNode(child) &&
      isBlockLevelNode(child),
  );
  if (firstBoundaryIndex < 0) {
    return { contentNodes: node.children, childrenNodes: [] };
  }
  return {
    contentNodes: node.children.slice(0, firstBoundaryIndex),
    childrenNodes: node.children.slice(firstBoundaryIndex),
  };
};
