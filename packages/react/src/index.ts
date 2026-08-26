export type {
  CreateEditorOptions,
  DocumentChangeEvent,
  EditorController,
  EditorError,
  PasteRejectedReason,
} from "@cp949/geul-core";
export { EditorContent } from "./editor-content.js";
export { EditorProvider, type EditorProviderProps } from "./editor-provider.js";
export { FormattingToolbar } from "./formatting-toolbar.js";
export { LinkToolbar } from "./link-toolbar.js";
export { SlashMenu } from "./slash-menu.js";
// TableHandles는 BlockSideMenu처럼 SlashMenu가 자동 마운트한다 — 공개
// export하면 소비자가 중복 마운트해 핸들 오버레이가 두 벌 겹친다.
export { useEditor } from "./use-editor.js";
