// document-import(importMarkdown) 공개 진입점. Markdown 문자열을 remark로
// parse → 참조 해석(definitionLookup/expandImageReferencesFromText/
// resolveReferences) → documentFromRoot(import-markdown-blocks.ts)로 model
// Document를 만들고, parseDocument(G-CNV-001 — 최종 검증은 이 한 곳)로
// 마무리한다. 파싱 orchestration만 남기고 나머지 책임(helpers, 인라인,
// 참조 해석, table/paragraph 판정, 상호재귀 블록 변환)은 같은 디렉터리의
// import-markdown-*.ts로 분리했다.
import { type IdFactory, parseDocument } from "@cp949/geul-model";

import type { ImportError } from "../errors.js";
import type { Result } from "../result.js";
import { parseProcessor } from "./gfm-parse-processor.js";
import { documentFromRoot } from "./import-markdown-blocks.js";
import {
  createDefaultIdFactory,
  MarkdownDocumentInvalidError,
  type MarkdownRoot,
} from "./import-markdown-helpers.js";
import {
  MAX_MARKDOWN_LIST_NESTING_DEPTH,
  markdownListNestingTooDeep,
} from "./import-markdown-list-nesting-guard.js";
import {
  definitionLookup,
  expandImageReferencesFromText,
  resolveReferences,
} from "./import-markdown-references.js";
import { capMarkdownTreeDepth } from "./import-markdown-tree-depth.js";
import {
  deepTreeFlattenedWarning,
  type ImportSuccess,
  type ImportWarning,
} from "./import-markdown-warnings.js";
import { stripAutolinkLiterals } from "./strip-autolink-literals.js";

export type {
  ImportSuccess,
  ImportWarning,
} from "./import-markdown-warnings.js";

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
    // 선두 BOM(U+FEFF)을 입력 단계에서 전부 한 번에 뗀다(Issue #421).
    // - remark는 입력의 선두 BOM을 하나 떼고 파싱해 position.offset이 그 기준이다.
    // - 원본을 받은 가드와 offset 기반 후처리는 BOM 개수만큼 어긋난다.
    // - 하나만 떼면 남은 BOM을 remark가 또 떼서 다시 어긋난다.
    const markdownSource = source.replace(/^\uFEFF+/, "");

    // remark-gfm의 list 파싱이 중첩 단수에 초선형(대략 3차)으로 느려져
    // depth 500부터 수 초, depth 1000은 30초 내 미종료로 CPU를 소진한다
    // (Issue #206). capMarkdownTreeDepth(아래)와 달리 손상이
    // parseProcessor.parse() 호출 *내부*에서 이미 일어나 그 호출이 끝난
    // 뒤에야 실행되는 post-parse 방어로는 막을 수 없다 — 파서를 호출하기
    // 전에 원본 텍스트만 사전 스캔해 구조적으로 거절한다
    // (import-markdown-list-nesting-guard.ts).
    if (markdownListNestingTooDeep(markdownSource)) {
      return {
        ok: false,
        error: {
          code: "MARKDOWN_LIST_NESTING_TOO_DEEP",
          message: `Markdown list nesting exceeds the maximum supported depth of ${MAX_MARKDOWN_LIST_NESTING_DEPTH}`,
        },
      };
    }

    // remark는 U+0000을 U+FFFD로 바꿔 CodeBlock source 위반을 숨긴다.
    // 같은 길이의 다른 금지 C0로 치환해 model validation까지 보존한다.
    // CR·CRLF는 LF로 바꾼다(Issue #418).
    // - CommonMark는 CR·CRLF·LF를 모두 줄 끝으로 정의한다.
    // - model은 LF 외 줄바꿈을 거절한다. 노드별 후처리는 빠뜨리기 쉽다.
    // - 길이가 바뀐다. offset을 읽는 후처리는 이 문자열을 받아야 한다.
    const parsedSource = markdownSource
      .replace(/\0/g, "\u0001")
      .replace(/\r\n?/g, "\n");
    const root = asMarkdownRoot(parseProcessor.parse(parsedSource));
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
    // own-traversal(blocksFromNodes 등)의 own-cap(64, ee9b9c6)만으로는
    // 캡 도달 후 남은 서브트리의 재귀 호출 자체를 막지 못한다(depth 1370+
    // 에서 여전히 RangeError) — 이 사전 캡이 own-traversal에 도달하는
    // mdast 트리 깊이 자체를 256으로 묶어 재귀 호출 횟수를 유계로 만든다
    // (Issue #135 §9, import-markdown-tree-depth.ts 헤더 주석 참고).
    if (capMarkdownTreeDepth(root)) {
      warnings.push(deepTreeFlattenedWarning());
    }
    // GFM autolink literal(맨몸 URL·www·이메일)을 평문으로 되돌린다
    // (Issue #400, strip-autolink-literals.ts).
    // - 깊이 캡 뒤에 둔다. 캡이 접은 서브트리에는 link가 없고, 패스는 유계
    //   트리만 훑는다.
    // - 참조 해석 앞에 둔다. 이후 단계가 literal link를 보지 않게 한다.
    stripAutolinkLiterals(root, parsedSource);
    const definitions = definitionLookup(root);
    expandImageReferencesFromText(root, parsedSource);
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
