export type EditorError =
  | { code: "DOCUMENT_INVALID"; message: string }
  | { code: "BLOCK_NOT_FOUND"; blockId: string }
  | { code: "COMMAND_NOT_APPLICABLE"; command: string }
  | { code: "CODE_BLOCK_MARK_NOT_ALLOWED" }
  | { code: "LINK_HREF_REJECTED"; href: string }
  | { code: "TABLE_NOT_FOUND"; blockId: string }
  | { code: "TABLE_NODE_INVALID"; message: string }
  | { code: "INVALID_TABLE_SIZE" }
  | { code: "INDEX_OUT_OF_RANGE" }
  | { code: "MERGE_BOUNDARY_CROSSED" }
  | { code: "COLUMN_WIDTH_OUT_OF_RANGE"; width: number }
  | { code: "NOT_RECTANGULAR" }
  | { code: "TABULAR_DATA_INVALID"; message: string }
  | { code: "CELL_NOT_FOUND"; cellId: string }
  | { code: "LAST_ROW" }
  | { code: "LAST_COLUMN" }
  | { code: "INVALID_COLOR"; color: string }
  | { code: "INVALID_ALIGN"; align: string }
  | { code: "CELL_LIMIT_EXCEEDED" }
  | { code: "PASTE_MERGE_CONFLICT" }
  | { code: "PASTE_TARGET_NOT_FOUND" }
  | { code: "TRANSACTION_REJECTED" }
  | { code: "MEDIA_RESIZE_NOT_SUPPORTED" }
  | { code: "MEDIA_PREVIEW_TOGGLE_NOT_SUPPORTED" }
  | { code: "MEDIA_TEXT_ALIGNMENT_NOT_SUPPORTED" };
