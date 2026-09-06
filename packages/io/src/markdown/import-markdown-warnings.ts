// importMarkdown이 반환하는 경고·성공 payload 타입만 담는다. 외부 model
// 타입만 참조하는 leaf라 다른 신규 markdown 파일 전체가 순환 없이 기댈 수
// 있다.
import type { Document } from "@cp949/geul-model";

export type ImportWarning = {
  kind:
    | "RAW_HTML_DOWNGRADED"
    | "IMAGE_DOWNGRADED"
    | "UNSUPPORTED_BLOCK_DOWNGRADED"
    | "UNSUPPORTED_INLINE_DOWNGRADED"
    | "QUOTE_CHILD_DOWNGRADED"
    | "NESTED_QUOTE_FLATTENED"
    | "CODE_BLOCK_META_DROPPED";
  blockId: string;
  rowId?: string;
  cellId?: string;
  message: string;
};

export type ImportSuccess = {
  document: Document;
  warnings: ImportWarning[];
};
