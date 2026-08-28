import type { Schema } from "hast-util-sanitize";

export const htmlAllowedAttributes: Record<string, string[]> = {
  "*": [],
  a: ["href"],
  col: ["width", "dataBeColumnId", "dataBeWidth"],
  // DELTA-04(children 재귀 왕복): export-html.ts의 blockNode가 children 있는
  // paragraph/heading을 감싸는 wrapper(바깥 div, children 컨테이너 div)가
  // 쓰는 두 속성이다. dataBeBlockId는 p/h1~h3와 같은 이름을 재사용하고,
  // dataBeChildren은 "이 div가 children 목록 컨테이너"라는 새 마커다(값은
  // 항상 "1"). 이 목록에 없으면 sanitize가 div의 모든 속성을 지워
  // import-html.ts의 findChildrenWrapper가 children 컨테이너를 알아보지
  // 못하고 children이 조용히 사라진다(완료 조건 3의 변이 시나리오).
  div: ["dataBeBlockId", "dataBeChildren"],
  h1: ["dataBeBlockId"],
  h2: ["dataBeBlockId"],
  h3: ["dataBeBlockId"],
  p: ["dataBeBlockId"],
  table: ["dataBeBlockId", "dataBeHeaderRows", "dataBeHeaderColumns"],
  td: [
    "rowSpan",
    "colSpan",
    "scope",
    "dataBeCellId",
    "dataBeColumnId",
    "dataBeTextColor",
    "dataBeBackgroundColor",
    "dataBeAlign",
  ],
  th: [
    "rowSpan",
    "colSpan",
    "scope",
    "dataBeCellId",
    "dataBeColumnId",
    "dataBeTextColor",
    "dataBeBackgroundColor",
    "dataBeAlign",
  ],
  tr: ["dataBeRowId"],
};

export const htmlStrippedTagNames = [
  "script",
  "style",
  "svg",
  "math",
  "iframe",
  "object",
  "embed",
  "template",
];

export const htmlAllowedTagNames = [
  "p",
  "h1",
  "h2",
  "h3",
  "strong",
  "em",
  "u",
  "s",
  "code",
  "a",
  "br",
  // div/li/blockquote/ul/ol도 p와 같은 문단 경계다(아키텍처 리뷰 2차 후보
  // G, Issue #113의 import 경로 반영). model에 리스트·인용문 전용 Block
  // 타입이 없어 heading처럼 별도 타입을 만들 수는 없으므로 p처럼 문단으로만
  // 분리한다 — sanitize가 이 태그를 unwrap하면 documentFromRoot의
  // block-segmenter.ts 재귀가 애초에 경계를 볼 수 없으므로 여기서 살려야
  // 한다. clipboardAllowedTagNames가 이 다섯을 별도로 다시 얹지 않고
  // 이 목록을 그대로 상속하는 이유이기도 하다.
  "div",
  "li",
  "blockquote",
  "ul",
  "ol",
  "table",
  "colgroup",
  "col",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
];

export const htmlSanitizeSchema: Schema = {
  allowComments: false,
  allowDoctypes: false,
  ancestors: {
    col: ["table"],
    colgroup: ["table"],
    tbody: ["table"],
    td: ["table"],
    tfoot: ["table"],
    th: ["table"],
    thead: ["table"],
    tr: ["table"],
  },
  attributes: htmlAllowedAttributes,
  clobber: [],
  protocols: {
    href: ["http", "https", "mailto", "tel"],
  },
  required: {},
  strip: htmlStrippedTagNames,
  tagNames: htmlAllowedTagNames,
};

// 클립보드 경로 전용 허용 목록. importHtml의 목록을 공유하면 두 가지가
// 깨진다 — style을 공유 목록에 넣으면 importHtml이 여전히 무시하는 속성을
// import-warnings가 "제거됨"으로 보고하지 않게 되고(경고 소실), role은
// 문서 모델에 없는 속성인데 import 계약에 새 속성이 생긴 것처럼 보인다.
// 그래서 클립보드에만 필요한 두 속성을 여기서만 얹는다.
const clipboardCellAttributes = [...(htmlAllowedAttributes.td ?? []), "style"];

export const clipboardAllowedAttributes: Record<string, string[]> = {
  ...htmlAllowedAttributes,
  table: [...(htmlAllowedAttributes.table ?? []), "role"],
  td: clipboardCellAttributes,
  th: clipboardCellAttributes,
};

// clipboard 경로 전용 tagNames 오버라이드. h4~h6만 남는다 — model
// HeadingBlock.level이 1~3만 허용해 import-html.ts가 h4~h6를 만들 수 없기
// 때문이다(그래서 sanitize가 unwrap해 SAFE_BLOCK_DOWNGRADED로 강등된다).
// clipboard 경로는 model에 저장하지 않고 blockSequenceFromNodes가 h4~h6를
// 문단으로 다운그레이드만 하므로, sanitize 단계에서 태그 자체를 살려
// 파서에 도달시켜야 블록 경계로 인식할 수 있다(DELTA-03, Issue #72).
// div/li/blockquote/ul/ol은 htmlAllowedTagNames가 이미 공유하므로(아키텍처
// 리뷰 2차 후보 G) 여기서 다시 얹지 않는다 — import 경로도 이제 같은 태그를
// 문단 경계로 인식해 SAFE_BLOCK_DOWNGRADED 계약이 깨지지 않는다.
export const clipboardAllowedTagNames = [
  ...htmlAllowedTagNames,
  "h4",
  "h5",
  "h6",
];

// <title>은 소스 문서 head의 메타데이터지 사용자가 선택한 본문이 아니다.
// tagNames에도 strip에도 없으면 sanitize가 태그만 벗기고(unwrap) 그 텍스트를
// fragment 최상위로 끌어올리는데, 그러면 clipboard-table-parser의 혼합 콘텐츠
// 판정(spec §4.1)이 이를 "표 밖 실질 텍스트"로 보고 스프레드시트 표
// 붙여넣기를 통째로 막는다 — sawTable 때문에 TSV 짝으로도 폴백하지 못한다.
// 문서 import 경로는 import-warnings 계약이 걸려 있어 목록을 공유하지 않는다.
export const clipboardStrippedTagNames = [...htmlStrippedTagNames, "title"];

export const clipboardSanitizeSchema: Schema = {
  ...htmlSanitizeSchema,
  attributes: clipboardAllowedAttributes,
  strip: clipboardStrippedTagNames,
  tagNames: clipboardAllowedTagNames,
};
