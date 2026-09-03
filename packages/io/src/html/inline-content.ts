import {
  appendOrMergeInlineItem,
  type InlineContent,
  type TextMark,
} from "@cp949/geul-model";

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

export type HtmlRoot = {
  type: "root";
  children: HtmlNode[];
};

// textColor/backgroundColor는 기존 6종 뒤(6·7)에 붙는다 — RD-001
// DELTA-01(model TextMark 확장)이 이 Record를 컴파일 오류로 강제 갱신시켜
// 여기 추가했다. HTML `<span style>` 인코드·디코드 자체는 RD-004 범위다
// (아래 wrapMark의 명시 거절 참고).
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

const markForElement = (node: HtmlElementNode): TextMark | undefined => {
  switch (node.tagName) {
    case "a": {
      const href = node.properties.href;
      return typeof href === "string" ? { type: "link", href } : undefined;
    }
    case "strong":
      return { type: "bold" };
    case "em":
      return { type: "italic" };
    case "u":
      return { type: "underline" };
    case "s":
      return { type: "strike" };
    case "code":
      return { type: "code" };
    default:
      return undefined;
  }
};

const readInlineNodes = (
  nodes: HtmlNode[],
  marks: TextMark[],
  content: InlineContent,
): void => {
  for (const node of nodes) {
    if (node.type === "text") {
      appendOrMergeInlineItem(content, node.value, marks);
      continue;
    }
    if (node.type !== "element") continue;
    if (node.tagName === "br") {
      appendOrMergeInlineItem(content, "\n", marks);
      continue;
    }

    const mark = markForElement(node);
    readInlineNodes(
      node.children,
      mark === undefined ? marks : [...marks, mark],
      content,
    );
  }
};

export const inlineContentFromNodes = (nodes: HtmlNode[]): InlineContent => {
  const content: InlineContent = [];
  readInlineNodes(nodes, [], content);
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
    case "backgroundColor":
      // spec §7.1·roadmap D1이 `<span style="...">` 마크당 1개 중첩으로
      // 이미 결정했지만, sanitize-schema.ts의 htmlAllowedTagNames에 `span`이
      // 아직 없고 markForElement(디코드 방향)도 이 태그를 모른다 —
      // 인코드만 먼저 열면 재파싱·sanitize에서 조용히 사라지는 반쪽
      // round-trip이 된다. RD-004가 스키마 허용·디코드와 함께 이 case를
      // 구현으로 교체한다. 이 경로는 RD-002(명령)·RD-004 전까지 어떤
      // 프로덕션 문서도 도달하지 않는다(오늘 이 mark를 만드는 경로가
      // 없다) — 그래도 언젠가 도달하면 잘못된 손실 대신 여기서 명시적으로
      // 멈춘다.
      throw new Error(
        `${mark.type} HTML export is not implemented yet (RD-004)`,
      );
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
  content.flatMap((item) => {
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
