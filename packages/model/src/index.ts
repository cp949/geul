export { isCanonicalCellAlign } from "./cell-align.js";
export { isCanonicalCellColor } from "./cell-color.js";
export { createEmptyDocument } from "./create-document.js";
export type { DocumentError, DocumentErrorCode } from "./errors.js";
export { createRandomDocumentId } from "./id-factory.js";
export { appendOrMergeInlineItem } from "./inline-content-merge.js";
export { isSupportedLinkHref } from "./link-policy.js";
export {
  canonicalizeTextMarks,
  decodeTextMark,
  isCanonicalTextMarks,
  PLAIN_TEXT_MARK_TYPES,
  sameMarks,
} from "./mark-canonicalization.js";
export type { TextMarkNameInput } from "./mark-canonicalization.js";
export type { Result } from "./result.js";
export { parseDocument } from "./schema.js";
export {
  isValidDocumentId,
  isValidInlineText,
  sanitizeInlineText,
} from "./string-invariants.js";
export type { TableColumnsAttributeError } from "./table-columns-attribute.js";
export {
  parseTableColumns,
  serializeTableColumns,
} from "./table-columns-attribute.js";
export type {
  GridCell,
  TableGridInvalidReason,
  TableGridValidationError,
  TableSizeViolation,
} from "./table-grid-validation.js";
export {
  MAX_COLUMN_WIDTH,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_LOGICAL_CELLS,
  MIN_COLUMN_WIDTH,
  tableSizeViolationMessage,
  validateGridCoverage,
  validateTableGrid,
  validateTableSize,
} from "./table-grid-validation.js";
export type {
  Block,
  Document,
  HeadingBlock,
  IdFactory,
  InlineContent,
  ParagraphBlock,
  TableBlock,
  TableColumn,
  TextMark,
} from "./types.js";
