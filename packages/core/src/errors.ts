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
  | { code: "MEDIA_TEXT_ALIGNMENT_NOT_SUPPORTED" }
  // top-level CustomBlock(model, RD-002-DELTA-01)은 저장 계약상 유효하지만
  // PM atom 노드가 아직 등록되지 않아(registry는 RD-002-DELTA-06) 이
  // 에디터가 로드할 수 없다 — 조용히 무시하거나 잘못 렌더링하지 않고 로드
  // 자체를 거절한다. 표가 R0에서 쓰던 것과 같은 이름·의미의 손실 정책
  // 카테고리다(docs/reviews/r0-project-foundation-completion.md 참고 —
  // 표가 R1에서 지원되며 이 코드의 생산처가 한 번 사라졌었다).
  | { code: "EDITOR_FEATURE_UNAVAILABLE"; message: string };
