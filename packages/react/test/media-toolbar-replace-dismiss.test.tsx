// @vitest-environment jsdom

/**
 * MediaToolbar 교체 모드(replacing)의 닫힘이 useDismissibleOverlay를 거치는
 * 계약을 확인한다(Issue #233, RD-003 DELTA-04).
 * - 동작 변경 5: 교체 모드에서 Escape는 cancelReplacing으로 view에 돌아간다.
 *   toolbar는 남고 두 번째 Escape가 toolbar를 닫는다. 업로드 중이면 abort한다.
 * - 교체 모드 바깥 클릭은 toolbar를 닫는다. 진행 중 업로드는 abort하지 않고
 *   완료돼도 닫힌 toolbar를 다시 열지 않는다.
 * - toolbar 안 클릭과 IME 조합 중 Escape는 교체 모드를 닫지 않는다.
 * - 교체 모드에서 편집기 안 클릭은 selection 변경으로 판정한다(Issue #251).
 *   selection이 다른 블록이나 비미디어로 옮겨가면 닫히거나 새 블록의 view가 된다.
 *   같은 블록이면 교체 모드가 유지된다.
 * - 편집 모드(rename·caption)의 닫힘은 media-toolbar-dismiss.test.tsx가 소유한다.
 * 기존 media-toolbar.test.tsx 단언은 이전 후에도 수정 없이 통과한다.
 */
import { DEFAULT_DICTIONARY, type MediaBlockKind } from "@cp949/geul-core";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorContent, MediaToolbar } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { queryMountedEditable } from "./query-mounted-editable.js";
import { fireSelectionChange } from "./selection-events.js";

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

const filledImageBlock: SelectionMediaBlock = {
  blockId: "media-1",
  kind: "image",
  url: "https://example.com/dir/photo.png",
  name: "photo.png",
  caption: null,
  showPreview: true,
  textAlignment: null,
};

/**
 * 업로드가 켜진 미디어 선택 fake controller를 만든다.
 * `replaceMediaBlockFile`은 호출부가 정한 Promise로 업로드 진행을 조절한다.
 */
const fakeController = (
  replaceMediaBlockFile: () => Promise<{ ok: true; value: undefined }>,
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
  getSelectionMediaBlock: vi.fn(() => filledImageBlock),
  isUploadEnabled: vi.fn(() => true),
  getMediaUploadState: vi.fn(() => null),
  getDictionary: vi.fn(() => DEFAULT_DICTIONARY),
  replaceDocument: vi.fn(),
  commands: {
    setMediaBlockName: vi.fn(() => ({ ok: true })),
    setMediaBlockCaption: vi.fn(() => ({ ok: true })),
    setMediaShowPreview: vi.fn(() => ({ ok: true })),
    setMediaTextAlignment: vi.fn(() => ({ ok: true })),
    deleteBlock: vi.fn(() => ({ ok: true })),
    replaceMediaBlockFile: vi.fn(replaceMediaBlockFile),
    setMediaBlockUrl: vi.fn(() => ({ ok: true })),
    setIframeSrc: vi.fn(() => ({ ok: true })),
    cancelMediaUpload: vi.fn(() => ({ ok: true, value: undefined })),
  },
});

/**
 * toolbar를 열고 more 메뉴의 Replace 항목으로 교체 모드에 들어간다.
 * 편집 영역을 함께 돌려준다.
 */
const enterReplacing = (
  controller: ReturnType<typeof fakeController> = fakeController(
    () => new Promise<never>(() => {}),
  ),
) => {
  render(
    withProvider(
      controller,
      <>
        <MediaToolbar />
        <EditorContent />
      </>,
    ),
  );
  const editable = queryMountedEditable(
    screen.getByRole("textbox", { name: "Editor" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "More media options" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Replace file" }));
  expect(replacingVisible()).toBe(true);
  return { controller, editable };
};

/** 교체 모드 UI(탭 목록)가 떠 있는지 본다. */
const replacingVisible = () => screen.queryByRole("tablist") !== null;

/** media toolbar가 떠 있는지 본다. */
const toolbarVisible = () =>
  screen.queryByRole("toolbar", { name: "Media toolbar" }) !== null;

/** 교체 모드에서 Upload 탭에 파일을 올려 업로드 중 상태로 만든다. */
const startUpload = () => {
  const file = new File(["x"], "new.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("Image file"), {
    target: { files: [file] },
  });
  expect(screen.queryByRole("status")).not.toBeNull();
};

/**
 * 편집 영역 밖 입력을 만든다. 호출부가 `remove()`로 치운다.
 * 초점은 주지 않는다. 테스트가 초점 위치를 정한다.
 */
const createOutsideInput = () => {
  const input = document.createElement("input");
  document.body.append(input);
  return input;
};

describe("동작 변경 5: 교체 모드가 Escape로 닫힌다(Issue #233 RD-003 DELTA-04)", () => {
  it("동작 변경 5: Escape 한 번에 교체 모드가 view로 돌아가고 toolbar는 남으며 두 번째에 toolbar가 닫힌다", () => {
    enterReplacing();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(replacingVisible()).toBe(false);
    expect(toolbarVisible()).toBe(true);
    expect(
      screen.queryByRole("button", { name: "More media options" }),
    ).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(toolbarVisible()).toBe(false);
  });

  it("동작 변경 5: Embed 탭 URL 입력에 초점이 있어도 Escape 한 번에 교체 모드가 view로 돌아간다", () => {
    enterReplacing();
    fireEvent.click(screen.getByRole("tab", { name: "Embed" }));
    const input = screen.getByRole<HTMLInputElement>("textbox", {
      name: /URL/,
    });
    input.focus();

    fireEvent.keyDown(input, { key: "Escape" });

    expect(replacingVisible()).toBe(false);
    expect(toolbarVisible()).toBe(true);
  });

  it("동작 변경 5: 업로드 중 Escape는 업로드를 abort하고 view로 돌아간다", () => {
    const { controller } = enterReplacing();
    startUpload();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(controller.commands.cancelMediaUpload).toHaveBeenCalledWith(
      "media-1",
    );
    expect(replacingVisible()).toBe(false);
    expect(toolbarVisible()).toBe(true);
  });

  it("교체 모드에서 IME 조합 중 Escape는 교체 모드를 닫지 않는다", () => {
    enterReplacing();

    fireEvent.keyDown(document, { key: "Escape", isComposing: true });

    expect(replacingVisible()).toBe(true);
  });

  it("Escape로 view에 돌아온 뒤 초점이 편집기로 간다", () => {
    const { editable } = enterReplacing();
    screen.getByRole("tab", { name: "Embed" }).focus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(document.activeElement).toBe(editable);
  });
});

describe("교체 모드 바깥 클릭은 toolbar를 닫는다(Issue #233 RD-003 DELTA-04)", () => {
  it("편집기 밖을 누르면 교체 모드와 toolbar가 함께 닫힌다", () => {
    const { controller } = enterReplacing();
    const outside = createOutsideInput();
    try {
      fireEvent.pointerDown(outside);

      expect(toolbarVisible()).toBe(false);
      expect(controller.commands.cancelMediaUpload).not.toHaveBeenCalled();
    } finally {
      outside.remove();
    }
  });

  it("toolbar 안(탭)을 눌러도 교체 모드가 닫히지 않는다", () => {
    enterReplacing();

    fireEvent.pointerDown(screen.getByRole("tab", { name: "Embed" }));

    expect(replacingVisible()).toBe(true);
  });

  it("업로드 중 바깥 클릭은 업로드를 abort하지 않고 완료돼도 toolbar를 다시 열지 않는다", async () => {
    let finishUpload: () => void = () => {};
    const controller = fakeController(
      () =>
        new Promise((resolve) => {
          finishUpload = () => resolve({ ok: true, value: undefined });
        }),
    );
    enterReplacing(controller);
    startUpload();
    const outside = createOutsideInput();
    try {
      fireEvent.pointerDown(outside);
      expect(toolbarVisible()).toBe(false);
      expect(controller.commands.cancelMediaUpload).not.toHaveBeenCalled();

      await act(async () => {
        finishUpload();
      });

      expect(toolbarVisible()).toBe(false);
    } finally {
      outside.remove();
    }
  });
});

describe("교체 모드는 selection 변경으로 닫힌다(Issue #251)", () => {
  it("selection이 비미디어로 옮겨가면 교체 모드가 닫히고 업로드는 abort하지 않는다", () => {
    const { controller } = enterReplacing();
    controller.getSelectionMediaBlock.mockReturnValue(null as never);

    fireSelectionChange();

    expect(toolbarVisible()).toBe(false);
    expect(controller.commands.cancelMediaUpload).not.toHaveBeenCalled();
  });

  it("이벤트 안 읽기가 이동 직전 selection이어도 매크로태스크 뒤 재읽기가 교체 모드를 닫는다", async () => {
    const { controller } = enterReplacing();
    // 큐잉된 selectionchange를 먼저 흘려보낸다. 남겨 두면 지연 읽기 없이도 통과한다.
    await act(
      () =>
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, 0);
        }),
    );

    fireSelectionChange();
    expect(replacingVisible()).toBe(true);

    controller.getSelectionMediaBlock.mockReturnValue(null as never);
    await act(
      () =>
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, 0);
        }),
    );

    expect(toolbarVisible()).toBe(false);
  });

  it("selection이 다른 미디어 블록으로 옮겨가면 교체 모드를 버리고 그 블록의 view가 열린다", () => {
    const { controller } = enterReplacing();
    controller.getSelectionMediaBlock.mockReturnValue({
      ...filledImageBlock,
      blockId: "media-2",
    });

    fireSelectionChange();

    expect(replacingVisible()).toBe(false);
    expect(toolbarVisible()).toBe(true);
    expect(
      screen.queryByRole("button", { name: "More media options" }),
    ).not.toBeNull();
  });

  it("같은 블록 pointerdown과 selection 재관측은 교체 모드를 유지한다", async () => {
    const { editable } = enterReplacing();
    const sameBlock = editable.querySelector<HTMLElement>(
      '[data-geul-block-id="media-1"]',
    );
    if (sameBlock === null) throw new Error("미디어 블록 요소가 없다");

    fireEvent.pointerDown(sameBlock);
    await act(
      () =>
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, 0);
        }),
    );
    fireSelectionChange();

    expect(replacingVisible()).toBe(true);
  });

  it("리사이즈 핸들 pointerdown은 교체 모드를 닫지 않는다", () => {
    enterReplacing();
    const handle = document.createElement("div");
    handle.setAttribute("data-geul-media-resize-handle", "");
    document.body.append(handle);
    try {
      fireEvent.pointerDown(handle);

      expect(replacingVisible()).toBe(true);
    } finally {
      handle.remove();
    }
  });
});
