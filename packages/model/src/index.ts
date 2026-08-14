export { createEmptyDocument } from "./create-document.js";
export type { DocumentError, DocumentErrorCode } from "./errors.js";
export { isSupportedLinkHref } from "./link-policy.js";
export {
  canonicalizeTextMarks,
  isCanonicalTextMarks,
} from "./mark-canonicalization.js";
export type { Result } from "./result.js";
export { parseDocument } from "./schema.js";
export type {
  TableGridInvalidReason,
  TableGridValidationError,
} from "./table-grid-validation.js";
export { validateTableGrid } from "./table-grid-validation.js";
export type {
  Block,
  Document,
  HeadingBlock,
  IdFactory,
  InlineContent,
  ParagraphBlock,
  TableBlock,
  TextMark,
} from "./types.js";
