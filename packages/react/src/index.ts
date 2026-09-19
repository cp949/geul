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
export { StaticToolbar, type StaticToolbarProps } from "./static-toolbar.js";
// TableHandles는 BlockSideMenu처럼 SlashMenu가 자동 마운트한다 — 공개
// export하면 소비자가 중복 마운트해 핸들 오버레이가 두 벌 겹친다.
export { useDictionary, useEditor } from "./use-editor.js";
// EmojiPicker/SlashMenu가 내부에서만 쓰던 오버레이 인프라 4종을 공개한다
// (Issue #210 "## 결정" D4) — mention처럼 소비자 앱이 직접 만드는 커스텀
// 트리거 popup(`apps/showcase`의 `17-mention` 예제)이 캐럿-폴링·클램프
// 위치·바깥클릭/Escape dismiss·포커스 복구를 새로 구현하지 않고 그대로
// 재사용하게 한다. `useEditorMount` 자체와 그 `setElement`(내부 전용
// mutator)는 노출하지 않는다 — `useEditorElement`가 `element`만 읽기
// 전용으로 감싼다(`use-editor-element.ts`).
export {
  type ClampAnchor,
  useClampedMenuPosition,
} from "./use-clamped-menu-position.js";
export { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
// use-dismiss-on-outside-or-escape.ts는 옵션 타입(`UseDismissOnOutsideOrEscapeOptions`
// 상당)을 그 파일 밖으로 export하지 않는다(내부 전용 관례) — 이번 변경의
// 편집 허용 범위가 그 파일을 포함하지 않아 새로 export를 추가하는 대신
// 훅 시그니처에서 그대로 파생한다(구현이 바뀌면 이 타입도 함께 갱신됨).
import type { useDismissOnOutsideOrEscape as _useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
export type UseDismissOnOutsideOrEscapeOptions = Parameters<
  typeof _useDismissOnOutsideOrEscape
>[0];
export { useEditorElement } from "./use-editor-element.js";
export { useFocusEditor } from "./use-focus-editor.js";
