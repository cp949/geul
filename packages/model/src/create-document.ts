import { createRandomDocumentId } from "./id-factory.js";
import type { Document, IdFactory } from "./types.js";

export const createEmptyDocument = (
  createId: IdFactory = createRandomDocumentId,
): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [{ id: createId(), type: "paragraph", content: [] }],
});
