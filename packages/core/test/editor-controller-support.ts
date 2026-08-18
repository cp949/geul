import type { Document, InlineContent } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { afterEach } from "vitest";
import type { EditorController } from "../src/index.js";

export const paragraphDocument = (text: string, revision = 0): Document => ({
  formatVersion: 1,
  revision,
  blocks: [
    {
      id: "block-1",
      type: "paragraph",
      content: [{ text }],
    },
  ],
});

export const sequentialIds = (prefix: string) => {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
};

export const documentWithContent = (content: InlineContent): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [{ id: "block-1", type: "paragraph", content }],
});

/**
 * 테스트가 마운트한 에디터 목록. 마운트된 채 남으면 ProseMirror DOMObserver의
 * 지연 flush가 jsdom 환경 해제 이후에 실행되어 "document is not defined"
 * unhandled error가 된다. afterEach에서 일괄 해제한다.
 */
const mountedEditors = new Set<EditorController>();

afterEach(() => {
  // destroy()는 멱등이므로 테스트가 이미 해제한 에디터도 안전하다.
  for (const editor of mountedEditors) editor.destroy();
  mountedEditors.clear();
});

export const mountTiptapEditor = (
  editor: EditorController,
): { editable: HTMLElement; tiptap: TiptapEditor } => {
  const container = document.createElement("div");
  editor.mount(container);
  const editable = container.querySelector<
    HTMLElement & { editor?: TiptapEditor }
  >("[contenteditable='true']");
  if (editable?.editor === undefined) {
    throw new Error("Mounted Tiptap editor was not available");
  }
  mountedEditors.add(editor);
  return { editable, tiptap: editable.editor };
};

export const editorState = (
  editor: EditorController,
  tiptap: TiptapEditor,
) => ({
  document: editor.getDocument(),
  selection: tiptap.state.selection.toJSON(),
  storedMarks: tiptap.state.storedMarks?.map((mark) => mark.toJSON()) ?? null,
  tiptapDocument: tiptap.state.doc.toJSON(),
});
