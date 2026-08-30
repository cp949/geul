import type { BlockTypeDescriptor, EditorController } from "@cp949/geul-core";

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
];

export const getBlockTypeOptionsForSource = (
  source: BlockTypeDescriptor,
): readonly BlockTypeOption[] => {
  if (source.type === "codeBlock") {
    return BLOCK_TYPE_OPTIONS.filter(
      ({ id }) => id !== "bullet-list" && id !== "numbered-list",
    );
  }
  if (source.type === "bulletListItem" || source.type === "numberedListItem") {
    return BLOCK_TYPE_OPTIONS.filter(({ id }) => id !== "code");
  }
  return BLOCK_TYPE_OPTIONS;
};

export const blockTypeToOptionId = (blockType: BlockTypeDescriptor): string => {
  switch (blockType.type) {
    case "paragraph":
      return "paragraph";
    case "heading":
      return `heading-${blockType.level}`;
    case "quote":
      return "quote";
    case "codeBlock":
      return "code";
    case "bulletListItem":
      return "bullet-list";
    case "numberedListItem":
      return "numbered-list";
  }
};
