import type { Schema } from "hast-util-sanitize";

export const htmlAllowedAttributes: Record<string, string[]> = {
  "*": [],
  a: ["href"],
  col: ["width", "dataBeColumnId", "dataBeWidth"],
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
};
