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
// 타입 비노출 계약(ADR-0002)을 건드리지 않는다. 목록 종류 판정 3종
// (아키텍처 리뷰 6차 L1)도 같은 이유로 react까지 통과시킨다.
export {
  isInlineContentBlockType,
  isListItemBlockType,
  isNestableBlockType,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  parseTableColumns,
  serializeTableColumns,
} from "@cp949/geul-model";
export type {
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
export type { TableCellTarget } from "./table-grid.js";
export type { PasteRejectedReason } from "./table-command-error.js";
