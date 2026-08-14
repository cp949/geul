import { isSupportedLinkHref } from "@cp949/geul-model";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

const isSupportedLinkMark = (mark: {
  type: { name: string };
  attrs: { href?: unknown };
}): boolean =>
  mark.type.name !== "link" ||
  (typeof mark.attrs.href === "string" && isSupportedLinkHref(mark.attrs.href));

export const LinkPolicyExtension = Extension.create({
  name: "linkPolicy",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        filterTransaction: (transaction) => {
          if (
            transaction.storedMarksSet &&
            transaction.storedMarks?.some((mark) => !isSupportedLinkMark(mark))
          ) {
            return false;
          }
          if (!transaction.docChanged) return true;

          let supported = true;
          transaction.doc.descendants((node) => {
            for (const mark of node.marks) {
              if (!isSupportedLinkMark(mark)) {
                supported = false;
                return false;
              }
            }
            return supported;
          });
          return supported;
        },
      }),
    ];
  },
});
