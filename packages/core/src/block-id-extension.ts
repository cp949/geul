import {
  createRandomDocumentId,
  type IdFactory,
  isValidDocumentId,
  type TableColumn,
} from "@cp949/geul-model";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { createUniqueDocumentId } from "./document-id-factory.js";

type BlockIdOptions = {
  createId: IdFactory;
};

export const BlockIdExtension = Extension.create<BlockIdOptions>({
  name: "blockId",

  addOptions() {
    return {
      createId: createRandomDocumentId,
    };
  },

  // blockId는 blockContainer가 identity 소유자다(D19) — paragraph/heading은
  // group이 "blockContent"로 바뀌며 blockId attr을 컨테이너로 넘겼다. table은
  // 이 global attr 대상에 없다(지금도 없었다) — 표의 blockId는
  // table-extension.ts가 자체 addAttributes로 부여하는 별도 경로다(실측
  // 확인: types 배열이 이전에도 "table"을 포함한 적이 없다).
  addGlobalAttributes() {
    return [
      {
        types: ["blockContainer"],
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

          const nonBlockContainerIdentityIds = new Set<string>();
          const occupiedIds = new Set<string>();
          const addNonBlockContainerIdentity = (value: unknown): void => {
            if (typeof value !== "string") return;
            occupiedIds.add(value);
            nonBlockContainerIdentityIds.add(value);
          };
          nextState.doc.descendants((node) => {
            if (node.type.name === "blockContainer") {
              const blockId = node.attrs.blockId;
              if (typeof blockId === "string" && isValidDocumentId(blockId)) {
                occupiedIds.add(blockId);
              }
            } else if (node.type.name === "table") {
              addNonBlockContainerIdentity(node.attrs.blockId);
              for (const column of (node.attrs.columns ??
                []) as TableColumn[]) {
                addNonBlockContainerIdentity(column.id);
              }
            } else if (node.type.name === "tableRow") {
              addNonBlockContainerIdentity(node.attrs.rowId);
            } else if (
              node.type.name === "tableCell" ||
              node.type.name === "tableHeader"
            ) {
              addNonBlockContainerIdentity(node.attrs.cellId);
            } else if (node.type.name === "divider") {
              addNonBlockContainerIdentity(node.attrs.blockId);
            } else if (
              node.type.name === "file" ||
              node.type.name === "image" ||
              node.type.name === "video" ||
              node.type.name === "audio"
            ) {
              // 4종 미디어 블록(RD-002 DELTA-01)도 divider·table과 같은
              // 비포장 자체-identity 노드다 — blockContainer 자동 id
              // 발급이 이미 존재하는 미디어 블록 id와 충돌하지 않도록
              // 점유 id로 등록한다(spec §3.1, G-EDT-003).
              addNonBlockContainerIdentity(node.attrs.blockId);
            }
            return true;
          });

          const seenIds = new Set<string>();
          const transaction = nextState.tr;
          let changed = false;

          nextState.doc.descendants((node, position) => {
            if (node.type.name !== "blockContainer") {
              // blockContainer가 아닌 노드(blockGroup·blockContent·table 등)
              // 안에도 임의 깊이의 중첩 blockContainer가 있을 수 있어(D19)
              // 계속 하위로 내려간다.
              return true;
            }

            const currentId = node.attrs.blockId;
            if (
              typeof currentId === "string" &&
              isValidDocumentId(currentId) &&
              !seenIds.has(currentId) &&
              !nonBlockContainerIdentityIds.has(currentId)
            ) {
              seenIds.add(currentId);
              occupiedIds.add(currentId);
              // 유효 id를 확인했어도 이 컨테이너의 자식 blockGroup 안에 더
              // 깊은 blockContainer가 있을 수 있다 — 하위 탐색을 끊지 않는다
              // (완료 조건 5: depth≥1 신규 블록도 id를 받아야 한다).
              return true;
            }

            const nextId = createUniqueDocumentId(createId, occupiedIds);
            seenIds.add(nextId);
            occupiedIds.add(nextId);
            transaction.setNodeMarkup(position, undefined, {
              ...node.attrs,
              blockId: nextId,
            });
            changed = true;
            return true;
          });

          return changed ? transaction : null;
        },
      }),
    ];
  },
});
