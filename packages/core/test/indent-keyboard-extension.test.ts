/**
 * IndentKeyboardExtension이 표 밖 Tab/Shift+Tab을 indentBlockCommand/
 * outdentBlockCommand로 올바르게 라우팅하는지 검증한다. 완료 조건 1(표 밖
 * 라우팅과 적용 불가 시 브라우저 기본 동작 허용)과 완료 조건 3·4(G-EDT-002 stale
 * selection 재동기화와 dispatch 0~1회 계약)를 다룬다.
 *
 * 대부분의 it은 exported 순수 함수(indentBlockShortcut/outdentBlockShortcut)를
 * 직접 호출해 Tiptap의 keymap 플러그인 체인을 우회한다 — table-keyboard-
 * extension.test.ts도 같은 방식이라 그 파일의 표 Tab 테스트는 이 확장의
 * isInTable 가드를 실제로 거치지 않는다(가드를 지워도 실패하지 않는다,
 * 트랙-4 실측). 그래서 마지막 describe만 editor-controller.ts와 동일한
 * 등록 순서로 두 확장을 함께 마운트하고 실제 keydown을 흘려보내, 가드가
 * 없으면 표 셀 탐색이 깨진다는 것을 이 파일이 직접 고정한다.
 */
import type { Editor, JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import {
  IndentKeyboardExtension,
  indentBlockShortcut,
  outdentBlockShortcut,
} from "../src/indent-keyboard-extension.js";
import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import { TableKeyboardNavigationExtension } from "../src/table-keyboard-extension.js";
import { sequentialIds } from "./editor-controller-support.js";
import { withNativeCaret } from "./native-selection-test-support.js";
import {
  activeCellId,
  createTableFixtureEditor,
  docWithParagraph,
  docWithTwoRowTable,
  placeCaretInCell,
} from "./table-test-support.js";

/** blockId를 가진 blockContainer 하나(자식 없는 leaf, paragraph 콘텐츠)의 tiptap JSON. */
const containerJson = (blockId: string, text: string): JSONContent => ({
  type: "blockContainer",
  attrs: { blockId },
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

/** children을 가진 blockGroup까지 포함한 blockContainer의 tiptap JSON. */
const containerWithGroupJson = (
  blockId: string,
  text: string,
  children: JSONContent[],
): JSONContent => ({
  type: "blockContainer",
  attrs: { blockId },
  content: [
    { type: "paragraph", content: [{ type: "text", text }] },
    { type: "blockGroup", content: children },
  ],
});

/** 형제 문단 2개(p1, p2) — p2를 indent하면 p1의 자식이 된다. */
const twoSiblingParagraphsDoc = (): JSONContent => ({
  type: "doc",
  content: [containerJson("p1", "one"), containerJson("p2", "two")],
});

/**
 * 이미 자식(child-1)을 가진 문단(parent-1) — child-1을 outdent하면 top-level
 * parent-1의 형제로 나온다.
 */
const parentWithChildDoc = (): JSONContent => ({
  type: "doc",
  content: [
    containerWithGroupJson("parent-1", "parent", [
      containerJson("child-1", "child"),
    ]),
  ],
});

/**
 * blockId를 가진 blockContainer를 찾아 그 콘텐츠 안 가장 가까운 텍스트
 * 위치를 반환한다. indent-commands.ts의 placeCaretInMovedBlock과 같은 방식
 * (컨테이너 경계+1에서 TextSelection.near)으로 실제 콘텐츠 구조(문단 진입에
 * 몇 칸이 필요한지)에 기대지 않는다. 못 찾으면 null이다.
 */
const findBlockContentPosition = (
  editor: Editor,
  blockId: string,
): number | null => {
  let containerPos: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (containerPos !== null) return false;
    if (node.type.name === "blockContainer" && node.attrs.blockId === blockId) {
      containerPos = pos;
      return false;
    }
    return true;
  });
  if (containerPos === null) return null;
  const resolved = editor.state.doc.resolve(containerPos + 1);
  return TextSelection.near(resolved).from;
};

/**
 * targetBlockId 안에 실제 DOM 캐럿을 두고(클릭을 흉내낸다), editor.state.selection은
 * staleBlockId 안으로 되돌려 stale하게 만든 뒤 fn을 실행한다. 클릭 직후
 * Tab/Shift+Tab이 눌리는 상황(G-EDT-002, Issue #118과 같은 부류)을 재현하는
 * 이 파일 전용 조립이다 — withNativeCaret 위에 stale 시나리오를 얹는다.
 */
const withStaleSelection = (
  editor: Editor,
  targetBlockId: string,
  staleBlockId: string,
  fn: () => void,
): void => {
  const targetPos = findBlockContentPosition(editor, targetBlockId);
  if (targetPos === null) throw new Error("fixture 준비 실패");
  editor.commands.setTextSelection(targetPos);

  // ProseMirror의 내부 DOM 구조에서 실제 텍스트 노드를 찾는다(클릭 지점의
  // source가 될 노드).
  const { node: nodeAtTarget } = editor.view.domAtPos(targetPos);
  const textNode = nodeAtTarget.childNodes[0] || nodeAtTarget;

  const editable = editor.view.dom as HTMLElement;
  withNativeCaret(
    editable,
    () => {
      const stalePos = findBlockContentPosition(editor, staleBlockId);
      if (stalePos === null) throw new Error("fixture 준비 실패");
      // 네이티브 DOM selection은 targetBlockId 안이지만, editor.state.selection만
      // staleBlockId로 되돌려 의도적으로 stale하게 만든다.
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.near(editor.state.doc.resolve(stalePos)),
        ),
      );
      fn();
    },
    textNode,
  );
};

describe("Tab/Shift+Tab 라우팅", () => {
  it("표 셀 밖 캐럿에서 Tab이 indentBlock을, Shift+Tab이 outdentBlock을 호출한다", () => {
    // Tab → indentBlockCommand: p2가 p1의 자식이 된다.
    const indentEditor = createTableFixtureEditor(twoSiblingParagraphsDoc());
    const p2Pos = findBlockContentPosition(indentEditor, "p2");
    if (p2Pos === null) throw new Error("fixture 준비 실패");
    indentEditor.commands.setTextSelection(p2Pos);

    const indentConsumed = indentBlockShortcut(indentEditor);

    expect(indentConsumed).toBe(true);
    const indentedDoc = indentEditor.getJSON() as TiptapJsonNode;
    expect(indentedDoc.content).toHaveLength(1);
    const p1 = indentedDoc.content?.[0];
    expect(p1?.attrs?.blockId).toBe("p1");
    const p1Group = p1?.content?.[1];
    expect(p1Group?.type).toBe("blockGroup");
    expect(p1Group?.content?.[0]?.attrs?.blockId).toBe("p2");

    // Shift+Tab → outdentBlockCommand: child-1이 parent-1의 형제(top-level)가 된다.
    const outdentEditor = createTableFixtureEditor(parentWithChildDoc());
    const childPos = findBlockContentPosition(outdentEditor, "child-1");
    if (childPos === null) throw new Error("fixture 준비 실패");
    outdentEditor.commands.setTextSelection(childPos);

    const outdentConsumed = outdentBlockShortcut(outdentEditor);

    expect(outdentConsumed).toBe(true);
    const outdentedDoc = outdentEditor.getJSON() as TiptapJsonNode;
    expect(outdentedDoc.content).toHaveLength(2);
    expect(outdentedDoc.content?.[0]?.attrs?.blockId).toBe("parent-1");
    expect(outdentedDoc.content?.[1]?.attrs?.blockId).toBe("child-1");
  });

  it("적용 불가한 최상위 블록에서는 키 이벤트를 소비하지 않고 문서를 변경하지 않는다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    const pos = findBlockContentPosition(editor, "para-1");
    if (pos === null) throw new Error("fixture 준비 실패");
    editor.commands.setTextSelection(pos);
    const before = editor.getJSON();

    // 유일한 최상위 블록 — 앞 형제가 없어 indent 불가, 부모가 없어 outdent 불가.
    const indentConsumed = indentBlockShortcut(editor);
    const outdentConsumed = outdentBlockShortcut(editor);

    expect(indentConsumed).toBe(false);
    expect(outdentConsumed).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });
});

describe("stale selection 재동기화(G-EDT-002, Issue #118과 같은 부류)", () => {
  it("클릭으로 캐럿을 다른 블록에 옮긴 직후 곧바로 누른 Tab/Shift+Tab이 클릭한 블록을 대상으로 한다", () => {
    // Tab: 클릭한 p2가 대상이어야 indent가 성공한다(stale한 p1이 대상이면
    // 앞 형제가 없어 실패하고 문서가 그대로 남는다 — 변이 재현 지점).
    const indentEditor = createTableFixtureEditor(twoSiblingParagraphsDoc());
    withStaleSelection(indentEditor, "p2", "p1", () => {
      indentBlockShortcut(indentEditor);
    });
    const indentedDoc = indentEditor.getJSON() as TiptapJsonNode;
    // p2가 p1의 자식이 됐다 — 클릭한 블록(p2)이 대상이었다는 증거.
    expect(indentedDoc.content).toHaveLength(1);

    // Shift+Tab: 클릭한 child-1이 대상이어야 outdent가 성공한다(stale한
    // parent-1이 대상이면 부모가 없어 실패하고 문서가 그대로 남는다).
    const outdentEditor = createTableFixtureEditor(parentWithChildDoc());
    withStaleSelection(outdentEditor, "child-1", "parent-1", () => {
      outdentBlockShortcut(outdentEditor);
    });
    const outdentedDoc = outdentEditor.getJSON() as TiptapJsonNode;
    // child-1이 top-level로 나왔다 — 클릭한 블록(child-1)이 대상이었다는 증거.
    expect(outdentedDoc.content).toHaveLength(2);
  });

  it("정상 경로(재계산 불필요)에서 dispatch 0~1회다", () => {
    const editor = createTableFixtureEditor(twoSiblingParagraphsDoc());
    const p2Pos = findBlockContentPosition(editor, "p2");
    if (p2Pos === null) throw new Error("fixture 준비 실패");
    editor.commands.setTextSelection(p2Pos);

    const dispatchSpy = vi.spyOn(editor.view, "dispatch");

    const consumed = indentBlockShortcut(editor);

    expect(consumed).toBe(true);
    expect([0, 1]).toContain(dispatchSpy.mock.calls.length);

    dispatchSpy.mockRestore();
  });

  it("stale 경로(재계산 발생)에서도 dispatch 0~1회(기존 명령 하나 그대로)다", () => {
    const editor = createTableFixtureEditor(twoSiblingParagraphsDoc());
    withStaleSelection(editor, "p2", "p1", () => {
      const dispatchSpy = vi.spyOn(editor.view, "dispatch");

      const consumed = indentBlockShortcut(editor);

      expect(consumed).toBe(true);
      // 재동기화는 EditorState.apply()만 쓰고 dispatch하지 않는다 — 실제
      // dispatch는 indentBlockCommand 내부의 단일 호출 하나뿐이어야 한다.
      // 재동기화 로직이 자체적으로 dispatch까지 하면(중복) 이 카운트가 2가
      // 되어 RED다.
      expect([0, 1]).toContain(dispatchSpy.mock.calls.length);

      dispatchSpy.mockRestore();
    });
  });
});

describe("표 셀 안 Tab/Shift+Tab은 실제 keymap 디스패치에서도 IndentKeyboardExtension을 우회한다", () => {
  // editor-controller.ts와 같은 등록 순서(TableKeyboardNavigationExtension
  // 다음 IndentKeyboardExtension)로 두 확장을 함께 마운트하고, 순수 함수
  // 호출이 아니라 실제 keydown을 view.someProp("handleKeyDown", ...)로
  // 흘려보낸다. Tiptap 3.30.1은 sortExtensions([...].reverse())로 같은
  // priority에서 나중 등록된 확장의 keymap을 먼저 실행하므로(Ruling D4)
  // IndentKeyboardExtension이 TableKeyboardNavigationExtension보다 먼저
  // 실행된다 — isInTable 가드가 없으면 이 확장이 Tab을 먼저 삼켜(표 셀
  // 안에는 blockContainer 조상이 없어 아무 command도 호출하지 않지만 여전히
  // true를 반환한다) 셀 탐색이 도달하지 못한다.
  const dispatchTabKeydown = (editor: Editor, shift: boolean): boolean => {
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: shift,
      bubbles: true,
      cancelable: true,
    });
    return (
      editor.view.someProp("handleKeyDown", (f) => f(editor.view, event)) ===
      true
    );
  };

  const mountedTableEditor = () =>
    createTableFixtureEditor(docWithTwoRowTable, [
      TableKeyboardNavigationExtension.configure({
        createId: sequentialIds("new"),
      }),
      IndentKeyboardExtension,
    ]);

  it("Tab keydown이 다음 셀로 캐럿을 옮긴다", () => {
    // 변이: IndentKeyboardExtension의 isInTable 가드를 제거하면 이 단언이
    // RED다(cell-1에 머무른다) — 트랙-4 실측.
    const editor = mountedTableEditor();
    placeCaretInCell(editor, "cell-1");

    const handled = dispatchTabKeydown(editor, false);

    expect(handled).toBe(true);
    expect(activeCellId(editor)).toBe("cell-2");
  });

  it("첫 셀의 Shift+Tab keydown은 표 밖으로 포커스를 넘기지 않는다", () => {
    const editor = mountedTableEditor();
    placeCaretInCell(editor, "cell-1");
    const before = editor.state.selection.from;

    const handled = dispatchTabKeydown(editor, true);

    expect(handled).toBe(true);
    expect(editor.state.selection.from).toBe(before);
  });
});
