import { Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import {
  toggleHeadingCollapseCommand,
  toggleListItemCollapseCommand,
} from "./toggle-collapse-commands.js";

/**
 * 클릭 가능한 접힘 트라이앵글 marker DOM을 만든다(RD-004 DELTA-03).
 * `contenteditable` false로 캐럿·텍스트 선택 대상에서 제외하고, 좌클릭
 * mousedown만 처리한다 — 우클릭·중클릭은 기본 브라우저 동작을 그대로 둔다.
 * `role="button"`/`aria-expanded`는 스크린리더 의미만 준다 — 키보드
 * 활성화(Space/Enter)는 체크박스 marker(RD-001 DELTA-05)와 동일하게 이
 * DELTA 범위 밖이다.
 */
const createToggleMarkerElement = (
  collapsed: boolean,
  onToggle: () => void,
): HTMLElement => {
  const marker = globalThis.document.createElement("span");
  marker.setAttribute("data-be-toggle-marker", "");
  marker.setAttribute("data-be-collapsed", String(collapsed));
  marker.setAttribute("role", "button");
  marker.setAttribute("aria-expanded", String(!collapsed));
  marker.contentEditable = "false";
  marker.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    onToggle();
  });
  return marker;
};

// isToggleable heading·toggleListItem은 bulletListItem/numberedListItem의
// 번호 marker(형제 scope 의존, list-presentation-extension.ts)와 달리 자기
// attrs(isToggleable/collapsed)만으로 완결되는 표시라 그 파일과 분리한다
// (check-list-item-marker-extension.ts와 같은 원칙). heading·toggleListItem의
// PM 부모는 항상 blockContainer다(D19) — descendants의 parent 인자에서 바로
// blockId를 얻는다. heading은 isToggleable === true인 경우만 marker를 꽂고
// (일반 heading은 접을 수 없다), toggleListItem은 타입 자체가 토글
// 여부를 뜻하므로 전부 marker를 꽂는다(toggle-collapse-visibility-extension.ts와
// 동일 판정 기준).
const toggleCollapseMarkerDecorations = (
  state: EditorState,
  toggleHeading: (blockId: string) => void,
  toggleListItem: (blockId: string) => void,
): DecorationSet => {
  const decorations: Decoration[] = [];

  state.doc.descendants((node, position, parent) => {
    const typeName = node.type.name;
    const isToggleableHeading =
      typeName === "heading" && node.attrs.isToggleable === true;
    const isToggleListItem = typeName === "toggleListItem";
    if ((!isToggleableHeading && !isToggleListItem) || parent === null) {
      return true;
    }

    const blockId = parent.attrs.blockId as string;
    const collapsed = node.attrs.collapsed === true;
    const onToggle = isToggleableHeading
      ? () => toggleHeading(blockId)
      : () => toggleListItem(blockId);
    decorations.push(
      Decoration.widget(
        position + 1,
        () => createToggleMarkerElement(collapsed, onToggle),
        {
          side: -1,
          // 위젯에서 버블링한 이벤트에 대한 PM 기본 클릭 처리(캐럿 재배치
          // 등)를 명시적으로 억제한다 — 이벤트 순서·좌표 가정에 기대지
          // 않는 PM 공식 경로다.
          stopEvent: () => true,
          ignoreSelection: true,
          // 같은 key는 동작까지 동일해야 재사용이 안전하다(PM 권고) —
          // collapsed가 바뀌면 DOM(aria-expanded 등)도 달라지므로 key에
          // 포함해, 그 항목이 실제로 바뀔 때만 위젯을 다시 만든다.
          key: `toggle-marker-${blockId}-${String(collapsed)}`,
        },
      ),
    );
    return false;
  });

  return DecorationSet.create(state.doc, decorations);
};

export const ToggleCollapseMarkerExtension = Extension.create({
  name: "toggleCollapseMarker",

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        props: {
          decorations: (state) =>
            toggleCollapseMarkerDecorations(
              state,
              (blockId) => {
                toggleHeadingCollapseCommand(editor, blockId);
              },
              (blockId) => {
                toggleListItemCollapseCommand(editor, blockId);
              },
            ),
        },
      }),
    ];
  },
});
