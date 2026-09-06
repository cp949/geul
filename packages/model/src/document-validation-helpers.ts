import type { DocumentError } from "./errors.js";
import type { Result } from "./result.js";

// 문서 트리 안에서 값의 위치를 가리키는 경로다. 배열 인덱스와 객체 키만
// 담는다 — document-structure-validation.ts, table-block-validation.ts,
// text-block-props-validation.ts, document-nesting-depth.ts, parse-document.ts가
// 공유하는 leaf 타입이다.
export type DocumentPath = Array<string | number>;

export const invalid = (
  path: DocumentPath,
  message: string,
): Result<never, DocumentError> => ({
  ok: false,
  error: { code: "DOCUMENT_INVALID", path, message },
});

export const documentPath = (path: PropertyKey[]): DocumentPath =>
  path.flatMap((part) =>
    typeof part === "string" || typeof part === "number" ? [part] : [],
  );
