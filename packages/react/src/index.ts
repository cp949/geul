// Next.js App Router client-only 통합(EXT-013, spec §11.3, R4 슬라이스8
// RD-002). React hook을 쓰는 컴포넌트를 노출하므로 RSC 경계에서 client
// component로 취급돼야 한다 — BlockNote 선례와 동일 형태(코드 비복사).
// 이 지시어는 directive prologue(파일의 첫 statement)여야 유효하므로 이
// export보다 앞에 둔다. 다른 번들러·런타임에서는 무해한 문자열 리터럴이라
// breaking 없는 additive 변경이다(`packages/react/README.md` 참고).
"use client";

export type {
  CreateEditorOptions,
  DocumentChangeEvent,
  EditorController,
  EditorError,
  PasteRejectedReason,
} from "@cp949/geul-core";
// spec §8(EXT-009) — editor-controller-types.ts가 문서화한 override
// 패턴("DEFAULT_DICTIONARY를 스프레드해 필요한 key만 override")을 react
// 표면만 쓰는 소비자도 실행할 수 있도록 값을 그대로 re-export한다.
export { DEFAULT_DICTIONARY } from "@cp949/geul-core";
export type { CodeBlockLanguageOption } from "./code-block-language-option.js";
export { EditorContent } from "./editor-content.js";
export { EditorProvider, type EditorProviderProps } from "./editor-provider.js";
export { EmojiPicker, type EmojiPickerProps } from "./emoji-picker.js";
export { FilePanel, type FilePanelProps } from "./file-panel.js";
export {
  FormattingToolbar,
  type FormattingToolbarProps,
} from "./formatting-toolbar.js";
export { LinkToolbar, type LinkToolbarProps } from "./link-toolbar.js";
export { MediaResizeHandles } from "./media-resize-handles.js";
export { MediaToolbar, type MediaToolbarProps } from "./media-toolbar.js";
export {
  SlashMenu,
  type SlashMenuCustomItem,
  type SlashMenuProps,
} from "./slash-menu.js";
// TableHandles는 BlockSideMenu처럼 SlashMenu가 자동 마운트한다 — 공개
// export하면 소비자가 중복 마운트해 핸들 오버레이가 두 벌 겹친다.
export { useDictionary, useEditor } from "./use-editor.js";
