import {
  createEditor,
  parseTableColumns,
  serializeTableColumns,
  type BlockTypeDescriptor,
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
const blockTypeOutputs: BlockTypeDescriptor[] = [
  { type: "bulletListItem" },
  { type: "numberedListItem" },
  { type: "numberedListItem", startNumber: 0 },
];
// output descriptor는 저장 정규형만 보고하므로 command input 전용 null을
// 허용하지 않는다.
const invalidBlockTypeOutput: BlockTypeDescriptor = {
  type: "numberedListItem",
  // @ts-expect-error BlockTypeDescriptor numbered startNumber는 null을 거절한다.
  startNumber: null,
};
void invalidBlockTypeOutput;
const consumeBlockTypeOutput = (blockType: BlockTypeDescriptor): string => {
  switch (blockType.type) {
    case "paragraph":
    case "quote":
    case "bulletListItem":
      return blockType.type;
    case "heading":
      return `${blockType.type}:${blockType.level}`;
    case "codeBlock":
      return `${blockType.type}:${blockType.language ?? ""}`;
    case "numberedListItem":
      return `${blockType.type}:${blockType.startNumber ?? ""}`;
    default: {
      const exhaustive: never = blockType;
      return exhaustive;
    }
  }
};
void blockTypeOutputs.map(consumeBlockTypeOutput);
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
