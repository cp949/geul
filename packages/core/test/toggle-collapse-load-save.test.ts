/**
 * toggleListItem의 collapsed가 production 편집기 경로(등록·load/save round
 * trip·DOM 표시 숨김)에서 어떤 계약을 받는지 검증한다(spec §4.4, Issue #38
 * 슬라이스 6 RD-003 완료 조건 5-7). collapsed: true인 블록의 자식은 편집기
 * DOM에서만 숨겨지고 저장 문서의 children은 그대로 남는다 — 표시 숨김이지
 * 데이터 삭제가 아니다. React 컴포넌트·사용자 커맨드는 이 파일이 다루는
 * 범위가 아니다(RD-004).
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  documentOf,
  liveSchema,
  mountTiptapEditor,
  paragraphDocument,
} from "./editor-controller-support.js";

/**
 * collapsed toggleListItem·visible toggleListItem·tail 문단을 나란히 둔
 * 문서. collapsed 항목만 자식이 숨겨지는지를 같은 문서 안에서 대조한다.
 */
const toggleListItemDocument = (): Document =>
  documentOf(
    {
      id: "toggle-collapsed",
      type: "toggleListItem",
      collapsed: true,
      content: [{ text: "collapsed toggle" }],
      children: [
        {
          id: "toggle-collapsed-child",
          type: "paragraph",
          content: [{ text: "hidden child" }],
        },
      ],
    },
    {
      id: "toggle-visible",
      type: "toggleListItem",
      content: [{ text: "visible toggle" }],
      children: [
        {
          id: "toggle-visible-child",
          type: "paragraph",
          content: [{ text: "visible child" }],
        },
      ],
    },
    { id: "tail", type: "paragraph", content: [{ text: "tail" }] },
  );

describe("production 스키마 등록", () => {
  it("toggleListItem node가 collapsed 속성과 함께 등록되고 외부 parse는 열지 않는다", () => {
    const schema = liveSchema();
    const toggle = schema.nodes.toggleListItem;
    if (toggle === undefined) throw new Error("toggleListItem node가 없다");

    expect(Object.keys(toggle.spec.attrs ?? {})).toEqual(["collapsed"]);
    expect(toggle.create().attrs).toEqual({ collapsed: null });
    expect(toggle.spec.parseDOM ?? []).toEqual([]);
  });
});

describe("createEditor round trip", () => {
  it("toggleListItem의 collapsed·content·children이 getDocument()에 그대로 보존된다", () => {
    const editor = createEditor({
      initialDocument: toggleListItemDocument(),
    });
    try {
      expect(editor.getDocument()).toEqual(toggleListItemDocument());
    } finally {
      editor.destroy();
    }
  });
});

describe("collapsed DOM 숨김(완료 조건 6·7)", () => {
  it("collapsed: true인 toggleListItem의 자식 blockGroup만 DOM에서 숨겨지고 저장 children은 유지된다", () => {
    const editor = createEditor({
      initialDocument: toggleListItemDocument(),
    });
    try {
      const { editable } = mountTiptapEditor(editor);

      const hiddenGroup = editable.querySelector(
        '[data-geul-block-id="toggle-collapsed"] > [data-geul-block-group]',
      );
      expect(hiddenGroup).not.toBeNull();
      expect(getComputedStyle(hiddenGroup as Element).display).toBe("none");
      expect(
        editable.querySelector('[data-geul-block-id="toggle-collapsed-child"]'),
      ).not.toBeNull();

      const visibleGroup = editable.querySelector(
        '[data-geul-block-id="toggle-visible"] > [data-geul-block-group]',
      );
      expect(visibleGroup).not.toBeNull();
      expect(getComputedStyle(visibleGroup as Element).display).not.toBe(
        "none",
      );

      expect(editor.getDocument()).toEqual(toggleListItemDocument());
    } finally {
      editor.destroy();
    }
  });

  it("replaceDocument로 collapsed: true 문서를 로드해도 같은 DOM 숨김·데이터 보존 계약이 적용된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("이전"),
    });
    try {
      expect(editor.replaceDocument(toggleListItemDocument())).toEqual({
        ok: true,
        value: undefined,
      });
      const { editable } = mountTiptapEditor(editor);

      const hiddenGroup = editable.querySelector(
        '[data-geul-block-id="toggle-collapsed"] > [data-geul-block-group]',
      );
      expect(getComputedStyle(hiddenGroup as Element).display).toBe("none");

      expect(editor.getDocument()).toEqual({
        ...toggleListItemDocument(),
        revision: 1,
      });
    } finally {
      editor.destroy();
    }
  });
});

describe("caret 컨텍스트가 toggleListItem을 보고한다(RD-004 DELTA-04)", () => {
  it("toggleListItem 안 캐럿에서 getCaretBlockContext가 toggleListItem descriptor를 보고한다", () => {
    const editor = createEditor({ initialDocument: toggleListItemDocument() });
    try {
      const { tiptap } = mountTiptapEditor(editor);
      tiptap.commands.setTextSelection(
        contentTextStart(tiptap, "toggle-visible"),
      );

      expect(editor.getCaretBlockContext()?.blockType).toEqual({
        type: "toggleListItem",
      });
    } finally {
      editor.destroy();
    }
  });
});
