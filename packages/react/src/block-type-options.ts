import type { BlockTypeDescriptor } from "@cp949/geul-core";

export type BlockTypeOption = {
  id: string;
  label: string;
  description: string;
  keywords: readonly string[];
  blockType: BlockTypeDescriptor;
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
];

export const blockTypeToOptionId = (blockType: BlockTypeDescriptor): string => {
  if (blockType.type === "paragraph") return "paragraph";
  if (blockType.type === "quote") return "quote";
  return `heading-${blockType.level}`;
};
