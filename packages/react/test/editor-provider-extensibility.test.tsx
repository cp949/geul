// @vitest-environment jsdom
/**
 * `EditorProviderProps`에 추가된 7개 R4 확장성 옵션(`customBlocks`/
 * `customInlineContent`/`customStyles`/`enabledBlockTypes`/`commands`/
 * `keyboardShortcuts`/`attributeOverrides`)이 `core.createEditor()`로 실제
 * threading되는지 검증한다(Issue #160). fake 컨트롤러가 아니라 실제
 * `createEditor()`를 `EditorProvider`+`EditorContent`로 jsdom에 마운트하는
 * 통합 테스트다 — 각 옵션의 core 레벨 registry 계약 자체(등록·JSON
 * round-trip 세부사항)는 `packages/core/test/*-registry.test.ts` 등이 이미
 * 고정하므로, 여기서는 "`EditorProvider`를 거쳐도 core까지 온전히
 * 도달해 같은 동작을 만드는지"만 확인한다.
 *
 * `commands`/`keyboardShortcuts`는 "01-계획.md"의 "## 결정" 1·2가 요구하는
 * 혼합 패턴(key 집합 마운트 고정 + 함수 본체 latest-ref, 마운트 후 key
 * 집합 변경은 경고 없이 무시)을 회귀로 고정한다.
 */
import type {
  CreateEditorOptions,
  CustomBlockDefinition,
  CustomInlineContentDefinition,
  CustomStyleDefinition,
  EditorController,
} from "@cp949/geul-core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorContent, EditorProvider, useEditor } from "../src/index.js";
import { queryMountedEditable } from "./query-mounted-editable.js";

afterEach(cleanup);

const paragraphDocument = (
  text: string,
): CreateEditorOptions["initialDocument"] => ({
  formatVersion: 1,
  revision: 0,
  blocks: [{ id: "block-1", type: "paragraph", content: [{ text }] }],
});

/** 테스트 본문에서 `useEditor()`로 얻은 컨트롤러를 캡처하는 공용 자식. */
const CaptureEditor = (props: {
  onCapture: (editor: EditorController) => void;
}) => {
  const editor = useEditor();
  props.onCapture(editor);
  return null;
};

// customBlocks 등록 계약 대상 fixture(RD-002-DELTA-11) —
// custom-block-registry.test.ts의 fixture와 동형 구조.
const widgetDefinition: CustomBlockDefinition = {
  render: ({ block }) => {
    const element = document.createElement("div");
    element.dataset.widget = "true";
    element.textContent = `widget:${block.id}`;
    return { element };
  },
};

// customInlineContent 등록 계약 대상 fixture(RD-002-DELTA-18).
const tagDefinition: CustomInlineContentDefinition = {
  render: ({ item }) => {
    const element = document.createElement("span");
    element.dataset.tag = "true";
    element.textContent = `tag:${item.customType}`;
    return element;
  },
};

// customStyles 등록 계약 대상 fixture(RD-002-DELTA-19).
const highlightDefinition: CustomStyleDefinition = {
  render: (value) => ({
    className: "highlight",
    style: {
      backgroundColor: (value.props?.color as string | undefined) ?? "yellow",
    },
  }),
};

describe("EditorProvider — customBlocks/customInlineContent/customStyles(EXT-001~003)", () => {
  it("셋을 EditorProvider로 등록하면 initialDocument의 각 인스턴스가 렌더되고 getDocument()가 그대로 재조회한다", () => {
    const initialDocument: CreateEditorOptions["initialDocument"] = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "block-1",
          type: "paragraph",
          content: [
            {
              text: "hi",
              marks: [{ type: "myHighlight", props: { color: "pink" } }],
            },
            { type: "custom", customType: "myTag", props: { label: "x" } },
          ],
        },
        {
          id: "widget-1",
          type: "myWidget",
          content: "none",
          props: { count: 3 },
        },
      ],
    };
    let controller: EditorController | undefined;

    render(
      <EditorProvider
        initialDocument={initialDocument}
        customBlocks={{ myWidget: widgetDefinition }}
        customInlineContent={{ myTag: tagDefinition }}
        customStyles={{ myHighlight: highlightDefinition }}
      >
        <CaptureEditor onCapture={(editor) => (controller = editor)} />
        <EditorContent />
      </EditorProvider>,
    );
    const host = screen.getByRole("textbox", { name: "Editor" });

    const widget = host.querySelector('[data-widget="true"]');
    expect(widget?.textContent).toBe("widget:widget-1");
    const tag = host.querySelector('[data-tag="true"]');
    expect(tag?.textContent).toBe("tag:myTag");
    const styled = host.querySelector(".highlight");
    expect((styled as HTMLElement | null)?.style.backgroundColor).toBe("pink");

    // TrailingBlockExtension이 마지막 블록이 paragraph가 아니면(myWidget)
    // 빈 paragraph를 자동으로 덧붙이므로(다른 core 테스트가 이미 고정한
    // characterization) 전체 배열이 아니라 등록한 두 블록만 id로 골라
    // 재조회 결과를 확인한다.
    const blocks = controller?.getDocument().blocks;
    expect(blocks?.find((block) => block.id === "block-1")).toEqual(
      initialDocument.blocks[0],
    );
    expect(blocks?.find((block) => block.id === "widget-1")).toEqual(
      initialDocument.blocks[1],
    );
  });

  it("customBlocks에 등록한 타입을 commands.insertCustomBlock으로 삽입하면 렌더되고 getDocument()에 반영된다", () => {
    let controller: EditorController | undefined;

    render(
      <EditorProvider
        initialDocument={paragraphDocument("seed")}
        customBlocks={{ myWidget: widgetDefinition }}
      >
        <CaptureEditor onCapture={(editor) => (controller = editor)} />
        <EditorContent />
      </EditorProvider>,
    );
    const host = screen.getByRole("textbox", { name: "Editor" });
    if (controller === undefined) throw new Error("컨트롤러 캡처 실패");

    const inserted = controller.commands.insertCustomBlock(
      "block-1",
      "myWidget",
      "none",
      { count: 5 },
    );
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;

    const rendered = host.querySelector(
      `[data-geul-block-id="${inserted.value.blockId}"]`,
    );
    expect(rendered?.textContent).toBe(`widget:${inserted.value.blockId}`);
    expect(
      controller
        .getDocument()
        .blocks.find((block) => block.id === inserted.value.blockId),
    ).toEqual({
      id: inserted.value.blockId,
      type: "myWidget",
      content: "none",
      props: { count: 5 },
    });
  });
});

describe("EditorProvider — enabledBlockTypes(EXT-004)", () => {
  it("deny로 비활성화한 타입은 EDITOR_FEATURE_UNAVAILABLE로 거절되고 문서가 바뀌지 않는다", () => {
    let controller: EditorController | undefined;

    render(
      <EditorProvider
        initialDocument={paragraphDocument("seed")}
        enabledBlockTypes={{ mode: "deny", types: ["quote"] }}
      >
        <CaptureEditor onCapture={(editor) => (controller = editor)} />
      </EditorProvider>,
    );
    if (controller === undefined) throw new Error("컨트롤러 캡처 실패");
    const before = controller.getDocument();

    const result = controller.replaceDocument({
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "p1", type: "paragraph", content: [{ text: "hi" }] },
        { id: "q1", type: "quote", content: [{ text: "nested" }] },
      ],
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "EDITOR_FEATURE_UNAVAILABLE",
        message: expect.stringContaining("quote"),
      },
    });
    expect(controller.getDocument()).toEqual(before);
  });
});

describe("EditorProvider — commands(EXT-005)", () => {
  it("등록한 함수가 runCustomCommand로 호출되고, 리렌더로 함수 본체가 바뀌면 최신 본체를 실행한다(latest-ref)", () => {
    let controller: EditorController | undefined;
    // 전달되는 editor 인자가 지연 바인딩 Proxy(controllerFacade,
    // editor-controller.ts:92-98)라 캡처한 controller와 참조 동일성이
    // 없다 — 실제 문서를 바꿔 기능적으로 검증한다(core의
    // editor-controller-custom-commands.test.ts와 동일 접근).
    const firstFn = vi.fn((ed: EditorController, text: unknown) =>
      ed.commands.setText("block-1", `first:${text as string}`),
    );
    const latestFn = vi.fn((ed: EditorController, text: unknown) =>
      ed.commands.setText("block-1", `latest:${text as string}`),
    );

    const view = render(
      <EditorProvider
        initialDocument={paragraphDocument("seed")}
        commands={{ myCmd: firstFn }}
      >
        <CaptureEditor onCapture={(editor) => (controller = editor)} />
      </EditorProvider>,
    );
    if (controller === undefined) throw new Error("컨트롤러 캡처 실패");

    expect(controller.runCustomCommand("myCmd", "a")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(controller.getDocument().blocks[0]).toMatchObject({
      content: [{ text: "first:a" }],
    });
    expect(latestFn).not.toHaveBeenCalled();

    view.rerender(
      <EditorProvider
        initialDocument={paragraphDocument("seed")}
        commands={{ myCmd: latestFn }}
      >
        <CaptureEditor onCapture={(editor) => (controller = editor)} />
      </EditorProvider>,
    );

    expect(controller.runCustomCommand("myCmd", "b")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(controller.getDocument().blocks[0]).toMatchObject({
      content: [{ text: "latest:b" }],
    });
    expect(firstFn).toHaveBeenCalledTimes(1);
    expect(latestFn).toHaveBeenCalledTimes(1);
  });

  it("마운트 후 commands에 새 key를 추가해도 경고 없이 조용히 무시된다(등록 key 집합은 마운트 시 고정)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    let controller: EditorController | undefined;
    const known = vi.fn(() => ({ ok: true, value: undefined }) as const);
    const added = vi.fn(() => ({ ok: true, value: undefined }) as const);

    const view = render(
      <EditorProvider
        initialDocument={paragraphDocument("seed")}
        commands={{ known }}
      >
        <CaptureEditor onCapture={(editor) => (controller = editor)} />
      </EditorProvider>,
    );
    if (controller === undefined) throw new Error("컨트롤러 캡처 실패");

    view.rerender(
      <EditorProvider
        initialDocument={paragraphDocument("seed")}
        commands={{ known, added }}
      >
        <CaptureEditor onCapture={(editor) => (controller = editor)} />
      </EditorProvider>,
    );

    expect(controller.runCustomCommand("added")).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "added" },
    });
    expect(added).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("마운트 후 commands에서 key를 제거해도 마지막으로 관측된 함수 본체를 계속 실행한다", () => {
    let controller: EditorController | undefined;
    const originalFn = vi.fn((ed: EditorController) =>
      ed.commands.setText("block-1", "원본"),
    );

    const view = render(
      <EditorProvider
        initialDocument={paragraphDocument("seed")}
        commands={{ myCmd: originalFn }}
      >
        <CaptureEditor onCapture={(editor) => (controller = editor)} />
      </EditorProvider>,
    );
    if (controller === undefined) throw new Error("컨트롤러 캡처 실패");

    // commands prop에서 myCmd 자체를 지운다 — key 집합은 마운트 시
    // 고정이라 core 등록은 그대로 남고, latestCommands는 갱신되지 않아
    // 마지막으로 관측된 originalFn을 계속 참조해야 한다.
    view.rerender(
      <EditorProvider initialDocument={paragraphDocument("seed")} commands={{}}>
        <CaptureEditor onCapture={(editor) => (controller = editor)} />
      </EditorProvider>,
    );

    expect(controller.runCustomCommand("myCmd")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(controller.getDocument().blocks[0]).toMatchObject({
      content: [{ text: "원본" }],
    });
    expect(originalFn).toHaveBeenCalledTimes(1);
  });
});

describe("EditorProvider — keyboardShortcuts(EXT-005)", () => {
  it("등록한 key가 실제 keydown에 반응하고, 리렌더로 함수 본체가 바뀌면 최신 본체를 실행한다(latest-ref)", () => {
    let controller: EditorController | undefined;
    // commands 테스트와 같은 이유(controllerFacade는 캡처한 controller와
    // 참조 동일성이 없다, custom-keyboard-shortcuts-extension.ts:58-82)로
    // 실제 문서를 바꿔 기능적으로 검증한다.
    const firstHandler = vi.fn((ed: EditorController) => {
      ed.commands.setText("block-1", "first");
      return true;
    });
    const latestHandler = vi.fn((ed: EditorController) => {
      ed.commands.setText("block-1", "latest");
      return true;
    });

    const view = render(
      <EditorProvider
        initialDocument={paragraphDocument("seed")}
        keyboardShortcuts={{ F13: firstHandler }}
      >
        <CaptureEditor onCapture={(editor) => (controller = editor)} />
        <EditorContent />
      </EditorProvider>,
    );
    const host = screen.getByRole("textbox", { name: "Editor" });
    const editable = queryMountedEditable(host);
    editable.focus();

    editable.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "F13",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(controller?.getDocument().blocks[0]).toMatchObject({
      content: [{ text: "first" }],
    });

    view.rerender(
      <EditorProvider
        initialDocument={paragraphDocument("seed")}
        keyboardShortcuts={{ F13: latestHandler }}
      >
        <CaptureEditor onCapture={(editor) => (controller = editor)} />
        <EditorContent />
      </EditorProvider>,
    );

    editable.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "F13",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(latestHandler).toHaveBeenCalledTimes(1);
    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(controller?.getDocument().blocks[0]).toMatchObject({
      content: [{ text: "latest" }],
    });
  });

  it("마운트 후 keyboardShortcuts에 새 key를 추가해도 경고 없이 조용히 무시된다(등록 key 집합은 마운트 시 고정)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const known = vi.fn(() => true);
    const added = vi.fn(() => true);

    const view = render(
      <EditorProvider
        initialDocument={paragraphDocument("seed")}
        keyboardShortcuts={{ F13: known }}
      >
        <EditorContent />
      </EditorProvider>,
    );
    const host = screen.getByRole("textbox", { name: "Editor" });
    const editable = queryMountedEditable(host);
    editable.focus();

    view.rerender(
      <EditorProvider
        initialDocument={paragraphDocument("seed")}
        keyboardShortcuts={{ F13: known, F14: added }}
      >
        <EditorContent />
      </EditorProvider>,
    );

    editable.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "F14",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(added).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("마운트 후 keyboardShortcuts에서 key를 제거해도 마지막으로 관측된 함수 본체가 keydown에 반응한다", () => {
    let controller: EditorController | undefined;
    const originalHandler = vi.fn((ed: EditorController) => {
      ed.commands.setText("block-1", "원본");
      return true;
    });

    const view = render(
      <EditorProvider
        initialDocument={paragraphDocument("seed")}
        keyboardShortcuts={{ F13: originalHandler }}
      >
        <CaptureEditor onCapture={(editor) => (controller = editor)} />
        <EditorContent />
      </EditorProvider>,
    );
    const host = screen.getByRole("textbox", { name: "Editor" });
    const editable = queryMountedEditable(host);
    editable.focus();

    // keyboardShortcuts prop에서 F13 자체를 지운다 — key 집합은 마운트
    // 시 고정이라 core keymap 등록은 그대로 남고, latestKeyboardShortcuts는
    // 갱신되지 않아 마지막으로 관측된 originalHandler를 계속 참조해야 한다.
    view.rerender(
      <EditorProvider
        initialDocument={paragraphDocument("seed")}
        keyboardShortcuts={{}}
      >
        <CaptureEditor onCapture={(editor) => (controller = editor)} />
        <EditorContent />
      </EditorProvider>,
    );

    editable.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "F13",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(originalHandler).toHaveBeenCalledTimes(1);
    expect(controller?.getDocument().blocks[0]).toMatchObject({
      content: [{ text: "원본" }],
    });
  });
});

describe("EditorProvider — dictionary(EXT-009)", () => {
  it("override 시 EditorContent의 접근 가능한 이름이 override 값으로 바뀐다", () => {
    render(
      <EditorProvider
        initialDocument={paragraphDocument("seed")}
        dictionary={{
          placeholder: {
            paragraph: "Enter text or type '/' for commands",
            heading: "Heading {level}",
            quote: "Quote",
            codeBlock: "Code",
            listItem: "List item",
          },
          editor: { ariaLabel: "편집기" },
        }}
      >
        <EditorContent />
      </EditorProvider>,
    );

    expect(screen.getByRole("textbox", { name: "편집기" })).not.toBeNull();
    expect(screen.queryByRole("textbox", { name: "Editor" })).toBeNull();
  });

  it('dictionary 미지정 시 기본값(en) "Editor"가 그대로 쓰인다', () => {
    let controller: EditorController | undefined;

    render(
      <EditorProvider initialDocument={paragraphDocument("seed")}>
        <CaptureEditor onCapture={(editor) => (controller = editor)} />
        <EditorContent />
      </EditorProvider>,
    );

    expect(screen.getByRole("textbox", { name: "Editor" })).not.toBeNull();
    expect(controller?.getDictionary().editor.ariaLabel).toBe("Editor");
  });
});

describe("EditorProvider — attributeOverrides(EXT-008)", () => {
  it("editor/blockContainer/blockGroup 3개 역할이 렌더된 DOM에 반영된다", () => {
    const nestedDocument: CreateEditorOptions["initialDocument"] = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "parent",
          type: "paragraph",
          content: [{ text: "부모" }],
          children: [
            { id: "child", type: "paragraph", content: [{ text: "자식" }] },
          ],
        },
      ],
    };

    render(
      <EditorProvider
        initialDocument={nestedDocument}
        attributeOverrides={{
          editor: { "data-color-scheme": "dark" },
          blockContainer: { "data-consumer-container": "yes" },
          blockGroup: { "data-consumer-group": "yes" },
        }}
      >
        <EditorContent />
      </EditorProvider>,
    );
    const host = screen.getByRole("textbox", { name: "Editor" });
    const editable = queryMountedEditable(host);

    expect(editable.getAttribute("data-color-scheme")).toBe("dark");
    const container = host.querySelector("[data-geul-block-id]");
    expect(container?.getAttribute("data-consumer-container")).toBe("yes");
    const group = host.querySelector("[data-geul-block-group]");
    expect(group?.getAttribute("data-consumer-group")).toBe("yes");
  });
});
