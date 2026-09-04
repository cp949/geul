export type { TabularCell, TabularData } from "@cp949/geul-io";
export type {
  InlineContentBlockType,
  ListItemBlock,
  ListItemBlockType,
  NestableBlockType,
  Result,
  TableColumn,
  TableColumnsAttributeError,
} from "@cp949/geul-model";
// data-be-columns 왕복은 model이 단독으로 소유한다(Issue #75). react는
// model에 직접 의존하지 않으므로 core가 통과시킨다 — 선례는 아래 열 너비
// 상수다. 노출되는 값은 문자열과 TableColumn뿐이라 Tiptap/ProseMirror
// 타입 비노출 계약(ADR-0002)을 건드리지 않는다. 목록 종류 판정 4종
// (아키텍처 리뷰 6차 L1, isListEntryBlockType은 RD-004 DELTA-04 추가)도
// 같은 이유로 react까지 통과시킨다. isListEntryBlockType(RD-003 F2)은 io
// 직렬화 축과 분리된 편집 UX 축 판정이다 — react block-type-options.ts가
// 이 predicate로 Turn into 옵션 필터를 codeBlock 가드(core
// generic-block-commands.ts)와 일치시킨다.
export {
  isInlineContentBlockType,
  isListEntryBlockType,
  isListItemBlockType,
  isNestableBlockType,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  parseTableColumns,
  serializeTableColumns,
} from "@cp949/geul-model";
export type {
  BlockSelection,
  BlockTypeDescriptor,
  BlockTypeSource,
  CreateEditorOptions,
  DocumentChangeEvent,
  EditorController,
  SetBlockTypeDescriptor,
  TableCellSelection,
} from "./editor-controller.js";
export {
  blockTypeDescriptorFromBlock,
  createEditor,
} from "./editor-controller.js";
export type { EditorError } from "./errors.js";
export type { MediaBlockKind } from "./media-block-kind.js";
export type {
  MediaUploadState,
  UploadFile,
  UploadResult,
} from "./media-upload.js";
export type { TableCellTarget } from "./table-grid.js";
export type { PasteRejectedReason } from "./table-command-error.js";
