import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

type RevisionGuardOptions = {
  canApplyDocumentChange: () => boolean;
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
          !transaction.docChanged || canApplyDocumentChange(),
      }),
    ];
  },
});
