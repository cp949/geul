// @vitest-environment jsdom

/**
 * LinkToolbar의 view 모드와 편집 모드 닫힘이 useDismissibleOverlay를 거치는
 * 계약을 확인한다(Issue #233, RD-003 DELTA-02).
 * - 동작 변경 4: 편집 모드가 바깥 클릭으로 닫힌다. 입력 중이던 초안은 버려진다.
 *   바깥 클릭은 재오픈 억제를 기록하지 않는다.
 * - 동작 변경 2: 서식 툴바와 링크 툴바(view)가 함께 열린 채 Escape는 나중에 열린
 *   하나만 닫는다. 열림 순서는 순차 마운트로 고정하고 양방향을 본다.
 * - view↔편집 모드 전환은 스택 위치를 바꾸지 않는다.
 * - 편집 모드에서 입력이 아닌 Save·Cancel 버튼에 초점이 있어도 Escape가 닫는다.
 *   URL 입력의 Escape는 handleMenuKeyDown이 소비해 이중 닫힘이 없다.
 * - 편집기가 먼저 막은 Escape는 닫고, 편집기 밖에서 막힌 Escape와 IME 조합 중
 *   Escape는 닫지 않는다.
 * - 바깥 클릭 때 초점이 툴바 안이면 편집기로 옮기고, 밖이면 그대로 둔다.
 * - DOM selection이 편집기 밖이면 view를 열지 않고, 열려 있으면 닫는다. 활성 링크가
 *   남아 있어도 같다. 단 초점이 툴바 안이면 닫지 않는다(Issue #282).
 * 기존 link-toolbar.test.tsx 단언은 이전 후에도 수정 없이 통과한다.
 * 편집기 안 Escape를 ProseMirror가 막는 경로는 jsdom이 재현하지 못해
 * e2e/link-toolbar.spec.ts가 소유한다.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { EditorController } from "@cp949/geul-core";
import type { FC } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorContent, FormattingToolbar, LinkToolbar } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { fakeController as fakeFormattingController } from "./formatting-toolbar-test-support.js";
import { mountBlockEditor } from "./mount-editor.js";
import { queryMountedEditable } from "./query-mounted-editable.js";
import {
  collapseSelection,
  fireSelectionChange,
  selectText,
} from "./selection-events.js";

afterEach(cleanup);

const EXISTING_HREF = "https://old.example.com";

/**
 * 서식 툴바와 링크 툴바를 함께 그릴 수 있는 fake controller를 만든다.
 * 서식 툴바 fake에 링크 조회·명령을 더한다. `href`가 null이면 활성 링크가
 * 없는 선택이다.
 */
const fakeController = (href: string | null = null) => {
  const base = fakeFormattingController();
  return {
    ...base,
    getSelectionLink: vi.fn(() => (href === null ? null : { href })),
    commands: {
      ...base.commands,
      setLink: vi.fn(() => ({ ok: true })),
      unsetLink: vi.fn(() => ({ ok: true, value: undefined })),
    },
  };
};

type Controller = ReturnType<typeof fakeController>;

/**
 * 링크 툴바만 그리고 첫 문장을 선택해 view 모드로 연다. 편집 영역을 함께
 * 돌려준다.
 */
const openLinkToolbar = (controller: Controller = fakeController()) => {
  render(
    withProvider(
      controller,
      <>
        <LinkToolbar />
        <EditorContent />
      </>,
    ),
  );
  const host = screen.getByRole("textbox", { name: "Editor" });
  const textNode = host.firstChild?.firstChild;
  if (!textNode) throw new Error("Text node was not rendered");
  selectText(textNode, 0, 8);
  expect(linkToolbarVisible()).toBe(true);
  return { controller, editable: queryMountedEditable(host) };
};

/**
 * 편집 모드까지 연다. view에서 Add link(활성 링크가 있으면 Edit link)를
 * 누른다. 초점은 URL 입력으로 간다.
 */
const openLinkEditing = (controller: Controller = fakeController()) => {
  const opened = openLinkToolbar(controller);
  fireEvent.click(
    screen.getByRole("button", {
      name: controller.getSelectionLink() === null ? "Add link" : "Edit link",
    }),
  );
  expect(screen.queryByRole("textbox", { name: "Link URL" })).not.toBeNull();
  return opened;
};

/** 링크 툴바가 떠 있는지 본다. */
const linkToolbarVisible = () =>
  screen.queryByRole("toolbar", { name: "Link" }) !== null;

/** 서식 툴바가 떠 있는지 본다. */
const formattingToolbarVisible = () =>
  screen.queryByRole("toolbar", { name: "Formatting" }) !== null;

/**
 * 편집 영역 밖 입력을 만든다. 호출부가 `remove()`로 치운다.
 * 초점은 주지 않는다. 테스트가 초점 위치를 정한다.
 */
const createOutsideInput = () => {
  const input = document.createElement("input");
  document.body.append(input);
  return input;
};

/**
 * 처음 선택과 같은 범위(첫 8글자)를 다시 선택해 알린다. jsdom은 입력에 초점을
 * 주면 DOM selection을 입력으로 옮겨 버려 selection이 남지 않는다. 같은 범위를
 * 세워 "같은 selection 재관측"을 만든다.
 */
const reselectFirstSentence = () => {
  const host = screen.getByRole("textbox", { name: "Editor" });
  const textNode = host.firstChild?.firstChild;
  if (!textNode) throw new Error("Text node was not rendered");
  selectText(textNode, 0, 8);
};

/**
 * 편집 모드를 닫은 뒤 `updateFromSelection`을 막아 둔 `editingRef`를 푸는
 * `setTimeout`을 흘려보낸다. 컴포넌트의 타이머가 먼저 등록돼 있어 같은
 * 지연의 이 타이머보다 앞서 실행된다. 고정 sleep이 아니다.
 */
const flushEditingGuard = () =>
  act(
    () =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      }),
  );

type ToolbarKind = "formatting" | "link";

/**
 * 서식 툴바와 링크 툴바의 열림 순서를 `first` → 나머지로 만든다. `first`만 그려
 * 선택으로 열고, 그다음 나머지를 `rerender`로 더해 나중에 열리게 한다.
 * JSX 순서는 `jsxOrder`로 열림 순서와 따로 정한다. 기본값은 열림 순서와 같다.
 * 한 번에 마운트하면 같은 커밋의 effect가 JSX 순서로 돌아 열림 순서가 JSX 순서가
 * 된다. 그래서 이 헬퍼는 열림 순서와 JSX 순서가 같은 호출만으로는 순차 마운트와
 * 한 번에 마운트를 구별하지 못한다. 구별은 JSX 순서가 열림 순서와 반대인 호출이
 * 맡는다.
 */
const mountSequentially = (
  first: ToolbarKind,
  jsxOrder: readonly [ToolbarKind, ToolbarKind] = first === "formatting"
    ? ["formatting", "link"]
    : ["link", "formatting"],
  controller: Controller = fakeController(),
) => {
  const slot = (kind: ToolbarKind, laterShown: boolean) => {
    if (kind !== first && !laterShown) return null;
    return kind === "formatting" ? <FormattingToolbar /> : <LinkToolbar />;
  };
  const tree = (laterShown: boolean) =>
    withProvider(
      controller,
      <>
        {slot(jsxOrder[0], laterShown)}
        {slot(jsxOrder[1], laterShown)}
        <EditorContent />
      </>,
    );
  const view = render(tree(false));
  const host = screen.getByRole("textbox", { name: "Editor" });
  const textNode = host.firstChild?.firstChild;
  if (!textNode) throw new Error("Text node was not rendered");
  selectText(textNode, 0, 8);
  expect(
    first === "formatting" ? formattingToolbarVisible() : linkToolbarVisible(),
  ).toBe(true);

  view.rerender(tree(true));
  expect(formattingToolbarVisible()).toBe(true);
  expect(linkToolbarVisible()).toBe(true);
  return { controller, editable: queryMountedEditable(host) };
};

describe("LinkToolbar 편집 모드 바깥 클릭이 useDismissibleOverlay를 거친다(Issue #233 RD-003 DELTA-02)", () => {
  it("동작 변경 4: 편집 모드에서 바깥을 누르면 툴바가 닫히고 입력 중이던 초안은 버려진다", async () => {
    const controller = fakeController(EXISTING_HREF);
    openLinkEditing(controller);
    fireEvent.change(screen.getByRole("textbox", { name: "Link URL" }), {
      target: { value: "https://new.example.com" },
    });
    const outside = createOutsideInput();
    try {
      // 초점이 편집기 밖에 있는 상태에서 누른다. 편집기에 초점이 있으면 공허하다.
      outside.focus();

      fireEvent.pointerDown(outside);

      expect(linkToolbarVisible()).toBe(false);
      expect(screen.queryByRole("textbox", { name: "Link URL" })).toBeNull();
      expect(controller.commands.setLink).not.toHaveBeenCalled();

      // 같은 selection이 재관측되면 view가 다시 열린다. 초안은 남지 않는다.
      await flushEditingGuard();
      reselectFirstSentence();
      expect(linkToolbarVisible()).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Edit link" }));
      const input = screen.getByRole<HTMLInputElement>("textbox", {
        name: "Link URL",
      });
      expect(input.value).toBe(EXISTING_HREF);
    } finally {
      outside.remove();
    }
  });

  it("편집 모드 바깥 클릭은 재오픈 억제를 기록하지 않아 같은 selection이 재관측되면 view가 다시 열린다", async () => {
    openLinkEditing();
    const outside = createOutsideInput();
    try {
      outside.focus();
      fireEvent.pointerDown(outside);
      expect(linkToolbarVisible()).toBe(false);

      await flushEditingGuard();
      reselectFirstSentence();

      expect(linkToolbarVisible()).toBe(true);
      expect(screen.queryByRole("button", { name: "Add link" })).not.toBeNull();
    } finally {
      outside.remove();
    }
  });

  it("편집 모드를 바깥 클릭으로 닫으면 editingRef가 풀려 이후 selection 변화가 다시 반영된다", async () => {
    openLinkEditing();
    const outside = createOutsideInput();
    try {
      outside.focus();
      fireEvent.pointerDown(outside);
      expect(linkToolbarVisible()).toBe(false);

      // 풀지 않으면 updateFromSelection이 영구히 막혀 view가 다시 열리지 않는다.
      await flushEditingGuard();
      const host = screen.getByRole("textbox", { name: "Editor" });
      const textNode = host.firstChild?.firstChild;
      if (!textNode) throw new Error("Text node was not rendered");
      selectText(textNode, 1, 5);

      expect(linkToolbarVisible()).toBe(true);
    } finally {
      outside.remove();
    }
  });

  it("편집 모드 바깥 클릭 때 초점이 URL 입력에 있으면 편집기로 옮긴다", () => {
    const { editable } = openLinkEditing();
    // 편집 모드 진입이 초점을 URL 입력으로 옮긴다. 처음부터 편집기면 공허하다.
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Link URL" }),
    );
    const outside = createOutsideInput();
    try {
      fireEvent.pointerDown(outside);

      expect(linkToolbarVisible()).toBe(false);
      expect(document.activeElement).toBe(editable);
    } finally {
      outside.remove();
    }
  });
});

describe("LinkToolbar 편집 모드 Escape가 useDismissibleOverlay를 거친다(Issue #233 RD-003 DELTA-02)", () => {
  it("편집 모드에서 Cancel 버튼에 초점이 있어도 Escape가 툴바를 닫는다", () => {
    const { editable } = openLinkEditing();
    const cancel = screen.getByRole("button", { name: "Cancel link edit" });
    cancel.focus();
    expect(document.activeElement).toBe(cancel);

    fireEvent.keyDown(cancel, { key: "Escape" });

    expect(linkToolbarVisible()).toBe(false);
    expect(document.activeElement).toBe(editable);
  });

  it("편집 모드에서 Save 버튼에 초점이 있어도 Escape가 툴바를 닫고 링크를 저장하지 않는다", () => {
    const { controller } = openLinkEditing();
    const save = screen.getByRole("button", { name: "Save link" });
    save.focus();

    fireEvent.keyDown(save, { key: "Escape" });

    expect(linkToolbarVisible()).toBe(false);
    expect(controller.commands.setLink).not.toHaveBeenCalled();
  });

  it("편집 모드를 Escape로 닫은 뒤 editingRef가 풀리고 억제도 남지 않아 selection 재관측이 다시 반영된다", async () => {
    openLinkEditing();
    const cancel = screen.getByRole("button", { name: "Cancel link edit" });

    fireEvent.keyDown(cancel, { key: "Escape" });
    expect(linkToolbarVisible()).toBe(false);

    await flushEditingGuard();
    // 편집 모드 Escape는 재오픈 억제를 기록하지 않는다. 같은 selection이 재관측되면
    // view가 다시 열린다.
    reselectFirstSentence();
    expect(linkToolbarVisible()).toBe(true);
    const host = screen.getByRole("textbox", { name: "Editor" });
    const textNode = host.firstChild?.firstChild;
    if (!textNode) throw new Error("Text node was not rendered");
    selectText(textNode, 1, 5);

    expect(linkToolbarVisible()).toBe(true);
  });
});

describe("LinkToolbar view 모드 Escape·바깥 클릭이 useDismissibleOverlay를 거친다(Issue #233 RD-003 DELTA-02)", () => {
  it("편집기 밖에서 이미 preventDefault된 Escape는 view 툴바를 닫지 않는다", () => {
    openLinkToolbar();
    const outside = createOutsideInput();
    try {
      outside.focus();
      outside.addEventListener("keydown", (event) => event.preventDefault());

      fireEvent.keyDown(outside, { key: "Escape" });

      expect(linkToolbarVisible()).toBe(true);
    } finally {
      outside.remove();
    }
  });

  it("IME 조합 중 Escape는 view 툴바를 닫지 않고 조합이 끝난 뒤 Escape는 닫는다", () => {
    openLinkToolbar();

    fireEvent.keyDown(document, { key: "Escape", isComposing: true });
    expect(linkToolbarVisible()).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(linkToolbarVisible()).toBe(false);
  });

  it("view 바깥 클릭 때 초점이 툴바 안이면 편집기로 옮긴다", () => {
    const { editable } = openLinkToolbar();
    // 초점이 처음부터 편집기에 있으면 단언이 공허해진다. 툴바 버튼에 둔다.
    const addLink = screen.getByRole("button", { name: "Add link" });
    addLink.focus();
    expect(document.activeElement).toBe(addLink);
    const outside = createOutsideInput();
    try {
      fireEvent.pointerDown(outside);

      expect(linkToolbarVisible()).toBe(false);
      expect(document.activeElement).toBe(editable);
    } finally {
      outside.remove();
    }
  });
});

describe("옛 훅과 같은 결과를 내는 LinkToolbar 회귀 가드(Issue #233 RD-003 DELTA-02)", () => {
  // 이 describe의 테스트는 옛 훅에서도 통과한다. module 경유를 증명하지 않고 이전
  // 전후로 닫힘 계약이 같음을 잠근다. module 경유 증명은 위 describe들이 맡는다.
  it("URL 입력의 Escape는 이중 닫힘 없이 한 번만 닫고 편집기로 초점을 한 번만 보낸다", () => {
    const { editable } = openLinkEditing();
    const focusSpy = vi.spyOn(editable, "focus").mockImplementation(() => {});

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Link URL" }), {
      key: "Escape",
    });

    expect(linkToolbarVisible()).toBe(false);
    // handleMenuKeyDown이 소비한 키를 module이 건너뛰면 1번이고, 둘 다
    // 닫으면 2번이다.
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it("편집 모드에서 툴바 안(URL 입력·Save)을 눌러도 닫히지 않는다", () => {
    openLinkEditing();

    fireEvent.pointerDown(screen.getByRole("textbox", { name: "Link URL" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Save link" }));

    expect(linkToolbarVisible()).toBe(true);
    expect(screen.queryByRole("textbox", { name: "Link URL" })).not.toBeNull();
  });

  it("편집기가 Escape를 먼저 preventDefault해도 view 툴바가 닫힌다", () => {
    const { editable } = openLinkToolbar();
    // ProseMirror editHandlers.keydown이 편집기 안의 Escape를 막는 것을 흉내 낸다.
    const consume = (event: Event) => event.preventDefault();
    editable.addEventListener("keydown", consume);
    try {
      fireEvent.keyDown(editable, { key: "Escape" });
    } finally {
      editable.removeEventListener("keydown", consume);
    }

    expect(linkToolbarVisible()).toBe(false);
  });

  it("view 바깥 클릭은 재오픈 억제를 기록하지 않아 같은 selection이 재관측되면 다시 열린다", () => {
    openLinkToolbar();
    const outside = createOutsideInput();
    try {
      outside.focus();
      fireEvent.pointerDown(outside);
      expect(linkToolbarVisible()).toBe(false);

      // Escape와 달리 바깥 클릭은 억제를 남기지 않는다.
      reselectFirstSentence();

      expect(linkToolbarVisible()).toBe(true);
    } finally {
      outside.remove();
    }
  });

  it("view 바깥 클릭 때 초점이 이미 편집기 밖이면 그대로 둔다", () => {
    openLinkToolbar();
    const outside = createOutsideInput();
    try {
      outside.focus();

      fireEvent.pointerDown(outside);

      expect(linkToolbarVisible()).toBe(false);
      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });
});

describe("서식 툴바와 링크 툴바가 함께 열려도 Escape는 나중에 열린 하나만 닫는다(Issue #233 RD-003 DELTA-02)", () => {
  it("동작 변경 2: 서식 툴바가 먼저, 링크 툴바가 나중에 열렸으면 Escape 한 번에 링크 툴바만 닫히고 두 번째에 서식 툴바가 닫힌다", () => {
    mountSequentially("formatting");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(linkToolbarVisible()).toBe(false);
    expect(formattingToolbarVisible()).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(formattingToolbarVisible()).toBe(false);
  });

  it("동작 변경 2: 링크 툴바가 먼저, 서식 툴바가 나중에 열렸으면 Escape 한 번에 서식 툴바만 닫히고 두 번째에 링크 툴바가 닫힌다", () => {
    mountSequentially("link");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(formattingToolbarVisible()).toBe(false);
    expect(linkToolbarVisible()).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(linkToolbarVisible()).toBe(false);
  });

  it("동작 변경 2: JSX에서는 링크 툴바가 앞이어도 서식 툴바가 먼저 열렸으면 Escape 한 번에 링크 툴바만 닫힌다", () => {
    // 한 번에 마운트하면 JSX 뒤쪽인 서식 툴바가 나중에 열려 먼저 닫힌다.
    mountSequentially("formatting", ["link", "formatting"]);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(linkToolbarVisible()).toBe(false);
    expect(formattingToolbarVisible()).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(formattingToolbarVisible()).toBe(false);
  });

  it("동작 변경 2: JSX에서는 서식 툴바가 앞이어도 링크 툴바가 먼저 열렸으면 Escape 한 번에 서식 툴바만 닫힌다", () => {
    // 한 번에 마운트하면 JSX 뒤쪽인 링크 툴바가 나중에 열려 먼저 닫힌다.
    mountSequentially("link", ["formatting", "link"]);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(formattingToolbarVisible()).toBe(false);
    expect(linkToolbarVisible()).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(linkToolbarVisible()).toBe(false);
  });

  it("링크 툴바가 view에서 편집 모드로 바뀌어도 스택 위치가 유지돼 Escape가 나중에 열린 서식 툴바를 먼저 닫는다", () => {
    mountSequentially("link");
    // click만 보내 pointerdown 바깥 클릭 없이 모드만 바꾼다.
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    expect(screen.queryByRole("textbox", { name: "Link URL" })).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(formattingToolbarVisible()).toBe(false);
    expect(screen.queryByRole("textbox", { name: "Link URL" })).not.toBeNull();

    // 편집 모드도 스택에 있어 서식 툴바가 사라진 뒤에는 이쪽이 닫힌다.
    fireEvent.keyDown(document, { key: "Escape" });

    expect(linkToolbarVisible()).toBe(false);
  });
});

describe("LinkToolbar는 DOM selection이 편집기 밖이면 열지 않고 닫는다(Issue #282)", () => {
  const LINK_TEXT = "링크 본문";

  /**
   * 링크 문단 하나를 실제 편집기로 마운트한다. 활성 링크는 `getSelectionLink`
   * 스파이로 고정한다. 실제 selection이 링크 안인지는 이 테스트의 관심사가 아니다.
   * 관심사는 활성 링크가 있는데 DOM selection이 편집기 밖인 상태다.
   */
  const mountLinkEditor = (component?: FC<{ editor: EditorController }>) => {
    const mounted = mountBlockEditor({
      initialBlocks: [
        {
          id: "block-1",
          type: "paragraph",
          content: [
            { text: LINK_TEXT, marks: [{ type: "link", href: EXISTING_HREF }] },
          ],
        },
      ],
      children:
        component === undefined ? (
          <LinkToolbar />
        ) : (
          <LinkToolbar component={component} />
        ),
    });
    const getSelectionLink = vi
      .spyOn(mounted.editor, "getSelectionLink")
      .mockReturnValue({ href: EXISTING_HREF });
    const textNode = mounted.editable.querySelector("a")?.firstChild;
    if (!textNode) throw new Error("링크 text node가 렌더되지 않았다");
    return { ...mounted, getSelectionLink, textNode };
  };

  /** 편집기 밖에 텍스트가 든 요소를 만든다. 호출부가 `remove()`로 치운다. */
  const createOutsideText = () => {
    const outside = document.createElement("p");
    outside.textContent = "편집기 밖 문장";
    document.body.append(outside);
    return outside;
  };

  it("단위 1: 활성 링크가 있어도 DOM selection이 편집기 밖이면 view를 열지 않는다", async () => {
    const { getSelectionLink } = mountLinkEditor();
    const outside = createOutsideText();
    try {
      // 선택이 없는 상태(rangeCount 0)와 편집기 밖 텍스트 선택을 모두 본다.
      collapseSelection();
      expect(getSelectionLink()).not.toBeNull();
      expect(linkToolbarVisible()).toBe(false);

      const outsideText = outside.firstChild;
      if (!outsideText) throw new Error("바깥 text node가 없다");
      selectText(outsideText, 0, 3);

      expect(getSelectionLink()).not.toBeNull();
      expect(linkToolbarVisible()).toBe(false);
      // jsdom이 늦게 큐잉한 selectionchange를 act 안에서 소화한다.
      await flushEditingGuard();
      expect(linkToolbarVisible()).toBe(false);
    } finally {
      outside.remove();
    }
  });

  it("단위 2: view가 열린 뒤 DOM selection이 편집기 밖으로 가면 활성 링크가 남아 있어도 닫힌다", async () => {
    const { getSelectionLink, textNode } = mountLinkEditor();
    selectText(textNode, 1, 1);
    expect(linkToolbarVisible()).toBe(true);
    const outside = createOutsideText();
    try {
      const outsideText = outside.firstChild;
      if (!outsideText) throw new Error("바깥 text node가 없다");

      selectText(outsideText, 0, 3);

      expect(getSelectionLink()).not.toBeNull();
      expect(linkToolbarVisible()).toBe(false);

      // 편집기 안으로 돌아오면 다시 열린다.
      selectText(textNode, 1, 1);
      expect(linkToolbarVisible()).toBe(true);
      await flushEditingGuard();
      expect(linkToolbarVisible()).toBe(true);
    } finally {
      outside.remove();
    }
  });

  it("단위 3: 초점이 툴바 안 요소이면 DOM selection이 밖이어도 닫지 않는다(D4, 커스텀 component 입력)", () => {
    const CustomInput: FC<{ editor: EditorController }> = () => (
      <input aria-label="커스텀 URL" />
    );
    const { textNode } = mountLinkEditor(CustomInput);
    selectText(textNode, 1, 1);
    expect(linkToolbarVisible()).toBe(true);
    const input = screen.getByRole("textbox", { name: "커스텀 URL" });

    // jsdom은 입력에 초점을 주면 DOM selection을 입력으로 옮긴다. 입력 안
    // selection은 편집기 밖이다.
    input.focus();
    expect(document.activeElement).toBe(input);
    fireSelectionChange();

    expect(linkToolbarVisible()).toBe(true);
  });
});
