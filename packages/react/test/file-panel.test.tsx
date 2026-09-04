// @vitest-environment jsdom

/**
 * FilePanel 컴포넌트: url 없는 미디어 블록 선택 시 자동 열림, URL 제출
 * 시 setMediaBlockUrl 호출과 이름 초깃값(마지막 path segment) 추출·표시,
 * 거부된 URL의 인라인 메시지, Escape/바깥 클릭에 따른 닫힘과 focus
 * 복원 차이(RD-003 DELTA-01), Upload 탭의 파일 선택·loading/에러·
 * retry·cancel(RD-003 DELTA-02)을 검증한다.
 */

import type { EditorError, MediaBlockKind } from "@cp949/geul-core";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorContent, FilePanel } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { queryMountedEditable } from "./query-mounted-editable.js";

// link-toolbar.test.tsx와 같은 이유(@testing-library/react가 전역
// afterEach/teardown이 함수일 때만 자동 cleanup을 등록하는데, 저장소
// vitest.config.ts는 globals:true가 아니라 자동 등록이 없다).
afterEach(cleanup);

type SelectionMediaBlock = {
  blockId: string;
  kind: MediaBlockKind;
  url: string | null;
  name: string | null;
  caption: string | null;
};

type UploadMediaFileResult =
  { ok: true; value: undefined } | { ok: false; error: EditorError };

type MediaUploadState =
  "uploading" | { status: "error"; code: string; message: string } | null;

type FakeControllerOptions = {
  getSelectionMediaBlock?: () => SelectionMediaBlock | null;
  setMediaBlockUrl?: (
    blockId: string,
    url: string,
  ) => { ok: boolean; error?: { code: string } };
  isUploadEnabled?: () => boolean;
  getMediaUploadState?: (blockId: string) => MediaUploadState;
  uploadMediaFile?: (
    blockId: string,
    file: File,
  ) => Promise<UploadMediaFileResult>;
};

const fakeController = ({
  getSelectionMediaBlock = () => null,
  setMediaBlockUrl = () => ({ ok: true }),
  isUploadEnabled = () => false,
  getMediaUploadState = () => null,
  uploadMediaFile = () => Promise.resolve({ ok: true, value: undefined }),
}: FakeControllerOptions = {}) => ({
  mount: vi.fn((element: HTMLElement) => {
    const editable = document.createElement("div");
    // link-toolbar.test.tsx와 같은 이유 — jsdom은 contentEditable IDL
    // 프로퍼티를 속성으로 반영하지 않는다.
    editable.setAttribute("contenteditable", "true");
    // 대상 미디어 블록의 렌더 DOM(RD-002 DELTA-01 계약) — FilePanel의
    // readBlockBounds가 이 selector로 앵커 좌표를 찾는다.
    const mediaBlockElement = document.createElement("div");
    mediaBlockElement.setAttribute("data-be-block-id", "media-1");
    editable.append(mediaBlockElement);
    element.append(editable);
  }),
  unmount: vi.fn(),
  destroy: vi.fn(),
  getDocument: vi.fn(),
  getSelectionMediaBlock: vi.fn(getSelectionMediaBlock),
  isUploadEnabled: vi.fn(isUploadEnabled),
  getMediaUploadState: vi.fn(getMediaUploadState),
  replaceDocument: vi.fn(),
  commands: {
    setMediaBlockUrl: vi.fn(setMediaBlockUrl),
    setMediaBlockName: vi.fn(() => ({ ok: true, value: undefined })),
    uploadMediaFile: vi.fn(uploadMediaFile),
    cancelMediaUpload: vi.fn(() => ({ ok: true, value: undefined })),
  },
});

const emptyImageBlock: SelectionMediaBlock = {
  blockId: "media-1",
  kind: "image",
  url: null,
  name: null,
  caption: null,
};

const renderPanel = (controller: ReturnType<typeof fakeController>) =>
  render(
    withProvider(
      controller,
      <>
        <FilePanel />
        <EditorContent />
      </>,
    ),
  );

const getEditable = () => {
  const host = screen.getByRole("textbox", { name: "Editor" });
  return queryMountedEditable(host);
};

describe("FilePanel 파일 패널", () => {
  it("선택된 미디어 블록이 없으면 렌더링하지 않는다", () => {
    const controller = fakeController();
    renderPanel(controller);

    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("url이 있는 미디어 블록을 선택하면 렌더링하지 않는다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => ({
        ...emptyImageBlock,
        url: "https://example.com/pic.png",
      }),
    });
    renderPanel(controller);

    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("url 없는 미디어 블록을 선택하면 패널이 열리고 URL 입력에 초점이 간다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
    });
    renderPanel(controller);

    expect(screen.getByRole("toolbar", { name: "File panel" })).not.toBeNull();
    const input = screen.getByRole("textbox", { name: "Image URL" });
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("kind별로 URL 입력 라벨이 다르다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => ({ ...emptyImageBlock, kind: "video" }),
    });
    renderPanel(controller);

    expect(screen.getByRole("textbox", { name: "Video URL" })).not.toBeNull();
  });

  it("URL을 입력해 저장하면 setMediaBlockUrl을 호출한다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
    });
    renderPanel(controller);

    fireEvent.change(screen.getByRole("textbox", { name: "Image URL" }), {
      target: { value: "https://example.com/dir/photo.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save URL" }));

    expect(controller.commands.setMediaBlockUrl).toHaveBeenCalledWith(
      "media-1",
      "https://example.com/dir/photo.png",
    );
  });

  it("Enter로도 URL을 제출한다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
    });
    renderPanel(controller);

    const input = screen.getByRole("textbox", { name: "Image URL" });
    fireEvent.change(input, {
      target: { value: "https://example.com/dir/photo.png" },
    });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(controller.commands.setMediaBlockUrl).toHaveBeenCalledWith(
      "media-1",
      "https://example.com/dir/photo.png",
    );
  });

  it("제출 성공 시 마지막 path segment로 이름을 추출해 저장하고 패널에 표시한다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
    });
    renderPanel(controller);

    fireEvent.change(screen.getByRole("textbox", { name: "Image URL" }), {
      target: { value: "https://example.com/dir/photo.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save URL" }));

    expect(controller.commands.setMediaBlockName).toHaveBeenCalledWith(
      "media-1",
      "photo.png",
    );
    expect(screen.getByText("Name: photo.png")).not.toBeNull();
  });

  it("이름 추출에 실패하면 setMediaBlockName을 호출하지 않고 URL 자체를 표시한다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
    });
    renderPanel(controller);

    fireEvent.change(screen.getByRole("textbox", { name: "Image URL" }), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save URL" }));

    expect(controller.commands.setMediaBlockName).not.toHaveBeenCalled();
    expect(screen.getByText("Name: https://example.com")).not.toBeNull();
  });

  it("거부된 URL이면 거부 메시지를 표시하고 이름을 저장하지 않는다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
      setMediaBlockUrl: () => ({
        ok: false,
        error: { code: "LINK_HREF_REJECTED" },
      }),
    });
    renderPanel(controller);

    fireEvent.change(screen.getByRole("textbox", { name: "Image URL" }), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save URL" }));

    expect(screen.getByRole("alert")).not.toBeNull();
    expect(controller.commands.setMediaBlockName).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Image URL" })).not.toBeNull();
  });

  it("Escape는 패널을 닫고 편집기로 focus를 복원한다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
    });
    renderPanel(controller);
    const editable = getEditable();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  it("바깥 클릭은 패널을 닫되 focus를 옮기지 않는다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
    });
    renderPanel(controller);

    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();

    fireEvent.pointerDown(outside);

    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it("Close 버튼은 패널을 닫고 편집기로 focus를 복원한다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
    });
    renderPanel(controller);
    const editable = getEditable();

    fireEvent.click(screen.getByRole("button", { name: "Close file panel" }));

    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(document.activeElement).toBe(editable);
  });
});

describe("FilePanel Upload 탭(RD-003 DELTA-02)", () => {
  it("uploadFile 미등록 시 탭이 보이지 않고 URL 입력만 남는다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
    });
    renderPanel(controller);

    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Image URL" })).not.toBeNull();
  });

  it("uploadFile 등록 시 Embed/Upload 탭이 보이고 기본 활성 탭은 Embed다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
      isUploadEnabled: () => true,
    });
    renderPanel(controller);

    const embedTab = screen.getByRole("tab", { name: "Embed" });
    const uploadTab = screen.getByRole("tab", { name: "Upload" });
    expect(embedTab.getAttribute("aria-selected")).toBe("true");
    expect(uploadTab.getAttribute("aria-selected")).toBe("false");
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Image URL" }),
    );
  });

  it("Upload 탭 클릭 시 파일 선택 input이 보이고 URL input은 사라진다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
      isUploadEnabled: () => true,
    });
    renderPanel(controller);

    fireEvent.click(screen.getByRole("tab", { name: "Upload" }));

    expect(screen.queryByRole("textbox", { name: "Image URL" })).toBeNull();
    expect(screen.getByLabelText("Image file")).not.toBeNull();
  });

  it("파일을 선택하면 uploadMediaFile을 호출하고 loading 동안 input을 비활성화한다", () => {
    let resolveUpload: (value: UploadMediaFileResult) => void = () => {};
    const uploadMediaFile = vi.fn(
      () =>
        new Promise<UploadMediaFileResult>((resolve) => {
          resolveUpload = resolve;
        }),
    );
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
      isUploadEnabled: () => true,
      uploadMediaFile,
    });
    renderPanel(controller);
    fireEvent.click(screen.getByRole("tab", { name: "Upload" }));

    const file = new File(["x"], "photo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image file"), {
      target: { files: [file] },
    });

    expect(uploadMediaFile).toHaveBeenCalledWith("media-1", file);
    expect(screen.getByRole("status")).not.toBeNull();
    expect(
      (screen.getByLabelText("Image file") as HTMLInputElement).disabled,
    ).toBe(true);
    void resolveUpload!;
  });

  it("업로드가 성공(pending null)하면 idle로 돌아가 파일 input이 다시 나타난다", async () => {
    const uploadMediaFile = vi.fn(() =>
      Promise.resolve<UploadMediaFileResult>({ ok: true, value: undefined }),
    );
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
      isUploadEnabled: () => true,
      uploadMediaFile,
      getMediaUploadState: () => null,
    });
    renderPanel(controller);
    fireEvent.click(screen.getByRole("tab", { name: "Upload" }));

    const file = new File(["x"], "photo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image file"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.queryByRole("status")).toBeNull();
    });
    expect(
      (screen.getByLabelText("Image file") as HTMLInputElement).disabled,
    ).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("업로드가 실패(pending error)하면 에러 메시지와 Retry 버튼을 보여준다", async () => {
    const uploadMediaFile = vi.fn(() =>
      Promise.resolve<UploadMediaFileResult>({ ok: true, value: undefined }),
    );
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
      isUploadEnabled: () => true,
      uploadMediaFile,
      getMediaUploadState: () => ({
        status: "error",
        code: "UPLOAD_FAILED",
        message: "네트워크 오류로 업로드에 실패했다",
      }),
    });
    renderPanel(controller);
    fireEvent.click(screen.getByRole("tab", { name: "Upload" }));

    const file = new File(["x"], "photo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image file"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "네트워크 오류로 업로드에 실패했다",
      );
    });
    expect(screen.getByRole("button", { name: "Retry" })).not.toBeNull();
  });

  it("Retry 클릭 시 파일 선택 없이 같은 File로 uploadMediaFile을 재호출한다", async () => {
    let callCount = 0;
    const uploadMediaFile = vi.fn(() => {
      callCount += 1;
      return Promise.resolve<UploadMediaFileResult>({
        ok: true,
        value: undefined,
      });
    });
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
      isUploadEnabled: () => true,
      uploadMediaFile,
      getMediaUploadState: () =>
        callCount < 2
          ? { status: "error", code: "UPLOAD_FAILED", message: "실패" }
          : null,
    });
    renderPanel(controller);
    fireEvent.click(screen.getByRole("tab", { name: "Upload" }));

    const file = new File(["x"], "photo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image file"), {
      target: { files: [file] },
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Retry" })).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(uploadMediaFile).toHaveBeenCalledTimes(2);
    expect(uploadMediaFile).toHaveBeenNthCalledWith(1, "media-1", file);
    expect(uploadMediaFile).toHaveBeenNthCalledWith(2, "media-1", file);
  });

  it("uploading 중 Cancel 클릭 시 cancelMediaUpload를 호출한다", () => {
    const uploadMediaFile = vi.fn(() => new Promise<never>(() => {}));
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
      isUploadEnabled: () => true,
      uploadMediaFile,
    });
    renderPanel(controller);
    fireEvent.click(screen.getByRole("tab", { name: "Upload" }));

    const file = new File(["x"], "photo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image file"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(controller.commands.cancelMediaUpload).toHaveBeenCalledWith(
      "media-1",
    );
  });

  it("uploadMediaFile이 사전조건 실패(ok:false)를 반환해도 에러 상태로 전이한다", async () => {
    const uploadMediaFile = vi.fn(() =>
      Promise.resolve<UploadMediaFileResult>({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "uploadMediaFile" },
      }),
    );
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
      isUploadEnabled: () => true,
      uploadMediaFile,
    });
    renderPanel(controller);
    fireEvent.click(screen.getByRole("tab", { name: "Upload" }));

    const file = new File(["x"], "photo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image file"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).not.toBeNull();
    });
  });

  it("패널을 재오픈했을 때 시딩된 에러는 보여주되 heldFile이 없어 Retry는 숨긴다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
      isUploadEnabled: () => true,
      getMediaUploadState: () => ({
        status: "error",
        code: "UPLOAD_FAILED",
        message: "이전 시도 실패",
      }),
    });
    renderPanel(controller);

    fireEvent.click(screen.getByRole("tab", { name: "Upload" }));

    expect(screen.getByRole("alert").textContent).toBe("이전 시도 실패");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});
