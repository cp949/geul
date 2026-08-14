import {
  type Document,
  type HeadingBlock,
  isCanonicalTextMarks,
  isSupportedLinkHref,
  type ParagraphBlock,
  type Result,
  type TextMark,
} from "@cp949/geul-model";

import type { EditorError } from "./errors.js";

export type TiptapJsonMark = {
  type?: string;
  attrs?: Record<string, unknown>;
};

export type TiptapJsonNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapJsonNode[];
  marks?: TiptapJsonMark[];
  text?: string;
};

const invalid = (message: string): Result<never, EditorError> => ({
  ok: false,
  error: { code: "DOCUMENT_INVALID", message },
});

const markKey = (mark: TextMark): string =>
  mark.type === "link" ? `link:${mark.href}` : mark.type;

const validateEditableContent = (
  blocks: Array<ParagraphBlock | HeadingBlock>,
): Result<void, EditorError> => {
  for (const block of blocks) {
    let previousMarks: string | undefined;

    for (const item of block.content) {
      if (item.text.length === 0) {
        return invalid(`Block ${block.id} contains an empty text run`);
      }
      if (item.marks?.length === 0) {
        return invalid(`Block ${block.id} contains an empty mark set`);
      }
      for (const mark of item.marks ?? []) {
        if (mark.type === "link" && !isSupportedLinkHref(mark.href)) {
          return invalid(`Block ${block.id} contains an unsupported link URL`);
        }
      }
      if (!isCanonicalTextMarks(item.marks ?? [])) {
        return invalid(`Block ${block.id} contains noncanonical mark ordering`);
      }

      const currentMarks = JSON.stringify((item.marks ?? []).map(markKey));
      if (currentMarks === previousMarks) {
        return invalid(
          `Block ${block.id} contains adjacent inline runs with identical marks`,
        );
      }
      previousMarks = currentMarks;
    }
  }

  return { ok: true, value: undefined };
};

const markToTiptap = (mark: TextMark): TiptapJsonMark => {
  switch (mark.type) {
    case "bold":
      return { type: "bold" };
    case "italic":
      return { type: "italic" };
    case "underline":
      return { type: "underline" };
    case "strike":
      return { type: "strike" };
    case "code":
      return { type: "code" };
    case "link":
      return { type: "link", attrs: { href: mark.href } };
  }
};

export const modelToTiptap = (
  document: Document,
): Result<TiptapJsonNode, EditorError> => {
  if (document.blocks.some((block) => block.type === "table")) {
    return {
      ok: false,
      error: { code: "EDITOR_FEATURE_UNAVAILABLE", feature: "table" },
    };
  }
  if (document.blocks.length === 0) {
    return invalid("R0 editor documents require at least one block");
  }
  const editableBlocks = document.blocks.filter(
    (block): block is ParagraphBlock | HeadingBlock => block.type !== "table",
  );
  const representable = validateEditableContent(editableBlocks);
  if (!representable.ok) return representable;

  return {
    ok: true,
    value: {
      type: "doc",
      content: editableBlocks.map((block) => ({
        type: block.type,
        attrs:
          block.type === "heading"
            ? { blockId: block.id, level: block.level }
            : { blockId: block.id },
        content: block.content.map((item) => ({
          type: "text",
          text: item.text,
          ...(item.marks === undefined
            ? {}
            : { marks: item.marks.map(markToTiptap) }),
        })),
      })),
    },
  };
};
