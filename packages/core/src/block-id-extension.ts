import { createRandomDocumentId, type IdFactory } from "@cp949/geul-model";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

type BlockIdOptions = {
  createId: IdFactory;
};

export const BlockIdExtension = Extension.create<BlockIdOptions>({
  name: "blockId",

  addOptions() {
    return { createId: createRandomDocumentId };
  },

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-be-block-id"),
            renderHTML: (attributes) => {
              const blockId = attributes.blockId;
              return typeof blockId === "string" && blockId.length > 0
                ? { "data-be-block-id": blockId }
                : {};
            },
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    const createId = this.options.createId;

    return [
      new Plugin({
        appendTransaction: (transactions, _previousState, nextState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }

          const seenIds = new Set<string>();
          const transaction = nextState.tr;
          let changed = false;

          nextState.doc.descendants((node, position) => {
            if (
              node.type.name !== "paragraph" &&
              node.type.name !== "heading"
            ) {
              return true;
            }

            const currentId = node.attrs.blockId;
            if (
              typeof currentId === "string" &&
              currentId.length > 0 &&
              !seenIds.has(currentId)
            ) {
              seenIds.add(currentId);
              return false;
            }

            let nextId = createId();
            while (nextId.length === 0 || seenIds.has(nextId)) {
              nextId = createId();
            }
            seenIds.add(nextId);
            transaction.setNodeMarkup(position, undefined, {
              ...node.attrs,
              blockId: nextId,
            });
            changed = true;
            return false;
          });

          return changed ? transaction : null;
        },
      }),
    ];
  },
});
