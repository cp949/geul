export type TextMark =
  | { type: "bold" | "italic" | "underline" | "strike" | "code" }
  | { type: "link"; href: string };

export type InlineContent = Array<{ text: string; marks?: TextMark[] }>;

export type ParagraphBlock = {
  id: string;
  type: "paragraph";
  content: InlineContent;
};
export type HeadingBlock = {
  id: string;
  type: "heading";
  level: 1 | 2 | 3;
  content: InlineContent;
};
export type TableBlock = {
  id: string;
  type: "table";
  columns: Array<{ id: string; width: number }>;
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
    }>;
  }>;
  headerRows: 0 | 1;
  headerColumns: 0 | 1;
};
export type Block = ParagraphBlock | HeadingBlock | TableBlock;
export type Document = { formatVersion: 1; revision: number; blocks: Block[] };
export type IdFactory = () => string;
