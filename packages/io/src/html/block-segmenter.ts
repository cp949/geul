import type {
  HtmlElementContent,
  HtmlElementNode,
  HtmlNode,
} from "./inline-content.js";
import { htmlElement } from "./inline-content.js";
import { tableNonSectionChildren } from "./table-layout.js";

// import-html.ts(documentFromRoot)와 clipboard-table-parser.ts
// (blockSequenceFromNodes)가 각자 재구현하던 "HAST 노드 시퀀스를 문단/헤딩/
// 구분선/표 경계로 쪼개는" 재귀 알고리즘을 여기 하나로 모은다(아키텍처
// 리뷰 2차 후보 G). 두 소비자는 경계 태그 집합과 표 판정만 다르고 재귀
// 구조 자체는 동일했다 — import-html.ts는 애초에 이 재귀가 없어(최상위
// 노드만 훑는 평면 루프) div/li/blockquote/ul/ol처럼 중첩 가능한 경계를
// 인식하지 못했고, 그 결과가 Issue #113과 같은 종류의 병합 버그였다
// (clipboard 경로는 #113으로 이미 고쳐졌지만 import 경로는 반영되지 않았다).
//
// 이 모듈은 의도적으로 "판정"만 하고 "해석"은 하지 않는다 — 각 세그먼트의
// 텍스트 정규화(공백 접기 여부), 실질 텍스트 판정, id 발급, 표 셀 파싱은
// 전부 호출자 몫이다(그릴링 결정: 문단 경계 태그 집합만 공유, 그 외 정책은
// 경로별로 남긴다). 그래서 반환 타입은 최종 Block이 아니라 아직 가공되지
// 않은 HTML 노드 묶음이다.
//
// Level은 정책(headingLevelFromTagName)이 인식하는 heading 레벨의 타입이다.
// 세그먼트는 정책이 준 값을 그대로 싣기만 하므로 타입도 그대로 흘려보낸다
// — import-html.ts는 model HeadingBlock["level"]을 넘겨 세그먼트에서 캐스트
// 없이 좁혀진 level을 받고(DELTA-06), clipboard-table-parser.ts와 테스트의
// number 정책은 기본값 그대로다.
export type BlockSegment<
  Level extends number = number,
  IncludeCodeBlock extends boolean = false,
> =
  // 경계 태그를 만나지 않고 그냥 쌓인 pending(loose 텍스트, 또는
  // div/li/blockquote 재귀 안에서 나온 내용)이다. 이걸 만든 특정 요소가
  // 없으므로 원본 element 참조가 없다 — import-html.ts는 이 kind만
  // 실질 텍스트 판정(비었으면 블록을 만들지 않음)을 적용한다.
  | { kind: "paragraph"; nodes: HtmlElementContent[] }
  // p 자신의 본문(wholesale 교체, 재귀하지 않음). node를 함께 주는 이유는
  // dataBeBlockId 같은 그 요소 자신의 속성을 호출자가 읽어야 해서다 —
  // import-html.ts는 p 하나당 블록 하나를 실질 텍스트 여부와 무관하게
  // 낸다(기존 parseBlock 관례, 빈 <p>도 빈 문단으로 보존).
  | {
      kind: "simpleBoundary";
      node: HtmlElementNode;
      nodes: HtmlElementContent[];
    }
  // heading 태그 자신의 본문. level만 싣고 실제 heading으로 쓸지 문단으로
  // 다운그레이드할지는 호출자가 정한다. node를 함께 주는 이유는
  // simpleBoundary와 같다.
  | {
      kind: "heading";
      level: Level;
      node: HtmlElementNode;
      nodes: HtmlElementContent[];
    }
  // hr 태그 자신(DELTA-06) — 콘텐츠가 없는 세그먼트라 nodes가 없다. 자식이
  // 없어 pending과 무관하고, flush()는 pending이 비어 있으면 아무것도 내지
  // 않으므로 문서 첫/마지막 블록이거나 hr만 든 div 안에 있어도 세그먼트가
  // 사라지지 않는다 — 별도 표식이 필요 없다(트랙-4 확인). node를 주는 이유는
  // simpleBoundary와 같다(dataBeBlockId). model divider로 해석할지는 호출자가
  // 정한다. hr은 isDividerTag를 넘긴 정책에서만 나온다 — 소비자는 union
  // exhaustiveness로 hr 분기를 갖는다.
  | { kind: "hr"; node: HtmlElementNode }
  // blockquote 태그 자신(DELTA-06a) — hr처럼 "판정"만 하고 안쪽으로 재귀하지
  // 않는다. 안쪽을 어떻게 나눌지(D6: 첫 <p>를 content로 승격, 나머지를
  // children으로 재귀)는 호출자 몫이라 원본 요소만 준다 — 여기서 재귀하면
  // children이 pending에 섞여 quote 경계가 사라진다. isQuoteTag를 넘긴
  // 정책에서만 나온다 — 넘기지 않으면(clipboard) blockquote는 예전처럼
  // isNestedBoundary(NESTED_BOUNDARY_TAG_NAMES)의 문단 경계로 남는다.
  | { kind: "blockquote"; node: HtmlElementNode }
  // pre를 CodeBlock으로 해석할지는 document import policy만 opt-in한다.
  // 원본 sanitized 요소를 그대로 넘겨 source·metadata 선택은 호출자가
  // 담당한다. clipboard policy에서는 이 variant가 나오지 않는다.
  | (IncludeCodeBlock extends true
      ? { kind: "codeBlock"; node: HtmlElementNode }
      : never)
  | {
      kind: "table";
      node: HtmlElementNode;
      // 표 직속 비섹션 자식(caption 등, table-layout.ts의
      // tableNonSectionChildren)을 조상 마크로 감싼 상태로 미리 계산해
      // 둔다 — ancestors는 이 재귀의 내부 개념이라 호출자에 노출하지
      // 않는다. 몇 개를 묶어 하나의 문단으로 만들지, 조각 단위로 실질
      // 텍스트를 거를지는 호출자 정책이라 여기서는 원본 노드 배열만 준다.
      nonSectionChildren: HtmlElementContent[];
    };

export type BlockSegmentPolicy<
  Level extends number = number,
  IncludeCodeBlock extends boolean = false,
> = {
  // p처럼 "경계를 만나면 지금까지 쌓인 내용을 flush하고 그 요소의 자식으로
  // pending을 통째로 교체한다"만 하는(재귀하지 않는) 태그.
  isSimpleBoundary: (tagName: string) => boolean;
  // heading 레벨을 인식한다. 반환값이 있으면 경계로 취급하고
  // {kind:"heading"} 세그먼트를 낸다 — 그 레벨을 실제 heading으로 쓸지
  // 문단으로 다운그레이드할지는 호출자가 정한다(import·clipboard 둘 다
  // h1~h6 전부 heading으로 쓴다 — DELTA-08, Issue #38 슬라이스 3 이후로
  // clipboard의 h4~h6 다운그레이드는 없다).
  headingLevelFromTagName: (tagName: string) => Level | undefined;
  // hr처럼 콘텐츠 없이 그 자체가 블록(model divider)인 태그 판정. 선택적이다
  // — 넘기지 않는 소비자(clipboard-table-parser.ts)에서는 hr이 예전처럼
  // 경계가 아닌 일반 요소로 pending에 들어가 텍스트 없이 지나간다(클립보드
  // 계약 불변 — clipboard의 hr 처리는 슬라이스 10 소관).
  isDividerTag?: (tagName: string) => boolean;
  // blockquote처럼 그 자체가 블록(model quote)이면서 안쪽 해석을 호출자가
  // 맡는 태그 판정. 선택적이다 — 넘기지 않는 소비자(clipboard-table-parser.ts)
  // 에서는 blockquote가 isNestedBoundary 쪽으로 떨어져 예전처럼 문단
  // 경계다(클립보드 계약 불변 — clipboard의 blockquote 매핑은 슬라이스 10
  // 소관). isNestedBoundary보다 먼저 판정한다 — 같은 태그가 두 집합에 있을
  // 때 세그먼트 승격이 이긴다.
  isQuoteTag?: (tagName: string) => boolean;
  // pre처럼 마크·일반 인라인 해석을 바이패스하고 리프 블록으로
  // 유지할 태그. document import만 넘기며 clipboard는 opt-in하지 않는다.
  // div/li/blockquote처럼 "경계를 만나면 flush하고, 안쪽을 재귀 탐색해
  // 더 깊은 경계를 개별 인식시킨 뒤 다시 flush한다"태그. 표 유무와
  // 무관하게 항상 재귀한다 — 임의 깊이의 중첩 경계를 전부 잡아야 하기
  // 때문이다.
  isNestedBoundary: (tagName: string) => boolean;
  // ul/ol처럼 그 자체는 경계가 아니라 순수 wrapper인 태그. flush 없이
  // 항상 재귀한다.
  isTransparent: (tagName: string) => boolean;
  // 표로 취급할 노드 판정. import는 단순 태그명 검사, clipboard는
  // findDataTables가 미리 고른 표 집합의 멤버십 검사처럼 호출자마다
  // 다르다 — 표 탐지 알고리즘 자체는 이 모듈이 아니라 호출자가 소유한다.
  isTableNode: (node: HtmlElementNode) => boolean;
} & (IncludeCodeBlock extends true
  ? { isCodeBlockTag: (tagName: string) => boolean }
  : { isCodeBlockTag?: undefined });

// 조상 서식 체인을 노드에 얕은 클론으로 다시 씌운다. 재귀 중 표나 중첩
// 경계를 만나 pending을 flush하면 그 안의 텍스트가 원래 있던 위치의 조상
// (`<strong>`, `<a>` 등)에서 떨어져 나오므로, 이 복원이 없으면 서식(href
// 포함)을 잃는다. 마크 없는 조상(p/div/li/ul 등)까지 함께 씌워도
// inlineContentFromNodes가 그 태그들을 인식하지 않고 그냥 재귀 통과하므로
// 결과는 달라지지 않는다.
const wrapInAncestors = (
  node: HtmlElementContent,
  ancestors: readonly HtmlElementNode[],
): HtmlElementContent =>
  ancestors.reduceRight<HtmlElementContent>(
    (child, ancestor) =>
      htmlElement(ancestor.tagName, ancestor.properties, [child]),
    node,
  );

// blockquote는 요소 자체를 세그먼트로 넘겨 호출자가 content/children을
// 나눈다. 조상 마크를 blockquote 바깥에 다시 씌우면 그 분할 전에 블록
// 구조가 숨으므로, 구조는 유지하고 각 텍스트 leaf에만 조상 체인을 복원한다.
const wrapTextDescendantsInAncestors = (
  node: HtmlElementContent,
  ancestors: readonly HtmlElementNode[],
): HtmlElementContent => {
  if (node.type === "text") return wrapInAncestors(node, ancestors);
  if (node.type === "comment") return node;
  return htmlElement(
    node.tagName,
    node.properties,
    node.children.map((child) =>
      wrapTextDescendantsInAncestors(child, ancestors),
    ),
  );
};

export function segmentBlocks<Level extends number = number>(
  nodes: readonly HtmlNode[],
  policy: BlockSegmentPolicy<Level, true>,
): BlockSegment<Level, true>[];
export function segmentBlocks<Level extends number = number>(
  nodes: readonly HtmlNode[],
  policy: BlockSegmentPolicy<Level, false>,
): BlockSegment<Level, false>[];
export function segmentBlocks<Level extends number = number>(
  nodes: readonly HtmlNode[],
  policy: BlockSegmentPolicy<Level, true> | BlockSegmentPolicy<Level, false>,
): BlockSegment<Level, true>[] {
  const segments: BlockSegment<Level, true>[] = [];
  let pending: HtmlElementContent[] = [];

  const flush = (): void => {
    if (pending.length === 0) return;
    segments.push({ kind: "paragraph", nodes: pending });
    pending = [];
  };

  // 미지원 안전 요소(<a>, <span> 등)는 그 자체로는 블록 경계가 아니지만,
  // 안쪽에 소비자가 인식하는 블록이 있으면 재귀해 그 경계를 보존해야 한다.
  // 표만 찾으면 h1~h6·blockquote·hr가 조상 인라인 요소와 함께 pending에
  // 흡수돼 문단으로 강등되거나(hr) 완전히 사라진다. 정책 판정을 그대로
  // 사용해 document import와 clipboard가 각자 허용한 경계만 탐지한다.
  const containsAnyBlockBoundary = (list: readonly HtmlNode[]): boolean => {
    for (const node of list) {
      if (node.type !== "element") continue;
      if (
        policy.isTableNode(node) ||
        policy.isSimpleBoundary(node.tagName) ||
        policy.headingLevelFromTagName(node.tagName) !== undefined ||
        policy.isDividerTag?.(node.tagName) === true ||
        policy.isQuoteTag?.(node.tagName) === true ||
        policy.isCodeBlockTag?.(node.tagName) === true ||
        policy.isNestedBoundary(node.tagName)
      ) {
        return true;
      }
      if (containsAnyBlockBoundary(node.children)) return true;
    }
    return false;
  };

  const walk = (
    list: readonly HtmlNode[],
    ancestors: readonly HtmlElementNode[],
  ): void => {
    for (const node of list) {
      if (node.type === "element" && policy.isTableNode(node)) {
        // 기존 pending(intro 등)을 먼저 내보낸 뒤에야 표 직속 비섹션
        // 자식을 계산한다 — 순서를 바꾸면 문서 순서가 역전된다.
        flush();
        segments.push({
          kind: "table",
          node,
          nonSectionChildren: tableNonSectionChildren(node).map((child) =>
            wrapInAncestors(child, ancestors),
          ),
        });
        continue;
      }
      if (node.type === "text") {
        pending.push(wrapInAncestors(node, ancestors));
        continue;
      }
      if (node.type !== "element") continue;

      // hr은 자식이 없어 표 탐색(containsAnyTable)도 재귀도 필요 없다 —
      // 앞선 pending만 내보내고 자기 세그먼트를 낸다. 표 셀 안의 hr은 이
      // walk가 표 노드를 통째로 표 세그먼트로 접으므로 여기 도달하지 않는다.
      if (policy.isDividerTag?.(node.tagName) === true) {
        flush();
        segments.push({ kind: "hr", node });
        continue;
      }
      // blockquote는 안쪽을 통째로 호출자에 넘긴다 — 표를 품어도 재귀하지
      // 않는다(호출자가 children을 다시 segmentBlocks에 넣어 표 세그먼트로
      // 잡는다). 아래 isNestedBoundary 분기보다 먼저 와야 정책이 있는
      // 소비자에서 blockquote가 문단 경계로 풀리지 않는다.
      if (policy.isQuoteTag?.(node.tagName) === true) {
        flush();
        segments.push({
          kind: "blockquote",
          node: htmlElement(
            node.tagName,
            node.properties,
            node.children.map((child) =>
              wrapTextDescendantsInAncestors(child, ancestors),
            ),
          ),
        });
        continue;
      }
      // pre는 자식의 code·br·wrapper를 다른 블록 경계로 해석하지
      // 않고 sanitized 서브트리 전체를 semantic caller에 넘긴다.
      if (policy.isCodeBlockTag?.(node.tagName) === true) {
        flush();
        segments.push({ kind: "codeBlock", node });
        continue;
      }

      const headingLevel = policy.headingLevelFromTagName(node.tagName);
      // p/heading이 지원 블록 경계를 자식으로 품으면 요소 전체를
      // 인라인 본문으로 접지 않고 자식 시퀀스를 재귀 분할한다. HTML5
      // parser는 table·blockquote·hr 등을 heading 안에 보존할 수 있다.
      // 표만 검사하면 quote는 heading 텍스트로 평탄화되고 divider는
      // 조용히 사라진다. 외부 heading 자체의 의미는 보존할 수 없으므로
      // 표 중첩 계약처럼 앞뒤 텍스트를 paragraph로 보존한다.
      if (
        (policy.isSimpleBoundary(node.tagName) || headingLevel !== undefined) &&
        containsAnyBlockBoundary(node.children)
      ) {
        walk(node.children, [...ancestors, node]);
        continue;
      }
      if (policy.isSimpleBoundary(node.tagName)) {
        flush();
        segments.push({
          kind: "simpleBoundary",
          node,
          nodes: node.children.map((child) =>
            wrapInAncestors(child, ancestors),
          ),
        });
        continue;
      }
      if (headingLevel !== undefined) {
        flush();
        segments.push({
          kind: "heading",
          level: headingLevel,
          node,
          nodes: node.children.map((child) =>
            wrapInAncestors(child, ancestors),
          ),
        });
        continue;
      }
      if (policy.isNestedBoundary(node.tagName)) {
        flush();
        walk(node.children, [...ancestors, node]);
        flush();
        continue;
      }
      if (policy.isTransparent(node.tagName)) {
        walk(node.children, [...ancestors, node]);
        continue;
      }
      if (containsAnyBlockBoundary(node.children)) {
        walk(node.children, [...ancestors, node]);
        continue;
      }
      pending.push(wrapInAncestors(node, ancestors));
    }
  };

  walk(nodes, []);
  flush();
  return segments;
}

// div/li는 model에 리스트 전용 Block 타입이 없어 heading처럼 별도 타입을
// 만들 수 없으므로 문단으로만 분리한다(Issue #113, #72). blockquote는 model
// quote가 생겼지만(DELTA-06a) 이 집합에 그대로 둔다 — isQuoteTag를 넘기는
// import-html.ts에서는 위 walk가 isNestedBoundary보다 먼저 세그먼트로
// 승격해 이 집합의 blockquote 항목에 도달하지 않고, 넘기지 않는
// clipboard-table-parser.ts에서는 예전 그대로 문단 경계다.
// import-html.ts와 clipboard-table-parser.ts가 정확히 같은 집합을 쓴다 —
// 문단 경계 태그 집합을 공유하기로 한 그릴링 결정(2차 리뷰 후보 G, Q2).
export const NESTED_BOUNDARY_TAG_NAMES = new Set(["div", "li", "blockquote"]);

// ul/ol 자체는 경계가 아니라 순수 wrapper다(li만 경계) — model에 리스트
// Block 타입이 없어 마커·순서도 보존하지 않는다. 두 소비자가 동일하게
// 쓴다.
export const isTransparentListTag = (tagName: string): boolean =>
  tagName === "ul" || tagName === "ol";

// p는 두 소비자가 동일하게 "경계지만 재귀하지 않는" 태그로 취급한다.
export const isParagraphTag = (tagName: string): boolean => tagName === "p";
