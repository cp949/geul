/**
 * `CreateEditorOptions.attributeOverrides.editor` 계약 테스트(spec §7,
 * R4 슬라이스5 RD-002-DELTA-01, EXT-008). readiness probe로 확인한 대로
 * `.geul-editor`(React 마운트 호스트)가 아니라 ProseMirror가 실제로 만드는
 * 편집 가능 DOM(`[contenteditable]`)이 대상이다.
 *
 * class 병합(공백 join)은 ProseMirror의 computeDocDeco()가 이미 네이티브로
 * 구현한다(`attrs.class = "ProseMirror"` 뒤에 소비자 class를 공백으로
 * 이어붙임 — Tiptap이 그 앞에 자기 "tiptap" 클래스를 한 번 더 prepend해
 * 최종 className은 "tiptap ProseMirror <소비자 class>"다, 실측 확인) — 이
 * 테스트는 우리 배선이 그 경로(editorProps.attributes)를 올바르게 타는지만
 * 고정한다.
 */
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import {
  mountTiptapEditor,
  paragraphDocument,
} from "./editor-controller-support.js";

describe("attributeOverrides.editor", () => {
  it("지정하지 않으면 편집 가능 DOM에 PM 기본 attribute만 있다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { editable } = mountTiptapEditor(editor);

    expect(editable.className).toBe("tiptap ProseMirror");
    expect(editable.getAttribute("role")).toBe("textbox");
    expect(editable.getAttribute("data-color-scheme")).toBeNull();
  });

  it("지정하면 편집 가능 DOM에 반영되고 class는 PM 기본값과 공백으로 병합된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      attributeOverrides: {
        editor: { "data-color-scheme": "dark", class: "consumer-theme" },
      },
    });
    const { editable } = mountTiptapEditor(editor);

    expect(editable.getAttribute("data-color-scheme")).toBe("dark");
    expect(editable.className).toBe("tiptap ProseMirror consumer-theme");
  });

  it("replaceDocument()로 재구성돼도 override가 유지된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("before"),
      attributeOverrides: { editor: { "data-color-scheme": "dark" } },
    });
    const container = document.createElement("div");
    editor.mount(container);

    expect(editor.replaceDocument(paragraphDocument("after"))).toEqual({
      ok: true,
      value: undefined,
    });

    const editable = container.querySelector<HTMLElement>(
      "[contenteditable='true']",
    );
    expect(editable?.getAttribute("data-color-scheme")).toBe("dark");

    editor.destroy();
  });
});
