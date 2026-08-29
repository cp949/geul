export type TextMark =
  | { type: "bold" | "italic" | "underline" | "strike" | "code" }
  | { type: "link"; href: string };

export type InlineContent = Array<{ text: string; marks?: TextMark[] }>;

export type ParagraphBlock = {
  id: string;
  type: "paragraph";
  content: InlineContent;
  children?: Block[];
};
export type HeadingBlock = {
  id: string;
  type: "heading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  content: InlineContent;
  children?: Block[];
};
export type QuoteBlock = {
  id: string;
  type: "quote";
  content: InlineContent;
  children?: Block[];
};
export type DividerBlock = { id: string; type: "divider" };
export type CodeBlock = {
  id: string;
  type: "codeBlock";
  language?: string;
  content: InlineContent;
};
export type TableColumn = { id: string; width: number };
export type TableBlock = {
  id: string;
  type: "table";
  columns: TableColumn[];
  rows: Array<{
    id: string;
    cells: Array<{
      id: string;
      columnId: string;
      rowSpan: number;
      columnSpan: number;
      content: InlineContent;
      textColor?: string;
      backgroundColor?: string;
      align?: "left" | "center" | "right";
    }>;
  }>;
  headerRows: 0 | 1;
  headerColumns: 0 | 1;
};
export type Block =
  | ParagraphBlock
  | HeadingBlock
  | TableBlock
  | QuoteBlock
  | DividerBlock
  | CodeBlock;
export type Document = { formatVersion: 1; revision: number; blocks: Block[] };
export type IdFactory = () => string;
