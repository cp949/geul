// @vitest-environment jsdom

/**
 * useCaptionEditingLifecycle(media-captions.tsx/code-block-captions.tsx가
 * 복제하던 caption 편집 commit/cancel 상태 머신을 통합한 훅, 01-계획.md
 * "20260918-03-caption-editing-lifecycle")의 3계약을 renderHook으로
 * 검증한다(use-exclusive-overlay.test.ts와 동일 패턴 — JSX 없음): (a) cancel
 * 후 commit을 호출하면 applyCommand가 호출되지 않는다, (b) draft가
 * committedCaption과 같으면(dirty 아님) applyCommand가 호출되지 않는다,
 * (c) commit 호출 후 setEditing(null)이 호출된다(unmount cleanup 포함).
 *
 * 추가 계약(Issue #288): 편집 중 대상 블록이 삭제되거나 접힘에 가려지면
 * 문서 변경 구독이 setEditing(null)로 편집 상태를 버린다(commit하지 않는다).
 * 편집 중이 아니면 구독하지 않는다. DOM 요소가 없다는 사실만으로는 버리지 않는다.
 * 사라진 블록에 대한 commit은 applyCommand를 호출하지 않는다.
 */

import type { EditorController } from "@cp949/geul-core";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useCaptionEditingLifecycle } from "../src/use-caption-editing-lifecycle.js";

type CaptionPayload = { blockId: string; draft: string };

type StoredBlock = ReturnType<EditorController["getBlock"]>;

const IMAGE_BLOCK: StoredBlock = {
  id: "b1",
  type: "image",
  url: "https://example.com/a.png",
};

/**
 * 문서 변경 구독이 닿는 fake. `emit`이 구독자를 호출하고, `block`이 `getBlock`의
 * 응답을 정한다(`undefined`면 삭제된 블록이다).
 */
const createFakeEditor = () => {
  const listeners = new Set<() => void>();
  const state: { block: StoredBlock } = { block: IMAGE_BLOCK };
  const subscribe = vi.fn<EditorController["subscribe"]>((listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  });
  return {
    editor: { subscribe, getBlock: () => state.block },
    subscribe,
    listenerCount: () => listeners.size,
    deleteBlock: () => {
      state.block = undefined;
      for (const listener of [...listeners]) listener();
    },
    setBlock: (block: StoredBlock) => {
      state.block = block;
    },
    emitChange: () => {
      for (const listener of [...listeners]) listener();
    },
  };
};

/** 편집 중이 아닌 상태. 기존 계약 테스트가 쓴다. 구독도 판정도 일어나지 않는다. */
const idleInvalidationDeps = {
  editor: createFakeEditor().editor,
  element: null,
  editingBlockId: null,
} as const;

describe("useCaptionEditingLifecycle", () => {
  it("cancel 후 commit을 호출하면 applyCommand가 호출되지 않는다", () => {
    const getSnapshot = vi.fn<() => CaptionPayload | null>(() => ({
      blockId: "b1",
      draft: "버려질 값",
    }));
    const setEditing = vi.fn();
    const applyCommand = vi.fn();
    const focusEditor = vi.fn();
    const { result } = renderHook(() =>
      useCaptionEditingLifecycle<CaptionPayload>({
        getSnapshot,
        setEditing,
        applyCommand,
        focusEditor,
        ...idleInvalidationDeps,
      }),
    );
    const element = document.createElement("input");

    act(() => {
      result.current.cancel(element);
    });
    act(() => {
      result.current.commit("b1", "원래 값");
    });

    expect(applyCommand).not.toHaveBeenCalled();
    expect(setEditing).toHaveBeenLastCalledWith(null);
  });

  it("cancel은 element.blur()와 focusEditor를 호출한다", () => {
    const getSnapshot = vi.fn<() => CaptionPayload | null>(() => null);
    const setEditing = vi.fn();
    const applyCommand = vi.fn();
    const focusEditor = vi.fn();
    const { result } = renderHook(() =>
      useCaptionEditingLifecycle<CaptionPayload>({
        getSnapshot,
        setEditing,
        applyCommand,
        focusEditor,
        ...idleInvalidationDeps,
      }),
    );
    const element = document.createElement("input");
    document.body.appendChild(element);
    element.focus();
    const blurSpy = vi.spyOn(element, "blur");

    act(() => {
      result.current.cancel(element);
    });

    expect(blurSpy).toHaveBeenCalledOnce();
    expect(focusEditor).toHaveBeenCalledOnce();
  });

  it("draft가 committedCaption과 같으면(dirty 아님) applyCommand가 호출되지 않는다", () => {
    const getSnapshot = vi.fn<() => CaptionPayload | null>(() => ({
      blockId: "b1",
      draft: "그대로",
    }));
    const setEditing = vi.fn();
    const applyCommand = vi.fn();
    const focusEditor = vi.fn();
    const { result } = renderHook(() =>
      useCaptionEditingLifecycle<CaptionPayload>({
        getSnapshot,
        setEditing,
        applyCommand,
        focusEditor,
        ...idleInvalidationDeps,
      }),
    );

    act(() => {
      result.current.commit("b1", "그대로");
    });

    expect(applyCommand).not.toHaveBeenCalled();
    expect(setEditing).toHaveBeenCalledWith(null);
  });

  it("draft가 committedCaption과 다르면(dirty) applyCommand를 호출하고 setEditing(null)을 호출한다", () => {
    const getSnapshot = vi.fn<() => CaptionPayload | null>(() => ({
      blockId: "b1",
      draft: "새 값",
    }));
    const setEditing = vi.fn();
    const applyCommand = vi.fn();
    const focusEditor = vi.fn();
    const { result } = renderHook(() =>
      useCaptionEditingLifecycle<CaptionPayload>({
        getSnapshot,
        setEditing,
        applyCommand,
        focusEditor,
        ...idleInvalidationDeps,
      }),
    );

    act(() => {
      result.current.commit("b1", "원래 값");
    });

    expect(applyCommand).toHaveBeenCalledWith("b1", "새 값");
    expect(setEditing).toHaveBeenCalledWith(null);
  });

  it("unmount 시에도 setEditing(null)이 호출된다", () => {
    const getSnapshot = vi.fn<() => CaptionPayload | null>(() => null);
    const setEditing = vi.fn();
    const applyCommand = vi.fn();
    const focusEditor = vi.fn();
    const { unmount } = renderHook(() =>
      useCaptionEditingLifecycle<CaptionPayload>({
        getSnapshot,
        setEditing,
        applyCommand,
        focusEditor,
        ...idleInvalidationDeps,
      }),
    );
    expect(setEditing).not.toHaveBeenCalled();

    unmount();

    expect(setEditing).toHaveBeenCalledWith(null);
  });

  describe("편집 중 대상 블록이 사라지면(Issue #288)", () => {
    /** blockId b1을 편집 중인 훅을 마운트한다. element는 b1을 담은 host다. */
    const mountEditing = (fake = createFakeEditor()) => {
      const host = document.createElement("div");
      const block = document.createElement("div");
      block.setAttribute("data-geul-block-id", "b1");
      host.appendChild(block);
      document.body.appendChild(host);
      const setEditing = vi.fn();
      const applyCommand = vi.fn();
      const hook = renderHook(() =>
        useCaptionEditingLifecycle<CaptionPayload>({
          getSnapshot: () => ({ blockId: "b1", draft: "초안" }),
          setEditing,
          applyCommand,
          focusEditor: vi.fn(),
          editor: fake.editor,
          element: host,
          editingBlockId: "b1",
        }),
      );
      return { fake, host, block, setEditing, applyCommand, ...hook };
    };

    it("이 editor 문서에 없는 블록의 편집은 처음부터 건드리지 않는다(다른 editor의 편집)", () => {
      const fake = createFakeEditor();
      fake.setBlock(undefined);
      const { setEditing, applyCommand } = mountEditing(fake);

      act(() => fake.emitChange());

      expect(setEditing).not.toHaveBeenCalled();
      expect(applyCommand).not.toHaveBeenCalled();
    });

    it("블록이 삭제되면 setEditing(null)을 호출하고 command는 보내지 않는다", () => {
      const { fake, setEditing, applyCommand } = mountEditing();
      expect(setEditing).not.toHaveBeenCalled();

      act(() => fake.deleteBlock());

      expect(setEditing).toHaveBeenCalledWith(null);
      expect(applyCommand).not.toHaveBeenCalled();
    });

    it("블록 DOM이 접힘 표식 아래로 들어가면 setEditing(null)을 호출한다", () => {
      const { fake, host, block, setEditing } = mountEditing();
      const group = document.createElement("div");
      group.setAttribute("data-geul-collapsed-hidden", "");
      host.replaceChild(group, block);
      group.appendChild(block);

      act(() => fake.emitChange());

      expect(setEditing).toHaveBeenCalledWith(null);
    });

    it("블록이 보이는 채라면 문서 변경이 와도 setEditing을 호출하지 않는다", () => {
      const { fake, setEditing } = mountEditing();

      act(() => fake.emitChange());
      act(() => fake.emitChange());

      expect(setEditing).not.toHaveBeenCalled();
    });

    it("블록 DOM 요소가 없다는 사실만으로는 setEditing을 호출하지 않는다", () => {
      const { fake, host, block, setEditing } = mountEditing();
      host.removeChild(block);

      act(() => fake.emitChange());

      expect(setEditing).not.toHaveBeenCalled();
    });

    it("편집 중이 아니면 문서 변경을 구독하지 않는다", () => {
      const fake = createFakeEditor();
      renderHook(() =>
        useCaptionEditingLifecycle<CaptionPayload>({
          getSnapshot: () => null,
          setEditing: vi.fn(),
          applyCommand: vi.fn(),
          focusEditor: vi.fn(),
          editor: fake.editor,
          element: document.createElement("div"),
          editingBlockId: null,
        }),
      );

      expect(fake.subscribe).not.toHaveBeenCalled();
    });

    it("unmount하면 구독을 해제한다", () => {
      const { fake, unmount } = mountEditing();
      expect(fake.listenerCount()).toBe(1);

      unmount();

      expect(fake.listenerCount()).toBe(0);
    });

    it("삭제된 블록에 대한 commit은 applyCommand를 호출하지 않고 편집 상태를 비운다", () => {
      const fake = createFakeEditor();
      const { result, setEditing, applyCommand } = mountEditing(fake);
      act(() => fake.deleteBlock());
      setEditing.mockClear();

      act(() => {
        result.current.commit("b1", "원래 값");
      });

      expect(applyCommand).not.toHaveBeenCalled();
      expect(setEditing).toHaveBeenCalledWith(null);
    });

    it("접힘에 가려진 블록에 대한 commit은 applyCommand를 호출하지 않는다", () => {
      const { host, block, result, applyCommand } = mountEditing();
      const group = document.createElement("div");
      group.setAttribute("data-geul-collapsed-hidden", "");
      host.replaceChild(group, block);
      group.appendChild(block);

      act(() => {
        result.current.commit("b1", "원래 값");
      });

      expect(applyCommand).not.toHaveBeenCalled();
    });
  });
});
