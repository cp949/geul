/**
 * Text 계열(paragraph/heading/quote) 경계에 인접한 CodeBlock의 Backspace·
 * Delete 병합을 고정한다(Issue #202 RD-001, 스펙 표 행1·2·3).
 *
 * 이 파일 이전에는 `block-join-extension.ts`의 `selectAdjacentCodeBlock`이
 * caret만 CodeBlock 경계로 옮기고 병합하지 않았다(select-only) — 이 파일이
 * 고정하는 병합 계약이 그 동작을 대체한다. 행1·2(DELTA-01)는 CodeBlock이
 * 항상 흡수되는 쪽이고 대상 Text 블록이 살아남는다. 행3(DELTA-02, 아래
 * "CodeBlock 끝 Delete" describe)은 반대 방향이다 — CodeBlock이 살아남고
 * 다음 블록이 흡수된다(코드 블록 자신의 경계 no-op·빈 CodeBlock Delete
 * 삭제는 이 파일이 다루지 않는다 — code-block-exit-extension.test.ts 소관).
 *
 * Backspace(이전=CodeBlock)는 mergeContainers의 기존 3개 호출부와 반대
 * 순서다 — 제거 대상(CodeBlock)이 대상(Text)보다 문서 순서상 앞이라
 * mergePos가 제거 범위보다 뒤에 있다. 이 순서 역전이 `tr.mapping` 일반화가
 * 필요한 이유이자 DELTA-01의 핵심 회귀 대상이다. 행3(DELTA-02)은 순서가
 * 기존 append 방향과 같아 `tr.mapping` 자체는 새 회귀 대상이 아니고, 대신
 * 다음 블록의 mark·hardBreak를 CodeBlock의 `marks: ""`·`content: "text*"`에
 * 맞춰 평탄화하는 것이 핵심 회귀 대상이다.
 *
 * Issue #281이 더한 축: CodeBlock 텍스트가 Text 블록에 들어갈 때 리터럴
 * `\n`을 hardBreak로 바꾼다(인접·atom 너머·숨은 codeBlock 경로). atom 너머
 * Backspace(이전 병합 대상=CodeBlock)는 인접 규칙처럼 문단이 남고 CodeBlock을
 * 흡수한다. 목록 항목은 같은 2단계 보호를 받는다. 변환은 정규화
 * appendTransaction에 기대지 않고 BlockJoin의 root transaction 자체가
 * 소유한다 — root 문서도 함께 검사한다.
 */
import type { Editor as TiptapEditor } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import {
  containerOf,
  contentTextStart,
  dispatchKeydown,
  inlineShape,
  literalNewlineTexts,
} from "../block-test-support.js";
import {
  codeBlockBlock,
  dividerBlock,
  documentOf,
  headingBlock,
  listItemBlock,
  oneCellTableBlock,
  paragraphBlock,
  quoteBlock,
  toggleBlock,
} from "../editor-controller-support.js";
import {
  countNodes,
  expectSchemaValid,
  mountDocument,
} from "./block-join-test-support.js";

describe("Text 시작 Backspace, 이전 블록=CodeBlock", () => {
  it("CodeBlock 내용이 paragraph 앞에 붙고 CodeBlock은 소멸한다", () => {
    const { tiptap } = mountDocument(
      documentOf(
        codeBlockBlock("code-1", "foo"),
        paragraphBlock("para-1", "bar"),
      ),
    );
    const beforeJson = tiptap.state.doc.toJSON();

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "para-1"));
    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(true);
    expectSchemaValid(tiptap);

    // para-1이 살아남는다 — CodeBlock에 병합되는 반대 방향(dev joinBackward
    // 기본 방향)이 아니라 CodeBlock이 흡수되는 쪽이다.
    expect(tiptap.state.doc.childCount).toBe(1);
    const container = tiptap.state.doc.child(0);
    expect(container.attrs.blockId).toBe("para-1");
    expect(container.firstChild?.type.name).toBe("paragraph");
    expect(container.firstChild?.textContent).toBe("foobar");
    expect(countNodes(tiptap, "codeBlock")).toBe(0);
    expect(countNodes(tiptap, "blockGroup")).toBe(0);

    // 캐럿은 흡수한 "foo"와 원래 "bar"의 경계에 있다.
    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(container.firstChild);
    expect(selection.$from.parentOffset).toBe("foo".length);

    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });

  it("heading 시작 Backspace도 같은 규칙이고 대상 타입(heading)은 유지된다", () => {
    // heading으로 끝나는 문서는 로드 시점 trailing paragraph가 붙는다
    // (UI-010, endsWithChildlessParagraph는 paragraph 타입만 인정) — tail을
    // 명시해 그 잡음을 피한다(code-block-exit-extension.test.ts와 같은 관례).
    const { tiptap } = mountDocument(
      documentOf(
        codeBlockBlock("code-1", "foo"),
        headingBlock("h-1", 2, "bar"),
        paragraphBlock("tail", "tail"),
      ),
    );
    const beforeJson = tiptap.state.doc.toJSON();

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "h-1"));
    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(true);
    expectSchemaValid(tiptap);

    expect(tiptap.state.doc.childCount).toBe(2);
    const container = tiptap.state.doc.child(0);
    expect(container.attrs.blockId).toBe("h-1");
    expect(container.firstChild?.type.name).toBe("heading");
    expect(container.firstChild?.attrs.level).toBe(2);
    expect(container.firstChild?.textContent).toBe("foobar");
    expect(tiptap.state.doc.child(1).attrs.blockId).toBe("tail");
    expect(countNodes(tiptap, "codeBlock")).toBe(0);

    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });

  it("빈 CodeBlock이 이전이어도 병합 없이 CodeBlock만 제거하고 caret 위치를 옮기지 않는다", () => {
    // inline.size === 0이라 tr.insert를 건너뛴다 — mergePos 재계산이
    // insert 유무와 무관하게 항상 일어나는지를 이 케이스가 고정한다.
    const { tiptap } = mountDocument(
      documentOf(codeBlockBlock("code-1", ""), paragraphBlock("para-1", "bar")),
    );
    const beforeJson = tiptap.state.doc.toJSON();

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "para-1"));
    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(true);
    expectSchemaValid(tiptap);

    expect(tiptap.state.doc.childCount).toBe(1);
    const container = tiptap.state.doc.child(0);
    expect(container.attrs.blockId).toBe("para-1");
    expect(container.firstChild?.textContent).toBe("bar");
    expect(countNodes(tiptap, "codeBlock")).toBe(0);

    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(container.firstChild);
    expect(selection.$from.parentOffset).toBe(0);

    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });

  it("이전 형제의 자식인 CodeBlock도 시각적으로 인접한 것으로 보고 병합하며 빈 blockGroup을 흔적 없이 제거한다", () => {
    const { tiptap } = mountDocument(
      documentOf(
        paragraphBlock("block-a", "x", [codeBlockBlock("code-x", "X")]),
        paragraphBlock("block-b", "B"),
      ),
    );
    const beforeJson = tiptap.state.doc.toJSON();

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "block-b"));
    const handled = dispatchKeydown(tiptap, "Backspace");

    expect(handled).toBe(true);
    expectSchemaValid(tiptap);

    // block-a는 그대로, code-x는 소멸하고 그 내용은 block-b 앞에 붙는다.
    // code-x가 block-a의 blockGroup 유일한 자식이었으므로 그룹째 사라진다
    // (PM "block+" 필러로 유령 빈 블록이 새로 채워지는 회귀 방지).
    expect(tiptap.state.doc.childCount).toBe(2);
    const root = tiptap.state.doc.child(0);
    expect(root.attrs.blockId).toBe("block-a");
    expect(root.childCount).toBe(1);
    expect(root.firstChild?.textContent).toBe("x");
    const merged = tiptap.state.doc.child(1);
    expect(merged.attrs.blockId).toBe("block-b");
    expect(merged.firstChild?.textContent).toBe("XB");
    expect(countNodes(tiptap, "codeBlock")).toBe(0);
    expect(countNodes(tiptap, "blockGroup")).toBe(0);

    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(merged.firstChild);
    expect(selection.$from.parentOffset).toBe("X".length);

    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });
});

describe("리스트 항목 시작 Backspace, 이전 블록=CodeBlock", () => {
  // 사용자 결정(2026-09-15) — 리스트 항목은 CodeBlock과 바로 병합하지
  // 않는다. 1st Backspace가 먼저 paragraph로 전환하고(divider·표의
  // "선택 먼저" 전례와 같은 결의 안전장치), 그 paragraph에서 2nd
  // Backspace가 비로소 CodeBlock을 흡수한다. 복잡한 stale CellSelection
  // 시나리오 없이 이 2단계 계약만 직접 고정한다(list-item-join.test.ts의
  // stale 케이스와 상호 보완).
  it("1st Backspace는 paragraph로 전환만 하고, 2nd Backspace가 CodeBlock을 흡수한다", () => {
    // 리스트 항목으로 끝나는 문서는 로드 시점 trailing paragraph가 붙으므로
    // (endsWithChildlessParagraph는 paragraph 타입만 인정) tail을 명시해
    // 그 잡음 없이 2단계 계약만 고정한다.
    const { tiptap } = mountDocument(
      documentOf(
        codeBlockBlock("code-1", "foo"),
        listItemBlock("list-1", "bulletListItem", "bar"),
        paragraphBlock("tail", "tail"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "list-1"));

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

    expect(countNodes(tiptap, "codeBlock")).toBe(1);
    const afterFirst = tiptap.state.doc.child(1);
    expect(afterFirst.attrs.blockId).toBe("list-1");
    expect(afterFirst.firstChild?.type.name).toBe("paragraph");
    expect(afterFirst.firstChild?.textContent).toBe("bar");

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "list-1"));
    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

    expect(countNodes(tiptap, "codeBlock")).toBe(0);
    expect(tiptap.state.doc.childCount).toBe(2);
    const merged = tiptap.state.doc.child(0);
    expect(merged.attrs.blockId).toBe("list-1");
    expect(merged.firstChild?.type.name).toBe("paragraph");
    expect(merged.firstChild?.textContent).toBe("foobar");
    expect(tiptap.state.doc.child(1).attrs.blockId).toBe("tail");
  });
});

describe("Text 끝 Delete, 다음 블록=CodeBlock", () => {
  it("CodeBlock 내용이 paragraph 뒤에 붙고 CodeBlock은 소멸한다", () => {
    // codeBlock으로 끝나는 문서는 로드 시점 trailing paragraph가 붙으므로
    // (code-block-exit-extension.test.ts와 같은 이유) tail을 명시해 그
    // 잡음 없이 병합 자체만 고정한다.
    const { tiptap } = mountDocument(
      documentOf(
        paragraphBlock("para-1", "bar"),
        codeBlockBlock("code-1", "foo"),
        paragraphBlock("tail", "tail"),
      ),
    );
    const beforeJson = tiptap.state.doc.toJSON();

    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, "para-1") + "bar".length,
    );
    const handled = dispatchKeydown(tiptap, "Delete");

    expect(handled).toBe(true);
    expectSchemaValid(tiptap);

    expect(tiptap.state.doc.childCount).toBe(2);
    const container = tiptap.state.doc.child(0);
    expect(container.attrs.blockId).toBe("para-1");
    expect(container.firstChild?.textContent).toBe("barfoo");
    expect(tiptap.state.doc.child(1).attrs.blockId).toBe("tail");
    expect(countNodes(tiptap, "codeBlock")).toBe(0);
    expect(countNodes(tiptap, "blockGroup")).toBe(0);

    // append 방향 — 캐럿은 원래 위치("bar" 끝)에 그대로 남는다.
    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(container.firstChild);
    expect(selection.$from.parentOffset).toBe("bar".length);

    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });
});

describe("CodeBlock 끝 Delete, 다음 블록=Text 등(RD-001-DELTA-02)", () => {
  it("다음 paragraph 내용이 서식 제거 후 CodeBlock 끝에 붙고 paragraph는 소멸한다", () => {
    const { tiptap } = mountDocument(
      documentOf(
        codeBlockBlock("code-1", "foo"),
        {
          id: "para-1",
          type: "paragraph",
          content: [{ text: "bar", marks: [{ type: "bold" }] }],
        },
        paragraphBlock("tail", "tail"),
      ),
    );
    const beforeJson = tiptap.state.doc.toJSON();

    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, "code-1") + "foo".length,
    );
    const handled = dispatchKeydown(tiptap, "Delete");

    expect(handled).toBe(true);
    expectSchemaValid(tiptap);

    // CodeBlock이 살아남는다 — DELTA-01의 반대 방향이다.
    expect(tiptap.state.doc.childCount).toBe(2);
    const container = tiptap.state.doc.child(0);
    expect(container.attrs.blockId).toBe("code-1");
    expect(container.firstChild?.type.name).toBe("codeBlock");
    expect(container.firstChild?.textContent).toBe("foobar");
    // 흡수한 텍스트는 mark를 잃는다 — CodeBlock 스키마가 marks: ""다.
    expect(container.firstChild?.firstChild?.marks).toEqual([]);
    expect(tiptap.state.doc.child(1).attrs.blockId).toBe("tail");
    expect(countNodes(tiptap, "paragraph")).toBe(1); // tail만 남는다.

    // append 방향 — 캐럿은 원래 CodeBlock 끝("foo" 뒤)에 그대로 남는다.
    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(container.firstChild);
    expect(selection.$from.parentOffset).toBe("foo".length);

    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });

  it("다음 paragraph의 hardBreak가 리터럴 개행으로 치환돼 CodeBlock에 붙는다", () => {
    const { tiptap } = mountDocument(
      documentOf(
        codeBlockBlock("code-1", "foo"),
        {
          id: "para-1",
          type: "paragraph",
          content: [{ text: "bar\nbaz" }],
        },
        paragraphBlock("tail", "tail"),
      ),
    );

    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, "code-1") + "foo".length,
    );
    expect(dispatchKeydown(tiptap, "Delete")).toBe(true);

    const container = tiptap.state.doc.child(0);
    expect(container.firstChild?.type.name).toBe("codeBlock");
    expect(container.firstChild?.textContent).toBe("foobar\nbaz");
  });

  it.each([
    ["heading", () => headingBlock("h-1", 2, "bar")],
    ["quote", () => quoteBlock("q-1", "bar")],
  ] as const)(
    "다음이 %s여도 같은 규칙으로 소멸하며 CodeBlock 타입은 유지된다",
    (_label, makeNext) => {
      const { tiptap } = mountDocument(
        documentOf(
          codeBlockBlock("code-1", "foo"),
          makeNext(),
          paragraphBlock("tail", "tail"),
        ),
      );

      tiptap.commands.setTextSelection(
        contentTextStart(tiptap, "code-1") + "foo".length,
      );
      expect(dispatchKeydown(tiptap, "Delete")).toBe(true);

      const container = tiptap.state.doc.child(0);
      expect(container.firstChild?.type.name).toBe("codeBlock");
      expect(container.firstChild?.textContent).toBe("foobar");
      expect(countNodes(tiptap, "heading")).toBe(0);
      expect(countNodes(tiptap, "quote")).toBe(0);
    },
  );

  it("다음이 리스트 항목이어도 바로 흡수한다(2단계 전환 없음)", () => {
    const { tiptap } = mountDocument(
      documentOf(
        codeBlockBlock("code-1", "foo"),
        listItemBlock("list-1", "bulletListItem", "bar"),
        paragraphBlock("tail", "tail"),
      ),
    );

    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, "code-1") + "foo".length,
    );
    expect(dispatchKeydown(tiptap, "Delete")).toBe(true);

    const container = tiptap.state.doc.child(0);
    expect(container.attrs.blockId).toBe("code-1");
    expect(container.firstChild?.type.name).toBe("codeBlock");
    expect(container.firstChild?.textContent).toBe("foobar");
    expect(countNodes(tiptap, "bulletListItem")).toBe(0);
  });

  it("다음도 CodeBlock이면 텍스트만 이어붙고 살아남는 CodeBlock의 language는 그대로다", () => {
    const { tiptap } = mountDocument(
      documentOf(
        codeBlockBlock("code-1", "foo", "typescript"),
        codeBlockBlock("code-2", "bar", "python"),
        paragraphBlock("tail", "tail"),
      ),
    );

    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, "code-1") + "foo".length,
    );
    expect(dispatchKeydown(tiptap, "Delete")).toBe(true);

    expect(countNodes(tiptap, "codeBlock")).toBe(1);
    const container = tiptap.state.doc.child(0);
    expect(container.attrs.blockId).toBe("code-1");
    expect(container.firstChild?.attrs.language).toBe("typescript");
    expect(container.firstChild?.textContent).toBe("foobar");
  });

  it.each([
    ["divider", () => dividerBlock("d-1")],
    ["table", () => oneCellTableBlock("table-1")],
  ] as const)(
    "다음이 %s면 atom·표 스킵 대상이라(RD-002/003 소관) 이 DELTA는 그대로 no-op한다",
    (_label, makeNext) => {
      const { tiptap } = mountDocument(
        documentOf(
          codeBlockBlock("code-1", "foo"),
          makeNext(),
          paragraphBlock("tail", "tail"),
        ),
      );
      const beforeJson = tiptap.state.doc.toJSON();

      tiptap.commands.setTextSelection(
        contentTextStart(tiptap, "code-1") + "foo".length,
      );
      const handled = dispatchKeydown(tiptap, "Delete");

      // 키는 소비되지만(codeBlock 자신의 경계라 기존 keymap으로 폴스루하지
      // 않는다) 문서는 무변경이다 — atom skip-and-merge는 이 DELTA 범위 밖.
      expect(handled).toBe(true);
      expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
    },
  );
});

/**
 * 키 하나를 실 디스패치하고 소비 여부와 그 dispatch의 root transaction
 * 문서를 돌려준다. root 문서는 appendTransaction(정규화)이 붙기 전이다 —
 * BlockJoin이 변환을 직접 소유하는지 확인한다.
 */
const pressWithRootDoc = (
  tiptap: TiptapEditor,
  key: string,
): { handled: boolean; rootDoc: PmNode | null } => {
  let rootDoc: PmNode | null = null;
  const listener = ({ transaction }: { transaction: { doc: PmNode } }) => {
    rootDoc ??= transaction.doc;
  };
  tiptap.on("transaction", listener);
  try {
    return { handled: dispatchKeydown(tiptap, key), rootDoc };
  } finally {
    tiptap.off("transaction", listener);
  }
};

describe("CodeBlock 흡수의 개행 변환(Issue #281)", () => {
  it("PQ 선두 Backspace는 여러 줄 CodeBlock을 foo·hardBreak·barPQ로 흡수하고 캐럿은 bar|PQ다", () => {
    const { tiptap } = mountDocument(
      documentOf(
        codeBlockBlock("code-1", "foo\nbar"),
        paragraphBlock("para-1", "PQ"),
      ),
    );
    const beforeJson = tiptap.state.doc.toJSON();
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "para-1"));

    const { handled, rootDoc } = pressWithRootDoc(tiptap, "Backspace");

    expect(handled).toBe(true);
    expect(rootDoc === null ? -1 : literalNewlineTexts(rootDoc).length).toBe(0);
    expectSchemaValid(tiptap);
    const container = containerOf(tiptap, "para-1");
    expect(inlineShape(container.firstChild)).toEqual([
      "foo",
      "<hardBreak>",
      "barPQ",
    ]);
    expect(countNodes(tiptap, "codeBlock")).toBe(0);
    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(container.firstChild);
    expect(selection.$from.parentOffset).toBe("foo\nbar".length);

    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });

  it.each([
    ["heading(h1)", () => headingBlock("t-1", 1, "PQ")],
    ["quote", () => quoteBlock("t-1", "PQ")],
  ] as const)(
    "%s 선두 Backspace도 개행을 hardBreak로 받고 대상 타입은 유지된다",
    (_label, makeTarget) => {
      const { tiptap } = mountDocument(
        documentOf(
          codeBlockBlock("code-1", "foo\nbar"),
          makeTarget(),
          paragraphBlock("tail", "tail"),
        ),
      );
      const targetType = containerOf(tiptap, "t-1").firstChild?.type.name;
      tiptap.commands.setTextSelection(contentTextStart(tiptap, "t-1"));

      const { handled, rootDoc } = pressWithRootDoc(tiptap, "Backspace");

      expect(handled).toBe(true);
      expect(rootDoc === null ? -1 : literalNewlineTexts(rootDoc).length).toBe(
        0,
      );
      const container = containerOf(tiptap, "t-1");
      expect(container.firstChild?.type.name).toBe(targetType);
      expect(inlineShape(container.firstChild)).toEqual([
        "foo",
        "<hardBreak>",
        "barPQ",
      ]);
    },
  );

  it("P 끝 Delete는 여러 줄 CodeBlock을 Pfoo·hardBreak·bar로 흡수하고 캐럿은 P|foo다", () => {
    const { tiptap } = mountDocument(
      documentOf(
        paragraphBlock("para-1", "P"),
        codeBlockBlock("code-1", "foo\nbar"),
        paragraphBlock("tail", "tail"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "para-1") + 1);

    const { handled, rootDoc } = pressWithRootDoc(tiptap, "Delete");

    expect(handled).toBe(true);
    expect(rootDoc === null ? -1 : literalNewlineTexts(rootDoc).length).toBe(0);
    const container = containerOf(tiptap, "para-1");
    expect(inlineShape(container.firstChild)).toEqual([
      "Pfoo",
      "<hardBreak>",
      "bar",
    ]);
    expect(tiptap.state.selection.$from.parentOffset).toBe(1);
  });
});

describe("atom 너머 CodeBlock 병합(Issue #281)", () => {
  it.each([
    ["divider", () => dividerBlock("atom-1")],
    ["table", () => oneCellTableBlock("atom-1")],
  ] as const)(
    "P 끝 Delete가 %s 너머 여러 줄 CodeBlock을 Pfoo·hardBreak·bar로 흡수하고 atom은 남는다",
    (_label, makeAtom) => {
      const { tiptap } = mountDocument(
        documentOf(
          paragraphBlock("para-1", "P"),
          makeAtom(),
          codeBlockBlock("code-1", "foo\nbar"),
          paragraphBlock("tail", "tail"),
        ),
      );
      const beforeJson = tiptap.state.doc.toJSON();
      tiptap.commands.setTextSelection(contentTextStart(tiptap, "para-1") + 1);

      const { handled, rootDoc } = pressWithRootDoc(tiptap, "Delete");

      expect(handled).toBe(true);
      expect(rootDoc === null ? -1 : literalNewlineTexts(rootDoc).length).toBe(
        0,
      );
      expectSchemaValid(tiptap);
      expect(inlineShape(containerOf(tiptap, "para-1").firstChild)).toEqual([
        "Pfoo",
        "<hardBreak>",
        "bar",
      ]);
      expect(countNodes(tiptap, "codeBlock")).toBe(0);
      expect(tiptap.state.doc.childCount).toBe(3);
      expect(tiptap.state.doc.child(1).attrs.blockId).toBe("atom-1");

      tiptap.commands.undo();
      expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
    },
  );

  it.each([
    ["divider", () => dividerBlock("atom-1")],
    ["table", () => oneCellTableBlock("atom-1")],
  ] as const)(
    "문단 선두 Backspace는 %s 너머 CodeBlock을 문단 앞에 흡수하고 문단 id·bold·hardBreak를 보존한다",
    (_label, makeAtom) => {
      const { tiptap } = mountDocument(
        documentOf(codeBlockBlock("code-1", "code"), makeAtom(), {
          id: "para-1",
          type: "paragraph",
          content: [
            { text: "ab", marks: [{ type: "bold" }] },
            { text: "\ncd" },
          ],
        }),
      );
      const beforeJson = tiptap.state.doc.toJSON();
      tiptap.commands.setTextSelection(contentTextStart(tiptap, "para-1"));

      const { handled, rootDoc } = pressWithRootDoc(tiptap, "Backspace");

      expect(handled).toBe(true);
      expect(rootDoc === null ? -1 : literalNewlineTexts(rootDoc).length).toBe(
        0,
      );
      expectSchemaValid(tiptap);
      expect(countNodes(tiptap, "codeBlock")).toBe(0);
      expect(tiptap.state.doc.childCount).toBe(2);
      expect(tiptap.state.doc.child(0).attrs.blockId).toBe("atom-1");
      const container = containerOf(tiptap, "para-1");
      expect(tiptap.state.doc.child(1)).toBe(container);
      expect(inlineShape(container.firstChild)).toEqual([
        "code",
        "ab",
        "<hardBreak>",
        "cd",
      ]);
      expect(
        container.firstChild?.child(1).marks.map((mark) => mark.type.name),
      ).toEqual(["bold"]);
      expect(container.firstChild?.child(0).marks).toEqual([]);
      const { selection } = tiptap.state;
      expect(selection.empty).toBe(true);
      expect(selection.$from.parent).toBe(container.firstChild);
      expect(selection.$from.parentOffset).toBe("code".length);

      tiptap.commands.undo();
      expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
    },
  );

  it("목록 항목 선두 Backspace는 divider 너머 CodeBlock이어도 먼저 paragraph 전환만 하고 다음 Backspace가 흡수한다", () => {
    const { tiptap } = mountDocument(
      documentOf(
        codeBlockBlock("code-1", "code"),
        dividerBlock("d-1"),
        listItemBlock("list-1", "bulletListItem", "ab"),
        paragraphBlock("tail", "tail"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "list-1"));

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

    expect(countNodes(tiptap, "codeBlock")).toBe(1);
    const afterFirst = containerOf(tiptap, "list-1");
    expect(afterFirst.firstChild?.type.name).toBe("paragraph");
    expect(afterFirst.firstChild?.textContent).toBe("ab");
    expect(tiptap.state.doc.childCount).toBe(4);

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "list-1"));
    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

    expect(countNodes(tiptap, "codeBlock")).toBe(0);
    expect(tiptap.state.doc.childCount).toBe(3);
    expect(tiptap.state.doc.child(0).attrs.blockId).toBe("d-1");
    const merged = containerOf(tiptap, "list-1");
    expect(merged.firstChild?.type.name).toBe("paragraph");
    expect(merged.firstChild?.textContent).toBe("codeab");
    expect(tiptap.state.doc.child(2).attrs.blockId).toBe("tail");
  });
});

describe("숨은 CodeBlock 병합의 개행 변환(Issue #281, #253 정책 유지)", () => {
  it("접힌 toggle의 숨은 마지막 자손이 여러 줄 CodeBlock이면 뒤 문단 Backspace 흡수 결과에 리터럴 개행이 없다", () => {
    const { tiptap } = mountDocument(
      documentOf(
        toggleBlock("c1", "접힘", {
          collapsed: true,
          children: [
            paragraphBlock("c1a", "숨은"),
            codeBlockBlock("c1b", "foo\nbar"),
          ],
        }),
        paragraphBlock("n1", "뒤"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "n1"));

    const { handled, rootDoc } = pressWithRootDoc(tiptap, "Backspace");

    expect(handled).toBe(true);
    expect(rootDoc === null ? -1 : literalNewlineTexts(rootDoc).length).toBe(0);
    expectSchemaValid(tiptap);
    expect(inlineShape(containerOf(tiptap, "n1").firstChild)).toEqual([
      "foo",
      "<hardBreak>",
      "bar뒤",
    ]);
    expect(countNodes(tiptap, "codeBlock")).toBe(0);
  });

  it("divider 너머 대상이 숨은 CodeBlock이면 현재처럼 접힌 toggle 라벨 끝에 병합하고 CodeBlock은 남는다", () => {
    const { tiptap } = mountDocument(
      documentOf(
        toggleBlock("c2", "접힘2", {
          collapsed: true,
          children: [codeBlockBlock("c2a", "foo\nbar")],
        }),
        dividerBlock("d-1"),
        paragraphBlock("n2", "뒤2"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "n2"));

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

    expectSchemaValid(tiptap);
    expect(containerOf(tiptap, "c2").firstChild?.textContent).toBe("접힘2뒤2");
    expect(containerOf(tiptap, "c2a").firstChild?.textContent).toBe("foo\nbar");
    expect(countNodes(tiptap, "codeBlock")).toBe(1);
  });
});
