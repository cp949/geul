import type { Schema } from "hast-util-sanitize";

export const htmlAllowedAttributes: Record<string, string[]> = {
  "*": [],
  a: ["href"],
  // blockquote(quote)는 블록 id를 자신이 갖는다(DELTA-06a — export-html.ts가
  // <blockquote data-be-block-id><p>content</p>[<div data-be-children>]>로
  // 낸다). 이 항목이 없으면 sanitize가 "*" 규칙으로 id를 지워 quote의 id가
  // 왕복에서 새로 발급된다. 안쪽 children 컨테이너 div는 아래 div 항목이
  // 그대로 받는다.
  // 뒤 세 속성(TextBlockProps, RD-004 DELTA-02)은 paragraph/heading/quote/
  // 목록 4종이 공유하는 블록 레벨 색상·정렬 매핑이다 — 표 셀과 이름은
  // 같지만(dataBeTextColor/dataBeBackgroundColor) 값 의미가 블록 단위다.
  // dataBeTextAlignment는 표 셀의 dataBeAlign과 별도 속성(필드명이 다르다,
  // export-html.ts의 textBlockPropsAttributes 참고).
  blockquote: [
    "dataBeBlockId",
    "dataBeTextColor",
    "dataBeBackgroundColor",
    "dataBeTextAlignment",
  ],
  col: ["width", "dataBeColumnId", "dataBeWidth"],
  // DELTA-04(children 재귀 왕복): export-html.ts의 blockNode가 children 있는
  // paragraph/heading을 감싸는 wrapper(바깥 div, children 컨테이너 div)가
  // 쓰는 두 속성이다. dataBeBlockId는 p/h1~h6/hr와 같은 이름을 재사용하고,
  // dataBeChildren은 "이 div가 children 목록 컨테이너"라는 새 마커다(값은
  // 항상 "1"). 이 목록에 없으면 sanitize가 div의 모든 속성을 지워
  // import-html.ts의 findChildrenWrapper가 children 컨테이너를 알아보지
  // 못하고 children이 조용히 사라진다(완료 조건 3의 변이 시나리오).
  div: ["dataBeBlockId", "dataBeChildren"],
  h1: [
    "dataBeBlockId",
    "dataBeTextColor",
    "dataBeBackgroundColor",
    "dataBeTextAlignment",
  ],
  h2: [
    "dataBeBlockId",
    "dataBeTextColor",
    "dataBeBackgroundColor",
    "dataBeTextAlignment",
  ],
  h3: [
    "dataBeBlockId",
    "dataBeTextColor",
    "dataBeBackgroundColor",
    "dataBeTextAlignment",
  ],
  h4: [
    "dataBeBlockId",
    "dataBeTextColor",
    "dataBeBackgroundColor",
    "dataBeTextAlignment",
  ],
  h5: [
    "dataBeBlockId",
    "dataBeTextColor",
    "dataBeBackgroundColor",
    "dataBeTextAlignment",
  ],
  h6: [
    "dataBeBlockId",
    "dataBeTextColor",
    "dataBeBackgroundColor",
    "dataBeTextAlignment",
  ],
  // hr(divider)은 속성이 블록 id뿐이다 — 이 항목이 없으면 sanitize가 "*"
  // 규칙으로 id를 지워 divider의 id가 왕복에서 새로 발급된다.
  hr: ["dataBeBlockId"],
  p: [
    "dataBeBlockId",
    "dataBeTextColor",
    "dataBeBackgroundColor",
    "dataBeTextAlignment",
  ],
  pre: ["dataBeBlockId", "dataLanguage", "className"],
  // 인라인 textColor/backgroundColor mark의 HTML 매핑이다(spec §7.1, RD-004
  // DELTA-01). 표 셀 색상(`data-be-*`)과 달리 실제 CSS `style` 속성을 쓴다 —
  // 문서 안에서 두 인코딩이 공존하는 것은 spec이 이미 결정했다
  // (inline-content.ts의 wrapMark 참고).
  span: ["style"],
  code: ["dataLanguage", "className"],
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
  "pre",
  // h1~h6는 model HeadingBlock.level 1~6과 1:1이다(DELTA-06, Issue #38 —
  // 그 전에는 model이 1~3만 허용해 h4~h6를 unwrap했다).
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  // hr은 model divider의 HTML 매핑이다(spec §7.1). 콘텐츠 없는 void 요소라
  // 표 태그(ancestors: table)처럼 조상 제약을 둘 이유가 없다 — 블록 위치면
  // block-segmenter.ts가 hr 세그먼트로 내고, 표 셀 안이면
  // inlineContentFromNodes가 텍스트 없이 지나간다.
  "hr",
  "strong",
  "em",
  "u",
  "s",
  "code",
  "a",
  "br",
  // span은 model에 전용 타입이 없다 — textColor/backgroundColor mark의 HTML
  // 인코딩 전용 인라인 wrapper다(위 htmlAllowedAttributes.span 참고).
  "span",
  // div/li/ul/ol은 p와 같은 문단 경계다(아키텍처 리뷰 2차 후보 G, Issue
  // #113의 import 경로 반영). model에 리스트 전용 Block 타입이 없어 heading
  // 처럼 별도 타입을 만들 수는 없으므로 p처럼 문단으로만 분리한다 —
  // sanitize가 이 태그를 unwrap하면 documentFromRoot의 block-segmenter.ts
  // 재귀가 애초에 경계를 볼 수 없으므로 여기서 살려야 한다.
  // blockquote는 문서 import에서 model quote 블록의 HTML 매핑이고(DELTA-06a,
  // spec §7.1 — content + children 중첩), 클립보드 경로에서는 여전히 문단
  // 경계다(clipboard-table-parser.ts가 isQuoteTag를 넘기지 않는다).
  // clipboardAllowedTagNames가 이 다섯을 별도로 다시 얹지 않고 이 목록을
  // 그대로 상속하는 이유이기도 하다.
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

// clipboard 경로 전용 tagNames. DELTA-03(Issue #72)에서는 h4~h6를 여기서만
// 얹었다 — 당시 model HeadingBlock.level이 1~3이라 문서 import 공유 목록에는
// 넣을 수 없었고, clipboard는 blockSequenceFromNodes가 h4~h6를 문단으로
// 다운그레이드만 하므로 태그를 파서까지 살려 블록 경계로 인식시키기만 하면
// 됐다. DELTA-06(Issue #38)이 h4~h6·hr을 공유 목록에 올려 두 목록의 내용이
// 같아졌지만 이름은 따로 둔다 — 두 경로의 허용 목록이 같아야 한다는 계약은
// 없고(clipboardStrippedTagNames가 이미 갈라져 있다) clipboardSanitizeSchema
// 가 어느 목록을 쓰는지 드러나야 한다. hr은 clipboard 정책
// (clipboard-table-parser.ts)이 divider 세그먼트로 인식하지 않아 pending
// 인라인 노드로 지나가며 텍스트를 내지 않는다 — clipboard의 hr 처리는
// 슬라이스 10 소관이다.
export const clipboardAllowedTagNames = [...htmlAllowedTagNames];

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
