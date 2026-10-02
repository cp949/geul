// @vitest-environment jsdom

/**
 * MediaToolbar의 view 모드 닫힘과 more 메뉴 닫힘이 useDismissibleOverlay를
 * 거치는 계약을 확인한다(Issue #233, RD-003 DELTA-03).
 * - 동작 변경 1: more 메뉴가 열린 채 Escape는 more 메뉴만 닫는다. 두 번째
 *   Escape가 toolbar를 닫는다. 메뉴가 닫힌 뒤에도 toolbar는 view로 남는다.
 * - 바깥 클릭은 오버레이마다 독립이다. 둘 다 allow 밖이면 둘 다 닫는다.
 * - rename·caption 입력의 Escape는 편집만 취소하고 toolbar는 남는다.
 *   stopPropagation 없이도 module이 defaultPrevented로 건너뛴다. jsdom은 결과
 *   상태만 확인하고 전파 순서는 e2e/media-toolbar.spec.ts:109가 소유한다.
 * - 편집 모드(rename·caption)는 module에 등록하지 않는다. 바깥 클릭·Escape에
 *   반응하지 않는 현행을 유지한다.
 * - 편집기가 먼저 막은 Escape는 닫고, 편집기 밖에서 막힌 Escape와 IME 조합 중
 *   Escape는 닫지 않는다.
 * - 바깥 클릭 때 초점이 오버레이 안이면 편집기로 옮기고, 밖이면 그대로 둔다.
 * - media toolbar와 미디어 핸들 메뉴가 함께 열려도 Escape는 나중에 열린 하나만
 *   닫는다(과도기 해소). 열림 순서를 양방향으로 본다.
 * 교체 모드(replacing)의 Escape·바깥 클릭은 DELTA-04가 소유한다.
 * 기존 media-toolbar.test.tsx 단언은 이전 후에도 수정 없이 통과한다.
 * 편집기 안 Escape를 ProseMirror가 막는 경로와 입력 Escape의 전파 순서는 jsdom이
 * 재현하지 못해 e2e/media-toolbar.spec.ts가 소유한다.
 * 옛 훅에서도 통과하는 9건은 "옛 훅과 같은 결과를 내는 회귀 가드" describe에
 * 모았다. 이전 전후로 닫힘 계약이 같음을 잠그며 module 경유를 증명하지 않는다.
 */
import {
  DEFAULT_DICTIONARY,
  type EditorController,
  type MediaBlockKind,
} from "@cp949/geul-core";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { type FC, type ReactNode, useMemo } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorContent, MediaToolbar } from "../src/index.js";
import { MediaHandleOverlays } from "../src/media-handle-overlays.js";
import { EditorContext, useEditor } from "../src/use-editor.js";
import { withProvider } from "./fake-editor-provider.js";
import { mountBlockEditor } from "./mount-editor.js";
import { queryMountedEditable } from "./query-mounted-editable.js";
import { fireSelectionChange } from "./selection-events.js";

// jsdom은 setPointerCapture를 구현하지 않는다. 핸들 pointerdown이 호출한다.
if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {};
}

afterEach(cleanup);

type SelectionMediaBlock = {
  blockId: string;
  kind: MediaBlockKind;
  url: string | null;
  name: string | null;
  caption: string | null;
  showPreview: boolean | null;
  textAlignment: "left" | "center" | "right" | null;
};

const MEDIA_URL = "https://example.com/dir/photo.png";

const filledImageBlock: SelectionMediaBlock = {
  blockId: "media-1",
  kind: "image",
  url: MEDIA_URL,
  name: "photo.png",
  caption: null,
  showPreview: true,
  textAlignment: null,
};

/**
 * 미디어 블록 하나가 선택된 상태를 돌려주는 fake controller를 만든다.
 * mount는 대상 블록의 렌더 DOM(`data-geul-block-id`)을 가진 편집 영역을 그린다.
 */
const fakeController = (
  getSelectionMediaBlock: () => SelectionMediaBlock | null = () =>
    filledImageBlock,
) => ({
  mount: vi.fn((element: HTMLElement) => {
    const editable = document.createElement("div");
    // jsdom은 contentEditable IDL 프로퍼티를 속성으로 반영하지 않는다.
    editable.setAttribute("contenteditable", "true");
    const mediaBlockElement = document.createElement("div");
    mediaBlockElement.setAttribute("data-geul-block-id", "media-1");
    editable.append(mediaBlockElement);
    element.append(editable);
  }),
  unmount: vi.fn(),
  destroy: vi.fn(),
  getDocument: vi.fn(),
  getSelectionMediaBlock: vi.fn(getSelectionMediaBlock),
  isUploadEnabled: vi.fn(() => false),
  getMediaUploadState: vi.fn(() => null),
  getDictionary: vi.fn(() => DEFAULT_DICTIONARY),
  replaceDocument: vi.fn(),
  commands: {
    setMediaBlockName: vi.fn(() => ({ ok: true })),
    setMediaBlockCaption: vi.fn(() => ({ ok: true })),
    setMediaShowPreview: vi.fn(() => ({ ok: true })),
    setMediaTextAlignment: vi.fn(() => ({ ok: true })),
    deleteBlock: vi.fn(() => ({ ok: true })),
    replaceMediaBlockFile: vi.fn(() =>
      Promise.resolve({ ok: true, value: undefined }),
    ),
    setMediaBlockUrl: vi.fn(() => ({ ok: true })),
    setIframeSrc: vi.fn(() => ({ ok: true })),
    cancelMediaUpload: vi.fn(() => ({ ok: true, value: undefined })),
  },
});

/**
 * media toolbar만 그려 view 모드로 연다. 편집 영역을 함께 돌려준다.
 * `component`를 주면 오버라이드 경로로 그린다.
 */
const openToolbar = (
  controller: ReturnType<typeof fakeController> = fakeController(),
  component?: MediaToolbarComponent,
) => {
  render(
    withProvider(
      controller,
      <>
        {component === undefined ? (
          <MediaToolbar />
        ) : (
          <MediaToolbar component={component} />
        )}
        <EditorContent />
      </>,
    ),
  );
  const editable = queryMountedEditable(
    screen.getByRole("textbox", { name: "Editor" }),
  );
  expect(toolbarVisible()).toBe(true);
  return { controller, editable };
};

type MediaToolbarComponent = FC<{ editor: EditorController }>;

/** toolbar를 연 뒤 more 메뉴까지 연다. */
const openToolbarWithMoreMenu = (
  controller: ReturnType<typeof fakeController> = fakeController(),
) => {
  const opened = openToolbar(controller);
  fireEvent.click(screen.getByRole("button", { name: "More media options" }));
  expect(moreMenuVisible()).toBe(true);
  return opened;
};

/** media toolbar가 떠 있는지 본다. */
const toolbarVisible = () =>
  screen.queryByRole("toolbar", { name: "Media toolbar" }) !== null;

/** more 메뉴가 열려 있는지 본다. */
const moreMenuVisible = () =>
  document.querySelector(".geul-media-toolbar__more-menu") !== null;

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
 * 닫힘이 `editingRef`를 세운 뒤 푸는 `setTimeout`을 흘려보낸다. 컴포넌트의
 * 타이머가 먼저 등록돼 같은 지연의 이 타이머보다 앞서 실행된다. 고정 sleep이
 * 아니다.
 */
const flushEditingGuard = () =>
  act(
    () =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      }),
  );

describe("동작 변경 1: more 메뉴가 열린 채 Escape는 more 메뉴만 닫는다(Issue #233 RD-003 DELTA-03)", () => {
  it("동작 변경 1: Escape 한 번에 more 메뉴만 닫히고 toolbar는 view로 남으며 두 번째에 toolbar가 닫힌다", () => {
    openToolbarWithMoreMenu();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(moreMenuVisible()).toBe(false);
    expect(toolbarVisible()).toBe(true);
    // 메뉴가 닫힌 뒤에도 view 모드다. 트리거가 남고 접힘 상태를 알린다.
    expect(
      screen
        .getByRole("button", { name: "More media options" })
        .getAttribute("aria-expanded"),
    ).toBe("false");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(toolbarVisible()).toBe(false);
  });

  it("동작 변경 1: 메뉴를 Escape로 닫은 뒤 메뉴를 다시 열면 다시 Escape 한 번에 메뉴만 닫힌다", () => {
    openToolbarWithMoreMenu();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(moreMenuVisible()).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "More media options" }));
    expect(moreMenuVisible()).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(moreMenuVisible()).toBe(false);
    expect(toolbarVisible()).toBe(true);
  });

  it("동작 변경 1: 열린 메뉴 안에서 Preview를 토글하거나 selection이 재관측돼도 Escape는 여전히 메뉴를 먼저 닫는다", () => {
    const controller = fakeController();
    openToolbarWithMoreMenu(controller);

    // toolbar 상태가 새 객체로 바뀌어도 열림 순서(스택 위치)는 유지된다.
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Preview" }));
    fireSelectionChange();
    expect(moreMenuVisible()).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(moreMenuVisible()).toBe(false);
    expect(toolbarVisible()).toBe(true);
  });
});

describe("바깥 클릭은 toolbar와 more 메뉴가 각자 판정한다(Issue #233 RD-003 DELTA-03)", () => {
  it("more 메뉴가 열린 채 바깥 클릭 때 초점이 메뉴 항목에 있으면 편집기로 옮긴다", () => {
    const { editable } = openToolbarWithMoreMenu();
    const menuItem = screen.getByRole("menuitem", { name: "Rename" });
    menuItem.focus();
    expect(document.activeElement).toBe(menuItem);
    const outside = createOutsideInput();
    try {
      // 초점을 옮기지 않고 누른다. 클릭 대상이 초점을 받지 않는 경우다.
      fireEvent.pointerDown(outside);

      expect(toolbarVisible()).toBe(false);
      expect(document.activeElement).toBe(editable);
    } finally {
      outside.remove();
    }
  });

  it("view 모드 바깥 클릭 때 초점이 toolbar 트리거에 있으면 편집기로 옮긴다", () => {
    const { editable } = openToolbar();
    const trigger = screen.getByRole("button", { name: "More media options" });
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    const outside = createOutsideInput();
    try {
      fireEvent.pointerDown(outside);

      expect(toolbarVisible()).toBe(false);
      expect(document.activeElement).toBe(editable);
    } finally {
      outside.remove();
    }
  });
});

describe("MediaToolbar view 모드 Escape가 module 규칙을 따른다(Issue #233 RD-003 DELTA-03)", () => {
  it("편집기가 먼저 preventDefault한 Escape도 more 메뉴를 닫고 그다음 toolbar를 닫는다", () => {
    const { editable } = openToolbarWithMoreMenu();
    // ProseMirror editHandlers.keydown이 편집기 안의 Escape를 막는 것을 흉내 낸다.
    const consume = (event: Event) => event.preventDefault();
    editable.addEventListener("keydown", consume);
    try {
      fireEvent.keyDown(editable, { key: "Escape" });

      expect(moreMenuVisible()).toBe(false);
      expect(toolbarVisible()).toBe(true);

      fireEvent.keyDown(editable, { key: "Escape" });

      expect(toolbarVisible()).toBe(false);
    } finally {
      editable.removeEventListener("keydown", consume);
    }
  });

  it("편집기 밖에서 이미 preventDefault된 Escape는 more 메뉴도 toolbar도 닫지 않는다", () => {
    openToolbarWithMoreMenu();
    const outside = createOutsideInput();
    try {
      outside.focus();
      outside.addEventListener("keydown", (event) => event.preventDefault());

      fireEvent.keyDown(outside, { key: "Escape" });

      expect(moreMenuVisible()).toBe(true);
      expect(toolbarVisible()).toBe(true);
    } finally {
      outside.remove();
    }
  });

  it("IME 조합 중 Escape는 more 메뉴를 닫지 않고 조합이 끝난 뒤 Escape는 닫는다", () => {
    openToolbarWithMoreMenu();

    fireEvent.keyDown(document, { key: "Escape", isComposing: true });
    expect(moreMenuVisible()).toBe(true);
    expect(toolbarVisible()).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(moreMenuVisible()).toBe(false);
    expect(toolbarVisible()).toBe(true);
  });

  it("IME 조합 중 Escape는 메뉴가 닫힌 view toolbar도 닫지 않는다", () => {
    openToolbar();

    fireEvent.keyDown(document, { key: "Escape", isComposing: true });
    expect(toolbarVisible()).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(toolbarVisible()).toBe(false);
  });
});

/** more 메뉴에서 항목을 눌러 편집 모드로 들어가 입력을 돌려준다. */
const enterEditing = (itemName: string, inputName: string) => {
  const opened = openToolbarWithMoreMenu();
  fireEvent.click(screen.getByRole("menuitem", { name: itemName }));
  const input = screen.getByRole<HTMLInputElement>("textbox", {
    name: inputName,
  });
  return { ...opened, input };
};

describe("옛 훅과 같은 결과를 내는 MediaToolbar 회귀 가드(Issue #233 RD-003 DELTA-03)", () => {
  // 이 describe의 테스트는 옛 훅에서도 통과한다. module 경유를 증명하지 않고 이전
  // 전후로 닫힘 계약이 같음을 잠근다. module 경유 증명은 다른 describe들이 맡는다.
  it("동작 변경 1: more 메뉴를 Escape로 닫으면 초점이 편집기로 돌아간다", () => {
    const { editable } = openToolbarWithMoreMenu();
    const menuItem = screen.getByRole("menuitem", { name: "Rename" });
    // 처음부터 편집기에 초점이 있으면 단언이 공허하다. 메뉴 항목에 둔다.
    menuItem.focus();
    expect(document.activeElement).toBe(menuItem);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(moreMenuVisible()).toBe(false);
    expect(document.activeElement).toBe(editable);
  });

  it("메뉴가 닫혀 있으면 Escape 한 번에 toolbar가 닫히고 같은 블록의 재관측이 다시 열지 않는다", async () => {
    const { editable } = openToolbar();
    const trigger = screen.getByRole("button", { name: "More media options" });
    trigger.focus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(toolbarVisible()).toBe(false);
    expect(document.activeElement).toBe(editable);

    // Escape는 재오픈 억제를 기록한다. 같은 블록 재관측이 다시 열면 안 된다.
    await flushEditingGuard();
    fireSelectionChange();
    expect(toolbarVisible()).toBe(false);
  });

  it("allow 밖 바깥 클릭은 more 메뉴와 toolbar를 둘 다 닫는다", () => {
    openToolbarWithMoreMenu();
    const outside = createOutsideInput();
    try {
      outside.focus();

      fireEvent.pointerDown(outside);

      expect(moreMenuVisible()).toBe(false);
      expect(toolbarVisible()).toBe(false);
      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });

  it("more 메뉴 안(항목)과 toolbar 안(트리거)을 눌러도 둘 다 닫히지 않는다", () => {
    openToolbarWithMoreMenu();

    fireEvent.pointerDown(screen.getByRole("menuitem", { name: "Rename" }));
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "More media options" }),
    );

    expect(moreMenuVisible()).toBe(true);
    expect(toolbarVisible()).toBe(true);
  });

  it("바깥 클릭으로 닫은 뒤 같은 블록의 selection 재관측은 toolbar를 다시 열지 않는다", async () => {
    openToolbar();
    const outside = createOutsideInput();
    try {
      outside.focus();
      fireEvent.pointerDown(outside);
      expect(toolbarVisible()).toBe(false);

      await flushEditingGuard();
      fireSelectionChange();

      expect(toolbarVisible()).toBe(false);
    } finally {
      outside.remove();
    }
  });

  it("rename 입력의 Escape는 편집만 취소하고 toolbar는 view로 남는다", () => {
    const { editable, input } = enterEditing("Rename", "Image name");
    fireEvent.change(input, { target: { value: "discarded.png" } });

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("textbox", { name: "Image name" })).toBeNull();
    expect(toolbarVisible()).toBe(true);
    expect(
      screen.queryByRole("button", { name: "More media options" }),
    ).not.toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  it("caption 입력의 Escape는 편집만 취소하고 toolbar는 view로 남는다", () => {
    const { editable, input } = enterEditing("Edit caption", "Image caption");
    fireEvent.change(input, { target: { value: "discarded" } });

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("textbox", { name: "Image caption" })).toBeNull();
    expect(toolbarVisible()).toBe(true);
    expect(
      screen.queryByRole("button", { name: "More media options" }),
    ).not.toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  it("편집 중 입력 밖 document의 Escape와 바깥 클릭에는 반응하지 않는다", () => {
    const { input } = enterEditing("Rename", "Image name");
    fireEvent.change(input, { target: { value: "draft.png" } });
    const outside = createOutsideInput();
    try {
      fireEvent.keyDown(document, { key: "Escape" });
      fireEvent.pointerDown(outside);

      expect(toolbarVisible()).toBe(true);
      expect(
        screen.getByRole<HTMLInputElement>("textbox", { name: "Image name" })
          .value,
      ).toBe("draft.png");
    } finally {
      outside.remove();
    }
  });

  it("component 오버라이드도 view 모드 Escape로 닫히고 훅 호출 순서가 깨지지 않는다", () => {
    const Custom = () => <span>custom control</span>;
    openToolbar(fakeController(), Custom);
    expect(screen.queryByText("custom control")).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(toolbarVisible()).toBe(false);
    expect(screen.queryByText("custom control")).toBeNull();
  });
});

/**
 * 실제 편집기에 media toolbar와 미디어 핸들 오버레이를 함께 마운트한다.
 * jsdom은 NodeSelection을 만들지 못해 toolbar가 읽는 `getSelectionMediaBlock`만
 * `selection.current`로 바꿔 끼운다. 나머지는 실제 컨트롤러다.
 * `selection.current`를 바꾼 뒤 `fireSelectionChange()`를 부르면 그 시점에 toolbar가
 * 열린다. 그래서 두 오버레이의 열림 순서를 테스트가 정할 수 있다.
 */
const mountToolbarWithMediaHandles = () => {
  const selection: { current: SelectionMediaBlock | null } = { current: null };
  const WithSelectionOverride = ({ children }: { children: ReactNode }) => {
    const editor = useEditor();
    const overridden = useMemo<EditorController>(
      () =>
        Object.create(editor, {
          getSelectionMediaBlock: { value: () => selection.current },
        }) as EditorController,
      [editor],
    );
    return (
      <EditorContext.Provider value={overridden}>
        {children}
      </EditorContext.Provider>
    );
  };
  const mounted = mountBlockEditor({
    initialBlocks: [
      { id: "image-1", type: "image" as const, url: MEDIA_URL },
      { id: "tail-1", type: "paragraph" as const, content: [] },
    ],
    children: (
      <>
        <WithSelectionOverride>
          <MediaToolbar />
        </WithSelectionOverride>
        <MediaHandleOverlays onBlockAdded={vi.fn()} />
      </>
    ),
  });
  const [media] = mounted.blocks;
  if (media === undefined) throw new Error("media 요소가 없다");
  return { ...mounted, media, selection };
};

type MountedPair = ReturnType<typeof mountToolbarWithMediaHandles>;

/** 선택을 미디어 블록으로 바꾸고 알려 toolbar를 연다. */
const openToolbarOf = ({ selection }: MountedPair) => {
  selection.current = { ...filledImageBlock, blockId: "image-1" };
  fireSelectionChange();
  expect(toolbarVisible()).toBe(true);
};

/**
 * 미디어 핸들을 키보드(Enter 신호 + click)로 열어 메뉴를 연다. 마우스로 열면
 * 핸들 pointerdown이 toolbar의 바깥 클릭이 돼 toolbar가 먼저 닫힌다. 키보드는
 * pointerdown이 없어 두 오버레이가 함께 열린다.
 */
const openHandleMenu = ({ media }: MountedPair) => {
  fireEvent.pointerMove(media);
  const handle = document.querySelector<HTMLElement>(
    ".geul-media-handle-overlay [data-geul-block-handle]",
  );
  if (handle === null) throw new Error("media 핸들이 없다");
  fireEvent.keyDown(handle, { key: "Enter" });
  fireEvent.click(handle);
  expect(handleMenuVisible()).toBe(true);
};

/** 미디어 핸들 메뉴가 열려 있는지 본다. */
const handleMenuVisible = () =>
  document.querySelector('[data-geul-menu-owner="media"]') !== null;

describe("media toolbar와 미디어 핸들 메뉴가 함께 열려도 Escape는 나중에 열린 하나만 닫는다(Issue #233 RD-003 DELTA-03 과도기 해소)", () => {
  it("toolbar가 먼저, 핸들 메뉴가 나중에 열렸으면 Escape 한 번에 핸들 메뉴만 닫히고 두 번째에 toolbar가 닫힌다", () => {
    const pair = mountToolbarWithMediaHandles();
    openToolbarOf(pair);
    openHandleMenu(pair);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(handleMenuVisible()).toBe(false);
    expect(toolbarVisible()).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(toolbarVisible()).toBe(false);
  });

  it("핸들 메뉴가 먼저, toolbar가 나중에 열렸으면 Escape 한 번에 toolbar만 닫히고 두 번째에 핸들 메뉴가 닫힌다", () => {
    const pair = mountToolbarWithMediaHandles();
    openHandleMenu(pair);
    openToolbarOf(pair);
    expect(handleMenuVisible()).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(toolbarVisible()).toBe(false);
    expect(handleMenuVisible()).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(handleMenuVisible()).toBe(false);
  });

  it("toolbar, more 메뉴, 핸들 메뉴가 순서대로 열렸으면 Escape가 세 번에 걸쳐 역순으로 하나씩 닫는다", () => {
    const pair = mountToolbarWithMediaHandles();
    openToolbarOf(pair);
    fireEvent.click(screen.getByRole("button", { name: "More media options" }));
    expect(moreMenuVisible()).toBe(true);
    openHandleMenu(pair);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(handleMenuVisible()).toBe(false);
    expect(moreMenuVisible()).toBe(true);
    expect(toolbarVisible()).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(moreMenuVisible()).toBe(false);
    expect(toolbarVisible()).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(toolbarVisible()).toBe(false);
  });
});
