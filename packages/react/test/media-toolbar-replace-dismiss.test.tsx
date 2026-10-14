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
 * - 닫은 블록 B의 재오픈 억제는 다른 블록 A의 교체 모드를 남기지 않는다(Issue
 *   #259). A의 교체 모드에서 B로 selection을 옮기면 B의 view가 열린다.
 * - 교체 모드를 저장·취소·업로드 성공으로 빠져나오면 초점이 편집기로 돌아온다
 *   (Issue #408). 업로드 성공은 초점이 툴바 안이거나 body일 때만 옮기고, 툴바·편집기
 *   밖 입력에 있으면 그대로 둔다. 바깥 클릭으로 닫힌 뒤 끝난 업로드와 미디어 블록이
 *   사라진 닫힘은 초점을 옮기지 않는다.
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
  // applyMediaUrl이 현재 블록 url을 읽는다. 같은 URL 재저장 판정에 쓴다.
  getBlock: vi.fn(() => ({
    id: "media-1",
    type: "image",
    url: filledImageBlock.url,
    name: filledImageBlock.name,
  })),
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

/**
 * 컴포넌트 타이머(닫힘의 editingRef 해제, 편집·교체 모드의 지연 재읽기)와 jsdom이
 * 큐잉한 selectionchange를 흘려보낸다. 컴포넌트 타이머가 먼저 등록돼 이 타이머보다
 * 앞서 실행된다. 고정 sleep이 아니다.
 */
const flushMacrotask = () =>
  act(
    () =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      }),
  );

/** 열린 more 메뉴의 `data-block-id`를 읽는다. 메뉴가 없으면 null이다. */
const moreMenuBlockId = () =>
  document
    .querySelector(".geul-media-toolbar__more-menu")
    ?.getAttribute("data-block-id") ?? null;

describe("닫은 블록의 재오픈 억제가 다른 블록의 교체 모드를 남기지 않는다(Issue #259)", () => {
  it("B를 Escape로 닫고 A의 교체 모드에서 B로 selection을 옮기면 교체 모드가 닫히고 B의 view가 열린다 (#259)", async () => {
    const controller = fakeController(() => new Promise<never>(() => {}));
    render(
      withProvider(
        controller,
        <>
          <MediaToolbar />
          <EditorContent />
        </>,
      ),
    );
    // media-1(B)의 view를 Escape로 닫아 억제를 기록한다.
    expect(toolbarVisible()).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(toolbarVisible()).toBe(false);
    await flushMacrotask();

    // media-2(A)의 view를 열고 교체 모드로 들어간다. 억제 키는 여전히 B다.
    controller.getSelectionMediaBlock.mockReturnValue({
      ...filledImageBlock,
      blockId: "media-2",
    });
    fireSelectionChange();
    fireEvent.click(screen.getByRole("button", { name: "More media options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Replace file" }));
    expect(replacingVisible()).toBe(true);

    controller.getSelectionMediaBlock.mockReturnValue(filledImageBlock);
    fireSelectionChange();
    await flushMacrotask();

    expect(replacingVisible()).toBe(false);
    expect(toolbarVisible()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "More media options" }));
    expect(moreMenuBlockId()).toBe("media-1");
  });
});

/** 업로드 Promise를 직접 끝낼 수 있는 fake controller와 끝내는 함수를 만든다. */
const deferredUploadController = () => {
  let finishUpload: () => void = () => {};
  const controller = fakeController(
    () =>
      new Promise((resolve) => {
        finishUpload = () => resolve({ ok: true, value: undefined });
      }),
  );
  return {
    controller,
    finishUpload: () =>
      act(async () => {
        finishUpload();
      }),
  };
};

/**
 * 초점을 body로 되돌린다. jsdom은 disabled 입력의 `blur()`를 무시한다(업로드 중
 * 파일 입력이 disabled다). 임시 입력에 초점을 줬다 놓아 `activeElement`를 비운다.
 */
const focusBody = () => {
  const probe = createOutsideInput();
  probe.focus();
  probe.blur();
  probe.remove();
  expect(document.activeElement).toBe(document.body);
};

/** 교체 모드 Embed 탭의 URL 입력에 값을 넣고 입력을 돌려준다. 입력에 초점이 있다. */
const typeEmbedUrl = (value: string) => {
  fireEvent.click(screen.getByRole("tab", { name: "Embed" }));
  const input = screen.getByRole<HTMLInputElement>("textbox", { name: /URL/ });
  fireEvent.change(input, { target: { value } });
  expect(document.activeElement).toBe(input);
  return input;
};

describe("교체 모드를 빠져나오면 초점이 편집기로 돌아온다(Issue #408)", () => {
  it("Embed 탭 URL 입력에서 Enter로 저장하면 초점이 편집기로 돌아온다", () => {
    const { editable } = enterReplacing();
    const input = typeEmbedUrl("https://example.com/new.png");

    fireEvent.keyDown(input, { key: "Enter" });

    expect(replacingVisible()).toBe(false);
    expect(toolbarVisible()).toBe(true);
    expect(document.activeElement).toBe(editable);
  });

  it("Embed 탭 저장 버튼을 누르면 초점이 편집기로 돌아온다", () => {
    const { editable } = enterReplacing();
    typeEmbedUrl("https://example.com/new.png");

    fireEvent.click(screen.getByRole("button", { name: "Save URL" }));

    expect(replacingVisible()).toBe(false);
    expect(document.activeElement).toBe(editable);
  });

  it("현재 URL과 같은 URL을 재저장해도 초점이 편집기로 돌아온다 (#384·#388)", () => {
    const controller = fakeController(() => new Promise<never>(() => {}));
    controller.commands.setMediaBlockUrl.mockReturnValue({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", message: "same value" },
    } as never);
    const { editable } = enterReplacing(controller);
    typeEmbedUrl(filledImageBlock.url ?? "");

    fireEvent.click(screen.getByRole("button", { name: "Save URL" }));

    expect(controller.commands.setMediaBlockUrl).toHaveBeenCalled();
    expect(replacingVisible()).toBe(false);
    expect(document.activeElement).toBe(editable);
  });

  it("거절된 URL은 교체 모드를 유지하고 초점을 옮기지 않는다", () => {
    const controller = fakeController(() => new Promise<never>(() => {}));
    controller.commands.setMediaBlockUrl.mockReturnValue({
      ok: false,
      error: { code: "INVALID_ARGUMENT", message: "bad url" },
    } as never);
    const { editable } = enterReplacing(controller);
    const input = typeEmbedUrl("not a url");

    fireEvent.keyDown(input, { key: "Enter" });

    expect(replacingVisible()).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(document.activeElement).not.toBe(editable);
  });

  it("Cancel 버튼을 누르면 초점이 편집기로 돌아온다", () => {
    const { editable } = enterReplacing();
    screen.getByRole("tab", { name: "Embed" }).focus();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(replacingVisible()).toBe(false);
    expect(toolbarVisible()).toBe(true);
    expect(document.activeElement).toBe(editable);
  });

  it("업로드가 성공할 때 초점이 툴바 안이면 편집기로 돌아온다", async () => {
    const { controller, finishUpload } = deferredUploadController();
    const { editable } = enterReplacing(controller);
    startUpload();
    const tab = screen.getByRole("tab", { name: "Embed" });
    tab.focus();
    expect(document.activeElement).toBe(tab);

    await finishUpload();

    expect(replacingVisible()).toBe(false);
    expect(toolbarVisible()).toBe(true);
    expect(document.activeElement).toBe(editable);
  });

  it("업로드가 성공할 때 초점이 body에 있으면 편집기로 돌아온다", async () => {
    const { controller, finishUpload } = deferredUploadController();
    const { editable } = enterReplacing(controller);
    startUpload();
    focusBody();

    await finishUpload();

    expect(replacingVisible()).toBe(false);
    expect(document.activeElement).toBe(editable);
  });

  it("업로드가 성공할 때 초점이 툴바·편집기 밖 입력에 있으면 그대로 둔다", async () => {
    const { controller, finishUpload } = deferredUploadController();
    enterReplacing(controller);
    startUpload();
    const outside = createOutsideInput();
    try {
      outside.focus();
      expect(document.activeElement).toBe(outside);

      await finishUpload();

      expect(replacingVisible()).toBe(false);
      expect(toolbarVisible()).toBe(true);
      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });

  it("바깥 클릭으로 닫힌 뒤 업로드가 끝나도 초점을 옮기지 않고 toolbar를 다시 열지 않는다", async () => {
    const { controller, finishUpload } = deferredUploadController();
    const { editable } = enterReplacing(controller);
    startUpload();
    const outside = createOutsideInput();
    try {
      // 실제 클릭처럼 초점이 바깥 요소로 간 뒤 비어 있는 곳으로 옮겨 간다.
      outside.focus();
      fireEvent.pointerDown(outside);
      outside.blur();
      expect(toolbarVisible()).toBe(false);
      expect(document.activeElement).toBe(document.body);

      await finishUpload();

      expect(toolbarVisible()).toBe(false);
      expect(document.activeElement).not.toBe(editable);
    } finally {
      outside.remove();
    }
  });

  it("저장할 때 미디어 블록이 사라져 toolbar가 닫히면 초점을 옮기지 않는다", () => {
    const controller = fakeController(() => new Promise<never>(() => {}));
    const { editable } = enterReplacing(controller);
    const input = typeEmbedUrl("https://example.com/new.png");
    controller.getSelectionMediaBlock.mockReturnValue(null as never);

    fireEvent.keyDown(input, { key: "Enter" });

    expect(toolbarVisible()).toBe(false);
    expect(document.activeElement).not.toBe(editable);
  });

  it("업로드가 끝날 때 미디어 블록이 사라져 toolbar가 닫히면 초점을 옮기지 않는다", async () => {
    const { controller, finishUpload } = deferredUploadController();
    const { editable } = enterReplacing(controller);
    startUpload();
    focusBody();
    controller.getSelectionMediaBlock.mockReturnValue(null as never);

    await finishUpload();

    expect(toolbarVisible()).toBe(false);
    expect(document.activeElement).not.toBe(editable);
  });
});
