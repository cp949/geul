import type { Document, IdFactory } from "./types.js";

declare const crypto: { randomUUID: () => string };

export const createEmptyDocument = (
  createId: IdFactory = () => crypto.randomUUID(),
): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [{ id: createId(), type: "paragraph", content: [] }],
});
