import {
  isListEntryBlockType,
  type BlockTypeDescriptor,
  type EditorController,
} from "@cp949/geul-core";

type SetBlockTypeInput = Parameters<
  EditorController["commands"]["setBlockType"]
>[1];
type SupportedBlockTypeInput = SetBlockTypeInput & BlockTypeDescriptor;

export type BlockTypeOption = {
  id: string;
  label: string;
  description: string;
  keywords: readonly string[];
  blockType: SupportedBlockTypeInput;
};

export const BLOCK_TYPE_OPTIONS: readonly BlockTypeOption[] = [
  {
    id: "paragraph",
    label: "Text",
    description: "Plain paragraph text",
    keywords: ["text", "paragraph", "p"],
    blockType: { type: "paragraph" },
  },
  {
    id: "heading-1",
    label: "Heading 1",
    description: "Large section heading",
    keywords: ["heading", "h1", "title"],
    blockType: { type: "heading", level: 1 },
  },
  {
    id: "heading-2",
    label: "Heading 2",
    description: "Medium section heading",
    keywords: ["heading", "h2", "subtitle"],
    blockType: { type: "heading", level: 2 },
  },
  {
    id: "heading-3",
    label: "Heading 3",
    description: "Small section heading",
    keywords: ["heading", "h3"],
    blockType: { type: "heading", level: 3 },
  },
  {
    id: "heading-4",
    label: "Heading 4",
    description: "Smaller section heading",
    keywords: ["heading", "h4"],
    blockType: { type: "heading", level: 4 },
  },
  {
    id: "heading-5",
    label: "Heading 5",
    description: "Extra small section heading",
    keywords: ["heading", "h5"],
    blockType: { type: "heading", level: 5 },
  },
  {
    id: "heading-6",
    label: "Heading 6",
    description: "Smallest section heading",
    keywords: ["heading", "h6"],
    blockType: { type: "heading", level: 6 },
  },
  // isToggleable(RD-004 DELTA-04)은 heading level과 같은 성격의 직교
  // 축이다 — 이 저장소가 이미 레벨을 콤보박스 없이 6개 독립 항목으로 내는
  // 관례를 그대로 연장한다(RD-004.md "DELTA-04 착수 전 결정").
  {
    id: "toggle-heading-1",
    label: "Toggle Heading 1",
    description: "Large collapsible heading",
    keywords: ["heading", "h1", "toggle", "collapsible", "expand", "collapse"],
    blockType: { type: "heading", level: 1, isToggleable: true },
  },
  {
    id: "toggle-heading-2",
    label: "Toggle Heading 2",
    description: "Medium collapsible heading",
    keywords: ["heading", "h2", "toggle", "collapsible", "expand", "collapse"],
    blockType: { type: "heading", level: 2, isToggleable: true },
  },
  {
    id: "toggle-heading-3",
    label: "Toggle Heading 3",
    description: "Small collapsible heading",
    keywords: ["heading", "h3", "toggle", "collapsible", "expand", "collapse"],
    blockType: { type: "heading", level: 3, isToggleable: true },
  },
  {
    id: "toggle-heading-4",
    label: "Toggle Heading 4",
    description: "Smaller collapsible heading",
    keywords: ["heading", "h4", "toggle", "collapsible", "expand", "collapse"],
    blockType: { type: "heading", level: 4, isToggleable: true },
  },
  {
    id: "toggle-heading-5",
    label: "Toggle Heading 5",
    description: "Extra small collapsible heading",
    keywords: ["heading", "h5", "toggle", "collapsible", "expand", "collapse"],
    blockType: { type: "heading", level: 5, isToggleable: true },
  },
  {
    id: "toggle-heading-6",
    label: "Toggle Heading 6",
    description: "Smallest collapsible heading",
    keywords: ["heading", "h6", "toggle", "collapsible", "expand", "collapse"],
    blockType: { type: "heading", level: 6, isToggleable: true },
  },
  {
    id: "quote",
    label: "Quote",
    description: "Capture a quote",
    keywords: ["quote", "blockquote", "citation"],
    blockType: { type: "quote" },
  },
  {
    id: "code",
    label: "Code",
    description: "Write plain code",
    keywords: ["code", "codeblock", "pre"],
    blockType: { type: "codeBlock" },
  },
  {
    id: "bullet-list",
    label: "Bulleted List",
    description: "Create a bulleted list",
    keywords: ["bullet", "list", "unordered", "ul"],
    blockType: { type: "bulletListItem" },
  },
  {
    id: "numbered-list",
    label: "Numbered List",
    description: "Create a numbered list",
    keywords: ["number", "list", "ordered", "ol"],
    blockType: { type: "numberedListItem" },
  },
  {
    id: "check-list",
    label: "Check List",
    description: "Track tasks with a checklist",
    keywords: ["check", "checkbox", "checklist", "todo", "task"],
    blockType: { type: "checkListItem" },
  },
  {
    id: "toggle-list",
    label: "Toggle List",
    description: "Create a collapsible toggle list",
    keywords: ["toggle", "list", "collapsible", "expand", "collapse"],
    blockType: { type: "toggleListItem" },
  },
];

export const getBlockTypeOptionsForSource = (
  source: BlockTypeDescriptor,
): readonly BlockTypeOption[] => {
  if (source.type === "codeBlock") {
    // codeBlock↔heading 전환은 isToggleable 값과 무관하게 항상 허용된다
    // (DELTA-02 changesCodeBlockBoundary) — toggle-heading-*는 제외하지
    // 않는다. codeBlock↔목록류만 command guard(isListEntryBlockType,
    // generic-block-commands.ts의 currentIsList/targetIsList)가 거절한다.
    return BLOCK_TYPE_OPTIONS.filter(
      ({ id }) =>
        id !== "bullet-list" &&
        id !== "numbered-list" &&
        id !== "check-list" &&
        id !== "toggle-list",
    );
  }
  // toggleListItem source에서도 Code 옵션을 제외해야 command guard와 UI가
  // 어긋나지 않는다(RD-004 DELTA-02가 codeBlock↔toggleListItem을 양방향
  // 거절로 이미 확정) — isListItemBlockType(io 직렬화 축)이 아니라
  // isListEntryBlockType(편집 UX 축, RD-003 F2)으로 판정한다.
  if (isListEntryBlockType(source.type)) {
    return BLOCK_TYPE_OPTIONS.filter(({ id }) => id !== "code");
  }
  return BLOCK_TYPE_OPTIONS;
};

export const blockTypeToOptionId = (blockType: BlockTypeDescriptor): string => {
  switch (blockType.type) {
    case "paragraph":
      return "paragraph";
    case "heading":
      return blockType.isToggleable === true
        ? `toggle-heading-${blockType.level}`
        : `heading-${blockType.level}`;
    case "quote":
      return "quote";
    case "codeBlock":
      return "code";
    case "bulletListItem":
      return "bullet-list";
    case "numberedListItem":
      return "numbered-list";
    case "checkListItem":
      return "check-list";
    case "toggleListItem":
      return "toggle-list";
  }
};
