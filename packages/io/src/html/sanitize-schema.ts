import type { Schema } from "hast-util-sanitize";

export const htmlAllowedAttributes: Record<string, string[]> = {
  "*": [],
  a: ["href"],
  // blockquote(quote)는 블록 id를 자신이 갖는다(DELTA-06a — export-html.ts가
  // <blockquote data-geul-block-id><p>content</p>[<div data-geul-children>]>로
  // 낸다). 이 항목이 없으면 sanitize가 "*" 규칙으로 id를 지워 quote의 id가
  // 왕복에서 새로 발급된다. 안쪽 children 컨테이너 div는 아래 div 항목이
  // 그대로 받는다.
  // 뒤 세 속성(TextBlockProps, RD-004 DELTA-02)은 paragraph/heading/quote/
  // 목록 4종이 공유하는 블록 레벨 색상·정렬 매핑이다 — 표 셀과 이름은
  // 같지만(dataGeulTextColor/dataGeulBackgroundColor) 값 의미가 블록 단위다.
  // dataGeulTextAlignment는 표 셀의 dataGeulAlign과 별도 속성(필드명이 다르다,
  // export-html.ts의 textBlockPropsAttributes 참고).
  blockquote: [
    "dataGeulBlockId",
    "dataGeulTextColor",
    "dataGeulBackgroundColor",
    "dataGeulTextAlignment",
  ],
  col: ["width", "dataGeulColumnId", "dataGeulWidth"],
  // DELTA-04(children 재귀 왕복): export-html.ts의 blockNode가 children 있는
  // paragraph/heading을 감싸는 wrapper(바깥 div, children 컨테이너 div)가
  // 쓰는 두 속성이다. dataGeulBlockId는 p/h1~h6/hr와 같은 이름을 재사용하고,
  // dataGeulChildren은 "이 div가 children 목록 컨테이너"라는 새 마커다(값은
  // 항상 "1"). 이 목록에 없으면 sanitize가 div의 모든 속성을 지워
  // import-html.ts의 findChildrenWrapper가 children 컨테이너를 알아보지
  // 못하고 children이 조용히 사라진다(완료 조건 3의 변이 시나리오).
  // dataGeulBlockGroup은 own export가 아니라 생산 편집기 in-editor copy가
  // 만드는 alternate children 컨테이너 마커다(BlockGroupExtension, 값은
  // 항상 빈 문자열) — RD-002, findChildrenWrapper가 dataGeulChildren과
  // 동등하게 인식한다.
  // 뒤 4개(dataGeulBulletListItem 등)는 목록류 4종의 production own-content
  // 존재 마커(Production*ListItemExtension.renderHTML, 값은 항상 빈
  // 문자열)고, 그 뒤 3개(dataGeulChecked/dataGeulStartNumber/
  // dataGeulCollapsed)는 상태 마커다 — RD-003, import-html.ts의
  // productionListItemType이 인식한다. dataGeulBlockId는 own-export
  // wrapper(위 주석)와 생산 편집기 blockContainer 두 경로가 같은 div
  // 태그·같은 속성명을 공유한다(개명 전에는 서로 다른 이름(data-be-block-id/
  // data-geul-block-id)이라 허용 목록에 두 항목이 필요했지만, Issue #159
  // 개명 후에는 같은 이름이라 한 항목으로 충분하다).
  div: [
    "dataGeulBlockId",
    "dataGeulChildren",
    "dataGeulBlockGroup",
    "dataGeulBulletListItem",
    "dataGeulNumberedListItem",
    "dataGeulCheckListItem",
    "dataGeulToggleListItem",
    "dataGeulChecked",
    "dataGeulStartNumber",
    "dataGeulCollapsed",
    // callout(Issue #209 RD-003 DELTA-01) — div가 own-content 블록(quote의
    // blockquote와 동형)을 겸하는 첫 사례다. dataGeulCallout이 존재 마커,
    // dataGeulIcon은 "정의된 경우만"(collapsed와 동일 패턴). TextBlockProps
    // 3종은 blockquote 항목과 같은 이름 규칙이다.
    "dataGeulCallout",
    "dataGeulIcon",
    "dataGeulTextColor",
    "dataGeulBackgroundColor",
    "dataGeulTextAlignment",
  ],
  h1: [
    "dataGeulBlockId",
    "dataGeulTextColor",
    "dataGeulBackgroundColor",
    "dataGeulTextAlignment",
  ],
  h2: [
    "dataGeulBlockId",
    "dataGeulTextColor",
    "dataGeulBackgroundColor",
    "dataGeulTextAlignment",
  ],
  h3: [
    "dataGeulBlockId",
    "dataGeulTextColor",
    "dataGeulBackgroundColor",
    "dataGeulTextAlignment",
  ],
  h4: [
    "dataGeulBlockId",
    "dataGeulTextColor",
    "dataGeulBackgroundColor",
    "dataGeulTextAlignment",
  ],
  h5: [
    "dataGeulBlockId",
    "dataGeulTextColor",
    "dataGeulBackgroundColor",
    "dataGeulTextAlignment",
  ],
  h6: [
    "dataGeulBlockId",
    "dataGeulTextColor",
    "dataGeulBackgroundColor",
    "dataGeulTextAlignment",
  ],
  // hr(divider)은 속성이 블록 id뿐이다 — 이 항목이 없으면 sanitize가 "*"
  // 규칙으로 id를 지워 divider의 id가 왕복에서 새로 발급된다. own-export와
  // 생산 편집기(divider-extension.ts) 둘 다 같은 dataGeulBlockId를 낸다
  // (Issue #159 개명 후 한 이름으로 통일 — 개명 전에는 두 이름을 함께
  // 허용해야 했다).
  hr: ["dataGeulBlockId"],
  p: [
    "dataGeulBlockId",
    "dataGeulTextColor",
    "dataGeulBackgroundColor",
    "dataGeulTextAlignment",
  ],
  pre: ["dataGeulBlockId", "dataLanguage", "className", "dataGeulCodeWrap"],
  // 인라인 textColor/backgroundColor mark의 HTML 매핑이다(spec §7.1, RD-004
  // DELTA-01). 표 셀 색상(`data-geul-*`)과 달리 실제 CSS `style` 속성을 쓴다 —
  // 문서 안에서 두 인코딩이 공존하는 것은 spec이 이미 결정했다
  // (inline-content.ts의 wrapMark 참고).
  // p/h1~h6/blockquote/li/summary(TextBlockProps, Issue #179)는 exportHtml이
  // style도 함께 내지만(export-html.ts의 textBlockPropsAttributes) 이 허용
  // 목록(경고 기준)에는 올리지 않는다 — data-geul-* 3종이 권위 값이다
  // (G-CNV-001). 외부 HTML은 data-geul-*가 없는 필드를 style에서 읽어야 하므로
  // sanitize 스키마에는 styleReadAttributes로 style을 남긴다(Issue #334). raw
  // "제거됨" 경고는 이전 그대로 나온다.
  span: ["style"],
  // b·strong의 style은 굵기 판정(`font-weight:normal|400` 등)과 색·기울임·
  // 밑줄·취소선 마크 판정에만 쓴다(Issue #316·#320·#334, inlineElementPresentation).
  // Google Docs 복사가 문서 전체를 `<b style="font-weight:normal">`로 감싼다.
  // 이 목록에 없으면 sanitize가 style을 지워 래퍼가 bold가 된다. raw 경고는
  // 이전처럼 style 제거를 보고한다(import-warnings.ts가 b·strong의 style을
  // 허용 속성에서 뺀다).
  b: ["style"],
  strong: ["style"],
  code: ["dataLanguage", "className"],
  // font·mark는 Issue #334부터 색·서식 마크로 읽는 태그다(inline-content.ts의
  // inlineElementPresentation). font는 color 속성(옛 HTML 글자색)과 style, mark는 style을
  // 정식으로 허용한다 — 읽는 속성이라 제거 경고가 없다. size·face는 읽지 않아
  // 이전처럼 속성 제거 경고를 낸다.
  font: ["color", "style"],
  mark: ["style"],
  table: ["dataGeulBlockId", "dataGeulHeaderRows", "dataGeulHeaderColumns"],
  td: [
    "rowSpan",
    "colSpan",
    "scope",
    "dataGeulCellId",
    "dataGeulColumnId",
    "dataGeulTextColor",
    "dataGeulBackgroundColor",
    "dataGeulAlign",
  ],
  th: [
    "rowSpan",
    "colSpan",
    "scope",
    "dataGeulCellId",
    "dataGeulColumnId",
    "dataGeulTextColor",
    "dataGeulBackgroundColor",
    "dataGeulAlign",
  ],
  tr: ["dataGeulRowId"],
};

// sanitize 스키마에만 합치는 읽기 전용 속성이다(Issue #334). 이 요소들의
// style은 색·서식 마크를 읽는 데만 쓴다. 경고 기준(htmlAllowedAttributes)에는
// 올리지 않는다 — import-warnings.ts가 그 집합으로 "제거됨" 경고를 판정하므로,
// 올리면 이전처럼 style 제거를 보고해야 하는 기존 경고 계약(G-CNV-002)이
// 깨진다. b·strong·span의 style은 위 htmlAllowedAttributes에 이미 있다.
// 블록 요소(p·h1~h6·li·blockquote·div, 단계 B)는 style 색을 블록 속성으로,
// 서식을 안쪽 마크로 읽거나(textBlockPropsFromElement, 문단 div) 표 셀
// 평탄화에서 마크로 읽는다. p·h1~h6·blockquote·li의 자기 echo style 경고 억제
// (import-warnings.ts의 isOwnEchoStyle)는 raw HAST와 이 경고 기준만 보므로
// 이 집합과 무관하다.
// 표 요소(td·th·tr·table, 단계 C)는 style 색과 옛 bgcolor 속성(HAST 이름
// bgColor)을 셀 색으로 읽는다(element-presentation.ts의 cellPresentation). 두 경로(importHtml·클립보드)가
// 같은 읽기 함수를 쓴다.
export const styleReadAttributes: Record<string, string[]> = {
  em: ["style"],
  i: ["style"],
  u: ["style"],
  s: ["style"],
  del: ["style"],
  strike: ["style"],
  code: ["style"],
  p: ["style"],
  h1: ["style"],
  h2: ["style"],
  h3: ["style"],
  h4: ["style"],
  h5: ["style"],
  h6: ["style"],
  li: ["style"],
  blockquote: ["style"],
  div: ["style"],
  td: ["style", "bgColor"],
  th: ["style", "bgColor"],
  tr: ["style", "bgColor"],
  table: ["style", "bgColor"],
};

// 태그마다 속성 이름을 이어 붙여 새 객체를 만든다. 두 입력은 바꾸지 않는다.
const mergeAttributes = (
  base: Record<string, string[]>,
  extra: Record<string, string[]>,
): Record<string, string[]> => {
  const merged: Record<string, string[]> = { ...base };
  for (const [tag, names] of Object.entries(extra)) {
    merged[tag] = [...(base[tag] ?? []), ...names];
  }
  return merged;
};

// sanitize 스키마가 쓰는 속성 허용 목록이다: 경고 기준 + 읽기 전용 속성. 세
// 스키마(htmlSanitizeSchema·htmlImportSanitizeSchema·clipboardSanitizeSchema)가
// 모두 이 목록에서 파생한다. 클립보드 스키마는 import 스키마를 거쳐 파생한다.
export const sanitizeAllowedAttributes: Record<string, string[]> =
  mergeAttributes(htmlAllowedAttributes, styleReadAttributes);

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
  // b/i는 strong/em의 구식(semantic-light) 동의어다 — 워드·구형 웹페이지·
  // 브라우저 `execCommand('bold'/'italic')`가 여전히 흔히 낸다. 없으면
  // 클립보드 붙여넣기에서 서식이 조용히 사라진다(inlineElementPresentation이 같은
  // bold/italic mark로 매핑, inline-content.ts).
  "b",
  "i",
  "u",
  "s",
  // del·strike는 s의 동의어다 — 구형 웹페이지·워드·Google Docs가 취소선을
  // 이 태그로 낸다. 없으면 sanitize가 태그를 벗겨 취소선이 사라진다
  // (inlineElementPresentation이 같은 strike로 매핑, Issue #320). ins는 의미가
  // 밑줄과 달라 읽지 않는다.
  "del",
  "strike",
  "code",
  // font·mark는 색·서식 마크로 읽는다(Issue #334). 없으면 sanitize가 태그를
  // 벗겨 글자색과 형광펜 배경이 사라진다.
  "font",
  "mark",
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
  // blockquote는 model quote 블록의 HTML 매핑이다(DELTA-06a, spec §7.1 —
  // content + children 중첩). 클립보드도 importHtml 변환기로 읽어 같다
  // (Issue #356 RD-005).
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
  attributes: sanitizeAllowedAttributes,
  clobber: [],
  protocols: {
    href: ["http", "https", "mailto", "tel"],
  },
  required: {},
  strip: htmlStrippedTagNames,
  tagNames: htmlAllowedTagNames,
};

// <title>은 소스 문서 head의 메타데이터지 사용자가 선택한 본문이 아니다.
// tagNames에도 strip에도 없으면 sanitize가 태그만 벗기고(unwrap) 그 텍스트를
// fragment 최상위로 끌어올린다. 그러면 스프레드시트 표 붙여넣기에 시트 이름
// 문단이 표 앞에 붙는다. 그래서 클립보드는 title을 글자째 지운다.
// 클립보드 sanitize 스키마(clipboard-sanitize-schema.ts)와 parse-html.ts의
// 깊이-캡 평탄화가 이 목록을 쓴다. 문서 import 경로는 import-warnings 계약이
// 걸려 있어 목록을 공유하지 않는다.
export const clipboardStrippedTagNames = [...htmlStrippedTagNames, "title"];
