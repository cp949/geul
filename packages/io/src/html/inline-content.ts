import {
  canonicalizeTextMarks,
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
  | HtmlTextNode
  | HtmlCommentNode
  | HtmlElementNode;

export type HtmlNode = HtmlElementContent | HtmlDoctypeNode;

export type HtmlRoot = {
  type: "root";
  children: HtmlNode[];
};

const htmlWrapperMarkOrder: Record<TextMark["type"], number> = {
  link: 0,
  bold: 1,
  italic: 2,
  underline: 3,
  strike: 4,
  code: 5,
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

const sameMarks = (
  left: TextMark[] | undefined,
  right: TextMark[] | undefined,
): boolean => {
  const normalizedLeft = left ?? [];
  const normalizedRight = right ?? [];
  if (normalizedLeft.length !== normalizedRight.length) return false;

  return normalizedLeft.every((mark, index) => {
    const candidate = normalizedRight[index];
    if (candidate === undefined || mark.type !== candidate.type) return false;
    return (
      mark.type !== "link" ||
      (candidate.type === "link" && mark.href === candidate.href)
    );
  });
};

const appendText = (
  content: InlineContent,
  text: string,
  marks: TextMark[],
): void => {
  if (text.length === 0) return;

  const normalizedMarks = canonicalizeTextMarks(marks);
  const previous = content.at(-1);
  if (previous !== undefined && sameMarks(previous.marks, normalizedMarks)) {
    previous.text += text;
    return;
  }

  content.push(
    normalizedMarks.length === 0 ? { text } : { text, marks: normalizedMarks },
  );
};

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
      appendText(content, node.value, marks);
      continue;
    }
    if (node.type !== "element") continue;
    if (node.tagName === "br") {
      appendText(content, "\n", marks);
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
