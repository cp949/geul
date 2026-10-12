// @vitest-environment jsdom

/**
 * SlashMenu의 `items` prop이 바뀌어 후보 수가 줄면 강조 항목이 마지막 후보로
 * 줄어드는 계약을 고정한다.
 *
 * 열림 판정은 `useCaretTriggerPopup`이 소유하고 옵션 콜백은 참조가 안정적이다.
 * 그래서 `items`만 바뀌면 훅의 열림 판정 effect가 다시 돌지 않는다. SlashMenu가
 * `popup.refresh()`로 후보 수를 다시 읽어야 한다.
 */

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SlashMenu, type SlashMenuCustomItem } from "../../src/index.js";
import { mountBlockEditor } from "../mount-editor.js";
import { typeIntoBlock } from "./slash-menu-test-support.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const customItem = (id: string): SlashMenuCustomItem => ({
  id,
  label: `Custom ${id}`,
  keywords: ["zzzunique"],
  onSelect: vi.fn(),
});

const THREE_ITEMS = [customItem("a"), customItem("b"), customItem("c")];
const ONE_ITEM = [customItem("a")];

type ItemsHandle = {
  setItems: (items: readonly SlashMenuCustomItem[]) => void;
};

/** `items` prop을 바깥에서 바꿀 수 있는 SlashMenu 호스트. */
const ItemsHost = ({ expose }: { expose: (handle: ItemsHandle) => void }) => {
  const [items, setItems] =
    useState<readonly SlashMenuCustomItem[]>(THREE_ITEMS);
  expose({ setItems });
  return <SlashMenu items={items} />;
};

const mountWithItems = () => {
  let latest: ItemsHandle | null = null;
  const rendered = mountBlockEditor({
    children: (
      <ItemsHost
        expose={(handle) => {
          latest = handle;
        }}
      />
    ),
  });
  rendered.editable.focus();
  const handle = (): ItemsHandle => {
    if (latest === null) throw new Error("ItemsHost가 렌더되지 않았다");
    return latest;
  };
  return { ...rendered, handle };
};

describe("SlashMenu items prop 변경", () => {
  it("후보 수가 줄면 강조 항목을 마지막 후보로 줄인다", () => {
    const rendered = mountWithItems();
    typeIntoBlock(rendered, 0, "/zzzunique");
    fireEvent.keyDown(rendered.editable, { key: "ArrowDown" });
    fireEvent.keyDown(rendered.editable, { key: "ArrowDown" });
    // 전제: 후보 3건 중 마지막이 강조돼 있다.
    expect(
      screen.getAllByRole("option").map((o) => o.getAttribute("aria-selected")),
    ).toEqual(["false", "false", "true"]);

    act(() => rendered.handle().setItems(ONE_ITEM));

    expect(
      screen.getAllByRole("option").map((o) => o.getAttribute("aria-selected")),
    ).toEqual(["true"]);
  });

  it("줄어든 뒤 Enter는 남은 후보를 확정한다", () => {
    const rendered = mountWithItems();
    typeIntoBlock(rendered, 0, "/zzzunique");
    fireEvent.keyDown(rendered.editable, { key: "ArrowDown" });
    fireEvent.keyDown(rendered.editable, { key: "ArrowDown" });
    act(() => rendered.handle().setItems(ONE_ITEM));

    fireEvent.keyDown(rendered.editable, { key: "Enter" });

    expect(ONE_ITEM[0]?.onSelect).toHaveBeenCalledTimes(1);
  });

  it("닫혀 있을 때 items가 바뀌어도 메뉴를 열지 않는다", () => {
    const rendered = mountWithItems();

    act(() => rendered.handle().setItems(ONE_ITEM));

    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
