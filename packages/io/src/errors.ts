export type ImportErrorCode =
  | "HTML_PARSE_FAILED"
  | "HTML_DOCUMENT_INVALID"
  | "MARKDOWN_PARSE_FAILED"
  | "MARKDOWN_DOCUMENT_INVALID";

export type ImportError = {
  code: ImportErrorCode;
  message: string;
};

export type ExportErrorCode =
  | "HTML_DOCUMENT_INVALID"
  | "HTML_SERIALIZE_FAILED"
  | "MARKDOWN_DOCUMENT_INVALID"
  | "MARKDOWN_SERIALIZE_FAILED";

export type ExportError = {
  code: ExportErrorCode;
  message: string;
};
