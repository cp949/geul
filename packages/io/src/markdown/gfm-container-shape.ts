import {
  isListItemBlockType,
  isTextRunItem,
  type Block,
  type InlineContent,
  type ListItemBlock,
  type ListItemBlockType,
  type QuoteBlock,
  type ToggleListItemBlock,
} from "@cp949/geul-model";

// GFM export가 컨테이너로 다루는 블록의 모양 판정을 모은다.
// loss-analysis.ts(손실 보고)와 export-markdown.ts(출력)가 이 파일을 읽는다.
// 손실 보고는 넓은 판정(firstChildMergesIntoOwnContent)을, 승격과 own 단락
// 판단은 좁은 판정(hasAmbiguousLeadingParagraph)을 읽는다. 둘은 의도된 분리다.
// 한쪽만 조정되면 손실 보고와 실제 출력이 조용히 어긋난다.

// own content가 비었는지 본다. 빈 배열뿐 아니라 mark 없는 빈 글자 런만 있는
// content도 비었다. parseDocument는 `[{ text: "" }]`를 정규화하지 않고, 이
// content는 빈 배열과 똑같이 빈 문단으로 나가기 때문이다. mark가 붙은 빈 런은
// `****`, `[](url)` 같은 마커로 나가 빈 문단이 아니므로 비지 않은 것으로 본다.
// 글자 런이 아닌 원소(커스텀 inline)도 비지 않은 것으로 본다.
export const isEmptyContent = (content: InlineContent): boolean =>
  content.every(
    (item) =>
      isTextRunItem(item) &&
      item.text === "" &&
      (item.marks === undefined || item.marks.length === 0),
  );

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
// 여기서 소유하고 export-markdown.ts의 flattenBlocks(승격 여부)와
// containerChildNodes(목록·quote의 own paragraph materialize 여부)가 같은
// 함수를 호출한다(아키텍처 리뷰 6차 후보 L5).
// 여러 곳이 독립된 조건을 유지하면 한쪽만
// 조정될 때 손실 보고와 실제 출력이 조용히 어긋난다. 목록 항목과 quote를
// 모두 판정한다(isGfmContainerLikeBlockType과 같은 편입 이력).
export const hasAmbiguousLeadingParagraph = (block: Block): boolean => {
  // isGfmContainerLikeBlockType은 block.type(string)만 좁힌다 — block 자신의
  // discriminated union은 좁혀지지 않는다(TS 제약, 아키텍처 리뷰 6차 L1에서
  // 처음 부딪힘). predicate가 이미 그 계약을 증명했으므로 캐스트는 안전하다.
  if (!isGfmContainerLikeBlockType(block.type)) return false;
  const item = block as ListItemBlock | ToggleListItemBlock | QuoteBlock;
  return (
    isEmptyContent(item.content) && item.children?.[0]?.type === "paragraph"
  );
};

// export-markdown.ts의 blockNode가 모델 블록 타입마다 내는 mdast 노드 종류다.
// "첫 자식이 mdast paragraph로 나가는가"를 모델 타입이 아니라 이 표로 판정한다.
// blockNode와 일치해야 하며 gfm-container-shape.test.ts의 parity 테스트가 지킨다.
// model/src/block-kind.ts의 `satisfies Record<...>` 표와 같은 패턴이라 새 블록
// 타입이 오면 컴파일 단계에서 이 표가 모자란다.
export type MdastNodeKind =
  | "table"
  | "thematicBreak"
  | "paragraph"
  | "code"
  | "list"
  | "blockquote"
  | "heading";

export const MDAST_NODE_KIND = {
  paragraph: "paragraph",
  // callout과 미디어 5종은 GFM에 고유 표현이 없어 paragraph(텍스트·링크·이미지)로 나간다.
  callout: "paragraph",
  file: "paragraph",
  image: "paragraph",
  video: "paragraph",
  audio: "paragraph",
  iframe: "paragraph",
  heading: "heading",
  quote: "blockquote",
  bulletListItem: "list",
  numberedListItem: "list",
  checkListItem: "list",
  toggleListItem: "list",
  codeBlock: "code",
  divider: "thematicBreak",
  table: "table",
} as const satisfies Record<Block["type"], MdastNodeKind>;

// hasAmbiguousLeadingParagraph의 상위 집합이다. 좁은 판정은 모델 타입
// paragraph만 보고, 이 판정은 mdast paragraph로 나가는 모든 첫 자식(image,
// callout, 미디어)을 본다. 손실 보고는 이 넓은 판정을 읽는다 — image 첫 자식도
// 재가져오기 때 own content로 뭉친다. 승격(flattenBlocks)과 own 빈 단락 판단
// (containerChildNodes)은 좁은 판정을 읽는다. 넓은 판정으로 바꾸면 image 첫
// 자식에서 own 빈 단락이 생겨 `*\n\n  ![img]` 모양으로 깨진다.
export const firstChildMergesIntoOwnContent = (block: Block): boolean => {
  if (!isGfmContainerLikeBlockType(block.type)) return false;
  const item = block as ListItemBlock | ToggleListItemBlock | QuoteBlock;
  const first = item.children?.[0];
  return (
    isEmptyContent(item.content) &&
    first !== undefined &&
    MDAST_NODE_KIND[first.type] === "paragraph"
  );
};

// mdast-util-gfm-task-list-item은 listItem의 첫 자식이 paragraph일 때만
// `[ ]`/`[x]`를 붙인다. own content가 비고 첫 자식이 없거나 mdast paragraph가
// 아니면 체크박스가 stringify에서 조용히 사라진다.
export const isCheckboxAnchorLost = (block: Block): boolean => {
  if (block.type !== "checkListItem") return false;
  const first = block.children?.[0];
  return (
    isEmptyContent(block.content) &&
    (first === undefined || MDAST_NODE_KIND[first.type] !== "paragraph")
  );
};
