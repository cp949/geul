/**
 * BlockJoinExtension의 Backspace/Delete 병합 계약을 확인한다.
 *
 * 컨테이너 스키마(D19)에서 PM joinBackward의 deleteBarrier는 두
 * blockContainer를 join하지 못하고(blockContent 둘 연속은 content
 * expression 위반) findWrapping(blockGroup) 경로로 떨어져 뒤 블록을 앞
 * 블록의 자식으로 들여쓴다 — 평면 문서에서도. Delete(forward)도 대칭으로
 * 뒤 블록을 자식화한다. 이 파일은 D22(커스텀 split/join 커맨드 도입)의
 * join 쪽 이행이 dev(StarterKit joinBackward/joinForward) 의미론 —
 * 병합·빈 블록 제거·표 인접 NodeSelection — 을 복원함을 고정한다.
 * 병합은 단일 dispatch(undo 1회 단위, G-EDT-001)여야 한다.
 *
 * 키 소비(반환 true)는 view.someProp("handleKeyDown", ...) 실 디스패치로
 * 검증한다 — 이 커맨드는 addKeyboardShortcuts로만 등록돼 editor.commands로
 * 노출되지 않는다(G-WKS-001).
 */
import { type Block, type Document } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { CellSelection } from "@tiptap/pm/tables";
import { describe, expect, it, vi } from "vitest";

import { BlockJoinExtension } from "../src/block-join-extension.js";
import { createEditor } from "../src/index.js";
import { contentTextStart, dispatchKeydown } from "./block-test-support.js";
import {
  documentOf,
  mountTiptapEditor,
  nestedParagraphDocument,
  oneCellTableBlock,
  sequentialIds,
} from "./editor-controller-support.js";
import {
  cellJson,
  createTableFixtureEditor,
  placeCaretInCell,
} from "./table-test-support.js";

/**
 * 문단 블록 리터럴을 만든다. 텍스트가 빈 문자열이면 content를 빈 배열로
 * 둔다(빈 블록) — 빈 text 조각을 넣지 않는 저장 문서의 정규형과 같다.
 */
const paragraphBlock = (
  id: string,
  text: string,
  children?: Block[],
): Block => ({
  id,
  type: "paragraph",
  content: text === "" ? [] : [{ text }],
  ...(children === undefined ? {} : { children }),
});

/**
 * 문서를 EditorController로 마운트해 실 키맵 체인이 걸린 tiptap 에디터를
 * 얻는다 — 각 케이스의 공통 도입부.
 */
const mountDocument = (document: Document) => {
  const editor = createEditor({
    initialDocument: document,
    createId: sequentialIds("id"),
  });
  return mountTiptapEditor(editor);
};

/**
 * 문서 안 해당 타입 노드 수를 센다 — blockGroup 완전 소멸(유령 빈 블록
 * 없음)과 "중첩이 생기지 않았다"를 구조 수치로 단언한다.
 */
const countNodes = (
  tiptap: Pick<TiptapEditor, "state">,
  typeName: string,
): number => {
  let count = 0;
  tiptap.state.doc.descendants((node) => {
    if (node.type.name === typeName) count += 1;
    return true;
  });
  return count;
};

/**
 * 직렬화·재파싱 후 check()로 결과 트리의 스키마 유효성을 고정한다 — 병합
 * step이 content expression을 깼다면 여기서 드러난다.
 */
const expectSchemaValid = (tiptap: TiptapEditor): void => {
  expect(() =>
    tiptap.schema.nodeFromJSON(tiptap.state.doc.toJSON()).check(),
  ).not.toThrow();
};

describe("블록 선두 Backspace는 앞 텍스트블록과 병합한다", () => {
  it("평면 두 블록에서 뒤 블록 선두 Backspace는 자식화가 아니라 한 블록으로 병합한다", () => {
    const { tiptap } = mountDocument(
      documentOf(
        paragraphBlock("block-a", "AAA"),
        paragraphBlock("block-b", "BBB"),
      ),
    );
    const beforeJson = tiptap.state.doc.toJSON();

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "block-b"));
    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(true);
    expectSchemaValid(tiptap);

    // dev(joinBackward) parity: 앞 블록 id를 유지한 한 블록 "AAABBB"가
    // 남는다 — 뒤 블록이 앞 블록의 자식이 되는 회귀가 아니다.
    expect(tiptap.state.doc.childCount).toBe(1);
    const container = tiptap.state.doc.child(0);
    expect(container.attrs.blockId).toBe("block-a");
    expect(container.childCount).toBe(1);
    expect(container.firstChild?.textContent).toBe("AAABBB");
    expect(countNodes(tiptap, "blockGroup")).toBe(0);

    // 캐럿은 병합 접점(앞 블록의 종전 텍스트 끝)에 있다.
    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(container.firstChild);
    expect(selection.$from.parentOffset).toBe(3);

    // 병합 전체가 단일 dispatch(undo 1회 단위)다(G-EDT-001).
    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });

  it("빈 블록 선두 Backspace는 빈 블록을 제거하고 캐럿을 앞 블록 끝으로 옮긴다", () => {
    // spec §7.1 "빈 블록의 `Backspace`는 앞 블록과 병합하거나 제목을
    // 문단으로 바꾼다" — 빈 문단의 병합은 제거 + 캐럿 이동이다.
    const { tiptap } = mountDocument(
      documentOf(
        paragraphBlock("block-a", "AAA"),
        paragraphBlock("block-b", ""),
      ),
    );
    const beforeJson = tiptap.state.doc.toJSON();

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "block-b"));
    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(true);
    expectSchemaValid(tiptap);

    // 빈 블록이 삭제되지 않고 앞 블록의 자식이 되는 회귀가 아니다.
    expect(tiptap.state.doc.childCount).toBe(1);
    const container = tiptap.state.doc.child(0);
    expect(container.attrs.blockId).toBe("block-a");
    expect(container.childCount).toBe(1);
    expect(container.firstChild?.textContent).toBe("AAA");
    expect(countNodes(tiptap, "blockGroup")).toBe(0);

    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(container.firstChild);
    expect(selection.$from.parentOffset).toBe(3);

    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });

  it("빈 heading 선두 Backspace는 heading을 제거하고 앞 문단을 그대로 둔다", () => {
    const { tiptap } = mountDocument(
      documentOf(paragraphBlock("block-a", "AAA"), {
        id: "block-h",
        type: "heading",
        level: 2,
        content: [],
      }),
    );
    const beforeJson = tiptap.state.doc.toJSON();

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "block-h"));
    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(true);
    expectSchemaValid(tiptap);

    // 빈 heading의 병합 = 제거("앞 블록과 병합" 쪽 충족) — heading이
    // 중첩된 채 남는 회귀가 아니다. childCount 2 = block-a + 로드 시점
    // trailing paragraph(UI-010, heading으로 끝나는 문서라 로드에 추가됨).
    expect(countNodes(tiptap, "heading")).toBe(0);
    expect(tiptap.state.doc.childCount).toBe(2);
    const container = tiptap.state.doc.child(0);
    expect(container.attrs.blockId).toBe("block-a");
    expect(container.firstChild?.type.name).toBe("paragraph");
    expect(container.firstChild?.textContent).toBe("AAA");
    expect(countNodes(tiptap, "blockGroup")).toBe(0);

    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(container.firstChild);
    expect(selection.$from.parentOffset).toBe(3);

    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });

  it("중첩 형제 사이 Backspace는 같은 깊이의 앞 형제와 병합하고 깊이를 바꾸지 않는다", () => {
    const { tiptap } = mountDocument(
      documentOf(
        paragraphBlock("block-a", "root", [
          paragraphBlock("child-1", "one"),
          paragraphBlock("child-2", "two"),
        ]),
      ),
    );
    const beforeJson = tiptap.state.doc.toJSON();

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "child-2"));
    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(true);
    expectSchemaValid(tiptap);

    // 깊이 불변 — child-2가 child-1의 자식(깊이 +1)이 되는 회귀가 아니다.
    // childCount 2 = block-a + 로드 시점 trailing paragraph(UI-010).
    expect(tiptap.state.doc.childCount).toBe(2);
    const root = tiptap.state.doc.child(0);
    expect(root.attrs.blockId).toBe("block-a");
    expect(root.childCount).toBe(2);
    const group = root.child(1);
    expect(group.type.name).toBe("blockGroup");
    expect(group.childCount).toBe(1);
    const merged = group.child(0);
    expect(merged.attrs.blockId).toBe("child-1");
    expect(merged.childCount).toBe(1);
    expect(merged.firstChild?.textContent).toBe("onetwo");
    expect(countNodes(tiptap, "blockGroup")).toBe(1);

    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(merged.firstChild);
    expect(selection.$from.parentOffset).toBe(3);

    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });

  it("유일한 자식 블록 선두 Backspace는 부모와 병합하고 blockGroup을 흔적 없이 제거한다", () => {
    const { tiptap } = mountDocument(nestedParagraphDocument());
    const beforeJson = tiptap.state.doc.toJSON();

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "child-1"));
    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(true);
    expectSchemaValid(tiptap);

    // childCount·blockContainer 2 = parent-1 + 로드 시점 trailing
    // paragraph(UI-010, 자식 딸린 paragraph로 끝나는 문서라 로드에 추가됨).
    expect(tiptap.state.doc.childCount).toBe(2);
    const container = tiptap.state.doc.child(0);
    expect(container.attrs.blockId).toBe("parent-1");
    expect(container.childCount).toBe(1);
    expect(container.firstChild?.textContent).toBe("parentchild");
    // 컨테이너만 지우고 빈 blockGroup을 남기면 PM이 "block+" 필러로 유령
    // 빈 블록을 다시 채운다 — 그룹째 사라져야 한다.
    expect(countNodes(tiptap, "blockGroup")).toBe(0);
    expect(countNodes(tiptap, "blockContainer")).toBe(2);

    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(container.firstChild);
    expect(selection.$from.parentOffset).toBe("parent".length);

    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });

  it("자식 딸린 블록 선두 Backspace는 텍스트만 앞 블록으로 보내고 자식을 그 자리로 승격한다", () => {
    const { tiptap } = mountDocument(
      documentOf(
        paragraphBlock("block-a", "A"),
        paragraphBlock("block-b", "B", [paragraphBlock("block-z", "Z")]),
      ),
    );
    const beforeJson = tiptap.state.doc.toJSON();

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "block-b"));
    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(true);
    expectSchemaValid(tiptap);

    // block-b의 텍스트는 block-a로, 자식 block-z는 block-b의 자리(최상위)로.
    // childCount 3 = block-a + block-z + 로드 시점 trailing paragraph
    // (UI-010, 자식 딸린 paragraph로 끝나는 문서라 로드에 추가됨).
    expect(tiptap.state.doc.childCount).toBe(3);
    const mergedInto = tiptap.state.doc.child(0);
    expect(mergedInto.attrs.blockId).toBe("block-a");
    expect(mergedInto.childCount).toBe(1);
    expect(mergedInto.firstChild?.textContent).toBe("AB");
    const promoted = tiptap.state.doc.child(1);
    expect(promoted.attrs.blockId).toBe("block-z");
    expect(promoted.childCount).toBe(1);
    expect(promoted.firstChild?.textContent).toBe("Z");
    expect(countNodes(tiptap, "blockGroup")).toBe(0);

    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(mergedInto.firstChild);
    expect(selection.$from.parentOffset).toBe(1);

    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });

  it("앞 형제가 자식을 가지면 시각적으로 이전인 그 마지막 자식 끝에 병합한다", () => {
    const { tiptap } = mountDocument(
      documentOf(
        paragraphBlock("block-a", "x", [paragraphBlock("block-x", "X")]),
        paragraphBlock("block-b", "B"),
      ),
    );
    const beforeJson = tiptap.state.doc.toJSON();

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "block-b"));
    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(true);
    expectSchemaValid(tiptap);

    // 문서 순서상 바로 앞 텍스트블록은 형제 block-a가 아니라 그 자식
    // block-x다 — 병합은 시각적으로 이전인 블록에 붙는다. childCount 2 =
    // block-a + trailing paragraph(UI-010, 병합으로 문서가 자식 딸린
    // paragraph로 끝나게 되어 같은 dispatch에서 추가됨).
    expect(tiptap.state.doc.childCount).toBe(2);
    const root = tiptap.state.doc.child(0);
    expect(root.attrs.blockId).toBe("block-a");
    expect(root.firstChild?.textContent).toBe("x");
    expect(root.childCount).toBe(2);
    const group = root.child(1);
    expect(group.childCount).toBe(1);
    const merged = group.child(0);
    expect(merged.attrs.blockId).toBe("block-x");
    expect(merged.firstChild?.textContent).toBe("XB");

    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(merged.firstChild);
    expect(selection.$from.parentOffset).toBe(1);

    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });

  it("앞이 표면 병합하지 않고 표를 NodeSelection으로 선택한다", () => {
    const { tiptap } = mountDocument(
      documentOf(oneCellTableBlock("table-1"), paragraphBlock("block-p", "P")),
    );
    const beforeJson = tiptap.state.doc.toJSON();

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "block-p"));
    const handled = dispatchKeydown(tiptap, "Backspace");

    // dev parity: 표 뒤 블록 선두 Backspace는 표를 선택할 뿐 문서를 바꾸지
    // 않는다(셀 병합·자식화 없음). selectNodeBackward가 세우는 표
    // NodeSelection은 tableEditing({ allowTableNodeSelection: false },
    // table-extension.ts)의 normalizeSelection이 같은 dispatch 안에서 표
    // 전체 CellSelection으로 정규화한다 — 이 에디터에서 "표가 선택된"
    // 상태의 관측 가능한 형태다.
    expect(handled).toBe(true);
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
    const { selection } = tiptap.state;
    expect(selection).toBeInstanceOf(CellSelection);
    expect(
      (selection as CellSelection).$anchorCell.node(-1).attrs.blockId,
    ).toBe("table-1");
  });

  it("문서 최선두 Backspace는 키를 소비하지 않고 문서를 바꾸지 않는다", () => {
    const { tiptap } = mountDocument(
      documentOf(paragraphBlock("block-a", "AAA")),
    );
    const beforeJson = tiptap.state.doc.toJSON();

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "block-a"));
    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(false);
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });
});

describe("텍스트 끝 Delete는 다음 텍스트블록을 끌어와 병합한다", () => {
  it("평면 두 블록에서 앞 블록 끝 Delete는 자식화가 아니라 한 블록으로 병합한다", () => {
    const { tiptap } = mountDocument(
      documentOf(
        paragraphBlock("block-a", "AAA"),
        paragraphBlock("block-b", "BBB"),
      ),
    );
    const beforeJson = tiptap.state.doc.toJSON();

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "block-a") + 3);
    const handled = dispatchKeydown(tiptap, "Delete");

    expect(handled).toBe(true);
    expectSchemaValid(tiptap);

    // dev(joinForward) parity: 뒤 블록이 앞 블록의 자식이 되는 회귀가
    // 아니라 한 블록 "AAABBB"로 병합된다.
    expect(tiptap.state.doc.childCount).toBe(1);
    const container = tiptap.state.doc.child(0);
    expect(container.attrs.blockId).toBe("block-a");
    expect(container.childCount).toBe(1);
    expect(container.firstChild?.textContent).toBe("AAABBB");
    expect(countNodes(tiptap, "blockGroup")).toBe(0);

    // 캐럿은 자기 종전 텍스트 끝에 남는다.
    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(container.firstChild);
    expect(selection.$from.parentOffset).toBe(3);

    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });

  it("부모 텍스트 끝 Delete는 유일한 자식을 끌어올려 병합하고 blockGroup을 흔적 없이 제거한다", () => {
    const { tiptap } = mountDocument(nestedParagraphDocument());
    const beforeJson = tiptap.state.doc.toJSON();

    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, "parent-1") + "parent".length,
    );
    const handled = dispatchKeydown(tiptap, "Delete");

    expect(handled).toBe(true);
    expectSchemaValid(tiptap);

    // childCount·blockContainer 2 = parent-1 + 로드 시점 trailing
    // paragraph(UI-010) — Backspace 쪽 케이스와 같은 구조다.
    expect(tiptap.state.doc.childCount).toBe(2);
    const container = tiptap.state.doc.child(0);
    expect(container.attrs.blockId).toBe("parent-1");
    expect(container.childCount).toBe(1);
    expect(container.firstChild?.textContent).toBe("parentchild");
    // Backspace 쪽과 같은 규칙 — 유일 자식을 지울 때는 그룹째 사라져야
    // PM "block+" 필러(유령 빈 블록)가 생기지 않는다.
    expect(countNodes(tiptap, "blockGroup")).toBe(0);
    expect(countNodes(tiptap, "blockContainer")).toBe(2);

    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(container.firstChild);
    expect(selection.$from.parentOffset).toBe("parent".length);

    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });

  it("다음이 표면 병합하지 않고 표를 NodeSelection으로 선택한다", () => {
    const { tiptap } = mountDocument(
      documentOf(paragraphBlock("block-p", "P"), oneCellTableBlock("table-1")),
    );
    const beforeJson = tiptap.state.doc.toJSON();

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "block-p") + 1);
    const handled = dispatchKeydown(tiptap, "Delete");

    // dev parity: 표 앞 블록 끝 Delete는 표를 선택할 뿐 문서를 바꾸지
    // 않는다. NodeSelection이 CellSelection으로 관측되는 이유는 위
    // Backspace 표 케이스와 같다(tableEditing normalizeSelection).
    expect(handled).toBe(true);
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
    const { selection } = tiptap.state;
    expect(selection).toBeInstanceOf(CellSelection);
    expect(
      (selection as CellSelection).$anchorCell.node(-1).attrs.blockId,
    ).toBe("table-1");
  });
});

describe("이 확장이 관여하지 않는 위치", () => {
  it("텍스트 중간 Backspace에는 관여하지 않는다 — 키 미소비, 병합 없음", () => {
    const { tiptap } = mountDocument(
      documentOf(
        paragraphBlock("block-a", "AAA"),
        paragraphBlock("block-b", "BBB"),
      ),
    );
    const beforeJson = tiptap.state.doc.toJSON();

    // "B|BB" — 블록 선두가 아니다.
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "block-b") + 1);
    const handled = dispatchKeydown(tiptap, "Backspace");

    // 이 확장이 여기서 병합을 실행했다면 문서가 바뀌고 키가 소비된다.
    // jsdom에는 native contenteditable 문자 삭제가 없고 PM 기본 체인의
    // 어떤 커맨드도 중간 문자 삭제를 맡지 않으므로, false 반환(기본 체인
    // 위임)이면 키 미소비·문서 불변으로 관측된다.
    expect(handled).toBe(false);
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });

  it("표 셀 안 Backspace에는 관여하지 않는다 — 병합 dispatch가 없다", () => {
    // 격리 fixture 에디터를 쓰는 이유: 이 확장 자신이 셀 안에서 아무것도
    // dispatch하지 않는다는 계약만 코어 keymap 몫과 분리해 고정한다.
    const editor = createTableFixtureEditor(
      {
        type: "doc",
        content: [
          {
            type: "table",
            attrs: {
              blockId: "table-1",
              columns: [{ id: "col-1", width: 160 }],
              headerRows: 0,
              headerColumns: 0,
            },
            content: [
              {
                type: "tableRow",
                attrs: { rowId: "row-1" },
                content: [
                  {
                    ...cellJson("cell-1", "col-1"),
                    content: [{ type: "text", text: "XY" }],
                  },
                ],
              },
            ],
          },
        ],
      },
      [BlockJoinExtension],
    );

    // 셀 텍스트 선두에 캐럿 — 블록 문단이었다면 병합이 발동할 위치다.
    placeCaretInCell(editor, "cell-1");
    const beforeJson = editor.state.doc.toJSON();

    const dispatchSpy = vi.spyOn(editor.view, "dispatch");
    dispatchKeydown(editor, "Backspace");

    // 이 확장이 병합을 실행했다면 step이 실린 dispatch가 있었을 것이다.
    // 코어 keymap 체인은 소비에 실패해도 빈 tr(step 0개)를 dispatch할 수
    // 있으므로(실측 1회) 횟수가 아니라 step 유무로 비관여를 고정한다.
    const structuralDispatches = dispatchSpy.mock.calls.filter(
      ([transaction]) => transaction.steps.length > 0,
    );
    expect(structuralDispatches).toHaveLength(0);
    dispatchSpy.mockRestore();
    expect(editor.state.doc.toJSON()).toEqual(beforeJson);
  });
});
