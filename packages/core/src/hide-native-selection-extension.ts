import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";

/**
 * 이미지 등 미디어를 NodeSelection으로 고르면 이전 캐럿 자리에 네이티브
 * caret이 남는다(커밋 af5dc91e). react의 `.geul-hide-selection *` 규칙
 * (caret-color·::selection 투명화)이 이 클래스에 걸려 그 잔상을 숨긴다.
 *
 * prosemirror-view가 root에 붙이는 `ProseMirror-hideselection`은 쓰지
 * 않는다. 그 클래스는 비가시 selection(`selection.visible === false`:
 * NodeSelection·GapCursor·CellSelection) 전부에 붙는다. CellSelection에
 * 규칙을 걸면 표 셀 범위 선택 때 10,000셀의 스타일 재계산이 일어난다
 * (Issue #239, 선택 +30ms).
 * 그래서 CellSelection을 제외한 비가시 selection(NodeSelection·GapCursor)
 * 일 때만 자체 클래스를 붙인다.
 *
 * `attributes` prop의 class는 prosemirror-view가 기본 클래스에 이어 붙이고,
 * 다른 plugin·editorProps.attributes의 class와도 병합한다.
 */
const HIDE_NATIVE_SELECTION_CLASS = "geul-hide-selection";

export const HideNativeSelectionExtension = Extension.create({
  name: "hideNativeSelection",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          attributes: ({ selection }) =>
            !selection.visible && !(selection instanceof CellSelection)
              ? { class: HIDE_NATIVE_SELECTION_CLASS }
              : {},
        },
      }),
    ];
  },
});
