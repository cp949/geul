// document-import의 핵심 상호재귀 클러스터를 담당한다: segmentBlocks가 낸
// 세그먼트를 실제 Block으로 옮기고(blocksFromSegments), li/ul·ol을 목록
// 블록으로 해석하고(blocksFromListItem/blocksFromListElement), children
// wrapper·details/blockquote 재귀를 모두 처리해 노드 배열 하나를 Block[]로
// 만든다(blocksFromNodes) — 이 넷과 documentFromRoot는 서로 되돌아 호출하는
// 상호재귀라 순환 import를 피하려면 한 파일에 남아야 한다(계획 Ruling-01).
import {
  type Block,
  type Document,
  type IdFactory,
  type ListItemBlock,
  MAX_NESTING_DEPTH,
} from "@cp949/geul-model";

import { segmentBlocks } from "./block-segmenter.js";
import { propertyInteger, propertyString } from "./hast-properties.js";
import {
  classLanguages,
  firstDirectCode,
  isElementNode,
  isListElement,
  paragraphContentFromNodes,
  textBlockPropsFromElement,
  textValue,
} from "./import-html-helpers.js";
import {
  buildProductionListItemBlock,
  consumePreservedAttributeWarning,
  isStartNumberInRange,
  productionListItemType,
} from "./import-html-list.js";
import { mediaBlockFromNode } from "./import-html-media.js";
import { importBlockSegmentPolicy } from "./import-html-segment-policy.js";
import { parseTable } from "./import-html-table.js";
import {
  findChildrenWrapper,
  findDetailsWrapper,
  splitListItemChildren,
  splitQuoteChildren,
} from "./import-html-wrappers.js";
import type { HtmlElementNode, HtmlNode, HtmlRoot } from "./inline-content.js";
import {
  codeBlockLanguageMetadataIgnoredWarning,
  type HtmlImportWarning,
  nestedChildrenFlattenedWarning,
} from "./import-warnings.js";
import { hasSubstantialText } from "./table-layout.js";

// segmentBlocks의 경계 판정을 실제 Block으로 옮기는 변환 하나만 한다(재귀
// unwrap은 다루지 않는다 — blocksFromNodes가 감싼다). documentFromRoot의
// 기존 루프 그대로이고, DELTA-04는 이 함수를 두 자리에서 재사용한다: (1)
// 최상위 nodes 중 children wrapper가 아닌 나머지("평면" 구간), (2) wrapper
// 안의 <p>/<hN> 자기 콘텐츠 하나(blocksFromNodes 참고). depth·warnings는
// blockquote 세그먼트의 children 재귀(blocksFromNodes로 되돌아감)가 wrapper
// 재귀와 같은 깊이 가드를 받기 위해서만 받는다(DELTA-06a).
const blocksFromSegments = (
  nodes: readonly HtmlNode[],
  createId: IdFactory,
  depth: number,
  warnings: HtmlImportWarning[],
): Block[] => {
  const blocks: Block[] = [];

  for (const segment of segmentBlocks(nodes, importBlockSegmentPolicy)) {
    if (segment.kind === "paragraph") {
      // 경계 태그 없이 자연히 쌓인 pending(예: div/li 재귀 안 텍스트,
      // 인식하지 않는 태그 통과분)이라 originating 요소가 없다 — 기존
      // flushInlineNodes 관례를 그대로 따른다: collapse/normalize 없이
      // textValue(...).trim()으로만 실질 텍스트를 거르고, id는 항상
      // 새로 발급한다(이 gap은 이번 변경의 범위 밖이다).
      if (textValue(segment.nodes).trim().length > 0) {
        blocks.push({
          id: createId(),
          type: "paragraph",
          content: paragraphContentFromNodes(segment.nodes),
        });
      }
      continue;
    }
    if (segment.kind === "simpleBoundary") {
      // p 자신의 본문 — 기존 parseBlock 관례대로 실질 텍스트 여부와
      // 무관하게 항상 블록 하나를 낸다(빈 <p>도 빈 문단으로 보존).
      // dataBeBlockId는 p 요소 자신의 속성이라 segment.node에서 읽는다.
      blocks.push({
        id: propertyString(segment.node, "dataBeBlockId") ?? createId(),
        type: "paragraph",
        content: paragraphContentFromNodes(segment.nodes),
        ...textBlockPropsFromElement(segment.node),
      });
      continue;
    }
    if (segment.kind === "heading") {
      // level은 headingLevelByTagName의 값 타입(HeadingBlock["level"])을
      // 세그먼트가 그대로 실어 온다 — 캐스트도 재검증도 없다. dataBeBlockId는
      // heading 요소 자신의 속성이라 segment.node에서 읽는다(기존 parseBlock
      // 관례).
      blocks.push({
        id: propertyString(segment.node, "dataBeBlockId") ?? createId(),
        type: "heading",
        level: segment.level,
        content: paragraphContentFromNodes(segment.nodes),
        ...textBlockPropsFromElement(segment.node),
      });
      continue;
    }
    if (segment.kind === "hr") {
      // divider는 콘텐츠·children 없는 리프다(spec §4.2). 빈 <p>를 빈 문단으로
      // 보존하는 관례처럼 hr 하나당 divider 하나를 항상 낸다.
      blocks.push({
        id: propertyString(segment.node, "dataBeBlockId") ?? createId(),
        type: "divider",
      });
      continue;
    }
    if (segment.kind === "media") {
      // 4종 미디어 블록(RD-001-DELTA-02) — mediaBlockFromNode가 figure/div/
      // bare 시각 태그 세 형태를 모두 판별해 디코드한다. figure의 자식은
      // 여기서 재귀하지 않는다(segment.node 자체가 이미 완결된 leaf다) —
      // 중복 생성 방지 가드는 block-segmenter.ts의 media 세그먼트가 안쪽을
      // 재귀하지 않는다는 사실과 대칭이다.
      blocks.push(mediaBlockFromNode(segment.node, createId, warnings));
      continue;
    }
    if (segment.kind === "blockquote") {
      // quote(D6 — splitQuoteChildren). blockquote 하나당 quote 하나를 항상
      // 낸다(빈 <blockquote>도 빈 quote — 빈 <p> 관례와 같다). id는 children
      // 재귀보다 먼저 발급해 문서 순서(부모 → 자식)대로 html-N이 붙게 한다.
      // children은 blocksFromNodes로 되돌아가 wrapper·중첩 blockquote를 다시
      // 인식하며, wrapper와 같은 깊이 가드를 받는다: depth >= MAX_NESTING_DEPTH
      // 면 children 배열을 만들 수 없으므로 quote는 content만 지키고 children
      // 자리의 노드는 같은 depth의 형제 블록으로 평탄화한다 — 실제로 블록이
      // 나왔을 때만(공백뿐이면 잃는 구조가 없다) NESTED_CHILDREN_FLATTENED를
      // 경고한다(Issue #132, G-CNV-002). 같은 depth 재귀는 HTML 트리 한 단계를
      // 소비하므로 MAX_HTML_TREE_DEPTH로 유계다.
      const id = propertyString(segment.node, "dataBeBlockId") ?? createId();
      const { contentNodes, childrenNodes } = splitQuoteChildren(segment.node);
      const content = paragraphContentFromNodes(contentNodes);
      const quoteProps = textBlockPropsFromElement(segment.node);
      if (depth >= MAX_NESTING_DEPTH) {
        const flattened = blocksFromNodes(
          childrenNodes,
          createId,
          depth,
          warnings,
        );
        if (flattened.length > 0)
          warnings.push(nestedChildrenFlattenedWarning());
        blocks.push(
          { id, type: "quote", content, ...quoteProps },
          ...flattened,
        );
        continue;
      }
      const children = blocksFromNodes(
        childrenNodes,
        createId,
        depth + 1,
        warnings,
      );
      blocks.push(
        children.length > 0
          ? { id, type: "quote", content, ...quoteProps, children }
          : { id, type: "quote", content, ...quoteProps },
      );
      continue;
    }
    // document import 정책은 isListTag를 넘기지 않아 도달하지 않는다 —
    // 공유 union의 exhaustiveness 반영(DELTA-01, Issue #143 (b)), ul/ol
    // 매핑은 이 파일의 blocksFromListElement가 이미 따로 담당한다.
    if (segment.kind === "list") continue;
    if (segment.kind === "codeBlock") {
      const source = textValue(segment.node.children);
      const id = propertyString(segment.node, "dataBeBlockId") ?? createId();
      const directCode = firstDirectCode(segment.node);
      const directCodeDataLanguage =
        directCode === undefined
          ? undefined
          : propertyString(directCode, "dataLanguage");
      const preDataLanguage = propertyString(segment.node, "dataLanguage");
      const directCodeClassLanguages =
        directCode === undefined ? [] : classLanguages(directCode);
      const preClassLanguages = classLanguages(segment.node);
      const selectionCandidates = [
        directCodeDataLanguage,
        preDataLanguage,
        directCodeClassLanguages[0],
        preClassLanguages[0],
      ].filter((value): value is string => value !== undefined);
      const language = selectionCandidates[0];
      const exactMetadataCandidates = [
        directCodeDataLanguage,
        preDataLanguage,
        ...directCodeClassLanguages,
        ...preClassLanguages,
      ].filter((value): value is string => value !== undefined);
      if (
        language !== undefined &&
        exactMetadataCandidates.some((candidate) => candidate !== language)
      ) {
        warnings.push(codeBlockLanguageMetadataIgnoredWarning(id));
      }
      blocks.push({
        id,
        type: "codeBlock",
        content: source.length === 0 ? [] : [{ text: source }],
        ...(language === undefined ? {} : { language }),
      });
      continue;
    }

    // caption 등 표 직속 비섹션 자식(thead/tbody/tfoot/tr/colgroup이 아닌
    // 나머지)은 sanitize가 unwrap한 caption 텍스트가 대표 사례다(caption은
    // htmlAllowedTagNames에 없다). parseTable은 이 노드들을 읽지 않으므로
    // 표 블록 앞에 문단으로 옮겨 담지 않으면 조용히 사라진다(이슈 #70).
    // 표 직속 비섹션 자식 사이에는 HTML5 tree construction 규칙상
    // foster-parenting되지 않는 구조적 공백(들여쓰기·개행) 텍스트 노드가
    // 그대로 남는다. 노드 단위로 "통째로 공백뿐인가"만 걸러내고, 실질
    // 텍스트가 있는 노드(caption 자체의 앞뒤 공백 포함)는 내부를 손대지
    // 않는다 — 일반 문단 생성 경로의 collapse-없음 관례를 그대로 따른다.
    const nonSectionChildren = segment.nonSectionChildren.filter((child) =>
      hasSubstantialText(textValue([child])),
    );
    if (nonSectionChildren.length > 0) {
      blocks.push({
        id: createId(),
        type: "paragraph",
        content: paragraphContentFromNodes(nonSectionChildren),
      });
    }
    blocks.push(parseTable(segment.node, createId));
  }

  return blocks;
};

// sanitized li 하나를 목록 블록으로 만든다. children depth가 model 상한에
// 닿으면 부모 항목은 유지하고 초과 블록을 같은 배열의 뒤쪽 형제로 내보낸다.
// quote/wrapper 경계와 같은 NESTED_CHILDREN_FLATTENED 계약이다.
const blocksFromListItem = (
  node: HtmlElementNode,
  listType: ListItemBlock["type"],
  startNumber: number | undefined,
  createId: IdFactory,
  depth: number,
  warnings: HtmlImportWarning[],
): Block[] => {
  const id = propertyString(node, "dataBeBlockId") ?? createId();
  const { contentNodes, childrenNodes } = splitListItemChildren(node);
  const content = paragraphContentFromNodes(contentNodes);
  const listItemProps = textBlockPropsFromElement(node);
  const ownBlock: ListItemBlock =
    listType === "numberedListItem"
      ? {
          id,
          type: "numberedListItem",
          content,
          ...(startNumber === undefined ? {} : { startNumber }),
          ...listItemProps,
        }
      : listType === "checkListItem"
        ? {
            id,
            type: "checkListItem",
            content,
            checked: propertyString(node, "dataBeChecked") === "true",
            ...listItemProps,
          }
        : { id, type: "bulletListItem", content, ...listItemProps };

  if (depth >= MAX_NESTING_DEPTH) {
    const flattened = blocksFromNodes(childrenNodes, createId, depth, warnings);
    if (flattened.length > 0) {
      warnings.push(nestedChildrenFlattenedWarning());
    }
    return [ownBlock, ...flattened];
  }

  const children = blocksFromNodes(
    childrenNodes,
    createId,
    depth + 1,
    warnings,
  );
  return children.length > 0 ? [{ ...ownBlock, children }] : [ownBlock];
};

// ul/ol 직속 li를 문서 순서대로 목록 항목으로 해석한다. ol[start]는 HTML
// 컨테이너의 첫 li에만 명시 startNumber로 붙는다. 별도 default ol이 같은
// model sibling scope의 번호 항목 바로 뒤에 오면 HTML의 새 컨테이너가 뜻하는
// 1 재시작을 첫 항목에 명시한다. 같은 ol의 후속 li에는 복제하지 않는다.
// malformed 비-li flow content도 버리지 않고 기존 blocksFromNodes 경계로
// 형제 블록화한다. model 범위를 벗어난 start(음수 등)는 explicit start가
// 아예 없었던 것처럼 접는다 — 검증 없이 아래로 흘려보내면 이 함수가 만드는
// Document 전체가 뒤이은 parseDocument에서 거절돼 목록 아닌 나머지
// 콘텐츠까지 통째로 사라진다(RD-005 readiness probe 실측 — 옛
// list-paste-fallback-extension.ts가 이미 같은 접이식 정책을 썼다).
const blocksFromListElement = (
  node: HtmlElementNode & { tagName: "ul" | "ol" },
  createId: IdFactory,
  depth: number,
  warnings: HtmlImportWarning[],
  restartDefaultOrderedList: boolean,
): Block[] => {
  const blocks: Block[] = [];
  let nonItemRun: HtmlNode[] = [];
  let itemIndex = 0;
  let flowInterruptedSinceItem = false;
  const rawExplicitStart =
    node.tagName === "ol" ? propertyInteger(node, "start", Number.NaN) : NaN;
  const explicitStart =
    Number.isInteger(rawExplicitStart) && isStartNumberInRange(rawExplicitStart)
      ? rawExplicitStart
      : Number.NaN;

  const flushNonItemRun = (): void => {
    if (nonItemRun.length === 0) return;
    const previousLength = blocks.length;
    blocks.push(...blocksFromNodes(nonItemRun, createId, depth, warnings));
    if (itemIndex > 0 && blocks.length > previousLength) {
      flowInterruptedSinceItem = true;
    }
    nonItemRun = [];
  };

  for (const child of node.children) {
    if (!isElementNode(child) || child.tagName !== "li") {
      nonItemRun.push(child);
      continue;
    }
    flushNonItemRun();
    if (propertyString(child, "dataBeBlockId") !== undefined) {
      consumePreservedAttributeWarning(warnings, "li", "dataBeBlockId");
    }
    // TextBlockProps 3필드(RD-004 DELTA-02)도 li/dataBeBlockId와 같은 raw
    // 오탐 패턴이다 — 셋 중 있는 것만 개별로 억제한다.
    if (propertyString(child, "dataBeTextColor") !== undefined) {
      consumePreservedAttributeWarning(warnings, "li", "dataBeTextColor");
    }
    if (propertyString(child, "dataBeBackgroundColor") !== undefined) {
      consumePreservedAttributeWarning(warnings, "li", "dataBeBackgroundColor");
    }
    if (propertyString(child, "dataBeTextAlignment") !== undefined) {
      consumePreservedAttributeWarning(warnings, "li", "dataBeTextAlignment");
    }
    // data-be-checked 존재 여부가 tag보다 우선한다 — own export는 항상
    // <ul>에 checkListItem을 낸다(로드맵 D3). 속성이 있으면 own-format
    // 계약이라 raw 오탐 경고도 함께 억제한다.
    const isCheckListItem =
      propertyString(child, "dataBeChecked") !== undefined;
    if (isCheckListItem) {
      consumePreservedAttributeWarning(warnings, "li", "dataBeChecked");
    }
    if (
      node.tagName === "ol" &&
      itemIndex === 0 &&
      Number.isInteger(explicitStart)
    ) {
      consumePreservedAttributeWarning(warnings, "ol", "start");
    }
    const startNumber =
      itemIndex === 0 && Number.isInteger(explicitStart)
        ? explicitStart
        : itemIndex === 0 &&
            blocks.length === 0 &&
            restartDefaultOrderedList &&
            !Number.isInteger(explicitStart)
          ? 1
          : itemIndex > 0 && flowInterruptedSinceItem
            ? (Number.isInteger(explicitStart) ? explicitStart : 1) + itemIndex
            : undefined;
    blocks.push(
      ...blocksFromListItem(
        child,
        isCheckListItem
          ? "checkListItem"
          : node.tagName === "ul"
            ? "bulletListItem"
            : "numberedListItem",
        startNumber,
        createId,
        depth,
        warnings,
      ),
    );
    itemIndex += 1;
    flowInterruptedSinceItem = false;
  }
  flushNonItemRun();
  return blocks;
};

// wrapper 재귀 해제 안전장치(G-CNV-001, PIT-0034) — model의
// findNestingDepthViolation(schema.ts)과 같은 모양의 가드다: depth <
// MAX_NESTING_DEPTH(64, blocks 배열 자체가 depth 1)일 때만 wrapper를
// 인식해 한 단계 더 내려가므로, 이 함수의 재귀 프레임과 만들어지는
// Document의 children 깊이가 모두 정확히 MAX_NESTING_DEPTH 안에서 끝난다 —
// 뒤이은 parseDocument의 DOCUMENT_LIMIT_EXCEEDED 거절에 기대지 않는다.
// 상한에 걸린 wrapper(depth >= MAX_NESTING_DEPTH에서 인식된 것)는 전면
// 거절하는 대신 그 자리 노드를 plainRun으로 넘겨 segmentBlocks 평면
// 처리로 평탄화하고, 실제로 잃는 구조(비어 있지 않은 children 컨테이너)가
// 있을 때만 NESTED_CHILDREN_FLATTENED를 경고한다(Issue #132, G-CNV-002 —
// 보이는 텍스트는 형제 문단으로 보존된다).
//
// plainRun으로 넘어간 노드가 들어가는 segmentBlocks(block-segmenter.ts의
// walk) 재귀와 import-html-helpers.ts의 textValue·createDefaultIdFactory
// 재귀는 깊이 제한이 없지만, parseHtmlFragment의 깊이-캡(MAX_HTML_TREE_DEPTH,
// Issue #130)이 HTML 트리 자체를 parse 직후에 절단하므로 전부 그 상수로
// 유계다. 캡 "이전"인 파서 라이브러리 내부 재귀(parse5의 EOF template
// 정리 — 닫히지 않은 중첩 template)만은 캡이 못 막는데, 그 구간은 우연한
// 최외곽 catch가 아니라 parseHtmlFragment 자신의 설계된 경계 catch가 받아
// undefined → HTML_PARSE_FAILED로 흡수된다(PIT-0034가 경계하는 "우연한
// catch 의존"은 결정 6 + 그 경계 catch로 제거됐다).
const blocksFromNodes = (
  nodes: readonly HtmlNode[],
  createId: IdFactory,
  depth: number,
  warnings: HtmlImportWarning[],
): Block[] => {
  const blocks: Block[] = [];
  let plainRun: HtmlNode[] = [];

  const flushPlainRun = (): void => {
    if (plainRun.length === 0) return;
    blocks.push(...blocksFromSegments(plainRun, createId, depth, warnings));
    plainRun = [];
  };

  for (const node of nodes) {
    if (isListElement(node)) {
      flushPlainRun();
      const previousBlock = blocks[blocks.length - 1];
      blocks.push(
        ...blocksFromListElement(
          node,
          createId,
          depth,
          warnings,
          node.tagName === "ol" && previousBlock?.type === "numberedListItem",
        ),
      );
      continue;
    }
    const details = findDetailsWrapper(node);
    if (details !== undefined) {
      if (depth >= MAX_NESTING_DEPTH) {
        // findChildrenWrapper의 depth 가드와 동일 원칙(63행 부근) — 정확히
        // 상한 깊이로 끝나는 체인은 경고하지 않는다.
        if (details.childrenNodes.length > 0) {
          warnings.push(nestedChildrenFlattenedWarning());
        }
        plainRun.push(node);
        continue;
      }

      flushPlainRun();
      // own-format 마커·구조를 raw HAST에서도 이미 확인했으므로(findDetailsWrapper)
      // sanitize가 details의 신규 속성 전부(공유 htmlAllowedAttributes에
      // "details" 항목 자체가 없어 전부 raw 오탐 대상이다)를 보존한 이번
      // 결과에 대한 raw "제거됨" 오탐만 지운다(consumePreservedAttributeWarning,
      // li/ol과 동일 패턴).
      consumePreservedAttributeWarning(warnings, "details", "dataBeBlockId");
      consumePreservedAttributeWarning(warnings, "details", "dataBeToggleable");
      consumePreservedAttributeWarning(warnings, "details", "dataBeCollapsed");
      consumePreservedAttributeWarning(warnings, "details", "open");
      const children = blocksFromNodes(
        details.childrenNodes,
        createId,
        depth + 1,
        warnings,
      );

      if (details.kind === "heading") {
        const headingBlocks = blocksFromSegments(
          [details.ownNode],
          createId,
          depth,
          warnings,
        );
        const headingBlock = headingBlocks[0];
        if (
          headingBlocks.length !== 1 ||
          headingBlock === undefined ||
          headingBlock.type !== "heading"
        ) {
          // findDetailsWrapper가 ownNode를 h1~h6로만 걸렀으므로 정상 입력에서
          // 도달하지 않는다(findChildrenWrapper의 동일 방어 분기와 같은 이유).
          plainRun.push(node);
          continue;
        }
        blocks.push({
          ...headingBlock,
          isToggleable: true,
          ...(details.collapsed === undefined
            ? {}
            : { collapsed: details.collapsed }),
          ...(children.length > 0 ? { children } : {}),
        });
        continue;
      }

      if (propertyString(details.summaryNode, "dataBeBlockId") !== undefined) {
        consumePreservedAttributeWarning(warnings, "summary", "dataBeBlockId");
      }
      // TextBlockProps 3필드(RD-004 DELTA-02)도 summary/dataBeBlockId와 같은
      // raw 오탐 패턴이다 — 셋 중 있는 것만 개별로 억제한다.
      if (
        propertyString(details.summaryNode, "dataBeTextColor") !== undefined
      ) {
        consumePreservedAttributeWarning(
          warnings,
          "summary",
          "dataBeTextColor",
        );
      }
      if (
        propertyString(details.summaryNode, "dataBeBackgroundColor") !==
        undefined
      ) {
        consumePreservedAttributeWarning(
          warnings,
          "summary",
          "dataBeBackgroundColor",
        );
      }
      if (
        propertyString(details.summaryNode, "dataBeTextAlignment") !== undefined
      ) {
        consumePreservedAttributeWarning(
          warnings,
          "summary",
          "dataBeTextAlignment",
        );
      }
      const id =
        propertyString(details.summaryNode, "dataBeBlockId") ?? createId();
      const content = paragraphContentFromNodes(details.summaryNode.children);
      blocks.push({
        id,
        type: "toggleListItem",
        content,
        ...(details.collapsed === undefined
          ? {}
          : { collapsed: details.collapsed }),
        ...textBlockPropsFromElement(details.summaryNode),
        ...(children.length > 0 ? { children } : {}),
      });
      continue;
    }
    const wrapper = findChildrenWrapper(node);
    if (wrapper === undefined) {
      plainRun.push(node);
      continue;
    }
    if (depth >= MAX_NESTING_DEPTH) {
      // children 컨테이너가 비어 있으면(정확히 상한 깊이로 끝나는 체인)
      // 평탄화 결과가 wrapper를 인식했을 때와 동일하므로 경고하지 않는다 —
      // 64단 입력의 기존 산출·경고를 그대로 유지한다.
      if (wrapper.childrenNodes.length > 0) {
        warnings.push(nestedChildrenFlattenedWarning());
      }
      plainRun.push(node);
      continue;
    }

    flushPlainRun();
    // 목록류 own-content(전부 div 태그)는 blocksFromSegments(범용
    // segmentBlocks)를 거치지 않는다 — segmentBlocks의 정책은 tagName
    // 기반이라 generic div를 항상 paragraph로만 보고 목록류 4타입을 낼 수
    // 없다(RD-003). buildProductionListItemBlock이 own-content div를 직접
    // 목록 블록으로 만든다.
    const listItemType = productionListItemType(wrapper.ownNode);
    const rawOwnBlock =
      listItemType === undefined
        ? (() => {
            const ownBlocks = blocksFromSegments(
              [wrapper.ownNode],
              createId,
              depth,
              warnings,
            );
            const candidate = ownBlocks[0];
            return ownBlocks.length === 1 &&
              candidate !== undefined &&
              (candidate.type === "paragraph" ||
                candidate.type === "heading" ||
                candidate.type === "quote" ||
                candidate.type === "codeBlock")
              ? candidate
              : undefined;
          })()
        : buildProductionListItemBlock(listItemType, wrapper.ownNode, createId);
    if (rawOwnBlock === undefined) {
      // findChildrenWrapper가 ownNode를 own-content 태그로만 걸렀으므로
      // 정상 입력에서 이 분기는 도달하지 않는다 — 그 태그가 (HTML5
      // 파싱상 가능한) 표를 품고 있어 segmentBlocks가 블록 하나 대신
      // 여러/다른(own-content 이외 — children을 가질 수 없는 divider
      // 포함) 세그먼트를 냈을 때만 방어적으로 wrapper 인식을 취소하고
      // 원본 노드를 평면 처리로 되돌린다. 목록류 분기(listItemType 있음)는
      // buildProductionListItemBlock이 항상 값을 반환하므로 이 갈래로
      // 오지 않는다.
      plainRun.push(node);
      continue;
    }

    // own-export는 own-content 태그(p/hN 등) 자신에 dataBeBlockId를 싣고,
    // 바깥 wrapper div의 같은 속성은 순전히 장식이다 — wrapper id는 항상
    // 버려지고 own-content 자신의 id(또는 없으면 새로 발급한 id)가
    // 이긴다(기존 계약, html-security-block-boundary.test.ts의 깊이-체인
    // 픽스처가 서로 다른 id로 이를 고정한다). 생산 편집기는 반대로
    // own-content 태그 자신에 id를 싣지 않고 바깥 blockContainer div
    // (RD-002)에만 싣는다 — ownNode 자신이 id가 없을 때만 바깥 id로
    // 보충해 두 계약을 함께 만족한다.
    const ownNodeHasOwnBlockId =
      propertyString(wrapper.ownNode, "dataBeBlockId") !== undefined;
    // findChildrenWrapper가 node를 div element로만 인정해 wrapper를
    // 반환했으므로 isElementNode는 항상 true다 — TS 좁히기 목적으로만
    // 확인한다.
    const outerBlockId =
      !ownNodeHasOwnBlockId && isElementNode(node)
        ? propertyString(node, "dataBeBlockId")
        : undefined;
    const ownBlock =
      outerBlockId === undefined
        ? rawOwnBlock
        : { ...rawOwnBlock, id: outerBlockId };

    const children = blocksFromNodes(
      wrapper.childrenNodes,
      createId,
      depth + 1,
      warnings,
    );
    // codeBlock(model CodeBlock)엔 children 필드가 없다 — findChildrenWrapper
    // 가 이미 pre를 2-child(children 컨테이너 형제 있음) 분기에서 거절해
    // children이 항상 빈 배열이지만, 그 보장은 값 단계라 타입엔 드러나지
    // 않는다. 판정식에 타입 좁히기를 그대로 반영해 스프레드가 CodeBlock에
    // 없는 키를 얹지 않게 한다.
    blocks.push(
      children.length > 0 && ownBlock.type !== "codeBlock"
        ? { ...ownBlock, children }
        : ownBlock,
    );
  }
  flushPlainRun();

  return blocks;
};

export const documentFromRoot = (
  root: HtmlRoot,
  createId: IdFactory,
  warnings: HtmlImportWarning[],
): Document => {
  const blocks = blocksFromNodes(root.children, createId, 1, warnings);
  return { formatVersion: 1, revision: 0, blocks };
};
