// @vitest-environment jsdom

/**
 * useHiddenBlocksRefresh(Issue #288)의 계약을 검증한다. 호출 컴포넌트가
 * `selector`에 걸린 요소 중 보이는 블록의 목록이 바뀔 때만 다시 렌더된다.
 * - 접힘으로 숨거나 펼쳐 드러나면 한 번 렌더한다.
 * - deleteBlock·insertBlocks로 블록이 줄거나 늘면 한 번 렌더한다.
 * - 목록이 그대로인 문서 변경(다른 블록의 텍스트 수정)은 렌더하지 않는다.
 * - selector에 걸리지 않는 블록의 변화는 렌더하지 않는다.
 * - `element`가 `null`이면 구독하지 않는다.
 * - unmount에서 구독을 해제한다.
 * 숨김 판정은 `data-geul-collapsed-hidden` 표식이다. 표식은 core 접힘
 * decoration이 실제로 붙인다.
 */

import type { EditorController } from "@cp949/geul-core";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useHiddenBlocksRefresh } from "../src/use-hidden-block-refresh.js";
import { useEditor, useEditorMount } from "../src/use-editor.js";
import {
  toggleCollapseByHostApi,
  toggleWithChild,
} from "./collapsed-toggle-test-support.js";
import { mountBlockEditor } from "./mount-editor.js";

afterEach(cleanup);

const CALLOUT_SELECTOR = "[data-geul-callout]";

/** 훅을 호출하고 렌더 횟수를 센다. */
const mountProbe = (
  selector: string,
  initialBlocks = calloutsInToggle(false),
) => {
  const renders = { count: 0 };
  const Probe = () => {
    const editor = useEditor();
    const { element } = useEditorMount();
    renders.count += 1;
    useHiddenBlocksRefresh(editor, element, selector);
    return null;
  };
  const rendered = mountBlockEditor({ initialBlocks, children: <Probe /> });
  return { ...rendered, renders };
};

/** 보이는 문단 p1, toggle tg(자식 callout c1)와 그 뒤 callout c2. */
const calloutsInToggle = (collapsed: boolean) => [
  ...toggleWithChild(
    { id: "c1", type: "callout", content: [{ text: "안" }] },
    collapsed,
  ),
  { id: "c2", type: "callout" as const, content: [{ text: "밖" }] },
];

describe("useHiddenBlocksRefresh(Issue #288)", () => {
  it("보이는 블록이 접혀 숨으면 한 번 렌더하고, 펼치면 한 번 더 렌더한다", () => {
    const { editor, renders } = mountProbe(CALLOUT_SELECTOR);
    const before = renders.count;

    toggleCollapseByHostApi(editor);
    expect(renders.count).toBe(before + 1);

    toggleCollapseByHostApi(editor);
    expect(renders.count).toBe(before + 2);
  });

  it("이미 숨은 블록이 든 채로 마운트하면 숨은 블록은 목록에 넣지 않는다", () => {
    const { editor, renders } = mountProbe(
      CALLOUT_SELECTOR,
      calloutsInToggle(true),
    );
    const before = renders.count;

    // 숨은 c1을 지워도 보이는 목록(c2)이 그대로다.
    act(() => {
      editor.commands.deleteBlock("c1");
    });

    expect(renders.count).toBe(before);
  });

  it("보이는 블록이 지워지면 한 번 렌더한다", () => {
    const { editor, renders } = mountProbe(CALLOUT_SELECTOR);
    const before = renders.count;

    act(() => {
      editor.commands.deleteBlock("c2");
    });

    expect(renders.count).toBe(before + 1);
  });

  it("보이는 블록이 늘면 한 번 렌더한다", () => {
    const { editor, renders } = mountProbe(CALLOUT_SELECTOR);
    const before = renders.count;

    act(() => {
      editor.insertBlocks(
        [{ id: "c3", type: "callout", content: [{ text: "새" }] }],
        "c2",
        "after",
      );
    });

    expect(renders.count).toBe(before + 1);
  });

  it("보이는 목록이 그대로인 문서 변경은 렌더하지 않는다", () => {
    const { editor, renders } = mountProbe(CALLOUT_SELECTOR);
    const before = renders.count;

    act(() => {
      editor.commands.setText("p1", "다른 블록의 텍스트 수정");
    });
    act(() => {
      editor.commands.setText("c2", "목록에 든 블록의 텍스트 수정");
    });

    expect(renders.count).toBe(before);
  });

  it("selector에 걸리지 않는 블록이 접히거나 지워져도 렌더하지 않는다", () => {
    const { editor, renders } = mountProbe("[data-geul-media-kind]");
    const before = renders.count;

    toggleCollapseByHostApi(editor);
    act(() => {
      editor.commands.deleteBlock("c2");
    });

    expect(renders.count).toBe(before);
  });

  it("element가 null이면 구독하지 않는다", () => {
    const editor = mountBlockEditor().editor;
    const subscribe = vi.spyOn(editor, "subscribe");
    const Probe = () => {
      useHiddenBlocksRefresh(editor, null, CALLOUT_SELECTOR);
      return null;
    };

    render(<Probe />);

    expect(subscribe).not.toHaveBeenCalled();
  });

  it("unmount하면 구독을 해제한다", () => {
    const editor: EditorController = mountBlockEditor().editor;
    const unsubscribe = vi.fn();
    vi.spyOn(editor, "subscribe").mockReturnValue(unsubscribe);
    const element = document.createElement("div");
    const Probe = () => {
      useHiddenBlocksRefresh(editor, element, CALLOUT_SELECTOR);
      return null;
    };

    const { unmount } = render(<Probe />);
    expect(unsubscribe).not.toHaveBeenCalled();
    unmount();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
