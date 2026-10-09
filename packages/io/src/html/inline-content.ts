import {
  appendOrMergeInlineItem,
  type InlineContent,
  type TextMark,
} from "@cp949/geul-model";

import {
  type InlineStyleMarks,
  parseInlineStyleMarks,
  parseStyleDeclarations,
} from "../clipboard/style-declarations.js";

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

// style의 italic·underline·strike를 마크로 바꾼다. bold는 태그마다 판정이
// 달라(span은 bold일 때만, b·strong은 normal이 아닐 때) 호출부가 정한다.
// 같은 종류 마크가 겹쳐도(`<b><span style="font-weight:700">`) 여기서 막지
// 않는다 — appendOrMergeInlineItem이 canonicalizeTextMarks로 종류당 하나만
// 남긴다.
const decorationMarks = (parsed: InlineStyleMarks): TextMark[] => {
  const marks: TextMark[] = [];
  if (parsed.italic) marks.push({ type: "italic" });
  if (parsed.underline) marks.push({ type: "underline" });
  if (parsed.strike) marks.push({ type: "strike" });
  return marks;
};

// 다른 case는 대개 mark 0개 또는 1개지만 span과 b·strong은 style 선언 하나에
// 여러 마크(color·background-color·font-weight 등)가 동시에 있을 수 있어
// (우리 export는 만들지 않는 모양이지만 외부 HTML은 흔히 이렇게 낸다) 반환형이
// 배열이다 — 한쪽만 반환하면 나머지가 조용히 사라진다.
const marksForElement = (node: HtmlElementNode): TextMark[] => {
  switch (node.tagName) {
    case "a": {
      const href = node.properties.href;
      return typeof href === "string" ? [{ type: "link", href }] : [];
    }
    case "strong":
    case "b": {
      // Google Docs 복사 래퍼 `<b style="font-weight:normal">`는 굵지 않다
      // (Issue #316). style은 sanitize 허용 목록이 b·strong에 남긴다. bold
      // 판정은 기존 규칙 그대로(font-weight가 normal·400이 아니면 bold)이고,
      // style의 italic·underline·strike는 추가로 읽는다(Issue #320).
      const style = node.properties.style;
      const parsed =
        typeof style === "string" ? parseInlineStyleMarks(style) : undefined;
      const marks: TextMark[] =
        parsed?.fontWeight === "normal" ? [] : [{ type: "bold" }];
      if (parsed !== undefined) marks.push(...decorationMarks(parsed));
      return marks;
    }
    case "em":
    case "i":
      return [{ type: "italic" }];
    case "u":
      return [{ type: "underline" }];
    // del·strike는 s와 같은 취소선이다. ins는 읽지 않는다.
    case "s":
    case "del":
    case "strike":
      return [{ type: "strike" }];
    case "code":
      return [{ type: "code" }];
    case "span": {
      const style = node.properties.style;
      if (typeof style !== "string") return [];
      const parsed = parseStyleDeclarations(style);
      const marks: TextMark[] = [];
      if (parsed.color !== undefined) {
        marks.push({ type: "textColor", color: parsed.color });
      }
      if (parsed.backgroundColor !== undefined) {
        marks.push({ type: "backgroundColor", color: parsed.backgroundColor });
      }
      const styleMarks = parseInlineStyleMarks(style);
      if (styleMarks.fontWeight === "bold") marks.push({ type: "bold" });
      marks.push(...decorationMarks(styleMarks));
      return marks;
    }
    default:
      return [];
  }
};

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

const readInlineNodes = (
  nodes: HtmlNode[],
  marks: TextMark[],
  content: InlineContent,
  breaks: BlockBreakState | undefined,
): void => {
  for (const node of nodes) {
    if (node.type === "text") {
      appendText(content, node.value, marks, breaks);
      continue;
    }
    if (node.type !== "element") continue;
    if (node.tagName === "br") {
      appendOrMergeInlineItem(content, "\n", marks);
      if (breaks !== undefined) breaks.pending = false;
      continue;
    }

    const isBlock = breaks?.tagNames.has(node.tagName) === true;
    if (isBlock && breaks !== undefined) breaks.pending = true;
    readInlineNodes(
      node.children,
      [...marks, ...marksForElement(node)],
      content,
      breaks,
    );
    if (isBlock && breaks !== undefined) breaks.pending = true;
  }
};

// blockBreakTagNames를 주면 그 태그(블록 요소)가 인라인으로 펼쳐질 때 앞뒤
// 내용 사이에 줄바꿈(`\n`) 하나를 넣는다. 브라우저가 그 경계에서 줄을
// 바꿔 보여 주는 것과 맞춘다. 앞뒤 어느 쪽에 내용이 없으면 넣지 않는다
// (Issue #323). importHtml 표 셀과 클립보드 표 파서의 셀(Issue #325)이
// 켠다. 끄면 `<p>a</p><p>b</p>`가 `ab`로 붙는다. importHtml 경로에서는
// 소스 공백 접기가 이 경계의 공백을 지우므로 `<p>a</p> <p>b</p>`도 붙는다.
export const inlineContentFromNodes = (
  nodes: HtmlNode[],
  options?: { blockBreakTagNames?: ReadonlySet<string> },
): InlineContent => {
  const content: InlineContent = [];
  const tagNames = options?.blockBreakTagNames;
  readInlineNodes(
    nodes,
    [],
    content,
    tagNames === undefined
      ? undefined
      : { tagNames, pending: false, seenText: false },
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
