export { isCanonicalCellAlign } from "./cell-align.js";
export { isCanonicalCellColor } from "./cell-color.js";
export { createEmptyDocument } from "./create-document.js";
export type { DocumentError, DocumentErrorCode } from "./errors.js";
export { createRandomDocumentId } from "./id-factory.js";
export { isSupportedLinkHref } from "./link-policy.js";
export {
  canonicalizeTextMarks,
  isCanonicalTextMarks,
  sameMarks,
} from "./mark-canonicalization.js";
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
} from "./table-grid-validation.js";
export {
  MAX_COLUMN_WIDTH,
  MAX_TABLE_LOGICAL_CELLS,
  MIN_COLUMN_WIDTH,
  validateGridCoverage,
  validateTableGrid,
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
