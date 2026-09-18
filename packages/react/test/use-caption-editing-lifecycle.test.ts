// @vitest-environment jsdom

/**
 * useCaptionEditingLifecycle(media-captions.tsx/code-block-captions.tsx가
 * 복제하던 caption 편집 commit/cancel 상태 머신을 통합한 훅, 01-계획.md
 * "20260918-03-caption-editing-lifecycle")의 3계약을 renderHook으로
 * 검증한다(use-exclusive-overlay.test.ts와 동일 패턴 — JSX 없음): (a) cancel
 * 후 commit을 호출하면 applyCommand가 호출되지 않는다, (b) draft가
 * committedCaption과 같으면(dirty 아님) applyCommand가 호출되지 않는다,
 * (c) commit 호출 후 setEditing(null)이 호출된다(unmount cleanup 포함).
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useCaptionEditingLifecycle } from "../src/use-caption-editing-lifecycle.js";

type CaptionPayload = { blockId: string; draft: string };

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
      }),
    );
    expect(setEditing).not.toHaveBeenCalled();

    unmount();

    expect(setEditing).toHaveBeenCalledWith(null);
  });
});
