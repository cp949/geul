import { Extension } from "@tiptap/core";
import { Plugin, type Transaction } from "@tiptap/pm/state";

// RD-004-DELTA-02 — canApplyDocumentChange가 transaction을 받는다.
// production-editor-session.ts::evaluateBeforeChange가 revision
// overflow 가드와 소비자 onBeforeChange를 이 하나의 함수 안에서
// AND 결합·fail-fast로 합쳐 넘긴다(이 확장 자신은 목록 내용을 모른다).
type RevisionGuardOptions = {
  canApplyDocumentChange: (transaction: Transaction) => boolean;
};

export const RevisionGuardExtension = Extension.create<RevisionGuardOptions>({
  name: "revisionGuard",

  addOptions() {
    return { canApplyDocumentChange: () => true };
  },

  addProseMirrorPlugins() {
    const canApplyDocumentChange = this.options.canApplyDocumentChange;
    return [
      new Plugin({
        filterTransaction: (transaction) =>
          !transaction.docChanged || canApplyDocumentChange(transaction),
      }),
    ];
  },
});
