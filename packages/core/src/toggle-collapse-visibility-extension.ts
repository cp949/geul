import { Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// collapsed: true인 heading·toggleListItem의 blockGroup(자식 children
// 컨테이너)을 편집기 DOM에서만 숨긴다(spec §4.1, §4.4) — 저장 문서의
// children은 그대로 남는다(표시 숨김이지 데이터 삭제가 아니다). React
// 컴포넌트·사용자 커맨드(toggleHeadingCollapse 등)는 이 확장의 책임이
// 아니다(RD-004) — placeholder-extension.ts와 같은 순수 core decoration
// 패턴으로, react는 표시 로직에 관여하지 않는다.
//
// heading은 collapsed가 있으면 항상 isToggleable: true다(model
// parseDocument가 그 불변식을 이미 거절하므로 여기서 isToggleable을 다시
// 확인하지 않는다 — G-CNV-001). toggleListItem은 타입 자체가 토글 여부를
// 뜻하므로 collapsed만 본다.
const collapsedGroupDecorations = (state: EditorState): DecorationSet => {
  const decorations: Decoration[] = [];

  state.doc.descendants((node, position) => {
    const typeName = node.type.name;
    if (
      (typeName !== "heading" && typeName !== "toggleListItem") ||
      node.attrs.collapsed !== true
    ) {
      return true;
    }

    // node는 blockContainer의 첫 자식(blockContent)이다(D19). 두 번째 자식
    // (blockGroup, 있다면)은 이 노드가 끝나는 위치에서 바로 시작한다 —
    // resolve로 그 위치의 다음 형제 노드를 직접 조회한다(부모를 거치지
    // 않고 위치 산술만으로 항상 옳다: children이 없으면 nodeAfter가 null).
    const groupStart = position + node.nodeSize;
    const groupNode = state.doc.resolve(groupStart).nodeAfter;
    if (groupNode === null || groupNode.type.name !== "blockGroup") {
      return true;
    }

    decorations.push(
      Decoration.node(groupStart, groupStart + groupNode.nodeSize, {
        style: "display: none",
        "data-be-collapsed-hidden": "",
      }),
    );
    return true;
  });

  return DecorationSet.create(state.doc, decorations);
};

export const ToggleCollapseVisibilityExtension = Extension.create({
  name: "toggleCollapseVisibility",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: collapsedGroupDecorations,
        },
      }),
    ];
  },
});
