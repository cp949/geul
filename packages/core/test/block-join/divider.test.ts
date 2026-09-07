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
/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Editor as TiptapEditor } from "@tiptap/core";
import { CellSelection } from "@tiptap/pm/tables";
import { describe, expect, it, vi } from "vitest";

import { BlockJoinExtension } from "../../src/block-join-extension.js";
import { contentTextStart, dispatchKeydown } from "../block-test-support.js";
import {
  dividerBetweenParagraphsDocument,
  dividerD1,
  documentOf,
  editorState,
  expectDividerNodeSelection,
  firstParagraphBlock,
  mounted,
  nestedParagraphDocument,
  notApplicable,
  okResult,
  oneCellTableBlock,
  paragraphBlock,
  restored,
  secondParagraphBlock,
  tailParagraphBlock,
} from "../editor-controller-support.js";
import {
  cellJson,
  createTableFixtureEditor,
  placeCaretInCell,
} from "../table-test-support.js";
import {
  countNodes,
  expectSchemaValid,
  mountDocument,
} from "./block-join-test-support.js";

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
