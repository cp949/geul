import {
  appendOrMergeInlineItem,
  type InlineContent,
  type TextMark,
} from "@cp949/geul-model";

import { parseStyleDeclarations } from "../clipboard/style-declarations.js";

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

// 다른 6개 case는 항상 mark 0개 또는 1개지만 span은 style 선언 하나에
// color·background-color가 동시에 있을 수 있어(우리 export는 만들지 않는
// 모양이지만 외부 HTML은 흔히 이렇게 낸다) 반환형이 배열이다 — 한쪽만
// 반환하면 나머지 하나가 조용히 사라진다.
const marksForElement = (node: HtmlElementNode): TextMark[] => {
  switch (node.tagName) {
    case "a": {
      const href = node.properties.href;
      return typeof href === "string" ? [{ type: "link", href }] : [];
    }
    case "strong":
      return [{ type: "bold" }];
    case "em":
      return [{ type: "italic" }];
    case "u":
      return [{ type: "underline" }];
    case "s":
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
      return marks;
    }
    default:
      return [];
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

    readInlineNodes(
      node.children,
      [...marks, ...marksForElement(node)],
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
