import { Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { toggleCheckListItemCheckedCommand } from "./check-list-item-commands.js";

/**
 * 클릭 가능한 체크박스 marker DOM을 만든다(RD-001 DELTA-05). `contenteditable`
 * false로 캐럿·텍스트 선택 대상에서 제외하고, 좌클릭 mousedown만 처리한다 —
 * 우클릭·중클릭은 기본 브라우저 동작을 그대로 둔다. `role="checkbox"`/
 * `aria-checked`는 스크린리더 의미만 준다 — 키보드 활성화(Space/Enter)는
 * 이 DELTA 범위 밖이다(RD-001.md "체크박스 클릭 UI" 문면, tabIndex는 문서
 * 전체 tab 순서를 바꾸는 별도 결정).
 */
const createCheckMarkerElement = (
  checked: boolean,
  onToggle: () => void,
): HTMLElement => {
  const marker = globalThis.document.createElement("span");
  marker.setAttribute("data-be-check-marker", "");
  marker.setAttribute("data-be-checked", String(checked));
  marker.setAttribute("role", "checkbox");
  marker.setAttribute("aria-checked", String(checked));
  marker.contentEditable = "false";
  marker.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    onToggle();
  });
  return marker;
};

// checkListItem은 bulletListItem/numberedListItem의 번호 marker(형제 scope
// 의존, list-presentation-extension.ts)와 달리 자기 attrs(checked)만으로
// 완결되는 표시라 그 파일과 분리한다(toggle-collapse-visibility-extension.ts가
// list-presentation-extension.ts와 분리된 것과 같은 원칙). checkListItem의
// PM 부모는 항상 blockContainer다(D19) — descendants의 parent 인자에서
// 바로 blockId를 얻는다(별도 위치 재탐색 불필요).
const checkListItemMarkerDecorations = (
  state: EditorState,
  toggle: (blockId: string) => void,
): DecorationSet => {
  const decorations: Decoration[] = [];

  state.doc.descendants((node, position, parent) => {
    if (node.type.name !== "checkListItem" || parent === null) return true;

    const blockId = parent.attrs.blockId as string;
    const checked = node.attrs.checked === true;
    decorations.push(
      Decoration.widget(
        position + 1,
        () => createCheckMarkerElement(checked, () => toggle(blockId)),
        {
          side: -1,
          // 위젯에서 버블링한 이벤트에 대한 PM 기본 클릭 처리(캐럿 재배치
          // 등)를 명시적으로 억제한다 — 이벤트 순서·좌표 가정에 기대지
          // 않는 PM 공식 경로다.
          stopEvent: () => true,
          ignoreSelection: true,
          // 같은 key는 동작까지 동일해야 재사용이 안전하다(PM 권고) —
          // checked가 바뀌면 DOM(aria-checked 등)도 달라지므로 key에
          // 포함해, 그 항목이 실제로 바뀔 때만 위젯을 다시 만든다.
          key: `check-marker-${blockId}-${String(checked)}`,
        },
      ),
    );
    return false;
  });

  return DecorationSet.create(state.doc, decorations);
};

export const CheckListItemMarkerExtension = Extension.create({
  name: "checkListItemMarker",

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        props: {
          decorations: (state) =>
            checkListItemMarkerDecorations(state, (blockId) => {
              toggleCheckListItemCheckedCommand(editor, blockId);
            }),
        },
      }),
    ];
  },
});
