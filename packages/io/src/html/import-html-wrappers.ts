// exportHtml이 children 재귀·D6 인용문 분할·details/summary 토글을 왕복하려고
// 내는 구조적 wrapper를 구조로만 인식한다: children wrapper 판별
// (findChildrenWrapper), toggle details/summary 판별(findDetailsWrapper),
// li/blockquote 직속 자식을 own-content와 children으로 나누는 분할
// (splitListItemChildren/splitQuoteChildren)까지 — "부분 일치를 관대하게
// 봐주지 않는다" 원칙을 공유하는 구조 판정 묶음이다.
import { isParagraphTag } from "./block-segmenter.js";
import { propertyString } from "./hast-properties.js";
import { isElementNode, textValue } from "./import-html-helpers.js";
import { productionListItemType } from "./import-html-list.js";
import {
  headingLevelByTagName,
  importBlockSegmentPolicy,
} from "./import-html-segment-policy.js";
import type {
  HtmlElementContent,
  HtmlElementNode,
  HtmlNode,
} from "./inline-content.js";
import { hasSubstantialText } from "./table-layout.js";

// blockquote 직속 자식 중 "블록 자리를 차지하는" 요소 판정 — segmentBlocks가
// importBlockSegmentPolicy로 경계·컨테이너·표로 인식하는 태그와 정확히 같은
// 집합이다(그 외 요소와 텍스트는 인라인이라 pending으로 쌓인다). D6의 "첫
// 자식이 문단인가/비문단인가"는 이 판정 위에서만 뜻이 있다 — strong 같은
// 인라인 요소를 블록으로 세면 인라인만 든 인용문이 빈 content가 된다.
const isBlockLevelElement = (node: HtmlElementNode): boolean =>
  importBlockSegmentPolicy.isSimpleBoundary(node.tagName) ||
  importBlockSegmentPolicy.headingLevelFromTagName(node.tagName) !==
    undefined ||
  importBlockSegmentPolicy.isDividerTag?.(node.tagName) === true ||
  importBlockSegmentPolicy.isQuoteTag?.(node.tagName) === true ||
  importBlockSegmentPolicy.isCodeBlockTag?.(node.tagName) === true ||
  importBlockSegmentPolicy.isNestedBoundary(node.tagName) ||
  importBlockSegmentPolicy.isTransparent(node.tagName) ||
  importBlockSegmentPolicy.isTableNode(node) ||
  importBlockSegmentPolicy.isMediaNode?.(node) === true;

// li가 목록 블록의 안정 ID와 content를 직접 소유한다(RD-003 HTML 정규형).
// 첫 실질 자식이 p면 그 p는 content wrapper일 뿐 별도 paragraph/ID가 아니다.
// direct inline run으로 시작하면 첫 block boundary 전까지가 content이고,
// 이후 flow content는 종류와 무관하게 children 변환 경계로 넘긴다.
export const splitListItemChildren = (
  node: HtmlElementNode,
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
  if (isElementNode(first) && isBlockLevelElement(first)) {
    return { contentNodes: [], childrenNodes: node.children };
  }

  const firstBoundaryIndex = node.children.findIndex(
    (child, index) =>
      index >= firstSubstantialIndex &&
      isElementNode(child) &&
      isBlockLevelElement(child),
  );
  if (firstBoundaryIndex < 0) {
    return { contentNodes: node.children, childrenNodes: [] };
  }
  return {
    contentNodes: node.children.slice(0, firstBoundaryIndex),
    childrenNodes: node.children.slice(firstBoundaryIndex),
  };
};

// D6(blockquote 분할 규칙, spec §7.1): blockquote의 자식을 quote content와
// children으로 나눈다. 머리(공백뿐인 텍스트를 건너뛴 첫 실질 노드)가
// <p>면 그 인라인이 content이고 나머지 자식이 children이다(export-html.ts가
// 내는 <blockquote><p>content</p>[<div data-be-children>]> 형상의 역변환).
// 머리가 h2·ul·중첩 blockquote처럼 비문단 블록이면 content는 비고 전부
// children이다. 머리가 텍스트나 인라인 요소면(손으로 쓴 HTML에서만
// 나타난다 — geul 자체 export는 own content를 항상 <p>로 감싼다)
// splitListItemChildren과 동일한 규칙을 쓴다: 블록 형제가 하나도 없으면
// 인라인 전체가 content이고, 있으면 첫 block-boundary 전까지를 content로
// 승격하고 boundary부터를 children으로 넘긴다(Issue #142 정정 — 이전에는
// 이 분기에서 content를 항상 비우고 전부 children으로 넘겼다. 근거로 든
// "승격하면 문서 순서가 어긋난다"는 실측에서 재현되지 않았다: content는
// blockContainer 스키마상 children보다 항상 먼저 렌더링되므로 승격해도
// 순서는 그대로 보존된다 — 차이는 순서가 아니라 구조적 귀속뿐이었다).
// children 자리가 export가 낸 단일 data-be-children 컨테이너뿐이면 그 안의
// 노드를 꺼낸다 — 컨테이너 div를 그대로 넘기면 segmentBlocks가 div를 문단
// 경계로 걸어 들어가 그 안의 children wrapper를 평면 처리해 버린다(문단
// head·비문단 블록 head 분기에서만 나타나는 형상이라 아래 두 분기에만
// 적용한다).
export const splitQuoteChildren = (
  node: HtmlElementNode,
): { contentNodes: HtmlNode[]; childrenNodes: HtmlNode[] } => {
  const head = node.children.find(
    (child) => isElementNode(child) || hasSubstantialText(textValue([child])),
  );
  if (head === undefined) return { contentNodes: [], childrenNodes: [] };

  if (!isElementNode(head) || !isBlockLevelElement(head)) {
    const headIndex = node.children.indexOf(head);
    const firstBoundaryIndex = node.children.findIndex(
      (child, index) =>
        index >= headIndex &&
        isElementNode(child) &&
        isBlockLevelElement(child),
    );
    if (firstBoundaryIndex < 0) {
      return { contentNodes: node.children, childrenNodes: [] };
    }
    return {
      contentNodes: node.children.slice(0, firstBoundaryIndex),
      childrenNodes: node.children.slice(firstBoundaryIndex),
    };
  }

  const rest = isParagraphTag(head.tagName)
    ? node.children.filter((child) => child !== head)
    : node.children;
  const contentNodes = isParagraphTag(head.tagName) ? head.children : [];

  const restElements = rest.filter(isElementNode);
  const container = restElements[0];
  const isSingleChildrenContainer =
    restElements.length === 1 &&
    container !== undefined &&
    container.tagName === "div" &&
    propertyString(container, "dataBeChildren") !== undefined &&
    !rest.some(
      (child) =>
        !isElementNode(child) && hasSubstantialText(textValue([child])),
    );
  return {
    contentNodes,
    childrenNodes:
      isSingleChildrenContainer && container !== undefined
        ? container.children
        : rest,
  };
};

// p/h1~h6(own-export가 기존에 쓰던 own-content 태그)에 blockquote·pre를
// 더한다 — 생산 편집기는 quote·codeBlock도 같은 blockContainer wrapper로
// 감싸 own-content 자리에 낸다(RD-002, quote-extension.ts/
// code-block-extension.ts). divider는 여기 들어가지 않는다 — model
// DividerBlock에 children 필드가 없어 own-content(=children을 가질 수
// 있는 부모) 자리에 올 수 없고, child 자리(childrenNodes 재귀)로만
// 등장한다. 목록류 4종(전부 div 태그)은 productionListItemType의 마커
// 판정으로 더한다(RD-003) — tagName만으로는 wrapper div와 구분할 수 없다.
const isOwnBoundaryTag = (node: HtmlElementNode): boolean =>
  isParagraphTag(node.tagName) ||
  headingLevelByTagName.has(node.tagName) ||
  node.tagName === "blockquote" ||
  node.tagName === "pre" ||
  productionListItemType(node) !== undefined;

// 컨테이너 div가 children 목록 wrapper임을 나타내는 두 마커 — own-export의
// dataBeChildren(값 "1")과 생산 편집기 in-editor copy의 dataBeBlockGroup
// (BlockGroupExtension이 항상 빈 문자열로 낸다, block-container-extension.ts)
// 은 alternate 표현일 뿐 의미가 같다(RD-002). dataBeBlockGroup은 값이 항상
// 빈 문자열이라 propertyString(빈 문자열을 "없음"으로 접는다)로는 존재
// 여부를 판정할 수 없어 raw property 존재만 직접 확인한다.
const isChildrenContainerMarker = (node: HtmlElementNode): boolean =>
  propertyString(node, "dataBeChildren") !== undefined ||
  node.properties.dataBeBlockGroup !== undefined;

// exportHtml(blockNode)이 낸 children wrapper를 구조로만 인식한다: div
// 자식이 정확히 2개(실질 텍스트가 섞이지 않은 순수 2-element), 첫째는
// p/h1~h6(그 블록 자신의 본문 — hr은 children을 가질 수 없는 divider라
// export가 이 자리에 절대 내지 않으므로 보지 않는다), 둘째는 dataBeChildren이
// 있는 div(children 목록)다. 이 두 자리 중 하나라도 어긋나면 wrapper로 보지
// 않고 undefined를 반환한다 — 호출자(blocksFromNodes)는 그 경우 원본 노드를 그대로
// 평면 처리(segmentBlocks)로 넘긴다. 부분 일치를 관대하게 봐주지 않는 이유:
// export가 절대 내지 않는 애매한 구조까지 wrapper로 오인하면 사용자가 직접
// 쓴 임의의 div(예: <div>STRAY<p>a</p><div data-be-children>b</div></div>)가
// 뜻하지 않게 중첩 구조로 해석되고, 그 사이·앞뒤에 낀 실질 텍스트("STRAY")가
// 결과 어디에도 담기지 못한 채 조용히 사라진다(G-CNV-002 위반 — 트랙-2
// 라운드5 리뷰가 실측한 결함, 즉시 정정). 그래서 두 element 자리를 확인하기
// 전에 먼저 element가 아닌 형제(text·comment 등)에 실질 텍스트가 있는지부터
// 걸러 wrapper 인식 자체를 취소한다(공백만 있는 텍스트는 원래 export가 내는
// 형태에도 나올 수 있어 통과시킨다 — 기존 caption 처리(`hasSubstantialText`)
// 와 같은 판정 기준). 반대로 못 알아보면 기존 NESTED_BOUNDARY_TAG_NAMES
// 평면 처리로 안전하게 떨어지므로(완료 조건 1의 변이 시나리오와 동일한
// 경로) 실패 방향이 항상 더 보수적이다.
export const findChildrenWrapper = (
  node: HtmlNode,
):
  | { ownNode: HtmlElementNode; childrenNodes: HtmlElementContent[] }
  | undefined => {
  if (node.type !== "element" || node.tagName !== "div") return undefined;

  const hasStrayText = node.children.some(
    (child) => !isElementNode(child) && hasSubstantialText(textValue([child])),
  );
  if (hasStrayText) return undefined;

  const elementChildren = node.children.filter(isElementNode);

  // 생산 편집기는 children 없는 leaf 블록도 예외 없이 blockContainer로
  // 감싼다(BlockContainerExtension) — own-export(children 있을 때만 감싼다)
  // 와 달리 "own-content 하나만" 형태가 나온다. 임의 외부 HTML(예:
  // `<div><p>...</p></div>` 같은 흔한 CMS 출력)까지 오인식하지 않도록
  // 바깥 div 자신이 비어 있지 않은 dataBeBlockId를 가질 때만 인정한다 —
  // own·생산 편집기 둘 다 이 마커를 실제로 싣지만, 임의 외부 HTML은
  // 이 저장소 전용 속성명을 우연히 쓸 가능성이 사실상 없다.
  if (elementChildren.length === 1) {
    const soleChild = elementChildren[0];
    if (soleChild === undefined || !isOwnBoundaryTag(soleChild)) {
      return undefined;
    }
    if (propertyString(node, "dataBeBlockId") === undefined) {
      return undefined;
    }
    return { ownNode: soleChild, childrenNodes: [] };
  }

  if (elementChildren.length !== 2) return undefined;

  const ownNode = elementChildren[0];
  const containerNode = elementChildren[1];
  if (ownNode === undefined || containerNode === undefined) return undefined;
  if (!isOwnBoundaryTag(ownNode)) return undefined;
  // codeBlock(model CodeBlock)은 divider와 같은 이유로 children 필드가
  // 없는 리프다 — blockContainer.content 표현("(nestableBlockContent
  // blockGroup?) | leafBlockContent")도 leafBlockContent 뒤에 blockGroup을
  // 절대 허용하지 않는다. pre가 own-content이면서 children 컨테이너
  // 형제까지 있는 입력은 정상 생산 출력에 존재할 수 없으므로 방어적으로
  // wrapper 인식을 취소한다(위 findChildrenWrapper 1-child 분기는 pre를
  // 그대로 인정한다 — children 없는 codeBlock은 정상이다).
  if (ownNode.tagName === "pre") return undefined;
  if (
    containerNode.tagName !== "div" ||
    !isChildrenContainerMarker(containerNode)
  ) {
    return undefined;
  }

  return { ownNode, childrenNodes: containerNode.children };
};

// isToggleable heading·toggleListItem이 공유하는 <details> 표현을 구조로만
// 인식한다(로드맵 D4, RD-005-DELTA-01.md "착수 전 결정" — findChildrenWrapper와
// 같은 "부분 일치를 관대하게 봐주지 않는다" 원칙). own-format 마커
// (data-be-toggleable="true")와 구조(첫 element 자식이 정확히 <summary>,
// 있으면 둘째는 dataBeChildren 있는 <div>) 둘 다 확인한다 — 손으로 쓴
// <details>(예: FAQ 아코디언)를 own-format으로 오인하지 않기 위해서다.
// <summary>의 유일한 element 자식이 h1~h6고 다른 실질 텍스트가 없으면
// heading(<summary>가 <hN>을 감싼 것), 아니면 toggleListItem(<summary>가
// own content를 직접 담음, <li>가 없는 목록 항목이라 여기서 처음 id가
// 등장한다)이다.
export const findDetailsWrapper = (
  node: HtmlNode,
):
  | {
      kind: "heading";
      ownNode: HtmlElementNode;
      collapsed: boolean | undefined;
      childrenNodes: HtmlElementContent[];
    }
  | {
      kind: "toggleListItem";
      summaryNode: HtmlElementNode;
      collapsed: boolean | undefined;
      childrenNodes: HtmlElementContent[];
    }
  | undefined => {
  if (node.type !== "element" || node.tagName !== "details") return undefined;
  if (propertyString(node, "dataBeToggleable") !== "true") return undefined;

  const hasStrayText = node.children.some(
    (child) => !isElementNode(child) && hasSubstantialText(textValue([child])),
  );
  if (hasStrayText) return undefined;

  const elementChildren = node.children.filter(isElementNode);
  if (elementChildren.length < 1 || elementChildren.length > 2)
    return undefined;

  const summaryNode = elementChildren[0];
  if (summaryNode === undefined || summaryNode.tagName !== "summary") {
    return undefined;
  }

  const containerNode = elementChildren[1];
  let childrenNodes: HtmlElementContent[] = [];
  if (containerNode !== undefined) {
    if (
      containerNode.tagName !== "div" ||
      propertyString(containerNode, "dataBeChildren") === undefined
    ) {
      return undefined;
    }
    childrenNodes = containerNode.children;
  }

  const collapsedAttr = propertyString(node, "dataBeCollapsed");
  const collapsed =
    collapsedAttr === undefined ? undefined : collapsedAttr === "true";

  const summaryHasStrayText = summaryNode.children.some(
    (child) => !isElementNode(child) && hasSubstantialText(textValue([child])),
  );
  const summaryElementChildren = summaryNode.children.filter(isElementNode);
  const headingChild = summaryElementChildren[0];
  if (
    !summaryHasStrayText &&
    summaryElementChildren.length === 1 &&
    summaryNode.children.length === 1 &&
    headingChild !== undefined &&
    headingLevelByTagName.has(headingChild.tagName)
  ) {
    return { kind: "heading", ownNode: headingChild, collapsed, childrenNodes };
  }

  return { kind: "toggleListItem", summaryNode, collapsed, childrenNodes };
};
