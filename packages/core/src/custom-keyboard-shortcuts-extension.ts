import {
  Extension,
  getExtensionField,
  type Editor,
  type KeyboardShortcutCommand,
} from "@tiptap/core";
import { keydownHandler } from "@tiptap/pm/keymap";
import type { EditorView } from "@tiptap/pm/view";

import type { EditorController } from "./editor-controller-types.js";

type CustomKeyboardShortcutsOptions = {
  keyboardShortcuts: Record<string, (editor: EditorController) => boolean>;
  controllerFacade?: EditorController;
};

// this.editor.extensionManager.extensions(이미 완전히 구성된 목록, 자기
// 자신 제외)를 순회해 각 확장의 addKeyboardShortcuts가 정의하는 키 이름을
// 모은다. `@tiptap/core`의 ExtensionManager.plugins getter(3.30.1
// dist/index.js:5439-5456)가 keymap 플러그인을 만들 때 쓰는 것과 같은
// context({name, options, storage, editor})를 재현한다 — 내장 확장의 키
// 목록을 하드코딩하지 않는다
// (roadmap.md "결정"이 "하드코딩 목록 유지·동기화 부담" 때문에 명시적
// 거부안을 기각한 것과 같은 이유 — 경고 로직도 그 부담을 지지 않는다).
const collectBuiltinKeyboardShortcutKeys = (
  editor: Editor,
  ownName: string,
): Set<string> => {
  const keys = new Set<string>();
  for (const extension of editor.extensionManager.extensions) {
    if (extension.name === ownName) continue;
    const context = {
      name: extension.name,
      options: extension.options,
      storage: (editor.extensionStorage as unknown as Record<string, unknown>)[
        extension.name
      ],
      editor,
    };
    const addKeyboardShortcuts = getExtensionField<
      () => Record<string, KeyboardShortcutCommand>
    >(extension, "addKeyboardShortcuts", context);
    if (addKeyboardShortcuts === undefined) continue;
    for (const key of Object.keys(addKeyboardShortcuts())) keys.add(key);
  }
  return keys;
};

// 폴백 확장(HistoryKeydownFallbackExtension)이 editor.storage로 부르는 면이다
// (Issue #319). 등록 키를 keymap 표기 그대로 매칭한다.
export type CustomKeyboardShortcutsStorage = {
  /** addKeyboardShortcuts가 keymap 플러그인에 넘기는 바인딩과 같은 객체다. */
  bindings: Record<string, () => boolean>;
  /**
   * keydown이 등록 키와 맞고 handler가 true를 반환했으면 true다.
   * - 매칭은 `@tiptap/pm/keymap`의 keydownHandler다. 편집기 밖 이벤트도 같다.
   * - keyboardShortcuts가 비었거나 controllerFacade가 없으면 항상 false다.
   */
  handleKeyDown: (view: EditorView, event: KeyboardEvent) => boolean;
};

const CUSTOM_KEYBOARD_SHORTCUTS_NAME = "customKeyboardShortcuts";

/**
 * 편집기의 등록 확장 storage를 돌려준다. `keyboardShortcuts`를 지정하지 않은
 * 편집기는 확장이 없으므로 `undefined`다. Tiptap의 `Storage` 인터페이스를
 * 전역 확장하지 않으려고 좁은 단언을 이 한 곳에 둔다.
 */
export const getCustomKeyboardShortcutsStorage = (
  editor: Editor,
): CustomKeyboardShortcutsStorage | undefined =>
  (
    editor.storage as unknown as Record<
      string,
      CustomKeyboardShortcutsStorage | undefined
    >
  )[CUSTOM_KEYBOARD_SHORTCUTS_NAME];

// 등록 확장의 priority다. 내장 확장 priority의 최댓값(1_200,
// TableBoundaryInputExtension)보다 크게 둔다.
// - Tiptap은 priority 내림차순으로 keymap 플러그인을 만든다.
// - ProseMirror는 앞선 플러그인의 handler부터 시도한다.
// - 배열 위치는 순서를 정하지 않는다. 같은 priority일 때만 선언 역순이다.
// 내장 priority를 올리면 이 값도 함께 확인한다.
// 테스트가 "다른 확장 priority의 최댓값보다 크다"를 단언한다.
export const CUSTOM_KEYBOARD_SHORTCUTS_PRIORITY = 10_000;

// CreateEditorOptions.keyboardShortcuts(spec §5, EXT-005)를 감싸는
// 확장이다. 등록 handler는 내장 keymap보다 먼저 실행된다(Issue #307).
// - true를 반환하면 내장 동작을 건너뛴다. 표 경계·codeBlock 보호도 건너뛴다.
// - false를 반환하면 ProseMirror keymap 표준 폴스루로 내장 shortcut이
//   이어진다. 이 확장이 별도로 구현할 필요가 없다.
// 편집기 밖에서 눌린 undo·redo는 HistoryKeydownFallbackExtension이 이 확장의
// storage.handleKeyDown을 불러 같은 handler를 먼저 실행한다(Issue #319).
// 바인딩 객체는 keymap 플러그인과 storage가 공유한다. controllerFacade가
// 없으면 false를 돌려주는 규칙이 한 곳에만 있다.
export const CustomKeyboardShortcutsExtension = Extension.create<
  CustomKeyboardShortcutsOptions,
  CustomKeyboardShortcutsStorage
>({
  name: "customKeyboardShortcuts",

  priority: CUSTOM_KEYBOARD_SHORTCUTS_PRIORITY,

  addOptions() {
    return { keyboardShortcuts: {} };
  },

  addStorage() {
    const { keyboardShortcuts, controllerFacade } = this.options;
    const bindings: Record<string, () => boolean> = {};
    for (const [key, run] of Object.entries(keyboardShortcuts)) {
      bindings[key] = () =>
        controllerFacade === undefined ? false : run(controllerFacade);
    }
    const match = keydownHandler(bindings);
    return {
      bindings,
      handleKeyDown: (view, event) =>
        Object.keys(bindings).length > 0 && match(view, event),
    };
  },

  addKeyboardShortcuts() {
    const { bindings } = this.storage;
    const registered = Object.keys(bindings);
    if (registered.length === 0) return {};

    const builtinKeys = collectBuiltinKeyboardShortcutKeys(
      this.editor,
      this.name,
    );
    for (const key of registered) {
      if (builtinKeys.has(key)) {
        console.warn(
          `[CustomKeyboardShortcutsExtension] 등록한 keyboardShortcuts["${key}"]가 내장 keyboard shortcut과 겹친다 — 등록한 handler가 먼저 실행된다. true를 반환하면 내장 동작(표 경계·codeBlock 보호 포함)을 건너뛴다. false를 반환하면 내장 동작이 이어진다.`,
        );
      }
    }
    return bindings;
  },
});
