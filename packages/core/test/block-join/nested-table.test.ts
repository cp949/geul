/**
 * BlockJoinExtension의 Backspace/Delete 병합 계약을 확인한다.
 *
 * 컨테이너 스키마(D19)에서 PM joinBackward의 deleteBarrier는 두
 * blockContainer를 join하지 못하고(blockContent 둘 연속은 content
 * expression 위반) findWrapping(blockGroup) 경로로 떨어져 뒤 블록을 앞
 * 블록의 자식으로 들여쓴다 — 평면 문서에서도. Delete(forward)도 대칭으로
 * 뒤 블록을 자식화한다. 이 파일은 D22(커스텀 split/join 커맨드 도입)의
 * join 쪽 이행이 dev(StarterKit joinBackward/joinForward) 의미론 —
 * 병합·빈 블록 제거·atom skip — 을 복원함을 고정한다. 병합은 단일
 * dispatch(undo 1회 단위, G-EDT-001)여야 한다.
 *
 * Issue #38 슬라이스 3(DELTA-05)이 더한 축: quote 블록의 Backspace join이
 * paragraph|heading 규칙을 그대로 따르고(05-C2), divider(비포장 atom)
 * 인접 Backspace/Delete가 divider를 그 자리에 그대로 두고 건너뛰어 그 너머의
 * 병합 가능한 블록과 현재 블록을 결합한다(Issue #202 RD-002).
 *
 * Issue #138·#202 RD-003이 더한 축: table도 divider·media와 완전히 같은
 * 규칙으로 편입됐다 — 그 자리에 그대로 두고 건너뛰어 그 너머의 병합
 * 가능한 블록과 결합한다. `#138`이 고친 auto-select(첫 키가 표 전체
 * `CellSelection`, 두 번째 키가 표만 삭제) 경로는 RD-002가 divider/media의
 * `selectAdjacentAtom`을 대체 없이 지운 것과 같은 이유로 폐기됐다 — 인접
 * 키가 표를 지우는 경로 자체가 없어져 `#138`의 실제 사용자 결과(중첩
 * 위치에서 부모·형제 블록이 표와 함께 통째로 사라지는 데이터 손실)가
 * 구조적으로 재발할 수 없다. 사용자가 직접 만든 전체 `CellSelection`(드래그
 * 등가)에서 표를 지우는 `deleteSelectedTable` 경로는 이 변경과 무관하게
 * 유지되며 아래 두 번째 describe가 검증한다.
 *
 * 키 소비(반환 true)는 view.someProp("handleKeyDown", ...) 실 디스패치로
 * 검증한다 — 이 커맨드는 addKeyboardShortcuts로만 등록돼 editor.commands로
 * 노출되지 않는다(G-WKS-001).
 */
import { CellSelection } from "@tiptap/pm/tables";
import { describe, expect, it } from "vitest";

import { contentTextStart, dispatchKeydown } from "../block-test-support.js";
import {
  documentOf,
  mounted,
  notApplicable,
  okResult,
  oneCellTableBlock,
  paragraphBlock,
} from "../editor-controller-support.js";
import { selectSingleCell } from "../table-test-support.js";
import { countNodes } from "./block-join-test-support.js";

describe("table 인접 Backspace/Delete(skip-and-merge, Issue #202 RD-003)", () => {
  it("table 바로 뒤 텍스트블록 선두 Backspace가 table을 건너뛰어 이전 텍스트블록에 병합한다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        paragraphBlock("p-1", "one"),
        oneCellTableBlock("t-1"),
        paragraphBlock("p-2", "two"),
        paragraphBlock("tail", ""),
      ),
    );

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "p-2"));
    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(true);
    // table은 지워지지 않고 그대로 남는다 — p-2가 소멸해 그 내용만 p-1에
    // 흡수된다.
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "onetwo"),
      oneCellTableBlock("t-1"),
      paragraphBlock("tail", ""),
    ]);
    expect(countNodes(tiptap, "table")).toBe(1);
    expect(tiptap.state.selection.empty).toBe(true);
    // 단일 dispatch(undo 1회 단위) — table을 거쳐 가는 select-only 중간
    // 단계가 없다.
    expect(changes).toHaveLength(1);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "one"),
      oneCellTableBlock("t-1"),
      paragraphBlock("p-2", "two"),
      paragraphBlock("tail", ""),
    ]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("table 바로 앞 텍스트블록 끝 Delete가 table을 건너뛰어 다음 텍스트블록과 결합한다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        paragraphBlock("p-1", "one"),
        oneCellTableBlock("t-1"),
        paragraphBlock("p-2", "two"),
        paragraphBlock("tail", ""),
      ),
    );

    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, "p-1") + "one".length,
    );
    const handled = dispatchKeydown(tiptap, "Delete");

    expect(handled).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "onetwo"),
      oneCellTableBlock("t-1"),
      paragraphBlock("tail", ""),
    ]);
    expect(countNodes(tiptap, "table")).toBe(1);
    expect(tiptap.state.selection.empty).toBe(true);
    expect(changes).toHaveLength(1);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "one"),
      oneCellTableBlock("t-1"),
      paragraphBlock("p-2", "two"),
      paragraphBlock("tail", ""),
    ]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("table이 앞 형제 컨테이너 blockGroup의 마지막 자식일 때 Backspace가 table을 건너뛰어 그 자식에 병합한다", () => {
    // [p-1 "one", children: [c-1 "c", table t-1]], p-2 "two" — p-2 선두의
    // 시각적 이전 노드는 t-1이고, 그 너머(t-1 앞)는 c-1이다. p-2가 소멸하고
    // 그 내용이 c-1에 흡수된다. t-1은 p-1의 blockGroup 안에 그대로 남는다.
    const { editor, tiptap, changes } = mounted(
      documentOf(
        paragraphBlock("p-1", "one", [
          paragraphBlock("c-1", "c"),
          oneCellTableBlock("t-1"),
        ]),
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
        oneCellTableBlock("t-1"),
      ]),
      paragraphBlock("tail", ""),
    ]);
    expect(countNodes(tiptap, "table")).toBe(1);
    expect(countNodes(tiptap, "blockGroup")).toBe(1);
    expect(changes).toHaveLength(1);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "one", [
        paragraphBlock("c-1", "c"),
        oneCellTableBlock("t-1"),
      ]),
      paragraphBlock("p-2", "two"),
      paragraphBlock("tail", ""),
    ]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("table이 캐럿 컨테이너 blockGroup의 첫 자식일 때 Delete가 table을 건너뛰어 그 다음 자식과 결합한다", () => {
    // [p-1 "one", children: [table t-1, c-1 "c"]], p-2 "two" — p-1 텍스트
    // 끝의 시각적 다음 노드는 t-1이고, 그 너머(t-1 뒤)는 c-1이다. c-1이
    // 소멸하고 그 내용이 p-1 자신에 흡수된다. p-2는 이 경로에 닿지 않아
    // 그대로 남는다.
    const { editor, tiptap, changes } = mounted(
      documentOf(
        paragraphBlock("p-1", "one", [
          oneCellTableBlock("t-1"),
          paragraphBlock("c-1", "c"),
        ]),
        paragraphBlock("p-2", "two"),
      ),
    );

    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, "p-1") + "one".length,
    );
    const handled = dispatchKeydown(tiptap, "Delete");

    expect(handled).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "onec", [oneCellTableBlock("t-1")]),
      paragraphBlock("p-2", "two"),
    ]);
    expect(countNodes(tiptap, "table")).toBe(1);
    expect(countNodes(tiptap, "blockGroup")).toBe(1);
    expect(changes).toHaveLength(1);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "one", [
        oneCellTableBlock("t-1"),
        paragraphBlock("c-1", "c"),
      ]),
      paragraphBlock("p-2", "two"),
    ]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("table이 blockGroup의 유일한 자식이면 Backspace가 그 컨테이너 자신에 병합하고 table은 그대로 남는다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        paragraphBlock("p-1", "one", [oneCellTableBlock("t-1")]),
        paragraphBlock("p-2", "two"),
        paragraphBlock("tail", ""),
      ),
    );

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "p-2"));
    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "onetwo", [oneCellTableBlock("t-1")]),
      paragraphBlock("tail", ""),
    ]);
    expect(countNodes(tiptap, "table")).toBe(1);
    expect(countNodes(tiptap, "blockGroup")).toBe(1);
    expect(changes).toHaveLength(1);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "one", [oneCellTableBlock("t-1")]),
      paragraphBlock("p-2", "two"),
      paragraphBlock("tail", ""),
    ]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });
});

describe("전체 표 CellSelection에서 Backspace/Delete(#138 관련 경로, deleteSelectedTable 유지)", () => {
  it.each(["Backspace", "Delete"] as const)(
    "형제 인접 table 전체 CellSelection에서 %s는 table만 지운다",
    (key) => {
      const { editor, tiptap, changes } = mounted(
        documentOf(
          paragraphBlock("p-1", "one"),
          oneCellTableBlock("t-1"),
          paragraphBlock("p-2", "two"),
        ),
      );
      selectSingleCell(tiptap, "cell-1");
      expect(tiptap.state.selection).toBeInstanceOf(CellSelection);
      const before = editor.getDocument().blocks;

      const handled = dispatchKeydown(tiptap, key);

      expect(handled).toBe(true);
      expect(editor.getDocument().blocks).toEqual([
        paragraphBlock("p-1", "one"),
        paragraphBlock("p-2", "two"),
      ]);
      expect(countNodes(tiptap, "table")).toBe(0);
      expect(changes).toHaveLength(1);

      expect(editor.commands.undo()).toEqual(okResult);
      expect(editor.getDocument().blocks).toEqual(before);
      expect(editor.commands.undo()).toEqual(notApplicable("undo"));
    },
  );

  it("table이 blockGroup의 유일한 자식일 때 전체 CellSelection Backspace는 그룹까지 제거한다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        paragraphBlock("p-1", "one", [oneCellTableBlock("t-1")]),
        paragraphBlock("p-2", "two"),
      ),
    );
    selectSingleCell(tiptap, "cell-1");
    expect(tiptap.state.selection).toBeInstanceOf(CellSelection);

    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "one"),
      paragraphBlock("p-2", "two"),
    ]);
    expect(countNodes(tiptap, "table")).toBe(0);
    expect(countNodes(tiptap, "blockGroup")).toBe(0);
    expect(changes).toHaveLength(1);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "one", [oneCellTableBlock("t-1")]),
      paragraphBlock("p-2", "two"),
    ]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });
});
