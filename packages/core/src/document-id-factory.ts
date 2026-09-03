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

// Issue #125 D6·D7 — 하위 트리(자식 blockId, 표라면 column/row/cell id까지)를
// 재귀적으로 재발급할 때 이 클로저 하나로 반복 호출한다. createUniqueDocumentId를
// 그대로 감싸되, 발급한 id를 매 호출 후 occupiedIds에 더해 같은 재귀 안에서
// 나중에 발급되는 id가 방금 쓴 id와 다시 충돌하지 않게 한다 — 호출부
// (generic-block-commands.ts duplicateBlock)가 이 순서를 직접 관리하지
// 않아도 된다. occupiedIds는 mutable Set을 받는다 — 소비 표시가 이 함수의
// 핵심 부작용이라 ReadonlySet으로 좁히지 않는다.
export const createDocumentIdAllocator = (
  createId: IdFactory,
  occupiedIds: Set<string>,
): (() => string) => {
  return () => {
    const id = createUniqueDocumentId(createId, occupiedIds);
    occupiedIds.add(id);
    return id;
  };
};
