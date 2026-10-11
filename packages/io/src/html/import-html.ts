// document-import(importHtml) 공개 진입점. HTML 문자열을 sanitized 루트로
// 준비(prepare-sanitized-root.ts: parse → sanitize → 링크·벗기기·공백 접기)하고
// raw HAST 경고를 모은 뒤 documentFromRoot(import-html-blocks.ts)로 model
// Document를 만들고, parseDocument(G-CNV-001 — 최종 검증은 이 한 곳)로
// 마무리한다. 파싱 orchestration만 남기고 나머지 책임(sanitize schema,
// helpers, table/media/list/wrapper 판정, 상호재귀 블록 변환)은 같은
// 디렉터리의 import-html-*.ts로 분리했다.
import {
  type Document,
  type IdFactory,
  type IframeEmbedConfig,
  parseDocument,
} from "@cp949/geul-model";

import type { ImportError } from "../errors.js";
import type { Result } from "../result.js";
import {
  createDefaultIdFactory,
  HtmlDocumentInvalidError,
} from "./import-html-helpers.js";
import { createImportContext } from "./import-context.js";
import {
  defaultHtmlTableSeam,
  documentFromRoot,
} from "./import-html-blocks.js";
import { htmlImportSanitizeSchema } from "./import-html-sanitize-schema.js";
import {
  collectHtmlImportWarnings,
  deepTreeFlattenedWarning,
  type HtmlImportWarning,
  unwrappedColorTagWarnings,
} from "./import-warnings.js";
import { prepareSanitizedRoot } from "./prepare-sanitized-root.js";

export const importHtml = (
  source: string,
  // iframeEmbed(Issue #215) — 생략 시 가장 보수적인 기본값(빈 config)으로
  // 판정한다. resolveIframeEmbedDecision 자체 기본값(allowCustomUrl 미지정
  // 시 거부, https만 허용, private network 차단)이 그대로 적용돼 host가
  // 명시적으로 허용하지 않은 iframe src는 import되지 않는다 — 이 함수를
  // 직접 호출하는 host 통합(예: 서버 사이드 parse/render, IO-009)도 이
  // 파라미터로만 whitelist·private-network 정책의 보호를 받는다.
  options?: { createId?: IdFactory; iframeEmbed?: IframeEmbedConfig },
): Result<
  { document: Document; warnings: HtmlImportWarning[] },
  ImportError
> => {
  try {
    // parse5는 U+0000을 AST 생성 전에 제거한다. 같은 길이의 다른 금지 C0로
    // 치환해 raw warning과 CodeBlock strict validation이 원문 위반을 본다.
    const prepared = prepareSanitizedRoot(
      source.replace(/\0/g, "\u0001"),
      htmlImportSanitizeSchema,
    );
    if (prepared === undefined) {
      return {
        ok: false,
        error: {
          code: "HTML_PARSE_FAILED",
          message: "HTML parser did not produce a root node",
        },
      };
    }
    // 깊이-캡 절단(Issue #130)은 sanitize·경고 수집 이전에 일어나므로 raw 경고
    // 수집과 sanitize 의미 변환이 같은(절단된) 트리를 본다 — 절단 사실 자체는
    // truncated로만 알 수 있어 여기서 경고로 바꾼다. 절단이 시간상 가장 먼저
    // 일어난 사건이라 경고 목록 맨 앞에 둔다.
    const { unsafeRoot, safeRoot, truncated, unwrappedColorTags } = prepared;
    const warnings = collectHtmlImportWarnings(unsafeRoot);
    if (truncated) warnings.unshift(deepTreeFlattenedWarning());
    // 블록을 품은 font·mark를 벗기는 순간 알린다(Issue #356 RD-006). 수집기
    // 경고 바로 뒤에 쌓인다.
    for (const node of unwrappedColorTags) {
      warnings.push(...unwrappedColorTagWarnings(node));
    }
    // 변환기가 글자를 정제하는 지점에서 UNSAFE_CODE_POINT_REMOVED를 낸다
    // (RD-001). 수집기 경고 뒤에 변환 순서로 쌓인다. 접기를 마친 트리에서
    // 텍스트 노드의 sanitize 뒤 부모 태그를 읽는다.
    const context = createImportContext(safeRoot, warnings);
    const document = documentFromRoot(
      safeRoot,
      options?.createId ?? createDefaultIdFactory(safeRoot),
      context,
      options?.iframeEmbed ?? {},
      defaultHtmlTableSeam,
    );
    // 변환기가 보존했다고 표시하지 않은 감사 대상 속성을 경고한다. 변환기
    // 경고라 가장 뒤에 붙는다.
    context.preserved.audit(safeRoot);
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
