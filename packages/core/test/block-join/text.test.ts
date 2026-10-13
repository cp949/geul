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
 * 인접 Backspace/Delete가 divider를 그 자리에 그대로 두고 건너뛰어 그 너머의
 * 병합 가능한 블록과 현재 블록을 결합한다(Issue #202 RD-002 — 05-C5의
 * selection-only 2단계 삭제를 대체, atom 연속 시 재귀적으로 전부 건너뛴다).
 *
 * Issue #202 RD-003이 더한 축: table도 divider·media(RD-002)와 같은 규칙으로
 * 편입됐다 — 인접 Backspace/Delete는 table을 그 자리에 두고 건너뛰어 그
 * 너머의 병합 가능한 블록과 결합한다. table이 문서 절대 경계(그 너머에
 * 병합 대상이 전혀 없음)에 있을 때만 이 확장이 false를 반환하고 PM 기본
 * keymap의 native 폴백이 table을 NodeSelection으로 선택한다 —
 * tableEditing({ allowTableNodeSelection: false })의 normalizeSelection이
 * 같은 dispatch 안에서 표 전체 CellSelection으로 정규화한다.
 *
 * Issue #404: 병합 대상이 없는 빈 마지막 문단과, 지워도 TrailingBlockExtension이
 * 되붙이는 자동 trailing 문단 병합의 Delete는 키를 소비하고 트랜잭션을 만들지
 * 않는다. 폴스루한 deleteCurrentNode와 지웠다 되붙는 병합이 문서는 그대로 두고
 * undo 단위만 남기던 것을 막는다.
 *
 * Issue #410: Backspace 쪽 형제 경로다. 자동 trailing 문단 맨 앞의 Backspace가
 * 그 문단을 지웠다 되붙이는 병합을 하지 않는다. 문서는 그대로 두고 캐럿만
 * 병합 접점으로 옮긴다(selection만 바꾸는 트랜잭션 하나).
 *
 * 키 소비(반환 true)는 view.someProp("handleKeyDown", ...) 실 디스패치로
 * 검증한다 — 이 커맨드는 addKeyboardShortcuts로만 등록돼 editor.commands로
 * 노출되지 않는다(G-WKS-001).
 */
import type { Editor as TiptapEditor } from "@tiptap/core";
import { CellSelection } from "@tiptap/pm/tables";
import { describe, expect, it, vi } from "vitest";

import { BlockJoinExtension } from "../../src/block-join-extension.js";
import {
  contentTextStart,
  dispatchKeydown,
  typeNativeText,
} from "../block-test-support.js";
import {
  checkListItemBlock,
  codeBlockBlock,
  dividerBlock,
  documentOf,
  headingBlock,
  listItemBlock,
  nestedParagraphDocument,
  oneCellTableBlock,
  paragraphBlock,
  tailParagraphBlock,
  toggleBlock,
} from "../editor-controller-support.js";
import {
  cellJson,
  createTableFixtureEditor,
  placeCaretInCell,
} from "../table-test-support.js";
import {
  countNodes,
  expectKeyConsumedUnchanged,
  expectSchemaValid,
  mountDocument,
  placeCaretInLastContainer,
  pressCountingDocChanges,
} from "./block-join-test-support.js";

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

  it("table이 문서 최선두면 Backspace는 그 너머가 없어 table을 NodeSelection으로 선택한다", () => {
    const { tiptap } = mountDocument(
      documentOf(oneCellTableBlock("table-1"), paragraphBlock("block-p", "P")),
    );
    const beforeJson = tiptap.state.doc.toJSON();

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "block-p"));
    const handled = dispatchKeydown(tiptap, "Backspace");

    // table 앞에 병합 대상이 전혀 없다(문서 절대 시작) — findMergeTarget이
    // null을 돌려줘 이 확장은 false로 물러나고, PM 기본 keymap의 native
    // 폴백(selectNodeBackward류)이 table을 NodeSelection으로 선택한다.
    // tableEditing의 normalizeSelection이 같은 dispatch 안에서 표 전체
    // CellSelection으로 정규화한다.
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

  it("다음이 표면 건너뛰어 그 다음 텍스트블록과 결합한다(Issue #202 RD-003)", () => {
    // 뒤에 실 paragraph(tail)를 둔다 — 병합 뒤 table이 최상위 마지막
    // 블록이 되면 trailing-block-extension.ts(UI-010)의 trailing paragraph
    // 불변식이 자동으로 새 paragraph를 추가해 기대값이 그 auto-fill에
    // 흔들린다(divider.test.ts와 같은 관례).
    const { tiptap } = mountDocument(
      documentOf(
        paragraphBlock("block-p", "P"),
        oneCellTableBlock("table-1"),
        paragraphBlock("block-q", "Q"),
        paragraphBlock("tail", ""),
      ),
    );
    const beforeJson = tiptap.state.doc.toJSON();

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "block-p") + 1);
    const handled = dispatchKeydown(tiptap, "Delete");

    expect(handled).toBe(true);
    expectSchemaValid(tiptap);

    // table은 지워지지 않고 그대로 남는다 — block-q가 소멸해 그 내용만
    // block-p에 흡수된다.
    expect(tiptap.state.doc.childCount).toBe(3);
    const container = tiptap.state.doc.child(0);
    expect(container.attrs.blockId).toBe("block-p");
    expect(container.firstChild?.textContent).toBe("PQ");
    expect(tiptap.state.doc.child(1).type.name).toBe("table");
    expect(countNodes(tiptap, "table")).toBe(1);

    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);

    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });
});

/*
 * 문서를 바꾸지 않는 Delete(Issue #404). 두 원인이 있다.
 * - 폴스루: 병합 대상이 없는 빈 마지막 문단에서 false를 돌려주면 Tiptap
 *   deleteCurrentNode가 같은 문단으로 되채운다.
 * - 자동 trailing 문단 병합: 마지막 블록이 문단이 아니면 빈 문단이 문서 끝에
 *   붙어 있다. 그 문단을 지워도 TrailingBlockExtension이 새 blockId로
 *   되붙인다. 일반 병합과 코드 블록 흡수가 같은 증상이다.
 * 두 경로 모두 키를 소비하고 트랜잭션을 만들지 않아야 한다. 통제 케이스는
 * 실제로 문서가 바뀌는 Delete가 그대로임을 고정한다.
 */
describe("문서를 바꾸지 않는 Delete는 키를 소비하고 트랜잭션을 만들지 않는다(Issue #404)", () => {
  /** 캐럿을 두고 Delete를 누르는 동작을 돌려준다. 키는 돌려받은 함수를 부를 때 눌린다. */
  const pressDeleteAt = (
    tiptap: TiptapEditor,
    blockId: string,
    offset: number,
  ) => {
    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, blockId) + offset,
    );
    return () => dispatchKeydown(tiptap, "Delete");
  };

  it("빈 마지막 문단의 Delete는 앞 문단이 있어도 아무것도 바꾸지 않는다", () => {
    const { tiptap } = mountDocument(
      documentOf(paragraphBlock("a", "abc"), paragraphBlock("b", "")),
    );

    expectKeyConsumedUnchanged(tiptap, pressDeleteAt(tiptap, "b", 0));
  });

  it("문단 하나뿐인 빈 문서의 Delete는 아무것도 바꾸지 않는다", () => {
    const { tiptap } = mountDocument(documentOf(paragraphBlock("only", "")));

    expectKeyConsumedUnchanged(tiptap, pressDeleteAt(tiptap, "only", 0));
  });

  it("마지막 heading 끝의 Delete는 자동 trailing 문단을 지웠다 되붙이지 않는다", () => {
    const { tiptap } = mountDocument(documentOf(headingBlock("h", 1, "x")));

    expectKeyConsumedUnchanged(tiptap, pressDeleteAt(tiptap, "h", 1));
  });

  it("마지막 bullet 항목 끝의 Delete는 자동 trailing 문단을 지웠다 되붙이지 않는다", () => {
    const { tiptap } = mountDocument(
      documentOf(listItemBlock("li", "bulletListItem", "x")),
    );

    expectKeyConsumedUnchanged(tiptap, pressDeleteAt(tiptap, "li", 1));
  });

  it("divider 앞 문단 끝의 Delete는 divider 너머 자동 trailing 문단을 지웠다 되붙이지 않는다", () => {
    const { tiptap } = mountDocument(
      documentOf(paragraphBlock("a", "abc"), dividerBlock("d")),
    );

    expectKeyConsumedUnchanged(tiptap, pressDeleteAt(tiptap, "a", 3));
  });

  it("표 앞 문단 끝의 Delete는 표 너머 자동 trailing 문단을 지웠다 되붙이지 않는다", () => {
    const { tiptap } = mountDocument(
      documentOf(paragraphBlock("a", "abc"), oneCellTableBlock("table-1")),
    );

    expectKeyConsumedUnchanged(tiptap, pressDeleteAt(tiptap, "a", 3));
  });

  it("색·정렬이 붙은 마지막 빈 문단은 Delete가 병합해 속성을 지운다", () => {
    const { tiptap } = mountDocument(
      documentOf(headingBlock("h", 1, "x"), {
        id: "t",
        type: "paragraph",
        content: [],
        backgroundColor: "#112233",
        textAlignment: "center",
      }),
    );
    const containerAttrs = () => {
      const last = tiptap.state.doc.lastChild;
      return last === null ? null : last.attrs;
    };
    expect(containerAttrs()?.backgroundColor).toBe("#112233");

    const result = pressCountingDocChanges(
      tiptap,
      pressDeleteAt(tiptap, "h", 1),
    );

    expect(result.handled).toBe(true);
    expect(result.docChanged).toBe(1);
    expect(containerAttrs()?.backgroundColor).toBeNull();
    expect(containerAttrs()?.textAlignment).toBeNull();
  });

  it("자식 문단의 마지막 빈 자식 Delete는 자동 trailing 문단을 지웠다 되붙이지 않는다", () => {
    const { tiptap } = mountDocument(
      documentOf({
        id: "p",
        type: "paragraph",
        content: [{ text: "x" }],
        children: [{ id: "c", type: "paragraph", content: [] }],
      }),
    );

    expectKeyConsumedUnchanged(tiptap, pressDeleteAt(tiptap, "c", 0));
  });

  it("마지막 코드 블록 끝의 Delete는 자동 trailing 문단을 지웠다 되붙이지 않는다", () => {
    const { tiptap } = mountDocument(
      documentOf(paragraphBlock("x", "x"), codeBlockBlock("k", "foo")),
    );

    expectKeyConsumedUnchanged(tiptap, pressDeleteAt(tiptap, "k", 3));
  });

  it("빈 마지막 문단의 Delete 뒤 undo 한 번은 직전 입력을 되돌린다", () => {
    const { tiptap } = mountDocument(
      documentOf(paragraphBlock("a", "abc"), paragraphBlock("b", "")),
    );
    const initialJson = tiptap.state.doc.toJSON();
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "a") + 3);
    typeNativeText(tiptap, "X");
    expect(tiptap.state.doc.child(0).textContent).toBe("abcX");

    const result = pressCountingDocChanges(
      tiptap,
      pressDeleteAt(tiptap, "b", 0),
    );
    expect(result).toEqual({ handled: true, docChanged: 0 });

    // 빈 undo 단위가 남았다면 이 undo는 문서를 바꾸지 못한다.
    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(initialJson);
  });

  it("통제: 앞 문단이 있는 빈 마지막 문단은 앞 문단 끝 Delete로 실제 삭제된다", () => {
    const { tiptap } = mountDocument(
      documentOf(paragraphBlock("a", "abc"), paragraphBlock("b", "")),
    );

    const result = pressCountingDocChanges(
      tiptap,
      pressDeleteAt(tiptap, "a", 3),
    );

    expect(result).toEqual({ handled: true, docChanged: 1 });
    expect(tiptap.state.doc.childCount).toBe(1);
    expect(tiptap.state.doc.child(0).attrs.blockId).toBe("a");
    expect(tiptap.state.doc.child(0).textContent).toBe("abc");
  });

  it("통제: 비어 있지 않은 trailing 문단은 heading 끝 Delete로 병합된다", () => {
    const { tiptap } = mountDocument(
      documentOf(headingBlock("h", 1, "x"), paragraphBlock("y", "y")),
    );

    const result = pressCountingDocChanges(
      tiptap,
      pressDeleteAt(tiptap, "h", 1),
    );

    expect(result).toEqual({ handled: true, docChanged: 1 });
    expect(tiptap.state.doc.child(0).attrs.blockId).toBe("h");
    expect(tiptap.state.doc.child(0).textContent).toBe("xy");
  });

  it("통제: 비어 있지 않은 마지막 문단 끝의 Delete는 키를 소비하지 않는다", () => {
    const { tiptap } = mountDocument(documentOf(paragraphBlock("a", "abc")));

    const result = pressCountingDocChanges(
      tiptap,
      pressDeleteAt(tiptap, "a", 3),
    );

    expect(result).toEqual({ handled: false, docChanged: 0 });
  });
});

/*
 * 문서를 바꾸지 않는 Backspace(Issue #410). #404 Delete의 형제 경로다.
 * 마지막 블록이 문단이 아니면 빈 문단이 문서 끝에 붙어 있다. 그 문단 맨 앞의
 * Backspace가 문단을 지우면 TrailingBlockExtension이 같은 dispatch 안에서 새
 * blockId로 되붙인다. 문서는 그대로고 undo 단위만 남는다.
 * 기대 동작은 키를 소비하고 문서를 바꾸지 않으며 캐럿만 병합 접점으로 옮기는
 * 것이다. 캐럿 위치는 일반 병합이 두는 위치와 같다. 통제 케이스는 실제로
 * 문서가 바뀌는 Backspace가 그대로임을 고정한다.
 */
describe("문서를 바꾸지 않는 Backspace는 캐럿만 병합 접점으로 옮긴다(Issue #410)", () => {
  /** 마지막 컨테이너 선두에서 Backspace를 누른다. */
  const pressBackspaceInLast = (tiptap: TiptapEditor) => {
    placeCaretInLastContainer(tiptap);
    return () => dispatchKeydown(tiptap, "Backspace");
  };

  it("마지막 heading 뒤 trailing 문단의 Backspace는 문서를 바꾸지 않고 캐럿을 heading 끝으로 옮긴다", () => {
    const { tiptap } = mountDocument(documentOf(headingBlock("h", 1, "x")));
    let transactions = 0;
    tiptap.on("transaction", () => {
      transactions += 1;
    });

    expectKeyConsumedUnchanged(tiptap, pressBackspaceInLast(tiptap));

    expect(tiptap.state.selection.from).toBe(3);
    expect(tiptap.state.selection.empty).toBe(true);
    // 장면 준비의 selection 이동 1개 + Backspace의 selection 전용 트랜잭션 1개.
    expect(transactions).toBe(2);
  });

  it("빈 heading 뒤 trailing 문단의 Backspace는 캐럿을 빈 heading 안으로 옮긴다", () => {
    const { tiptap } = mountDocument(documentOf(headingBlock("h", 1, "")));

    expectKeyConsumedUnchanged(tiptap, pressBackspaceInLast(tiptap));

    expect(tiptap.state.selection.from).toBe(2);
  });

  it("checkList 항목 뒤 trailing 문단의 Backspace는 문서를 바꾸지 않고 캐럿을 항목 끝으로 옮긴다", () => {
    const { tiptap } = mountDocument(
      documentOf(checkListItemBlock("c", "abc", false)),
    );

    expectKeyConsumedUnchanged(tiptap, pressBackspaceInLast(tiptap));

    expect(tiptap.state.selection.from).toBe(contentTextStart(tiptap, "c") + 3);
  });

  it("자식 딸린 문단 뒤 trailing 문단의 Backspace는 캐럿을 마지막 자손 끝으로 옮긴다", () => {
    const { tiptap } = mountDocument(
      documentOf({
        id: "p",
        type: "paragraph",
        content: [{ text: "x" }],
        children: [paragraphBlock("c", "y")],
      }),
    );

    expectKeyConsumedUnchanged(tiptap, pressBackspaceInLast(tiptap));

    expect(tiptap.state.selection.from).toBe(contentTextStart(tiptap, "c") + 1);
    expect(tiptap.state.selection.from).toBe(8);
  });

  it("열린 toggle 뒤 trailing 문단의 Backspace는 캐럿을 마지막 자손 끝으로 옮긴다", () => {
    const { tiptap } = mountDocument(
      documentOf(
        toggleBlock("t", "라벨", { children: [paragraphBlock("c", "자식")] }),
      ),
    );

    expectKeyConsumedUnchanged(tiptap, pressBackspaceInLast(tiptap));

    expect(tiptap.state.selection.from).toBe(contentTextStart(tiptap, "c") + 2);
  });

  it("접힌 toggle 뒤 trailing 문단의 Backspace는 숨은 자손이 아니라 라벨 끝으로 캐럿을 옮긴다(#253)", () => {
    const { tiptap } = mountDocument(
      documentOf(
        toggleBlock("t", "라벨", {
          collapsed: true,
          children: [paragraphBlock("c", "숨은")],
        }),
      ),
    );

    expectKeyConsumedUnchanged(tiptap, pressBackspaceInLast(tiptap));

    expect(tiptap.state.selection.from).toBe(contentTextStart(tiptap, "t") + 2);
  });

  it("divider 뒤 trailing 문단의 Backspace는 divider를 건너뛰어 앞 문단 끝으로 캐럿을 옮긴다", () => {
    const { tiptap } = mountDocument(
      documentOf(paragraphBlock("a", "abc"), dividerBlock("d")),
    );

    expectKeyConsumedUnchanged(tiptap, pressBackspaceInLast(tiptap));

    expect(tiptap.state.selection.from).toBe(contentTextStart(tiptap, "a") + 3);
  });

  it("표 뒤 trailing 문단의 Backspace는 표를 건너뛰어 앞 문단 끝으로 캐럿을 옮긴다", () => {
    const { tiptap } = mountDocument(
      documentOf(paragraphBlock("a", "abc"), oneCellTableBlock("table-1")),
    );

    expectKeyConsumedUnchanged(tiptap, pressBackspaceInLast(tiptap));

    expect(tiptap.state.selection.from).toBe(contentTextStart(tiptap, "a") + 3);
  });

  it("trailing 문단의 Backspace 뒤 undo 한 번은 직전 입력을 되돌린다", () => {
    const { tiptap } = mountDocument(documentOf(headingBlock("h", 1, "x")));
    const initialJson = tiptap.state.doc.toJSON();
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "h") + 1);
    typeNativeText(tiptap, "Y");
    expect(tiptap.state.doc.child(0).textContent).toBe("xY");

    const result = pressCountingDocChanges(
      tiptap,
      pressBackspaceInLast(tiptap),
    );
    expect(result).toEqual({ handled: true, docChanged: 0 });

    // 빈 undo 단위가 남았다면 이 undo는 입력한 글자를 되돌리지 못한다.
    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(initialJson);
  });

  it("통제: 색·정렬이 붙은 마지막 빈 문단은 Backspace가 병합해 속성을 지운다", () => {
    const { tiptap } = mountDocument(
      documentOf(headingBlock("h", 1, "x"), {
        id: "t",
        type: "paragraph",
        content: [],
        backgroundColor: "#112233",
        textAlignment: "center",
      }),
    );
    expect(tiptap.state.doc.lastChild?.attrs.backgroundColor).toBe("#112233");

    const result = pressCountingDocChanges(
      tiptap,
      pressBackspaceInLast(tiptap),
    );

    expect(result).toEqual({ handled: true, docChanged: 1 });
    expect(tiptap.state.doc.lastChild?.attrs.backgroundColor).toBeNull();
    expect(tiptap.state.doc.lastChild?.attrs.textAlignment).toBeNull();
  });

  it("통제: 앞 블록이 자식 없는 문단이면 빈 마지막 문단은 Backspace로 지워진다", () => {
    const { tiptap } = mountDocument(
      documentOf(paragraphBlock("a", "abc"), paragraphBlock("b", "")),
    );

    const result = pressCountingDocChanges(
      tiptap,
      pressBackspaceInLast(tiptap),
    );

    expect(result).toEqual({ handled: true, docChanged: 1 });
    expect(tiptap.state.doc.childCount).toBe(1);
    expect(tiptap.state.doc.child(0).attrs.blockId).toBe("a");
    expect(tiptap.state.doc.child(0).textContent).toBe("abc");
  });

  it("통제: 마지막 코드 블록 뒤 trailing 문단의 Backspace는 코드 블록을 문단으로 흡수한다", () => {
    const { tiptap } = mountDocument(
      documentOf(paragraphBlock("x", "x"), codeBlockBlock("k", "foo")),
    );

    const result = pressCountingDocChanges(
      tiptap,
      pressBackspaceInLast(tiptap),
    );

    expect(result).toEqual({ handled: true, docChanged: 1 });
    expect(countNodes(tiptap, "codeBlock")).toBe(0);
    expect(tiptap.state.doc.lastChild?.textContent).toBe("foo");
  });

  it("통제: 문단 하나뿐인 문서의 Backspace는 키를 소비하지 않는다", () => {
    const { tiptap } = mountDocument(documentOf(paragraphBlock("only", "")));

    const result = pressCountingDocChanges(
      tiptap,
      pressBackspaceInLast(tiptap),
    );

    expect(result).toEqual({ handled: false, docChanged: 0 });
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
