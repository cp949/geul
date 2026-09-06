// document-import(importMarkdown) 공개 진입점. Markdown 문자열을 remark로
// parse → 참조 해석(definitionLookup/expandImageReferencesFromText/
// resolveReferences) → documentFromRoot(import-markdown-blocks.ts)로 model
// Document를 만들고, parseDocument(G-CNV-001 — 최종 검증은 이 한 곳)로
// 마무리한다. 파싱 orchestration만 남기고 나머지 책임(helpers, 인라인,
// 참조 해석, table/paragraph 판정, 상호재귀 블록 변환)은 같은 디렉터리의
// import-markdown-*.ts로 분리했다.
import { type IdFactory, parseDocument } from "@cp949/geul-model";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type { ImportError } from "../errors.js";
import type { Result } from "../result.js";
import { documentFromRoot } from "./import-markdown-blocks.js";
import {
  createDefaultIdFactory,
  MarkdownDocumentInvalidError,
  type MarkdownRoot,
} from "./import-markdown-helpers.js";
import {
  definitionLookup,
  expandImageReferencesFromText,
  resolveReferences,
} from "./import-markdown-references.js";
import type {
  ImportSuccess,
  ImportWarning,
} from "./import-markdown-warnings.js";

export type {
  ImportSuccess,
  ImportWarning,
} from "./import-markdown-warnings.js";

const parseProcessor = unified().use(remarkParse).use(remarkGfm);

const asMarkdownRoot = (node: unknown): MarkdownRoot | undefined => {
  if (
    typeof node !== "object" ||
    node === null ||
    !("type" in node) ||
    node.type !== "root" ||
    !("children" in node) ||
    !Array.isArray(node.children)
  ) {
    return undefined;
  }
  return node as MarkdownRoot;
};

export const importMarkdown = (
  source: string,
  options?: { createId?: IdFactory },
): Result<ImportSuccess, ImportError> => {
  try {
    // remark는 U+0000을 U+FFFD로 바꿔 CodeBlock source 위반을 숨긴다.
    // 같은 길이의 다른 금지 C0로 치환해 model validation까지 보존한다.
    const root = asMarkdownRoot(
      parseProcessor.parse(source.replace(/\0/g, "\u0001")),
    );
    if (root === undefined) {
      return {
        ok: false,
        error: {
          code: "MARKDOWN_PARSE_FAILED",
          message: "Markdown parser did not produce a root node",
        },
      };
    }

    const warnings: ImportWarning[] = [];
    const definitions = definitionLookup(root);
    expandImageReferencesFromText(root, source);
    resolveReferences(root, definitions);
    const document = documentFromRoot(
      root,
      options?.createId ?? createDefaultIdFactory(),
      warnings,
    );
    const parsed = parseDocument(document);
    if (!parsed.ok) {
      return {
        ok: false,
        error: {
          code: "MARKDOWN_DOCUMENT_INVALID",
          message: `Imported Markdown produced an invalid document: ${parsed.error.message}`,
        },
      };
    }
    return { ok: true, value: { document: parsed.value, warnings } };
  } catch (error) {
    if (error instanceof MarkdownDocumentInvalidError) {
      return {
        ok: false,
        error: {
          code: "MARKDOWN_DOCUMENT_INVALID",
          message: `Imported Markdown produced an invalid document: ${error.message}`,
        },
      };
    }
    return {
      ok: false,
      error: {
        code: "MARKDOWN_PARSE_FAILED",
        message:
          error instanceof Error ? error.message : "Failed to parse Markdown",
      },
    };
  }
};
