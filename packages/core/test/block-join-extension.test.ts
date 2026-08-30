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
 * Issue #38 슬라이스 3(DELTA-05)이 더한 축: quote 블록의 Backspace join이
 * paragraph|heading 규칙을 그대로 따르고(05-C2), divider(비포장 atom)
 * 인접 Backspace/Delete가 텍스트를 divider 너머로 병합하지 않고 divider를
 * NodeSelection으로 선택한다(05-C5 — 첫 키는 selection-only, 이어지는 키가
 * divider를 지우고 그 삭제가 undo 1회 단위다).
 *
 * Issue #138이 더한 축: 표가 인접한 중첩 위치에서도 첫 키는 표 전체
 * CellSelection만 만들고, 이어지는 키는 표만 삭제해 undo 1회로 복원한다.
 *
 * 키 소비(반환 true)는 view.someProp("handleKeyDown", ...) 실 디스패치로
 * 검증한다 — 이 커맨드는 addKeyboardShortcuts로만 등록돼 editor.commands로
 * 노출되지 않는다(G-WKS-001).
 */
import { type Document } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { CellSelection } from "@tiptap/pm/tables";
import { describe, expect, it, vi } from "vitest";

import { BlockJoinExtension } from "../src/block-join-extension.js";
import { createEditor } from "../src/index.js";
import { contentTextStart, dispatchKeydown } from "./block-test-support.js";
import {
  dividerBetweenParagraphsDocument,
  dividerD1,
  documentOf,
  editorState,
  expectDividerNodeSelection,
  firstParagraphBlock,
  mounted,
  mountTiptapEditor,
  nestedParagraphDocument,
  notApplicable,
  okResult,
  oneCellTableBlock,
  paragraphBlock,
  restored,
  secondParagraphBlock,
  sequentialIds,
  tailParagraphBlock,
} from "./editor-controller-support.js";
import {
  cellJson,
  createTableFixtureEditor,
  placeCaretInCell,
} from "./table-test-support.js";

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
    // 않는다(셀 병합·자식화 없음). 직접 세운 표 NodeSelection은
    // tableEditing({ allowTableNodeSelection: false },
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

describe("quote 블록의 Backspace join", () => {
  it("빈 quote 선두 Backspace가 빈 heading과 같은 규칙으로 quote를 제거하고 캐럿을 앞 블록 끝으로 옮긴다", () => {
    const { tiptap } = mountDocument(
      documentOf(paragraphBlock("block-a", "AAA"), {
        id: "block-q",
        type: "quote",
        content: [],
      }),
    );
    const beforeJson = tiptap.state.doc.toJSON();

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "block-q"));
    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(true);
    expectSchemaValid(tiptap);

    // 빈 quote의 병합 = 제거(빈 heading 케이스와 같은 규칙). childCount 2 =
    // block-a + 로드 시점 trailing paragraph(UI-010, quote로 끝나는 문서라
    // 로드에 추가됨).
    expect(countNodes(tiptap, "quote")).toBe(0);
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

  it("내용 있는 quote 선두 Backspace가 앞 텍스트블록과 병합하고 quote 텍스트를 잃지 않는다", () => {
    // DELTA-04a 구현 중 관찰: 이 배치에서 quote-1 선두 Backspace가 quote
    // 블록과 텍스트 "quote text"를 통째로 지웠다(앞 문단에 병합되지 않음).
    const { tiptap } = mountDocument(
      documentOf(
        paragraphBlock("p-0", "before"),
        { id: "quote-1", type: "quote", content: [{ text: "quote text" }] },
        tailParagraphBlock,
      ),
    );
    const beforeJson = tiptap.state.doc.toJSON();

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "quote-1"));
    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(true);
    expectSchemaValid(tiptap);

    // paragraph 규칙 준용: 대상(앞 문단)의 타입·id를 유지한 채 quote의
    // 인라인 content가 그 끝에 붙고 quote 컨테이너는 사라진다.
    expect(tiptap.state.doc.childCount).toBe(2);
    const mergedInto = tiptap.state.doc.child(0);
    expect(mergedInto.attrs.blockId).toBe("p-0");
    expect(mergedInto.firstChild?.type.name).toBe("paragraph");
    expect(mergedInto.firstChild?.textContent).toBe("beforequote text");
    expect(countNodes(tiptap, "quote")).toBe(0);
    expect(tiptap.state.doc.child(1).attrs.blockId).toBe("tail");
    expect(countNodes(tiptap, "blockGroup")).toBe(0);

    // 캐럿은 병합 접점("before" 끝)에 있다.
    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(mergedInto.firstChild);
    expect(selection.$from.parentOffset).toBe("before".length);

    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });
});

/**
 * "문단-divider-문단" 문서에서 divider에 인접한 텍스트 경계 — Backspace는
 * 뒤 문단(block-2) 선두, Delete는 앞 문단(block-1) 끝 — 에 캐럿을 둔다.
 * 두 키의 첫 입력이 대칭이라 divider 인접 케이스들이 공유한다.
 */
const placeCaretBesideDivider = (
  tiptap: TiptapEditor,
  key: "Backspace" | "Delete",
): void => {
  tiptap.commands.setTextSelection(
    key === "Backspace"
      ? contentTextStart(tiptap, "block-2")
      : contentTextStart(tiptap, "block-1") + "first".length,
  );
};

/**
 * divider 인접 첫 키(Backspace 또는 Delete)가 divider를 NodeSelection으로
 * 선택만 하고 문서·revision·히스토리를 건드리지 않음을 단언한다 — 형제
 * 인접 두 케이스의 공통 골격.
 */
const expectFirstKeySelectsDivider = (key: "Backspace" | "Delete"): void => {
  const { editor, tiptap, changes } = mounted(
    dividerBetweenParagraphsDocument(),
  );
  const before = editorState(editor, tiptap);

  placeCaretBesideDivider(tiptap, key);
  const handled = dispatchKeydown(tiptap, key);

  // 키 소비를 고정한다 — false면 어떤 핸들러도 preventDefault하지 않아
  // native 폴백이 PM 몰래 DOM을 바꾼다.
  expect(handled).toBe(true);
  expectDividerNodeSelection(tiptap, "d-1");

  // selection-only 단일 dispatch(G-EDT-001 tr.docChanged 기준): 문서·
  // revision 무변경, onChange 없음, 히스토리 항목 없음(undo할 것이 없다).
  expect(tiptap.state.doc.toJSON()).toEqual(before.tiptapDocument);
  expect(editor.getDocument()).toEqual(before.document);
  expect(changes).toEqual([]);
  expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  expect(editor.getDocument().blocks).toEqual([
    firstParagraphBlock,
    dividerD1,
    secondParagraphBlock,
  ]);
};

/**
 * divider 인접 첫 키로 divider를 선택한 뒤 같은 키 한 번 더가 divider를
 * 지우고, 그 삭제가 undo 1회 단위임을 단언한다.
 */
const expectSecondKeyDeletesDivider = (key: "Backspace" | "Delete"): void => {
  const { editor, tiptap, changes } = mounted(
    dividerBetweenParagraphsDocument(),
  );
  placeCaretBesideDivider(tiptap, key);
  dispatchKeydown(tiptap, key);
  expectDividerNodeSelection(tiptap, "d-1");
  // 첫 키 뒤 스냅샷 — selection-only였으므로 문서는 로드 직후와 같다.
  const beforeDelete = editorState(editor, tiptap);
  expect(changes).toEqual([]);

  dispatchKeydown(tiptap, key);

  expect(editor.getDocument().blocks).toEqual([
    firstParagraphBlock,
    secondParagraphBlock,
  ]);
  expect(changes).toHaveLength(1);
  expect(changes[0]?.reason).toBe("local");

  // 삭제만이 히스토리 항목이다 — undo 1회로 divider가 돌아오고 첫 키의
  // NodeSelection이 복원된다.
  expect(editor.commands.undo()).toEqual(okResult);
  expect(editorState(editor, tiptap)).toEqual(restored(beforeDelete, 2));
  expect(editor.commands.undo()).toEqual(notApplicable("undo"));
};

describe("divider 인접 Backspace/Delete(표 전례)", () => {
  it.each(["Backspace", "Delete"] as const)(
    "DOM에 붙은 divider NodeSelection에서 %s 한 번 더는 divider만 삭제한다",
    (key) => {
      const { editor, editable, tiptap } = mounted(
        dividerBetweenParagraphsDocument(),
      );
      placeCaretBesideDivider(tiptap, key);
      expect(dispatchKeydown(tiptap, key)).toBe(true);
      expectDividerNodeSelection(tiptap, "d-1");
      const beforeDelete = editorState(editor, tiptap);
      const container = editable.parentElement;
      if (container === null) throw new Error("편집기 컨테이너 조회 실패");
      document.body.append(container);
      const coordsAtPos = vi
        .spyOn(tiptap.view, "coordsAtPos")
        .mockReturnValue({ left: 0, right: 0, top: 0, bottom: 0 });

      try {
        tiptap.view.focus();
        expect(dispatchKeydown(tiptap, key)).toBe(true);
        expect(editor.getDocument().blocks).toEqual([
          firstParagraphBlock,
          secondParagraphBlock,
        ]);
        expect(editor.commands.undo()).toEqual(okResult);
        expect(editorState(editor, tiptap)).toEqual(restored(beforeDelete, 2));
      } finally {
        coordsAtPos.mockRestore();
        container.remove();
      }
    },
  );

  it("divider 바로 뒤 텍스트블록 선두 Backspace가 divider를 NodeSelection으로 선택하고 doc·revision을 바꾸지 않으며 히스토리 항목을 만들지 않는다", () => {
    expectFirstKeySelectsDivider("Backspace");
  });

  it("divider 바로 앞 텍스트블록 끝 Delete가 divider를 NodeSelection으로 선택한다", () => {
    expectFirstKeySelectsDivider("Delete");
  });

  it("divider NodeSelection에서 Backspace 한 번 더가 divider를 삭제하고 undo 1회로 문서가 복원된다", () => {
    expectSecondKeyDeletesDivider("Backspace");
  });

  it("divider NodeSelection에서 Delete 한 번 더도 divider를 삭제하고 undo 1회로 문서가 복원된다", () => {
    expectSecondKeyDeletesDivider("Delete");
  });

  it("divider가 앞 형제 컨테이너 blockGroup의 마지막 자식일 때 Backspace가 텍스트를 divider 너머로 병합하지 않는다", () => {
    // [p-1 "one", [c-1 "c", d-1]], p-2 "two" — p-2 선두의 시각적 이전
    // 노드는 c-1이 아니라 d-1이다. 형제 인접과 같은 경로로 divider를
    // 선택하므로 문서는 무변경이어야 한다. 앞 형제 컨테이너 전체가 아니라
    // divider 자체가 선택되어야 두 번째 키가 컨테이너를 지우지 않는다.
    const { editor, tiptap, changes } = mounted(
      documentOf(
        paragraphBlock("p-1", "one", [paragraphBlock("c-1", "c"), dividerD1]),
        paragraphBlock("p-2", "two"),
      ),
    );
    const before = editorState(editor, tiptap);

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "p-2"));
    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(true);
    expectDividerNodeSelection(tiptap, "d-1");
    expect(tiptap.state.doc.toJSON()).toEqual(before.tiptapDocument);
    expect(editor.getDocument()).toEqual(before.document);
    expect(changes).toEqual([]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("divider가 캐럿 컨테이너 blockGroup의 첫 자식일 때 Delete가 텍스트를 divider 너머로 병합하지 않는다", () => {
    // [p-1 "one", [d-1, c-1 "c"]], p-2 "two" — p-1 텍스트 끝의 시각적
    // 다음 노드는 c-1이 아니라 첫 자식 d-1이다. 캐럿 컨테이너 전체(자식
    // 포함)가 아니라 divider 자체가 선택되어야 두 번째 키가 컨테이너를
    // 지우지 않는다.
    const { editor, tiptap, changes } = mounted(
      documentOf(
        paragraphBlock("p-1", "one", [dividerD1, paragraphBlock("c-1", "c")]),
        paragraphBlock("p-2", "two"),
      ),
    );
    const before = editorState(editor, tiptap);

    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, "p-1") + "one".length,
    );
    const handled = dispatchKeydown(tiptap, "Delete");

    expect(handled).toBe(true);
    expectDividerNodeSelection(tiptap, "d-1");
    expect(tiptap.state.doc.toJSON()).toEqual(before.tiptapDocument);
    expect(editor.getDocument()).toEqual(before.document);
    expect(changes).toEqual([]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("중첩 위치에서 divider NodeSelection 뒤 Backspace 한 번 더는 divider만 지우고 형제 자식·blockGroup을 보존한다", () => {
    // [p-1 "one", [c-1 "c", d-1]], p-2 "two" — 위 케이스와 같은 배치에서
    // 첫 키로 d-1을 선택한 뒤 Backspace 한 번 더가 d-1만 지운다. c-1과 그
    // blockGroup은 살아남는다(divider만 형제 목록에서 제거).
    const { editor, tiptap, changes } = mounted(
      documentOf(
        paragraphBlock("p-1", "one", [paragraphBlock("c-1", "c"), dividerD1]),
        paragraphBlock("p-2", "two"),
      ),
    );

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "p-2"));
    dispatchKeydown(tiptap, "Backspace");
    expectDividerNodeSelection(tiptap, "d-1");
    // 첫 키 뒤 스냅샷 — selection-only였으므로 문서는 로드 직후와 같다.
    const before = editorState(editor, tiptap);
    expect(changes).toEqual([]);

    dispatchKeydown(tiptap, "Backspace");

    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "one", [paragraphBlock("c-1", "c")]),
      paragraphBlock("p-2", "two"),
    ]);
    expect(countNodes(tiptap, "blockGroup")).toBe(1);
    expect(changes).toHaveLength(1);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });
});

/**
 * Issue #138의 Backspace/Delete 대칭 중첩 배치를 마운트하고 표에 인접한
 * 텍스트 경계에 캐럿을 둔다. 각 테스트는 첫 키부터 공개 상태를 관찰한다.
 */
const mountedBesideNestedTable = (key: "Backspace" | "Delete") => {
  const context = mounted(
    documentOf(
      paragraphBlock(
        "p-1",
        "one",
        key === "Backspace"
          ? [paragraphBlock("c-1", "c"), oneCellTableBlock("t-1")]
          : [oneCellTableBlock("t-1"), paragraphBlock("c-1", "c")],
      ),
      paragraphBlock("p-2", "two"),
    ),
  );
  context.tiptap.commands.setTextSelection(
    key === "Backspace"
      ? contentTextStart(context.tiptap, "p-2")
      : contentTextStart(context.tiptap, "p-1") + "one".length,
  );
  return context;
};

describe("중첩 표 인접 Backspace/Delete", () => {
  it.each(["Backspace", "Delete"] as const)(
    "DOM에 붙은 중첩 표 CellSelection에서 %s 한 번 더는 표만 삭제한다",
    (key) => {
      const { editor, editable, tiptap } = mountedBesideNestedTable(key);
      const container = editable.parentElement;
      if (container === null) throw new Error("편집기 컨테이너 조회 실패");

      try {
        expect(dispatchKeydown(tiptap, key)).toBe(true);
        expect(tiptap.state.selection).toBeInstanceOf(CellSelection);
        const beforeDelete = editorState(editor, tiptap);
        document.body.append(container);
        tiptap.view.focus();
        expect(document.getSelection()?.focusNode).not.toBeNull();
        const coordsAtPos = vi
          .spyOn(tiptap.view, "coordsAtPos")
          .mockReturnValue({ left: 0, right: 0, top: 0, bottom: 0 });

        try {
          expect(dispatchKeydown(tiptap, key)).toBe(true);

          expect(countNodes(tiptap, "table")).toBe(0);
          expect(editor.commands.undo()).toEqual(okResult);
          expect(editorState(editor, tiptap)).toEqual(
            restored(beforeDelete, 2),
          );
        } finally {
          coordsAtPos.mockRestore();
        }
      } finally {
        container.remove();
      }
    },
  );

  it("앞 형제의 마지막 자식 표에 인접한 Backspace는 표 전체를 선택하고 문서·revision·히스토리를 바꾸지 않는다", () => {
    const { editor, tiptap, changes } = mountedBesideNestedTable("Backspace");
    const before = editorState(editor, tiptap);

    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(true);
    expect(tiptap.state.selection).toBeInstanceOf(CellSelection);
    const selection = tiptap.state.selection as CellSelection;
    expect(selection.$anchorCell.node(-1).attrs.blockId).toBe("t-1");
    expect(selection.$headCell.node(-1).attrs.blockId).toBe("t-1");
    expect(tiptap.state.doc.toJSON()).toEqual(before.tiptapDocument);
    expect(editor.getDocument()).toEqual(before.document);
    expect(changes).toEqual([]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("부모의 첫 자식 표에 인접한 Delete는 표 전체를 선택하고 문서·revision·히스토리를 바꾸지 않는다", () => {
    const { editor, tiptap, changes } = mountedBesideNestedTable("Delete");
    const before = editorState(editor, tiptap);

    const handled = dispatchKeydown(tiptap, "Delete");

    expect(handled).toBe(true);
    expect(tiptap.state.selection).toBeInstanceOf(CellSelection);
    const selection = tiptap.state.selection as CellSelection;
    expect(selection.$anchorCell.node(-1).attrs.blockId).toBe("t-1");
    expect(selection.$headCell.node(-1).attrs.blockId).toBe("t-1");
    expect(tiptap.state.doc.toJSON()).toEqual(before.tiptapDocument);
    expect(editor.getDocument()).toEqual(before.document);
    expect(changes).toEqual([]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("중첩 표 CellSelection에서 Backspace 한 번 더는 표만 삭제하고 undo 1회로 선택과 문서를 복원한다", () => {
    const { editor, tiptap, changes } = mountedBesideNestedTable("Backspace");

    dispatchKeydown(tiptap, "Backspace");
    const beforeDelete = editorState(editor, tiptap);
    expect(changes).toEqual([]);

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "one", [paragraphBlock("c-1", "c")]),
      paragraphBlock("p-2", "two"),
    ]);
    expect(countNodes(tiptap, "table")).toBe(0);
    expect(countNodes(tiptap, "blockGroup")).toBe(1);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.reason).toBe("local");

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(beforeDelete, 2));
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("중첩 표 CellSelection에서 Delete 한 번 더는 표만 삭제하고 undo 1회로 선택과 문서를 복원한다", () => {
    const { editor, tiptap, changes } = mountedBesideNestedTable("Delete");

    dispatchKeydown(tiptap, "Delete");
    const beforeDelete = editorState(editor, tiptap);
    expect(changes).toEqual([]);

    expect(dispatchKeydown(tiptap, "Delete")).toBe(true);

    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "one", [paragraphBlock("c-1", "c")]),
      paragraphBlock("p-2", "two"),
    ]);
    expect(countNodes(tiptap, "table")).toBe(0);
    expect(countNodes(tiptap, "blockGroup")).toBe(1);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.reason).toBe("local");

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(beforeDelete, 2));
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("표가 blockGroup의 유일한 자식이면 Backspace 두 번이 빈 문단을 채우지 않고 그룹까지 제거한다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        paragraphBlock("p-1", "one", [oneCellTableBlock("t-1")]),
        paragraphBlock("p-2", "two"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "p-2"));

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);
    const beforeDelete = editorState(editor, tiptap);
    expect(tiptap.state.selection).toBeInstanceOf(CellSelection);
    expect(changes).toEqual([]);

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "one"),
      paragraphBlock("p-2", "two"),
    ]);
    expect(countNodes(tiptap, "table")).toBe(0);
    expect(countNodes(tiptap, "blockGroup")).toBe(0);
    expect(changes).toHaveLength(1);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(beforeDelete, 2));
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });
});
