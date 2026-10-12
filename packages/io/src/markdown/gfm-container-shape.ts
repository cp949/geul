import {
  isListItemBlockType,
  type Block,
  type ListItemBlock,
  type ListItemBlockType,
  type QuoteBlock,
  type ToggleListItemBlock,
} from "@cp949/geul-model";

// GFM export가 컨테이너로 다루는 블록의 모양 판정을 모은다.
// loss-analysis.ts(손실 보고)와 export-markdown.ts(출력)가 같은 판정을 읽는다.
// 한쪽만 조정되면 손실 보고와 실제 출력이 조용히 어긋난다.

// toggleListItem은 model isListItemBlockType(로드맵 D2, <ul>/<li> HTML 직렬화
// 축)에 없어 GFM export가 기본적으로 이를 목록으로 인식하지 못하고 default
// 분기로 떨어뜨려 글머리 기호 자체를 잃는다. GFM lossy export는 toggleListItem을
// 접힘 정보만 버린 채 일반 글머리 목록으로 낮추므로(spec §7.2) "GFM에서
// 목록처럼 다뤄야 하는 블록"을 판정하는 이 지역 predicate가 필요하다. model에
// 추가하지 않는다 — groupListItemRuns(html·markdown 공유)는 isListItemBlockType을
// 그대로 쓰는 채로 남아야 toggleListItem이 <ul>/<li>로 다시 묶이려는 시도가
// 생기지 않는다(D2가 막은 표 전용 분기 오판 문제 재발 방지). export-markdown.ts의
// blockNode가 단일 목록 항목을 listNode(mdast list/listItem)로 감쌀 때
// 이 좁은 predicate를 그대로 쓴다 — quote는 listNode로 감싸면 안 되므로(아래
// isGfmContainerLikeBlockType과 분리 유지).
export const isGfmListLikeBlockType = (
  type: string,
): type is ListItemBlockType | "toggleListItem" =>
  isListItemBlockType(type) || type === "toggleListItem";

// quote는 BLK-005 재평가(Issue #151, roadmap-workflow RD-001)로 컨테이너
// 취급 대상에 편입됐다 — GFM blockquote의 content model이 root와 같은 flow
// content라 중첩을 그대로 표현할 수 있다(DELTA-01 실측: remark-parse/
// remark-gfm/remark-stringify round-trip 확인). quote는 groupListItemRuns
// 대상이 아니고 listNode(mdast list/listItem)로 감싸지도 않는다 — 그래서 위
// isGfmListLikeBlockType을 넓히지 않고 별도 predicate로 합성한다. "children이
// 있어도 컨테이너를 유지한 채 손실 없이 재귀 순회 가능한 타입"을 판정할 때만
// (loss-analysis의 NESTED_CHILDREN 판정, flattenBlocks의 컨테이너 유지 분기,
// hasAmbiguousLeadingParagraph) 이 넓은 predicate를 쓴다.
export const isGfmContainerLikeBlockType = (
  type: string,
): type is ListItemBlockType | "toggleListItem" | "quote" =>
  isGfmListLikeBlockType(type) || type === "quote";

// paragraph/heading의 children은 대응 mdast 노드에 블록 슬롯이 없어
// NESTED_CHILDREN이다(확정 사항 9 — 두 타입 다 CommonMark에 자식-컨테이너가
// 없어 원천 불가능). 목록 항목·quote의 children은 mdast listItem·blockquote가
// 직접 표현하므로 손실 없이 재귀 순회한다. 단, GFM은 컨테이너의 own content와
// 첫 child paragraph 경계를 구분하지 못한다 — "own content가 비어 있고 첫
// child가 paragraph"인 모양은 재파싱 때 항상 같은 트리로 뭉친다. 이 판정을
// 여기서 소유하고 export-markdown.ts의 flattenBlocks(승격 여부)·listNode·
// quote 분기(둘 다 own paragraph materialize 여부)가 같은 함수를 호출한다
// (아키텍처 리뷰 6차 후보 L5) — 여러 곳이 독립된 조건을 유지하면 한쪽만
// 조정될 때 손실 보고와 실제 출력이 조용히 어긋난다. 목록 항목과 quote를
// 모두 판정한다(isGfmContainerLikeBlockType과 같은 편입 이력).
export const hasAmbiguousLeadingParagraph = (block: Block): boolean => {
  // isGfmContainerLikeBlockType은 block.type(string)만 좁힌다 — block 자신의
  // discriminated union은 좁혀지지 않는다(TS 제약, 아키텍처 리뷰 6차 L1에서
  // 처음 부딪힘). predicate가 이미 그 계약을 증명했으므로 캐스트는 안전하다.
  if (!isGfmContainerLikeBlockType(block.type)) return false;
  const item = block as ListItemBlock | ToggleListItemBlock | QuoteBlock;
  return item.content.length === 0 && item.children?.[0]?.type === "paragraph";
};
