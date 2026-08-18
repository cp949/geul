import {
  type Document,
  type HeadingBlock,
  type InlineContent,
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

// 편집기에 커밋되는 인라인 콘텐츠의 항목 계약: 빈 텍스트 런 금지
// (ProseMirror는 빈 텍스트 노드를 만들 수 없다), 빈 마크 배열 금지,
// 미지원 링크 금지(LinkPolicyExtension이 트랜잭션째 버리기 전에 경계에서
// 거절), 정규 마크 순서, 인접 동일 마크 런 금지. 위반이 없으면 null,
// 있으면 위반을 설명하는 서술어를 반환한다 — 호출자가 위치(블록 id, 셀
// 좌표)를 앞에 붙여 message를 만든다.
export const inlineContentViolation = (
  content: InlineContent,
): string | null => {
  let previousMarks: string | undefined;

  for (const item of content) {
    if (item.text.length === 0) {
      return "contains an empty text run";
    }
    if (item.marks?.length === 0) {
      return "contains an empty mark set";
    }
    for (const mark of item.marks ?? []) {
      if (mark.type === "link" && !isSupportedLinkHref(mark.href)) {
        return "contains an unsupported link URL";
      }
    }
    if (!isCanonicalTextMarks(item.marks ?? [])) {
      return "contains noncanonical mark ordering";
    }

    const currentMarks = JSON.stringify((item.marks ?? []).map(markKey));
    if (currentMarks === previousMarks) {
      return "contains adjacent inline runs with identical marks";
    }
    previousMarks = currentMarks;
  }
  return null;
};

const validateEditableContent = (
  blocks: Array<ParagraphBlock | HeadingBlock>,
): Result<void, EditorError> => {
  for (const block of blocks) {
    const violation = inlineContentViolation(block.content);
    if (violation !== null) {
      return invalid(`Block ${block.id} ${violation}`);
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
