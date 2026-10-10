import {
  appendOrMergeInlineItem,
  type InlineContent,
  type TextMark,
} from "@cp949/geul-model";

import {
  type InlinePresentation,
  type TextFormat,
  blockPresentation,
  EMPTY_INLINE_PRESENTATION,
  inheritInlinePresentation,
  inlineElementPresentation,
  inlinePresentationMarks,
} from "./element-presentation.js";

export type HtmlTextNode = {
  type: "text";
  value: string;
};

export type HtmlCommentNode = {
  type: "comment";
  value: string;
};

export type HtmlDoctypeNode = {
  type: "doctype";
};

export type HtmlElementNode = {
  type: "element";
  tagName: string;
  properties: Record<
    string,
    string | number | boolean | Array<string | number> | null | undefined
  >;
  children: HtmlElementContent[];
};

export type HtmlElementContent =
  HtmlTextNode | HtmlCommentNode | HtmlElementNode;

export type HtmlNode = HtmlElementContent | HtmlDoctypeNode;

// customBlockToHtml(spec §4.5, RD-003)이 반환하는 완성된 HTML 문자열을
// 구조화된 트리로 재파싱하지 않고 그대로 삽입하는 자리다 — hast의 표준
// raw-node passthrough(`allowDangerousHtml: true`, export-html.ts의
// stringifyProcessor 설정 참고)만으로 escape 없이 직렬화된다. 소비자가
// 자기 렌더러를 등록한 신뢰 경계 안의 동작이라 별도 sanitize를 하지
// 않는다(`toHtml`은 문자열을 그대로 반환하는 계약, React의
// dangerouslySetInnerHTML과 동일한 신뢰 모델). `HtmlNode`/`HtmlRoot`(import·
// clipboard 파싱 소비처가 실제로 parse한 hast 트리에 쓰는 공유 타입, "raw"를
// 절대 만들지 않는다)에는 합류시키지 않는다 — export-html.ts가 자신이
// 직접 구성하는 출력 트리에서만 로컬 타입으로 얹는다.
export type HtmlRawNode = {
  type: "raw";
  value: string;
};

export type HtmlRoot = {
  type: "root";
  children: HtmlNode[];
};

// textColor/backgroundColor는 기존 6종 뒤(6·7)에 붙는다 — 기존 값(0-5)을
// 그대로 두고 뒤에 이어 붙여야 순서·중첩(D1)이 유지된다.
const htmlWrapperMarkOrder: Record<TextMark["type"], number> = {
  link: 0,
  bold: 1,
  italic: 2,
  underline: 3,
  strike: 4,
  code: 5,
  textColor: 6,
  backgroundColor: 7,
};

const htmlWrapperMarks = (marks: readonly TextMark[]): TextMark[] =>
  marks
    .map((mark, index) => ({ mark, index }))
    .sort(
      (left, right) =>
        htmlWrapperMarkOrder[left.mark.type] -
          htmlWrapperMarkOrder[right.mark.type] || left.index - right.index,
    )
    .map(({ mark }) => mark);

// 블록 줄바꿈 옵션의 상태다. pending은 블록 요소의 시작이나 끝을 지나
// 다음 텍스트 앞에 줄바꿈을 넣어야 하는지다.
// seenText는 공백이 아닌 텍스트를 한 번이라도 읽었는지다. 셀 맨 앞의 소스
// 공백 뒤 첫 블록이 줄바꿈으로 시작하지 않게 한다.
type BlockBreakState = {
  tagNames: ReadonlySet<string>;
  pending: boolean;
  seenText: boolean;
};

const HTML_WHITESPACE_ONLY = /^[\t\n\f\r ]+$/;

const appendText = (
  content: InlineContent,
  text: string,
  marks: TextMark[],
  breaks: BlockBreakState | undefined,
): void => {
  if (text.length === 0) return;
  if (breaks?.pending === true) {
    // 블록 사이 공백뿐인 텍스트는 버리고 줄바꿈 대기를 유지한다. 클립보드
    // 표 파서는 공백을 한 칸으로 접어 두고, 소스 공백 접기가 꺼진 입력
    // (data-geul-*)은 공백이 그대로 온다. 어느 쪽이든 공백과 줄바꿈이
    // 섞이지 않게 한다.
    if (HTML_WHITESPACE_ONLY.test(text)) return;
    breaks.pending = false;
    const last = content[content.length - 1];
    // 앞에 보이는 텍스트가 없거나 이미 줄바꿈으로 끝나면 넣지 않는다. 블록
    // 양끝과 연속 경계가 빈 줄을 만들지 않는다. 앞이 공백뿐이면 그 공백은
    // 셀 정규화가 버린다.
    if (
      breaks.seenText &&
      last !== undefined &&
      "text" in last &&
      !last.text.endsWith("\n")
    ) {
      appendOrMergeInlineItem(content, "\n", []);
    }
  }
  if (breaks !== undefined && !HTML_WHITESPACE_ONLY.test(text)) {
    breaks.seenText = true;
  }
  appendOrMergeInlineItem(content, text, marks);
};

// 표 셀 평탄화 중 style의 색·서식을 마크로 읽는 블록 요소다(Issue #334 단계 B).
// 셀 안에는 블록 속성이 없어 마크가 유일한 표현이다. sanitize가 style을 남기는
// 블록 태그(styleReadAttributes)만 든다. ul·ol·table·tr·td 같은 래퍼는 읽지
// 않는다. 블록 모드(blockBreakTagNames 없음)에서는 이 경로가 꺼져 있어 같은
// 색이 블록 속성과 마크로 이중 반영되지 않는다.
const cellBlockStyleTagNames: ReadonlySet<string> = new Set([
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
]);

// 블록 경계가 될 수 있는 태그다. 문서 import(importHtml)와 클립보드 두 경로가
// 인식하는 경계의 합집합이다 — 경로마다 정책이 달라 안쪽 판정을 그대로 쓸 수
// 없으므로, 어느 경로에서든 #334 이전 sanitize가 font·mark를 벗겼을 때와 같은
// 결과를 내려면 합집합이어야 한다. 허용되지 않는 태그는 sanitize가 이미 지웠다.
const blockBoundaryTagNames: ReadonlySet<string> = new Set([
  "p",
  "pre",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "div",
  "li",
  "ul",
  "ol",
  "blockquote",
  "table",
  "colgroup",
  "col",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "details",
  "summary",
  "figure",
  "figcaption",
  "img",
  "video",
  "audio",
]);

// 색·서식 마크로 읽는 인라인 태그 가운데 #334가 허용 태그에 올린 둘이다.
const colorInlineTagNames: ReadonlySet<string> = new Set(["font", "mark"]);

// 블록 경계를 자손으로 가진 font·mark는 태그만 벗기고 자식을 그 자리에 둔다
// (Issue #334 리뷰). #334 전에는 sanitize가 두 태그를 벗겨 블록 구조가 그대로
// 남았다. 허용 태그로 올린 뒤에는 인라인 요소가 블록을 품어 목록이 문단으로,
// 표가 목록 항목 텍스트로 깨졌다. 블록 자손이 없는 font·mark는 그대로 두어
// 색·배경 마크로 읽는다. sanitize 이후의 의미 변환이라 경고 수집(raw HAST)과
// 별개다(G-CNV-002). 벗겨서 잃는 속성은 onUnwrap으로 호출자가 알린다
// (Issue #356 RD-006). 강등 경고는 findBlockBearingColorTags로 수집기가 낸다.
// 자식을 먼저 처리하므로 바깥이 벗겨져도 블록이 없는 안쪽 font·mark는 남는다.
// 후위 순회 한 번으로 끝낸다 — 자식 목록 처리가 "블록 경계가 있는가"를 돌려주고
// 부모는 그 결과로 자기 판정을 얻는다. font·mark마다 자손을 다시 훑으면 중첩
// 깊이에 이차다. 벗기는 일은 새 배열을 만들어 한 번에 덮어써, 형제가 많아도
// splice의 이동 비용이 붙지 않는다. 벗겨도 자손의 블록 여부는 바뀌지 않는다.
export const unwrapBlockBearingColorTags = (
  nodes: HtmlNode[],
  onUnwrap?: (node: HtmlElementNode) => void,
): void => {
  processColorTags(nodes, undefined, onUnwrap);
};

// 벗겨질 font·mark를 변경 없이 찾는다. 경고 수집기가 raw HAST에서 이 태그를
// 블록 자리의 지원 밖 태그로 강등 보고하려고 쓴다(G-CNV-002). 블록 경계 태그는
// sanitize가 지우지 않아 대개 raw와 sanitize 이후 판정이 같다. 예외: sanitize가
// 자식째 지우는 요소(object 등) 안 블록은 raw에만 있다. 그 font·mark는 실제로는
// 벗겨지지 않는다.
export const findBlockBearingColorTags = (
  nodes: readonly HtmlNode[],
): ReadonlySet<HtmlNode> => {
  const found = new Set<HtmlNode>();
  processColorTags(nodes as HtmlNode[], found);
  return found;
};

// found를 주면 트리를 바꾸지 않고 벗길 태그만 모은다. 벗길 때는 onUnwrap을
// 부른다.
const processColorTags = (
  nodes: HtmlNode[],
  found: Set<HtmlNode> | undefined,
  onUnwrap?: (node: HtmlElementNode) => void,
): boolean => {
  let hasBlock = false;
  let changed = false;
  const result: HtmlNode[] = [];
  for (const node of nodes) {
    if (node.type !== "element") {
      result.push(node);
      continue;
    }
    const childHasBlock = processColorTags(node.children, found, onUnwrap);
    if (blockBoundaryTagNames.has(node.tagName) || childHasBlock) {
      hasBlock = true;
    }
    if (colorInlineTagNames.has(node.tagName) && childHasBlock) {
      if (found !== undefined) {
        found.add(node);
        result.push(node);
      } else {
        onUnwrap?.(node);
        for (const child of node.children) result.push(child);
        changed = true;
      }
    } else {
      result.push(node);
    }
  }
  if (changed) {
    nodes.length = 0;
    for (const node of result) nodes.push(node);
  }
  return hasBlock;
};

// 블록 경계 태그(breaks.tagNames)를 자손으로 가졌는지 본다. 래퍼 div 판정에 쓴다.
const hasBlockBreakDescendant = (
  nodes: readonly HtmlNode[],
  tagNames: ReadonlySet<string>,
): boolean => {
  for (const node of nodes) {
    if (node.type !== "element") continue;
    if (tagNames.has(node.tagName)) return true;
    if (hasBlockBreakDescendant(node.children, tagNames)) return true;
  }
  return false;
};

// 셀 안 블록 요소의 style을 마크로 읽을지 정한다. div는 블록 자손이 없는
// 것만 읽는다 — 블록을 품은 래퍼 div의 색은 소스 앱 테마 색이라 셀 밖 래퍼
// div와 같이 읽지 않는다(Issue #334 리뷰 MINOR-1).
const readsCellBlockStyle = (
  node: HtmlElementNode,
  tagNames: ReadonlySet<string>,
): boolean =>
  cellBlockStyleTagNames.has(node.tagName) &&
  (node.tagName !== "div" || !hasBlockBreakDescendant(node.children, tagNames));

const readInlineNodes = (
  nodes: HtmlNode[],
  inherited: InlinePresentation,
  content: InlineContent,
  breaks: BlockBreakState | undefined,
  onText: ((node: HtmlTextNode) => void) | undefined,
): void => {
  for (const node of nodes) {
    if (node.type === "text") {
      onText?.(node);
      appendText(
        content,
        node.value,
        inlinePresentationMarks(inherited),
        breaks,
      );
      continue;
    }
    if (node.type !== "element") continue;
    if (node.tagName === "br") {
      appendOrMergeInlineItem(
        content,
        "\n",
        inlinePresentationMarks(inherited),
      );
      if (breaks !== undefined) breaks.pending = false;
      continue;
    }

    const isBlock = breaks?.tagNames.has(node.tagName) === true;
    if (isBlock && breaks !== undefined) breaks.pending = true;
    const own =
      isBlock &&
      breaks !== undefined &&
      readsCellBlockStyle(node, breaks.tagNames)
        ? cellBlockPresentation(node)
        : inlineElementPresentation(node);
    readInlineNodes(
      node.children,
      inheritInlinePresentation(inherited, own),
      content,
      breaks,
      onText,
    );
    if (isBlock && breaks !== undefined) breaks.pending = true;
  }
};

// 셀 안 블록 요소의 블록 투영을 마크로 읽는다. 셀 안에는 블록 속성이 없어 색도
// 마크가 유일한 표현이다.
const cellBlockPresentation = (node: HtmlElementNode): InlinePresentation => {
  const { colors, format } = blockPresentation(node);
  return { presentation: { ...format, ...colors }, marks: [] };
};

// blockBreakTagNames를 주면 그 태그(블록 요소)가 인라인으로 펼쳐질 때 앞뒤
// 내용 사이에 줄바꿈(`\n`) 하나를 넣는다. 브라우저가 그 경계에서 줄을
// 바꿔 보여 주는 것과 맞춘다. 앞뒤 어느 쪽에 내용이 없으면 넣지 않는다
// (Issue #323). importHtml 표 셀과 클립보드 표 파서의 셀(Issue #325)이
// 켠다. 끄면 `<p>a</p><p>b</p>`가 `ab`로 붙는다. importHtml 경로에서는
// 소스 공백 접기가 이 경계의 공백을 지우므로 `<p>a</p> <p>b</p>`도 붙는다.
//
// baseFormat은 모든 텍스트가 받는 바깥 서식이다. 블록 요소 style의 서식
// (blockPresentation의 format)을 그 안쪽 텍스트에 싣는다(Issue #334 단계 B).
//
// onText는 읽는 텍스트 노드마다 부른다. importHtml 변환기가 글자 정제 경고를
// 내는 자리다(RD-001). 클립보드 표 파서는 넘기지 않아 경고를 만들지 않는다.
export const inlineContentFromNodes = (
  nodes: HtmlNode[],
  options?: {
    blockBreakTagNames?: ReadonlySet<string>;
    baseFormat?: TextFormat;
    onText?: (node: HtmlTextNode) => void;
  },
): InlineContent => {
  const content: InlineContent = [];
  const tagNames = options?.blockBreakTagNames;
  readInlineNodes(
    nodes,
    options?.baseFormat === undefined
      ? EMPTY_INLINE_PRESENTATION
      : { presentation: options.baseFormat, marks: [] },
    content,
    tagNames === undefined
      ? undefined
      : { tagNames, pending: false, seenText: false },
    options?.onText,
  );
  return content;
};

const element = (
  tagName: string,
  properties: HtmlElementNode["properties"],
  children: HtmlElementContent[],
): HtmlElementNode => ({ type: "element", tagName, properties, children });

const wrapMark = (
  node: HtmlElementContent,
  mark: TextMark,
): HtmlElementNode => {
  switch (mark.type) {
    case "link":
      return element("a", { href: mark.href }, [node]);
    case "bold":
      return element("strong", {}, [node]);
    case "italic":
      return element("em", {}, [node]);
    case "underline":
      return element("u", {}, [node]);
    case "strike":
      return element("s", {}, [node]);
    case "code":
      return element("code", {}, [node]);
    case "textColor":
      // spec §7.1·roadmap D1: `<span style="color:...">` 마크당 1개 중첩(병합
      // 단일 span 아님) — htmlWrapperMarkOrder(6=textColor, 7=backgroundColor)
      // 순서 그대로 textColor가 backgroundColor를 감싼다(inlineContentToNodes의
      // reverse+reduce 실측 확인).
      return element("span", { style: `color:${mark.color}` }, [node]);
    case "backgroundColor":
      return element("span", { style: `background-color:${mark.color}` }, [
        node,
      ]);
  }
};

const textWithBreaks = (text: string): HtmlElementContent[] => {
  const parts = text.split("\n");
  const nodes: HtmlElementContent[] = [];

  for (const [index, part] of parts.entries()) {
    if (part.length > 0) nodes.push({ type: "text", value: part });
    if (index < parts.length - 1) nodes.push(element("br", {}, []));
  }

  return nodes;
};

export const inlineContentToNodes = (
  content: InlineContent,
): HtmlElementContent[] =>
  content.flatMap((rawItem) => {
    // 계약: exportHtml의 blocksInlineContentViolation(RD-002-DELTA-16)가
    // 이 함수 호출 전에 이미 커스텀 inline 원소·CustomTextMark를
    // HTML_DOCUMENT_INVALID로 거절했다는 전제 위에서 텍스트 런·알려진
    // 마크로 캐스트한다(core inlineContentToTiptap과 동일 패턴). 이
    // 함수는 packages/io/src/index.ts에 재수출되지 않는 내부 전용이라
    // exportHtml 진입점 게이트를 우회해 호출될 길이 없다.
    const item = rawItem as { text: string; marks?: TextMark[] };
    const marks = htmlWrapperMarks(item.marks ?? []);
    return textWithBreaks(item.text).map((textNode) =>
      [...marks]
        .reverse()
        .reduce<HtmlElementContent>(
          (node, mark) => wrapMark(node, mark),
          textNode,
        ),
    );
  });

export const htmlElement = element;
