import {
  Extension,
  getExtensionField,
  type Editor,
  type KeyboardShortcutCommand,
} from "@tiptap/core";

import type { EditorController } from "./editor-controller-types.js";

type CustomKeyboardShortcutsOptions = {
  keyboardShortcuts: Record<string, (editor: EditorController) => boolean>;
  controllerFacade?: EditorController;
};

// this.editor.extensionManager.extensions(이미 완전히 구성된 목록, 자기
// 자신 제외)를 순회해 각 확장의 addKeyboardShortcuts가 정의하는 키 이름을
// 모은다. `@tiptap/core`의 ExtensionManager.plugins getter(3.30.1
// dist/index.js:5439-5456)가 keymap 플러그인을 만들 때 쓰는 것과 같은
// context({name, options, storage, editor})를 재현한다 — 내장 키 9개
// (block-join/move/split/type-keyboard, code-block-exit/mark-guard,
// indent-keyboard, list-input-rule, table-keyboard)를 하드코딩하지 않는다
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

// CreateEditorOptions.keyboardShortcuts(spec §5, EXT-005)를 감싸는 확장이다.
// production-editor-assembly.ts의 extensions 배열 맨 끝에 조건부로 삽입돼
// Tiptap 3.30.1의 sortExtensions([...extensions].reverse()) 우선순위 규칙에
// 따라 항상 먼저 시도된다(roadmap.md "결정"). handler가 false를 반환하면
// ProseMirror keymap 표준 폴스루로 내장 shortcut이 이어서 실행된다 — 이
// 확장이 별도로 구현할 필요가 없다.
export const CustomKeyboardShortcutsExtension =
  Extension.create<CustomKeyboardShortcutsOptions>({
    name: "customKeyboardShortcuts",

    addOptions() {
      return { keyboardShortcuts: {} };
    },

    addKeyboardShortcuts() {
      const { keyboardShortcuts, controllerFacade } = this.options;
      const entries = Object.entries(keyboardShortcuts);
      if (entries.length === 0) return {};

      const builtinKeys = collectBuiltinKeyboardShortcutKeys(
        this.editor,
        this.name,
      );
      const bindings: Record<string, () => boolean> = {};
      for (const [key, run] of entries) {
        if (builtinKeys.has(key)) {
          console.warn(
            `[CustomKeyboardShortcutsExtension] 등록한 keyboardShortcuts["${key}"]가 내장 keyboard shortcut과 겹친다 — 등록한 handler가 항상 먼저 실행된다.`,
          );
        }
        bindings[key] = () =>
          controllerFacade === undefined ? false : run(controllerFacade);
      }
      return bindings;
    },
  });
