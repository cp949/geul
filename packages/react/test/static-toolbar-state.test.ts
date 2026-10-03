/**
 * `isSameStaticToolbarState`의 비교 규칙을 확인한다(Issue #218, RD-001 리뷰).
 * `subscribe` 통지는 타이핑마다 오므로 같은 상태면 재렌더를 생략한다. 비교가
 * 느슨하면 표시가 낡은 채 남는다. 그래서 상태 필드마다 "달라지면 다르다고
 * 판정"하는지를 하나씩 고정한다. 재렌더 생략 자체는
 * static-toolbar-subscription.test.tsx가 소유한다.
 */
import { describe, expect, it } from "vitest";

import type { FormattingToolbarState } from "../src/formatting-toolbar-state.js";
import { isSameStaticToolbarState } from "../src/static-toolbar-state.js";

/** 모든 필드가 채워진 기준 상태를 만든다. 호출마다 새 객체를 돌려준다. */
const baseState = (): FormattingToolbarState => ({
  activeMarks: ["bold", "italic"],
  blockSelection: { blockId: "block-1", blockType: { type: "paragraph" } },
  multiBlockSelection: null,
  nestingActions: { canIndent: true, canOutdent: false },
  isMediaBlockSelected: false,
  isCellRangeSelected: false,
});

describe("isSameStaticToolbarState", () => {
  it("값이 같은 두 상태는 같다고 판정한다", () => {
    expect(isSameStaticToolbarState(baseState(), baseState())).toBe(true);
  });

  it("활성 mark 개수가 다르면 다르다고 판정한다", () => {
    const next = { ...baseState(), activeMarks: ["bold" as const] };

    expect(isSameStaticToolbarState(baseState(), next)).toBe(false);
  });

  it("활성 mark 개수는 같고 종류가 다르면 다르다고 판정한다", () => {
    const next = {
      ...baseState(),
      activeMarks: ["bold" as const, "code" as const],
    };

    expect(isSameStaticToolbarState(baseState(), next)).toBe(false);
  });

  it("들여쓰기 가능 여부가 다르면 다르다고 판정한다", () => {
    const next = {
      ...baseState(),
      nestingActions: { canIndent: false, canOutdent: false },
    };

    expect(isSameStaticToolbarState(baseState(), next)).toBe(false);
  });

  it("내어쓰기 가능 여부가 다르면 다르다고 판정한다", () => {
    const next = {
      ...baseState(),
      nestingActions: { canIndent: true, canOutdent: true },
    };

    expect(isSameStaticToolbarState(baseState(), next)).toBe(false);
  });

  it("들여쓰기 상태가 null에서 값으로 바뀌면 다르다고 판정한다", () => {
    const next = { ...baseState(), nestingActions: null };

    expect(isSameStaticToolbarState(baseState(), next)).toBe(false);
    expect(isSameStaticToolbarState(next, baseState())).toBe(false);
  });

  it("들여쓰기 상태가 둘 다 null이면 같다고 판정한다", () => {
    const left = { ...baseState(), nestingActions: null };
    const right = { ...baseState(), nestingActions: null };

    expect(isSameStaticToolbarState(left, right)).toBe(true);
  });

  it("블록 id가 다르면 블록 타입이 같아도 다르다고 판정한다", () => {
    const next = {
      ...baseState(),
      blockSelection: {
        blockId: "block-2",
        blockType: { type: "paragraph" as const },
      },
    };

    expect(isSameStaticToolbarState(baseState(), next)).toBe(false);
  });

  it("블록 타입이 다르면 다르다고 판정한다", () => {
    const next = {
      ...baseState(),
      blockSelection: {
        blockId: "block-1",
        blockType: { type: "quote" as const },
      },
    };

    expect(isSameStaticToolbarState(baseState(), next)).toBe(false);
  });

  it("블록 타입 설명자의 부가 값(level)이 다르면 다르다고 판정한다", () => {
    const left = {
      ...baseState(),
      blockSelection: {
        blockId: "block-1",
        blockType: { type: "heading" as const, level: 1 as const },
      },
    };
    const right = {
      ...baseState(),
      blockSelection: {
        blockId: "block-1",
        blockType: { type: "heading" as const, level: 2 as const },
      },
    };

    expect(isSameStaticToolbarState(left, right)).toBe(false);
  });

  it("블록 선택이 null에서 값으로 바뀌면 다르다고 판정한다", () => {
    const next = { ...baseState(), blockSelection: null };

    expect(isSameStaticToolbarState(baseState(), next)).toBe(false);
    expect(isSameStaticToolbarState(next, baseState())).toBe(false);
  });

  it("미디어 블록 선택 여부가 다르면 다르다고 판정한다", () => {
    const next = { ...baseState(), isMediaBlockSelected: true };

    expect(isSameStaticToolbarState(baseState(), next)).toBe(false);
  });

  it("표 셀 범위 선택 여부가 다르면 다르다고 판정한다", () => {
    const next = { ...baseState(), isCellRangeSelected: true };

    expect(isSameStaticToolbarState(baseState(), next)).toBe(false);
  });
});

describe("isSameStaticToolbarState 여러 블록 선택", () => {
  const multi = (
    blockIds: string[],
    blockType: { type: "paragraph" } | null = { type: "paragraph" },
  ): FormattingToolbarState => ({
    ...baseState(),
    blockSelection: null,
    nestingActions: null,
    multiBlockSelection: { blockIds, blockType },
  });

  it("같은 블록 id와 타입이면 같다고 판정한다", () => {
    expect(isSameStaticToolbarState(multi(["a", "b"]), multi(["a", "b"]))).toBe(
      true,
    );
  });

  it("블록 id 목록이 다르면 다르다고 판정한다", () => {
    expect(isSameStaticToolbarState(multi(["a", "b"]), multi(["a", "c"]))).toBe(
      false,
    );
    expect(isSameStaticToolbarState(multi(["a", "b"]), multi(["a"]))).toBe(
      false,
    );
  });

  it("공통 타입이 값에서 null로 바뀌면 다르다고 판정한다", () => {
    expect(
      isSameStaticToolbarState(multi(["a", "b"]), multi(["a", "b"], null)),
    ).toBe(false);
  });

  it("단일 블록 선택과 여러 블록 선택은 다르다고 판정한다", () => {
    expect(isSameStaticToolbarState(baseState(), multi(["a", "b"]))).toBe(
      false,
    );
  });
});
