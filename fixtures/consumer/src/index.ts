import {
  createEditor,
  parseTableColumns,
  serializeTableColumns,
  type TableColumn,
  type TableColumnsAttributeError,
  type SetBlockTypeDescriptor,
} from "@cp949/geul-core";
import { importHtml } from "@cp949/geul-io";
import {
  type BulletListItemBlock,
  createEmptyDocument,
  type Document,
  type NumberedListItemBlock,
} from "@cp949/geul-model";
import {
  type DocumentChangeEvent,
  EditorContent,
  type EditorController,
  type EditorError,
  EditorProvider,
  LinkToolbar,
  type PasteRejectedReason,
  SlashMenu,
} from "@cp949/geul-react";

const document: Document = createEmptyDocument(() => "fixture-block");
const bulletListItem: BulletListItemBlock = {
  id: "fixture-bullet",
  type: "bulletListItem",
  content: [{ text: "bullet" }],
};
const numberedListItem: NumberedListItemBlock = {
  id: "fixture-numbered",
  type: "numberedListItem",
  startNumber: 0,
  content: [{ text: "numbered" }],
};
void [bulletListItem, numberedListItem];
const setBlockTypes: SetBlockTypeDescriptor[] = [
  { type: "bulletListItem" },
  { type: "numberedListItem" },
  { type: "numberedListItem", startNumber: null },
];
void setBlockTypes;
const editor: EditorController = createEditor({
  initialDocument: document,
  onPasteRejected: (reason) => {
    void reason;
  },
});
const rejection: PasteRejectedReason = {
  code: "CLIPBOARD_TABLE_INVALID",
  message: "fixture",
};
void rejection;
void importHtml("<p>Hello</p>");
void [EditorProvider, EditorContent, LinkToolbar, SlashMenu];
const pasted = editor.commands.pasteTabularData({ columnCount: 1, rows: [] });
void pasted;
void editor;
const event: DocumentChangeEvent = {
  revision: 0,
  changedBlockIds: [],
  reason: "local",
};
const error: EditorError = { code: "COMMAND_NOT_APPLICABLE", command: "undo" };
void event;
void error;
const column: TableColumn = { id: "fixture-column", width: 120 };
const columns = parseTableColumns(serializeTableColumns([column]));
const columnsError: TableColumnsAttributeError = {
  code: "TABLE_COLUMNS_ATTRIBUTE_INVALID",
  message: "fixture",
};
void columns;
void columnsError;
