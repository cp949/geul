import { Extension, type Editor } from "@tiptap/core";
import { type NodeSelection, Plugin, TextSelection } from "@tiptap/pm/state";
import type { Slice } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";

import { resolveSelectionAwareState } from "./selection-aware-state.js";
import {
  consumeWhileLiveBoundaryRange,
  deleteTableBoundaryRange,
  findTableBoundaryRange,
  type TableBoundaryRange,
} from "./table-boundary-range.js";

// 표(table) 경계에 걸친 범위 선택의 글자 입력·IME·Cut·붙여넣기·끌어 놓기·
// Shift-Enter(Issue #292). Enter·Backspace·Delete는 #289가 다룬다.
//
// 이전에는 이 경로들이 PM 기본 deleteSelection·replaceSelection을 탔다. 셀
// content는 "inline*"라 두 구간을 잇지 못해 선택하지 않은 뒷부분 텍스트가
// 셀로 옮겨 가거나 표가 사라졌다.
//
// 규칙: 선택한 텍스트만 #289 Backspace와 같이 지우고 삽입은 범위 시작의
// 캐럿에 한다(선택 교체 의미). 예외는 내부 이동 drop이다. 부분 표 slice를
// 임의 위치에 꽂는 결과가 정의되지 않아 소비하고 문서를 바꾸지 않는다.
//
// 판정은 DOM 파생 selection으로 하고 문서 transaction은 live state에서
// 만든다(G-EDT-002). live selection만 경계 범위이고 파생 selection이 대상
// 밖이면 폴스루하지 않고 소비한다(consumeWhileLiveBoundaryRange). 폴스루하면
// PM 기본 처리가 live 경계 범위에 적용돼 같은 손상이 난다.
//
// 우선순위는 입력 규칙(1_100), TableKeyboardNavigation·HardBreakKeyboard·
// MediaDropPaste·TablePaste·ClipboardPaste(100)보다 앞서야 한다. 입력 규칙은
// 경계 범위 위에서 매칭되기 전에 이 확장이 먼저 처리한다. 붙여넣기는 지운
// 뒤 기존 경로가 캐럿 기준으로 이어 받는다.

// DOM 파생 selection이 경계 범위면 그 범위를 돌려준다.
function derivedBoundaryRange(editor: Editor): TableBoundaryRange | null {
  // PM이 예약한 붙여넣기(capturePaste의 timeout)는 편집기가 해제된 뒤에도
  // 도착할 수 있다. 해제된 편집기는 view가 없어 DOM selection을 읽을 수 없다.
  if (editor.isDestroyed) return null;
  const state = resolveSelectionAwareState(editor, {
    allowNativeTextSelectionFromCellSelection: true,
  });
  return findTableBoundaryRange(state.selection);
}

// 경계 범위의 선택한 텍스트만 지운다. 문서 transaction은 live state에서
// 만든다. 지운 뒤 캐럿은 범위 시작이다(deleteTableBoundaryRange).
function deleteDerivedRange(editor: Editor, range: TableBoundaryRange) {
  const tr = editor.state.tr;
  deleteTableBoundaryRange(tr, range);
  return tr;
}

// PM의 dragstart는 draggable 노드를 끌면 view.dragging.node에 그 NodeSelection을
// 담는다. 타입 선언(EditorView.dragging)에는 없는 필드라 좁게 읽는다.
function draggedNodeOf(
  dragging: EditorView["dragging"],
): NodeSelection | undefined {
  return (dragging as { node?: NodeSelection } | null)?.node;
}

// 붙일 내용이 없는지 판정한다. PM은 slice가 비어도 handlePaste를 Slice.empty로
// 부른다. 파일, text/html, text/plain 중 하나라도 있으면 아래 경로
// (MediaDropPaste·TablePaste·ClipboardPaste)가 slice와 무관하게 처리할 수
// 있어 비었다고 보지 않는다.
function hasNothingToPaste(event: ClipboardEvent, slice: Slice): boolean {
  if (slice.size > 0) return false;
  const data = event.clipboardData;
  if (data === null) return false;
  return (
    (data.files?.length ?? 0) === 0 &&
    data.getData("text/html") === "" &&
    data.getData("text/plain") === ""
  );
}

export const TableBoundaryInputExtension = Extension.create({
  name: "tableBoundaryInput",
  priority: 1_200,

  // 지운 뒤 캐럿에 hardBreak를 삽입한다. 캐럿이 셀이면 셀 안, 표 밖이면 그
  // 블록 안이다. head 위치와 무관하게 같은 규칙이다. 캐럿 블록이
  // hardBreak를 받을 수 없으면(스키마 판정, codeBlock 등) 또는 h1이면
  // HardBreakKeyboard와 같이 삽입하지 않는다. 이때는 지우기만 하고
  // 소비한다. 어느 쪽이든 선택하지 않은 텍스트는 옮겨 가지 않는다.
  addKeyboardShortcuts() {
    return {
      "Shift-Enter": () =>
        consumeWhileLiveBoundaryRange(this.editor, () => {
          const state = resolveSelectionAwareState(this.editor, {
            allowNativeTextSelectionFromCellSelection: true,
          });
          const range = findTableBoundaryRange(state.selection);
          if (range === null) return false;
          const tr = deleteDerivedRange(this.editor, range);
          const hardBreak = this.editor.schema.nodes.hardBreak;
          const { $from } = tr.selection;
          const parent = $from.parent;
          const accepts =
            hardBreak !== undefined &&
            parent.canReplaceWith($from.index(), $from.index(), hardBreak);
          const isHeading1 =
            parent.type.name === "heading" && parent.attrs.level === 1;
          // 삽입할 수 없으면 지우기만 한다. 같은 tr이라 undo 1회다.
          this.editor.view.dispatch(
            (accepts && !isHeading1
              ? tr.replaceSelectionWith(hardBreak.create())
              : tr
            ).scrollIntoView(),
          );
          return true;
        }),
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        props: {
          // PM keypress는 $from과 $to의 부모가 다르면 항상 이 경로를 탄다.
          // 경계 범위는 부모가 다르므로 사용자 입력이 모두 여기를 지난다.
          handleTextInput: (view, _from, _to, text) =>
            consumeWhileLiveBoundaryRange(editor, () => {
              const range = derivedBoundaryRange(editor);
              if (range === null) return false;
              const tr = deleteDerivedRange(editor, range);
              view.dispatch(tr.insertText(text).scrollIntoView());
              return true;
            }),

          // 경계 범위를 먼저 지우고 false로 물러난다. MediaDropPaste·
          // TablePaste·ClipboardPaste·PM 기본이 캐럿 기준으로 이어 받는다.
          // 종류별 분기는 두지 않는다. live만 경계 범위이면 소비한다.
          //
          // 지움과 붙여넣기는 transaction 둘이다. prosemirror-history가 인접한
          // 두 transaction을 한 undo 그룹으로 묶어 undo 1회로 원복된다. 표
          // 붙여넣기는 자체 transaction이 closeHistory로 그룹을 닫아 undo가 2회
          // 필요하다. pasteHandler가 취소하거나 붙여넣기가 거절돼도 지움은
          // 남는다(undo 1회로 복원).
          handlePaste: (view, event, slice) => {
            const range = derivedBoundaryRange(editor);
            if (range === null) {
              return findTableBoundaryRange(view.state.selection) !== null;
            }
            // 붙일 내용이 없으면 지우지 않고 소비한다. 일반 선택에서 같은
            // 입력이 문서를 바꾸지 않는 현행과 맞춘다.
            if (hasNothingToPaste(event, slice)) return true;
            view.dispatch(deleteDerivedRange(editor, range));
            return false;
          },

          // 내부 이동 drop은 PM 기본이 선택 범위를 tr.deleteSelection()으로
          // 지운 뒤 slice를 놓는다. 경계 범위에서는 선택하지 않은 텍스트가
          // 셀로 옮겨 가거나 표가 사라진다. 부분 표 slice를 임의 위치에 꽂는
          // 결과가 정의되지 않아 소비하고 문서를 바꾸지 않는다. 지우는 쪽은
          // live selection이라 live로 판정한다. 복사 드래그(moved=false)와
          // 외부 drop은 선택을 지우지 않으므로 현행이다. 노드를 끌어
          // 옮기는 드래그(dragging.node)도 선택이 아니라 그 노드를 지운다.
          handleDrop: (view, _event, _slice, moved) => {
            if (!moved || draggedNodeOf(view.dragging) !== undefined) {
              return false;
            }
            return findTableBoundaryRange(view.state.selection) !== null;
          },

          handleDOMEvents: {
            // PM compositionstart는 비어 있지 않은 selection에서
            // deleteSelection()으로 범위를 지운다. 경계 범위를 먼저 지우고
            // false로 물러나 PM이 캐럿 기준으로 조합을 이어 간다.
            compositionstart: (view) => {
              // PM은 handleDOMEvents를 view.editable 검사 없이 실행한다. 읽기
              // 전용에서는 PM 기본 처리(editHandlers)가 막히므로 이 핸들러도
              // 문서를 바꾸지 않는다.
              if (!view.editable) return false;
              const range = derivedBoundaryRange(editor);
              if (range === null) return false;
              view.dispatch(deleteDerivedRange(editor, range));
              return false;
            },

            // PM 기본 cut은 tr.deleteSelection()이다. Copy와 같은 slice를
            // clipboardData에 싣고 #289 규칙으로 지운다. clipboardData가 없으면
            // PM 기본 경로에 맡기지 않고 소비해 문서를 바꾸지 않는다.
            cut: (view, event) => {
              // compositionstart와 같은 이유로 읽기 전용에서는 물러난다.
              if (!view.editable) return false;
              const range = derivedBoundaryRange(editor);
              if (range === null) {
                const live = findTableBoundaryRange(view.state.selection);
                if (live === null) return false;
                event.preventDefault();
                return true;
              }
              event.preventDefault();
              const data = (event as ClipboardEvent).clipboardData;
              if (data === null) return true;
              const slice = TextSelection.create(
                view.state.doc,
                range.from,
                range.to,
              ).content();
              const { dom, text } = view.serializeForClipboard(slice);
              data.clearData();
              data.setData("text/html", dom.innerHTML);
              data.setData("text/plain", text);
              const tr = deleteDerivedRange(editor, range);
              view.dispatch(tr.scrollIntoView().setMeta("uiEvent", "cut"));
              return true;
            },
          },
        },
      }),
    ];
  },
});
