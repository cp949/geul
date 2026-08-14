import { createEditor } from "@cp949/geul-core";
import { importHtml } from "@cp949/geul-io";
import { createEmptyDocument, type Document } from "@cp949/geul-model";
import {
  type DocumentChangeEvent,
  EditorContent,
  type EditorController,
  type EditorError,
  EditorProvider,
} from "@cp949/geul-react";

const document: Document = createEmptyDocument(() => "fixture-block");
const editor: EditorController = createEditor({ initialDocument: document });
void importHtml("<p>Hello</p>");
void EditorProvider;
void EditorContent;
void editor;
const event: DocumentChangeEvent = {
  revision: 0,
  changedBlockIds: [],
  reason: "local",
};
const error: EditorError = { code: "COMMAND_NOT_APPLICABLE", command: "undo" };
void event;
void error;
