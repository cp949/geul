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
  // isToggleable이 true인 heading만 collapsed를 가질 수 있다 — collapsed가
  // 있는데 isToggleable이 true가 아니면 DOCUMENT_INVALID다(spec §4.1). 이
  // 불변식은 schema.ts의 validateBlocksAt 한 곳에서만 판정한다(G-CNV-001).
  isToggleable?: boolean;
  collapsed?: boolean;
  children?: Block[];
};
export type QuoteBlock = {
  id: string;
  type: "quote";
  content: InlineContent;
  children?: Block[];
};
export type BulletListItemBlock = {
  id: string;
  type: "bulletListItem";
  content: InlineContent;
  children?: Block[];
};
export type NumberedListItemBlock = {
  id: string;
  type: "numberedListItem";
  content: InlineContent;
  startNumber?: number;
  children?: Block[];
};
// toggleListItem은 block-kind.ts의 NestableBlockType에 ListItemBlockType과
// 별도로 직접 추가된다 — <ul>/<ol> 표현을 갖는 bulletListItem/
// numberedListItem과 달리 자체 HTML 요소 계열이 없어 ListItemBlock 부분
// 유니온(목록 형제 직렬화용)에 포함하지 않는다. collapsed 규칙은 heading의
// isToggleable+collapsed와 동일한 의미다(spec §4.4) — 다만 toggleListItem은
// 타입 자체가 토글 여부를 뜻하므로 별도 isToggleable 필드가 없다.
export type ToggleListItemBlock = {
  id: string;
  type: "toggleListItem";
  content: InlineContent;
  collapsed?: boolean;
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
  | CodeBlock
  | BulletListItemBlock
  | NumberedListItemBlock
  | ToggleListItemBlock;
// bulletListItem·numberedListItem만 뽑은 부분 유니온이다. io export가
// 목록 형제를 묶어 <ul>/<ol> 또는 mdast list로 직렬화할 때 쓴다 — 세
// 패키지(io/html, io/markdown)가 각자 선언하던 동명 타입을 model로 옮겼다.
export type ListItemBlock = BulletListItemBlock | NumberedListItemBlock;
export type Document = { formatVersion: 1; revision: number; blocks: Block[] };
export type IdFactory = () => string;
