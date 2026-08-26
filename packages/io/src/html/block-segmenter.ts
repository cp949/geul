import type {
  HtmlElementContent,
  HtmlElementNode,
  HtmlNode,
} from "./inline-content.js";
import { htmlElement } from "./inline-content.js";
import { tableNonSectionChildren } from "./table-layout.js";

// import-html.ts(documentFromRoot)와 clipboard-table-parser.ts
// (blockSequenceFromNodes)가 각자 재구현하던 "HAST 노드 시퀀스를 문단/헤딩/표
// 경계로 쪼개는" 재귀 알고리즘을 여기 하나로 모은다(아키텍처 리뷰 2차 후보
// G). 두 소비자는 경계 태그 집합과 표 판정만 다르고 재귀 구조 자체는
// 동일했다 — import-html.ts는 애초에 이 재귀가 없어(최상위 노드만 훑는
// 평면 루프) div/li/blockquote/ul/ol처럼 중첩 가능한 경계를 인식하지
// 못했고, 그 결과가 Issue #113과 같은 종류의 병합 버그였다(clipboard 경로는
// #113으로 이미 고쳐졌지만 import 경로는 반영되지 않았다).
//
// 이 모듈은 의도적으로 "판정"만 하고 "해석"은 하지 않는다 — 각 세그먼트의
// 텍스트 정규화(공백 접기 여부), 실질 텍스트 판정, id 발급, 표 셀 파싱은
// 전부 호출자 몫이다(그릴링 결정: 문단 경계 태그 집합만 공유, 그 외 정책은
// 경로별로 남긴다). 그래서 반환 타입은 최종 Block이 아니라 아직 가공되지
// 않은 HTML 노드 묶음이다.
export type BlockSegment =
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
      level: number;
      node: HtmlElementNode;
      nodes: HtmlElementContent[];
    }
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

export type BlockSegmentPolicy = {
  // p처럼 "경계를 만나면 지금까지 쌓인 내용을 flush하고 그 요소의 자식으로
  // pending을 통째로 교체한다"만 하는(재귀하지 않는) 태그.
  isSimpleBoundary: (tagName: string) => boolean;
  // heading 레벨을 인식한다. 반환값이 있으면 경계로 취급하고
  // {kind:"heading"} 세그먼트를 낸다 — 그 레벨을 실제 heading으로 쓸지
  // 문단으로 다운그레이드할지는 호출자가 정한다(예: import는 h1~h3만
  // 들어오므로 항상 heading, clipboard는 h4~h6을 문단으로 내린다).
  headingLevelFromTagName: (tagName: string) => number | undefined;
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
};

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

export const segmentBlocks = (
  nodes: readonly HtmlNode[],
  policy: BlockSegmentPolicy,
): BlockSegment[] => {
  const segments: BlockSegment[] = [];
  let pending: HtmlElementContent[] = [];

  const flush = (): void => {
    if (pending.length === 0) return;
    segments.push({ kind: "paragraph", nodes: pending });
    pending = [];
  };

  // walk()가 표를 찾기 위해 더 파고들어야 하는지(descend), 아니면 표 없는
  // 순수 인라인/구조 콘텐츠라 통째로 pending에 밀어 넣어도 되는지 판단하는
  // 데 쓴다.
  const containsAnyTable = (list: readonly HtmlNode[]): boolean => {
    for (const node of list) {
      if (node.type !== "element") continue;
      if (policy.isTableNode(node)) return true;
      if (containsAnyTable(node.children)) return true;
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

      const headingLevel = policy.headingLevelFromTagName(node.tagName);
      // p/heading이 표를 자식으로 품고 있으면(HTML5 파싱 규칙상 table
      // 시작 태그는 p만 자동으로 닫고 heading은 닫지 않아 실제로 표를
      // 담을 수 있다) 블록 경계로 접어 인라인 텍스트로 흡수하지 않는다 —
      // 통과해 내려가 표를 표 세그먼트로 보존한다.
      if (
        (policy.isSimpleBoundary(node.tagName) || headingLevel !== undefined) &&
        containsAnyTable(node.children)
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
      if (containsAnyTable(node.children)) {
        walk(node.children, [...ancestors, node]);
        continue;
      }
      pending.push(wrapInAncestors(node, ancestors));
    }
  };

  walk(nodes, []);
  flush();
  return segments;
};

// div/li/blockquote는 model에 리스트·인용문 전용 Block 타입이 없어 heading
// 처럼 별도 타입을 만들 수 없으므로 문단으로만 분리한다(Issue #113, #72).
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
