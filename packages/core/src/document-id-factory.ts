import {
  isValidDocumentId,
  type Block,
  type Document,
  type IdFactory,
} from "@cp949/geul-model";

const MAX_DOCUMENT_ID_ATTEMPTS = 100;

const allocationErrorMessage = `createId failed to return a valid unique document id after ${MAX_DOCUMENT_ID_ATTEMPTS} attempts`;

const collectBlockIdentityIds = (block: Block, ids: Set<string>): void => {
  ids.add(block.id);
  if (block.type === "table") {
    for (const column of block.columns) ids.add(column.id);
    for (const row of block.rows) {
      ids.add(row.id);
      for (const cell of row.cells) ids.add(cell.id);
    }
    return;
  }
  const children = "children" in block ? block.children : undefined;
  for (const child of children ?? []) {
    collectBlockIdentityIds(child, ids);
  }
};

export const collectDocumentIdentityIds = (document: Document): Set<string> => {
  const ids = new Set<string>();
  for (const block of document.blocks) collectBlockIdentityIds(block, ids);
  return ids;
};

export const createUniqueDocumentId = (
  createId: IdFactory,
  occupiedIds: ReadonlySet<string>,
): string => {
  for (let attempt = 0; attempt < MAX_DOCUMENT_ID_ATTEMPTS; attempt += 1) {
    const candidate = createId();
    if (isValidDocumentId(candidate) && !occupiedIds.has(candidate)) {
      return candidate;
    }
  }
  throw new RangeError(allocationErrorMessage);
};
