export type DocumentErrorCode =
  | "DOCUMENT_FORMAT_UNSUPPORTED"
  | "DOCUMENT_INVALID"
  | "TABLE_GRID_INVALID"
  | "DOCUMENT_LIMIT_EXCEEDED";

export type DocumentError = {
  code: DocumentErrorCode;
  path: Array<string | number>;
  message: string;
};
