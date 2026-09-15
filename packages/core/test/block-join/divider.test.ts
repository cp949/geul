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
 * Issue #138이 더한 축: 표가 인접한 중첩 위치에서도 첫 키는 표 전체
 * CellSelection만 만들고, 이어지는 키는 표만 삭제해 undo 1회로 복원한다.
 *
 * 키 소비(반환 true)는 view.someProp("handleKeyDown", ...) 실 디스패치로
 * 검증한다 — 이 커맨드는 addKeyboardShortcuts로만 등록돼 editor.commands로
 * 노출되지 않는다(G-WKS-001).
 */
import { describe, expect, it, vi } from "vitest";

import { contentTextStart, dispatchKeydown } from "../block-test-support.js";
import {
  dividerBetweenParagraphsDocument,
  dividerD1,
  documentOf,
  editorState,
  expectDividerNodeSelection,
  firstParagraphBlock,
  mounted,
  notApplicable,
  okResult,
  paragraphBlock,
  restored,
  secondParagraphBlock,
  selectBlockNode,
} from "../editor-controller-support.js";
import { countNodes } from "./block-join-test-support.js";

describe("divider NodeSelection에서 Backspace/Delete", () => {
  it.each(["Backspace", "Delete"] as const)(
    "DOM에 붙은 divider NodeSelection에서 %s는 divider를 지운다",
    (key) => {
      // divider 자체를 클릭 선택한 경우(NodeSelection이 이미 있음)의 직접
      // 삭제는 RD-002의 skip+merge 대상이 아니다 — media-atom.test.ts의
      // "빈 %s 블록 NodeSelection" 계약과 같은 경로(PM 기본 deleteSelection).
      const { editor, editable, tiptap } = mounted(
        dividerBetweenParagraphsDocument(),
      );
      selectBlockNode(tiptap, "d-1");
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
});

describe("divider 인접 Backspace/Delete(skip-and-merge, Issue #202 RD-002)", () => {
  it("divider 바로 뒤 텍스트블록 선두 Backspace가 divider를 건너뛰어 이전 텍스트블록에 병합한다", () => {
    // 뒤에 실 paragraph(tail)를 둔다 — 병합 뒤 divider가 최상위 마지막
    // 블록이 되면 trailing-block-extension.ts(UI-010)의 "문서는 항상
    // 자식 없는 paragraph로 끝나야 한다" 불변식이 trailing paragraph를
    // 자동 추가해 기대값이 그 auto-fill에 흔들린다.
    const { editor, tiptap, changes } = mounted(
      documentOf(
        firstParagraphBlock,
        dividerD1,
        secondParagraphBlock,
        paragraphBlock("tail", ""),
      ),
    );

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "block-2"));
    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(true);
    // divider는 지워지지 않고 그대로 남는다 — block-2가 소멸해 그 내용만
    // block-1에 흡수된다.
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("block-1", "firstsecond"),
      dividerD1,
      paragraphBlock("tail", ""),
    ]);
    expect(countNodes(tiptap, "divider")).toBe(1);
    expect(tiptap.state.selection.empty).toBe(true);
    // 단일 dispatch(undo 1회 단위) — divider를 거쳐 가는 select-only 중간
    // 단계가 없다.
    expect(changes).toHaveLength(1);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([
      firstParagraphBlock,
      dividerD1,
      secondParagraphBlock,
      paragraphBlock("tail", ""),
    ]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("divider 바로 앞 텍스트블록 끝 Delete가 divider를 건너뛰어 다음 텍스트블록과 결합한다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        firstParagraphBlock,
        dividerD1,
        secondParagraphBlock,
        paragraphBlock("tail", ""),
      ),
    );

    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, "block-1") + "first".length,
    );
    const handled = dispatchKeydown(tiptap, "Delete");

    expect(handled).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("block-1", "firstsecond"),
      dividerD1,
      paragraphBlock("tail", ""),
    ]);
    expect(countNodes(tiptap, "divider")).toBe(1);
    expect(tiptap.state.selection.empty).toBe(true);
    expect(changes).toHaveLength(1);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([
      firstParagraphBlock,
      dividerD1,
      secondParagraphBlock,
      paragraphBlock("tail", ""),
    ]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("divider가 앞 형제 컨테이너 blockGroup의 마지막 자식일 때 Backspace가 divider를 건너뛰어 그 자식에 병합한다", () => {
    // [p-1 "one", [c-1 "c", d-1]], p-2 "two" — p-2 선두의 시각적 이전 노드는
    // d-1이고, 그 너머(d-1 앞)는 c-1이다. p-2가 소멸하고 그 내용이 c-1에
    // 흡수된다. d-1은 p-1의 blockGroup 안에 그대로 남는다. 뒤에 실
    // paragraph(tail)를 둔다 — 병합 뒤 유일한 최상위 블록 p-1이 blockGroup을
    // 가져(childCount 2) trailing 불변식을 만족하지 못하면 trailing
    // paragraph가 자동 추가된다.
    const { editor, tiptap, changes } = mounted(
      documentOf(
        paragraphBlock("p-1", "one", [paragraphBlock("c-1", "c"), dividerD1]),
        paragraphBlock("p-2", "two"),
        paragraphBlock("tail", ""),
      ),
    );

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "p-2"));
    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "one", [
        paragraphBlock("c-1", "ctwo"),
        dividerD1,
      ]),
      paragraphBlock("tail", ""),
    ]);
    expect(countNodes(tiptap, "divider")).toBe(1);
    expect(countNodes(tiptap, "blockGroup")).toBe(1);
    expect(changes).toHaveLength(1);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "one", [paragraphBlock("c-1", "c"), dividerD1]),
      paragraphBlock("p-2", "two"),
      paragraphBlock("tail", ""),
    ]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("divider가 캐럿 컨테이너 blockGroup의 첫 자식일 때 Delete가 divider를 건너뛰어 그 다음 자식과 결합한다", () => {
    // [p-1 "one", [d-1, c-1 "c"]], p-2 "two" — p-1 텍스트 끝의 시각적 다음
    // 노드는 d-1이고, 그 너머(d-1 뒤)는 c-1이다. c-1이 소멸하고 그 내용이
    // p-1 자신에 흡수된다. p-2는 이 경로에 닿지 않아 그대로 남는다.
    const { editor, tiptap, changes } = mounted(
      documentOf(
        paragraphBlock("p-1", "one", [dividerD1, paragraphBlock("c-1", "c")]),
        paragraphBlock("p-2", "two"),
      ),
    );

    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, "p-1") + "one".length,
    );
    const handled = dispatchKeydown(tiptap, "Delete");

    expect(handled).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "onec", [dividerD1]),
      paragraphBlock("p-2", "two"),
    ]);
    expect(countNodes(tiptap, "divider")).toBe(1);
    expect(countNodes(tiptap, "blockGroup")).toBe(1);
    expect(changes).toHaveLength(1);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "one", [dividerD1, paragraphBlock("c-1", "c")]),
      paragraphBlock("p-2", "two"),
    ]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });
});
