// @vitest-environment jsdom

/**
 * EmojiGrid의 재렌더 비용을 고정한다(Issue #234 RD-002 리뷰).
 *
 * useFixedPlacement는 열린 동안 scroll마다 호출 컴포넌트를 다시 렌더한다.
 * 이모지 옵션은 565개라, 항목·강조가 그대로인데 버튼을 매번 다시 만들면
 * 스크롤 프레임이 느려진다. 위치(`style`)만 바뀐 렌더는 항목을 다시 읽지 않아야 한다.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EmojiGrid } from "../src/emoji-grid.js";
import type { EmojiOption } from "../src/emoji-picker-options.js";

afterEach(cleanup);

/** `char`를 읽을 때마다 횟수를 세는 항목. 버튼을 다시 만들었는지 보는 관측점이다. */
const countingItem = (id: string, label: string) => {
  const reads = { char: 0 };
  const item = {
    id,
    label,
    keywords: [],
    get char() {
      reads.char += 1;
      return "😀";
    },
  } as unknown as EmojiOption;
  return { item, reads };
};

/** `EmojiGrid`를 렌더하고 `rerender`를 돌려준다. `left`로 style을 바꿔 다시 그릴 수 있다. */
const renderGrid = (
  items: readonly EmojiOption[],
  props: {
    onSelect?: (item: EmojiOption) => void;
    left?: number;
    idPrefix?: string;
  } = {},
) => {
  const element = (onSelect: (item: EmojiOption) => void, left: number) => (
    <EmojiGrid
      ariaLabel="Grid"
      emptyMessage="No matches"
      highlightedIndex={-1}
      {...(props.idPrefix === undefined ? {} : { idPrefix: props.idPrefix })}
      items={items}
      onSelect={onSelect}
      style={{ left, top: 0 }}
    />
  );
  const view = render(element(props.onSelect ?? (() => {}), props.left ?? 0));
  return {
    rerender: (onSelect: (item: EmojiOption) => void, left: number) =>
      view.rerender(element(onSelect, left)),
  };
};

describe("EmojiGrid 재렌더", () => {
  it("위치(style)만 바뀐 렌더는 항목 버튼을 다시 만들지 않는다", () => {
    const { item, reads } = countingItem("a", "Grinning");
    const grid = renderGrid([item]);
    const readsAfterMount = reads.char;

    grid.rerender(() => {}, 10);

    expect(screen.getByRole("listbox", { name: "Grid" }).style.left).toBe(
      "10px",
    );
    expect(reads.char).toBe(readsAfterMount);
  });

  it("재렌더로 onSelect가 바뀌어도 클릭은 최신 onSelect를 부른다", () => {
    const { item } = countingItem("a", "Grinning");
    const first = vi.fn();
    const latest = vi.fn();
    const grid = renderGrid([item], { onSelect: first });

    grid.rerender(latest, 10);
    fireEvent.click(screen.getByRole("option", { name: "Grinning" }));

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith(item);
  });
});

describe("EmojiGrid 옵션 id(Issue #409)", () => {
  it("idPrefix가 있으면 옵션에 `${idPrefix}-${item.id}` id를 단다", () => {
    const first = countingItem("a", "Grinning").item;
    const second = countingItem("b", "Smiley").item;
    renderGrid([first, second], { idPrefix: "picker" });

    expect(
      screen.getByRole("option", { name: "Grinning" }).getAttribute("id"),
    ).toBe("picker-a");
    expect(
      screen.getByRole("option", { name: "Smiley" }).getAttribute("id"),
    ).toBe("picker-b");
  });

  it("idPrefix가 없으면 옵션에 id 속성이 없다", () => {
    renderGrid([countingItem("a", "Grinning").item]);

    expect(
      screen.getByRole("option", { name: "Grinning" }).hasAttribute("id"),
    ).toBe(false);
  });
});
