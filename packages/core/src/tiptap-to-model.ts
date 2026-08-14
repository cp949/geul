import {
  canonicalizeTextMarks,
  type Document,
  type IdFactory,
  type InlineContent,
  parseDocument,
  type Result,
  type TextMark,
} from "@cp949/geul-model";

import type { EditorError } from "./errors.js";
import type { TiptapJsonMark, TiptapJsonNode } from "./model-to-tiptap.js";

const invalid = (message: string): Result<never, EditorError> => ({
  ok: false,
  error: { code: "DOCUMENT_INVALID", message },
});

const markFromTiptap = (
  mark: TiptapJsonMark,
): Result<TextMark, EditorError> => {
  switch (mark.type) {
    case "bold":
      return { ok: true, value: { type: "bold" } };
    case "italic":
      return { ok: true, value: { type: "italic" } };
    case "underline":
      return { ok: true, value: { type: "underline" } };
    case "strike":
      return { ok: true, value: { type: "strike" } };
    case "code":
      return { ok: true, value: { type: "code" } };
    case "link": {
      const href = mark.attrs?.href;
      return typeof href === "string"
        ? { ok: true, value: { type: "link", href } }
        : invalid("Link mark requires an href");
    }
    default:
      return invalid(`Unsupported Tiptap mark: ${String(mark.type)}`);
  }
};

const inlineContentFromTiptap = (
  nodes: TiptapJsonNode[] | undefined,
): Result<InlineContent, EditorError> => {
  const content: InlineContent = [];

  for (const node of nodes ?? []) {
    if (node.type !== "text" || typeof node.text !== "string") {
      return invalid(`Unsupported inline node: ${String(node.type)}`);
    }

    const marks: TextMark[] = [];
    for (const mark of node.marks ?? []) {
      const converted = markFromTiptap(mark);
      if (!converted.ok) return converted;
      marks.push(converted.value);
    }

    const canonicalMarks = canonicalizeTextMarks(marks);
    content.push({
      text: node.text,
      ...(canonicalMarks.length === 0 ? {} : { marks: canonicalMarks }),
    });
  }

  return { ok: true, value: content };
};

export const tiptapToModel = (
  json: TiptapJsonNode,
  revision: number,
  createId: IdFactory,
): Result<Document, EditorError> => {
  if (json.type !== "doc") return invalid("Tiptap content must be a document");

  const blocks: Document["blocks"] = [];
  for (const node of json.content ?? []) {
    const content = inlineContentFromTiptap(node.content);
    if (!content.ok) return content;

    const savedId = node.attrs?.blockId;
    const id =
      typeof savedId === "string" && savedId.length > 0 ? savedId : createId();

    if (node.type === "paragraph") {
      blocks.push({ id, type: "paragraph", content: content.value });
      continue;
    }

    if (node.type === "heading") {
      const level = node.attrs?.level;
      if (level !== 1 && level !== 2 && level !== 3) {
        return invalid(`Unsupported heading level: ${String(level)}`);
      }
      blocks.push({ id, type: "heading", level, content: content.value });
      continue;
    }

    return invalid(`Unsupported Tiptap block: ${String(node.type)}`);
  }

  const parsed = parseDocument({ formatVersion: 1, revision, blocks });
  return parsed.ok ? parsed : invalid(parsed.error.message);
};
