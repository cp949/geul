import type { ClipboardParseError } from "@cp949/geul-io";

import type { TableGridError } from "./table-grid.js";

// table-commands.ts/table-model-codec.ts는 Tiptap/ProseMirror 타입(Editor,
// Transaction, ProseMirrorNode, Schema)을 직접 쓰는 함수와 같은 파일에서
// TableCommandError/TableCodecError를 선언하고, table-paste-extension.ts는
// Tiptap Extension 인스턴스(TablePasteExtension)를 선언한다. tsc가 파일
// 단위로 .d.ts를 내보내므로, 다른 모듈이 그 파일에서 타입 하나만 import해도
// 같은 파일의 나머지 선언(Tiptap/PM 타입 포함) 전체가 딸려 나온다.
//
// 이 파일은 TableCommandError/TableCodecError/PasteRejectedReason 자체
// (Tiptap/PM을 전혀 참조하지 않는 순수 데이터 유니온)만 떼어 낸다 —
// CreateEditorOptions(core 공개 declaration, mount API)가 onPasteRejected를
// 통해 이 타입들에 도달할 때 table-commands.d.ts/table-model-codec.d.ts/
// table-paste-extension.d.ts를 공개 declaration 그래프에 끌어들이지 않게
// 한다(ADR-0002 "core의 공개 declaration에는 Tiptap 또는 ProseMirror 타입을
// 노출하지 않는다", packages/core/test/public-types.test.ts가 고정).
export type TableCodecError = { code: "TABLE_NODE_INVALID"; message: string };

export type TableCommandError =
  | TableGridError
  | TableCodecError
  | { code: "BLOCK_NOT_FOUND"; blockId: string }
  | { code: "TABLE_NOT_FOUND"; blockId: string }
  | { code: "INVALID_TABLE_SIZE" }
  | { code: "TABULAR_DATA_INVALID"; message: string }
  | { code: "CLIPBOARD_CONTENT_INVALID"; message: string }
  | { code: "PASTE_TARGET_NOT_FOUND" }
  | { code: "MERGE_TARGET_NOT_FOUND" }
  | { code: "TRANSACTION_REJECTED" };

// 붙여넣기가 거절된 원인이다. 파서 거절(CLIPBOARD_TABLE_INVALID)과 명령
// 거절(TableCommandError 전체)을 그대로 재사용한다 — 새 flatten 계약을
// 만들지 않는다(Issue #36 결정). NOT_TABULAR는 "표 붙여넣기 대상이
// 아니었던" 폴백 경로라 거절이 아니므로 이 union에 포함하지 않는다.
export type PasteRejectedReason =
  Exclude<ClipboardParseError, { code: "NOT_TABULAR" }> | TableCommandError;
