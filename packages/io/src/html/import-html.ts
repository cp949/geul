// document-import(importHtml) 공개 진입점. HTML 문자열을 parse → raw HAST
// 경고 수집 → sanitize → documentFromRoot(import-html-blocks.ts)로 model
// Document를 만들고, parseDocument(G-CNV-001 — 최종 검증은 이 한 곳)로
// 마무리한다. 파싱 orchestration만 남기고 나머지 책임(sanitize schema,
// helpers, table/media/list/wrapper 판정, 상호재귀 블록 변환)은 같은
// 디렉터리의 import-html-*.ts로 분리했다.
import {
  type Document,
  type IdFactory,
  parseDocument,
} from "@cp949/geul-model";
import { sanitize } from "hast-util-sanitize";

import type { ImportError } from "../errors.js";
import type { Result } from "../result.js";
import { sanitizeLinks } from "./hast-properties.js";
import {
  createDefaultIdFactory,
  HtmlDocumentInvalidError,
} from "./import-html-helpers.js";
import { documentFromRoot } from "./import-html-blocks.js";
import { htmlImportSanitizeSchema } from "./import-html-sanitize-schema.js";
import {
  collectHtmlImportWarnings,
  deepTreeFlattenedWarning,
  type HtmlImportWarning,
} from "./import-warnings.js";
import { asRoot, parseHtmlFragment } from "./parse-html.js";

export const importHtml = (
  source: string,
  options?: { createId?: IdFactory },
): Result<
  { document: Document; warnings: HtmlImportWarning[] },
  ImportError
> => {
  try {
    // parse5는 U+0000을 AST 생성 전에 제거한다. 같은 길이의 다른 금지 C0로
    // 치환해 raw warning과 CodeBlock strict validation이 원문 위반을 본다.
    const parsedFragment = parseHtmlFragment(source.replace(/\0/g, "\u0001"));
    if (parsedFragment === undefined) {
      return {
        ok: false,
        error: {
          code: "HTML_PARSE_FAILED",
          message: "HTML parser did not produce a root node",
        },
      };
    }
    // 깊이-캡 절단(Issue #130)은 sanitize·경고 수집 이전(parseHtmlFragment
    // 내부)에 일어나므로 raw 경고 수집과 sanitize 의미 변환이 같은(절단된)
    // 트리를 본다 — 절단 사실 자체는 캡 패스 반환값으로만 알 수 있어
    // 여기서 경고로 바꾼다. 절단이 시간상 가장 먼저 일어난 사건이라 경고
    // 목록 맨 앞에 둔다.
    const { root: unsafeRoot, truncated } = parsedFragment;
    const warnings = collectHtmlImportWarnings(unsafeRoot);
    if (truncated) warnings.unshift(deepTreeFlattenedWarning());
    const safeRoot = asRoot(sanitize(unsafeRoot, htmlImportSanitizeSchema));
    if (safeRoot === undefined) {
      return {
        ok: false,
        error: {
          code: "HTML_PARSE_FAILED",
          message: "HTML parser did not produce a root node",
        },
      };
    }

    sanitizeLinks(safeRoot.children);
    const document = documentFromRoot(
      safeRoot,
      options?.createId ?? createDefaultIdFactory(safeRoot),
      warnings,
    );
    const parsed = parseDocument(document);
    if (!parsed.ok) {
      return {
        ok: false,
        error: {
          code: "HTML_DOCUMENT_INVALID",
          message: `Imported HTML produced an invalid document: ${parsed.error.message}`,
        },
      };
    }

    return {
      ok: true,
      value: { document: parsed.value, warnings },
    };
  } catch (error) {
    if (error instanceof HtmlDocumentInvalidError) {
      return {
        ok: false,
        error: {
          code: "HTML_DOCUMENT_INVALID",
          message: `Imported HTML produced an invalid document: ${error.message}`,
        },
      };
    }
    return {
      ok: false,
      error: {
        code: "HTML_PARSE_FAILED",
        message:
          error instanceof Error ? error.message : "Failed to parse HTML",
      },
    };
  }
};
