export type EditorError =
  | { code: "DOCUMENT_INVALID"; message: string }
  | { code: "EDITOR_FEATURE_UNAVAILABLE"; feature: "table" }
  | { code: "BLOCK_NOT_FOUND"; blockId: string }
  | { code: "COMMAND_NOT_APPLICABLE"; command: string }
  | { code: "LINK_HREF_REJECTED"; href: string }
  | { code: "TABLE_NOT_FOUND"; blockId: string }
  | { code: "TABLE_NODE_INVALID"; message: string }
  | { code: "INVALID_TABLE_SIZE" }
  | { code: "INDEX_OUT_OF_RANGE" }
  | { code: "MERGE_BOUNDARY_CROSSED" }
  | { code: "COLUMN_WIDTH_OUT_OF_RANGE"; width: number }
  | { code: "NOT_RECTANGULAR" }
  | { code: "CELL_NOT_FOUND"; cellId: string }
  | { code: "LAST_ROW" }
  | { code: "LAST_COLUMN" }
  | { code: "INVALID_COLOR"; color: string }
  | { code: "INVALID_ALIGN"; align: string }
  | { code: "CELL_LIMIT_EXCEEDED" }
  | { code: "PASTE_MERGE_CONFLICT" }
  | { code: "PASTE_TARGET_NOT_FOUND" };
