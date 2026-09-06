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
  // PM atom 노드가 등록돼 있지 않으면(registry는 RD-002-DELTA-11,
  // CreateEditorOptions.customBlocks) 이 에디터가 로드할 수 없다 — 조용히
  // 무시하거나 잘못 렌더링하지 않고 로드 자체를 거절한다. 표가 R0에서 쓰던
  // 것과 같은 이름·의미의 손실 정책 카테고리다(docs/reviews/r0-project-
  // foundation-completion.md 참고 — 표가 R1에서 지원되며 이 코드의
  // 생산처가 한 번 사라졌었다).
  | { code: "EDITOR_FEATURE_UNAVAILABLE"; message: string }
  // insertCustomBlock(RD-002-DELTA-11) 전용 — insertMediaBlock의 스키마
  // 부재(도달 불가 방어선, throw)와 달리 여기서는 소비자가 등록하지 않은
  // type 이름을 실수로 넘기는 실제 도달 가능한 경로다.
  | { code: "CUSTOM_BLOCK_TYPE_NOT_REGISTERED"; type: string }
  // insertCustomInlineContent(RD-002-DELTA-18) 전용 — CUSTOM_BLOCK_TYPE_NOT_REGISTERED와
  // 같은 이유(소비자가 등록하지 않은 type 이름을 실수로 넘기는 실제 도달
  // 가능한 경로).
  | { code: "CUSTOM_INLINE_CONTENT_TYPE_NOT_REGISTERED"; type: string }
  // toggleCustomStyle(RD-002-DELTA-19) 전용 — 위 두 코드와 동일 이유.
  | { code: "CUSTOM_STYLE_TYPE_NOT_REGISTERED"; type: string };
