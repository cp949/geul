// @vitest-environment jsdom

/**
 * MediaToolbar 컴포넌트: url 있는 미디어 블록 선택 시 rename/caption/
 * delete/download 4개 control 노출(image/video/audio는 preview 토글까지
 * 5개, 슬라이스5 RD-002 DELTA-02), 빈 블록(url 없음)에는 렌더링하지
 * 않음(FilePanel과 상호 배타), rename/caption의 draft/Save/Cancel 편집과
 * 실패 시 에러 표시, delete의 명령 호출, download 링크의 href/download
 * 속성, selectionchange에 따른 표시·숨김 전환, Escape/바깥 클릭에 따른
 * 닫힘과 focus 복원 차이(RD-004 DELTA-01), Replace 트리거의 파일 선택·
 * loading/에러·retry·cancel(RD-003 DELTA-03), preview 토글의 노출 조건·
 * aria-pressed·명령 호출과 실패 처리(슬라이스5 RD-002 DELTA-02)를 검증한다.
 * image/video 전용 정렬 버튼 3개(좌/중/우)의 노출 조건(audio/file 제외)·
 * aria-pressed·클릭(같은 값 재클릭 시 null 해제)·실패 처리도 검증한다
 * (Issue #154, MED-009).
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

import { EditorContent, MediaToolbar } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { queryMountedEditable } from "./query-mounted-editable.js";

// link-toolbar.test.tsx/file-panel.test.tsx와 같은 이유(@testing-library/react가
// 전역 afterEach/teardown이 함수일 때만 자동 cleanup을 등록하는데, 저장소
// vitest.config.ts는 globals:true가 아니라 자동 등록이 없다).
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

type CommandResult = { ok: boolean; error?: { code: string } };

type ReplaceMediaFileResult =
  { ok: true; value: undefined } | { ok: false; error: EditorError };

type MediaUploadState =
  "uploading" | { status: "error"; code: string; message: string } | null;

type FakeControllerOptions = {
  getSelectionMediaBlock?: () => SelectionMediaBlock | null;
  setMediaBlockName?: (blockId: string, name: string) => CommandResult;
  setMediaBlockCaption?: (blockId: string, caption: string) => CommandResult;
  setMediaShowPreview?: (blockId: string, show: boolean) => CommandResult;
  setMediaTextAlignment?: (
    blockId: string,
    alignment: "left" | "center" | "right" | null,
  ) => CommandResult;
  deleteBlock?: (blockId: string) => CommandResult;
  isUploadEnabled?: () => boolean;
  getMediaUploadState?: (blockId: string) => MediaUploadState;
  replaceMediaBlockFile?: (
    blockId: string,
    file: File,
  ) => Promise<ReplaceMediaFileResult>;
};

const fakeController = ({
  getSelectionMediaBlock = () => null,
  setMediaBlockName = () => ({ ok: true }),
  setMediaBlockCaption = () => ({ ok: true }),
  setMediaShowPreview = () => ({ ok: true }),
  setMediaTextAlignment = () => ({ ok: true }),
  deleteBlock = () => ({ ok: true }),
  isUploadEnabled = () => false,
  getMediaUploadState = () => null,
  replaceMediaBlockFile = () => Promise.resolve({ ok: true, value: undefined }),
}: FakeControllerOptions = {}) => ({
  mount: vi.fn((element: HTMLElement) => {
    const editable = document.createElement("div");
    // jsdom은 contentEditable IDL 프로퍼티를 속성으로 반영하지 않는다
    // (link-toolbar.test.tsx/file-panel.test.tsx와 같은 이유).
    editable.setAttribute("contenteditable", "true");
    // 대상 미디어 블록의 렌더 DOM(RD-002 DELTA-01 계약) — MediaToolbar의
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
    setMediaBlockName: vi.fn(setMediaBlockName),
    setMediaBlockCaption: vi.fn(setMediaBlockCaption),
    setMediaShowPreview: vi.fn(setMediaShowPreview),
    setMediaTextAlignment: vi.fn(setMediaTextAlignment),
    deleteBlock: vi.fn(deleteBlock),
    replaceMediaBlockFile: vi.fn(replaceMediaBlockFile),
    cancelMediaUpload: vi.fn(() => ({ ok: true, value: undefined })),
  },
});

const emptyImageBlock: SelectionMediaBlock = {
  blockId: "media-1",
  kind: "image",
  url: null,
  name: null,
  caption: null,
  showPreview: true,
  textAlignment: null,
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

const filledFileBlock: SelectionMediaBlock = {
  blockId: "media-1",
  kind: "file",
  url: "https://example.com/dir/doc.pdf",
  name: "doc.pdf",
  caption: null,
  showPreview: null,
  textAlignment: null,
};

// 정렬 버튼 노출 조건(image/video만) 검증용 — Preview 버튼 노출 조건
// (file만 제외)과 반대 kind 집합이라 file 픽스처만으로는 audio 배제를
// 확인할 수 없다(Issue #154, MED-009).
const filledAudioBlock: SelectionMediaBlock = {
  blockId: "media-1",
  kind: "audio",
  url: "https://example.com/dir/track.mp3",
  name: "track.mp3",
  caption: null,
  showPreview: true,
  textAlignment: null,
};

const renderToolbar = (controller: ReturnType<typeof fakeController>) =>
  render(
    withProvider(
      controller,
      <>
        <MediaToolbar />
        <EditorContent />
      </>,
    ),
  );

const getEditable = () => {
  const host = screen.getByRole("textbox", { name: "Editor" });
  return queryMountedEditable(host);
};

describe("MediaToolbar 미디어 편집 toolbar", () => {
  it("선택된 미디어 블록이 없으면 렌더링하지 않는다", () => {
    renderToolbar(fakeController());

    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("url 없는 미디어 블록을 선택하면 렌더링하지 않는다(FilePanel 담당)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
    });
    renderToolbar(controller);

    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("url 있는 미디어 블록을 선택하면 5개 control이 보인다(image/video/audio, 슬라이스5 RD-002 DELTA-02)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);

    expect(
      screen.getByRole("toolbar", { name: "Media toolbar" }),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Rename" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Edit caption" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Preview" })).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Delete media block" }),
    ).not.toBeNull();
    expect(screen.getByRole("link", { name: "Download" })).not.toBeNull();
  });

  it("file 대상은 Preview 토글 버튼이 없다(4개 control, 슬라이스5 RD-002 DELTA-02)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledFileBlock,
    });
    renderToolbar(controller);

    expect(screen.getByRole("button", { name: "Rename" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Edit caption" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Preview" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Delete media block" }),
    ).not.toBeNull();
    expect(screen.getByRole("link", { name: "Download" })).not.toBeNull();
  });

  it("Preview 버튼은 현재 showPreview 값을 aria-pressed로 반영한다(슬라이스5 RD-002 DELTA-02)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => ({
        ...filledImageBlock,
        showPreview: false,
      }),
    });
    renderToolbar(controller);

    expect(
      screen
        .getByRole("button", { name: "Preview" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("Preview 클릭 시 setMediaShowPreview를 반대 값으로 호출하고 aria-pressed가 갱신된다(슬라이스5 RD-002 DELTA-02)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(controller.commands.setMediaShowPreview).toHaveBeenCalledWith(
      "media-1",
      false,
    );
    expect(
      screen
        .getByRole("button", { name: "Preview" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("Preview 토글이 거부되면 aria-pressed를 바꾸지 않고 에러를 표시한다(슬라이스5 RD-002 DELTA-02)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
      setMediaShowPreview: () => ({
        ok: false,
        error: { code: "BLOCK_NOT_FOUND" },
      }),
    });
    renderToolbar(controller);

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(screen.getByRole("alert")).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Preview" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("url 있는 image/video 블록을 선택하면 정렬 버튼 3개가 보인다(Issue #154, MED-009)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);

    expect(screen.getByRole("button", { name: "Align left" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Align center" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Align right" })).not.toBeNull();
  });

  it("file/audio 대상은 정렬 버튼이 없다(Issue #154, MED-009)", () => {
    const fileController = fakeController({
      getSelectionMediaBlock: () => filledFileBlock,
    });
    renderToolbar(fileController);
    expect(screen.queryByRole("button", { name: "Align left" })).toBeNull();
    cleanup();

    const audioController = fakeController({
      getSelectionMediaBlock: () => filledAudioBlock,
    });
    renderToolbar(audioController);
    expect(screen.queryByRole("button", { name: "Align left" })).toBeNull();
  });

  it("정렬 버튼은 현재 textAlignment 값을 aria-pressed로 반영한다(Issue #154, MED-009)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => ({
        ...filledImageBlock,
        textAlignment: "center",
      }),
    });
    renderToolbar(controller);

    expect(
      screen
        .getByRole("button", { name: "Align left" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen
        .getByRole("button", { name: "Align center" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Align right" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("정렬 버튼 클릭 시 setMediaTextAlignment를 호출하고 aria-pressed가 갱신된다(Issue #154, MED-009)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);

    fireEvent.click(screen.getByRole("button", { name: "Align right" }));

    expect(controller.commands.setMediaTextAlignment).toHaveBeenCalledWith(
      "media-1",
      "right",
    );
    expect(
      screen
        .getByRole("button", { name: "Align right" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("이미 활성인 정렬 버튼을 다시 클릭하면 null로 해제한다(Issue #154, MED-009)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => ({
        ...filledImageBlock,
        textAlignment: "right",
      }),
    });
    renderToolbar(controller);

    fireEvent.click(screen.getByRole("button", { name: "Align right" }));

    expect(controller.commands.setMediaTextAlignment).toHaveBeenCalledWith(
      "media-1",
      null,
    );
    expect(
      screen
        .getByRole("button", { name: "Align right" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("정렬 변경이 거부되면 aria-pressed를 바꾸지 않고 에러를 표시한다(Issue #154, MED-009)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
      setMediaTextAlignment: () => ({
        ok: false,
        error: { code: "BLOCK_NOT_FOUND" },
      }),
    });
    renderToolbar(controller);

    fireEvent.click(screen.getByRole("button", { name: "Align left" }));

    expect(screen.getByRole("alert")).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Align left" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("Rename 클릭 시 현재 이름을 기본값으로 편집 입력에 초점이 간다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    const input = screen.getByRole("textbox", {
      name: "Image name",
    }) as HTMLInputElement;
    expect(input.value).toBe("photo.png");
    expect(document.activeElement).toBe(input);
  });

  it("이름을 바꿔 저장하면 setMediaBlockName을 호출하고 view로 돌아간다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Image name" }), {
      target: { value: "renamed.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    expect(controller.commands.setMediaBlockName).toHaveBeenCalledWith(
      "media-1",
      "renamed.png",
    );
    expect(screen.queryByRole("textbox", { name: "Image name" })).toBeNull();
    expect(screen.getByRole("button", { name: "Rename" })).not.toBeNull();
  });

  it("Enter로도 이름을 제출한다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: "Image name" });
    fireEvent.change(input, { target: { value: "renamed.png" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(controller.commands.setMediaBlockName).toHaveBeenCalledWith(
      "media-1",
      "renamed.png",
    );
  });

  it("이름이 바뀌지 않았으면 저장해도 setMediaBlockName을 호출하지 않는다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    expect(controller.commands.setMediaBlockName).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Rename" })).not.toBeNull();
  });

  it("이름 저장이 거부되면 편집 모드를 유지하고 에러를 표시한다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
      setMediaBlockName: () => ({
        ok: false,
        error: { code: "BLOCK_NOT_FOUND" },
      }),
    });
    renderToolbar(controller);

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Image name" }), {
      target: { value: "renamed.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    expect(screen.getByRole("alert")).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "Image name" })).not.toBeNull();
  });

  it("Escape로 이름 편집을 취소하면 원래 값을 유지한 채 view로 돌아간다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);
    const editable = getEditable();

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Image name" }), {
      target: { value: "discarded.png" },
    });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Image name" }), {
      key: "Escape",
    });

    expect(controller.commands.setMediaBlockName).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Image name" })).toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  it("Caption 클릭 시 현재 caption을 기본값으로 편집 입력에 초점이 간다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => ({
        ...filledImageBlock,
        caption: "지금 caption",
      }),
    });
    renderToolbar(controller);

    fireEvent.click(screen.getByRole("button", { name: "Edit caption" }));

    const input = screen.getByRole("textbox", {
      name: "Image caption",
    }) as HTMLInputElement;
    expect(input.value).toBe("지금 caption");
    expect(document.activeElement).toBe(input);
  });

  it("caption을 바꿔 저장하면 setMediaBlockCaption을 호출한다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);

    fireEvent.click(screen.getByRole("button", { name: "Edit caption" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Image caption" }), {
      target: { value: "새 caption" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save caption" }));

    expect(controller.commands.setMediaBlockCaption).toHaveBeenCalledWith(
      "media-1",
      "새 caption",
    );
  });

  it("Delete 클릭 시 deleteBlock을 호출한다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);

    fireEvent.click(screen.getByRole("button", { name: "Delete media block" }));

    expect(controller.commands.deleteBlock).toHaveBeenCalledWith("media-1");
  });

  it("delete가 거부되면 에러를 표시한다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
      deleteBlock: () => ({ ok: false, error: { code: "BLOCK_NOT_FOUND" } }),
    });
    renderToolbar(controller);

    fireEvent.click(screen.getByRole("button", { name: "Delete media block" }));

    expect(screen.getByRole("alert")).not.toBeNull();
  });

  it("Download 링크가 href와 download 속성을 렌더한다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);

    const download = screen.getByRole("link", { name: "Download" });
    expect(download.getAttribute("href")).toBe(
      "https://example.com/dir/photo.png",
    );
    expect(download.getAttribute("download")).toBe("photo.png");
  });

  it("name이 없으면 download 속성값이 비어 있다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => ({ ...filledImageBlock, name: null }),
    });
    renderToolbar(controller);

    const download = screen.getByRole("link", { name: "Download" });
    expect(download.getAttribute("download")).toBe("");
  });

  it("Escape는 toolbar를 닫고 편집기로 focus를 복원한다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);
    const editable = getEditable();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(document.activeElement).toBe(editable);
  });

  it("바깥 클릭은 toolbar를 닫되 focus를 옮기지 않는다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);

    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();

    fireEvent.pointerDown(outside);

    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it("리사이즈 핸들 pointerdown은 바깥 클릭으로 취급하지 않는다(RD-001 DELTA-02 회귀)", () => {
    // media-resize-handles.tsx의 MediaResizeHandles는 app.tsx에서
    // MediaToolbar와 형제로 마운트되고, 실제로 그리는 핸들은
    // `[data-be-block-id]` 밖의 fixed 오버레이 div다(여기선 그 모양만
    // 재현한다) — 이 selector가 allow-list에 없으면 드래그 시작
    // pointerdown 자체가 "바깥 클릭"으로 오판정돼 toolbar가 닫히고,
    // 드래그 중 선택이 그대로 유지되는 한(resize는 selection을 바꾸지
    // 않는다) dismissedBlockIdRef가 계속 같은 블록을 가리켜 재오픈도
    // 막힌다(media-toolbar.tsx dismissedBlockIdRef 주석 참고).
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);

    const handle = document.createElement("div");
    handle.setAttribute("data-be-media-resize-handle", "right");
    document.body.append(handle);

    fireEvent.pointerDown(handle);

    expect(screen.queryByRole("toolbar")).not.toBeNull();
    handle.remove();
  });
});

describe("MediaToolbar Replace 트리거(RD-003 DELTA-03)", () => {
  it("uploadFile 미등록 시 Replace 버튼이 보이지 않는다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);

    expect(screen.queryByRole("button", { name: "Replace file" })).toBeNull();
  });

  it("uploadFile 등록 시 Replace 버튼이 보이고 클릭하면 file input이 나타난다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
      isUploadEnabled: () => true,
    });
    renderToolbar(controller);

    fireEvent.click(screen.getByRole("button", { name: "Replace file" }));

    expect(screen.getByLabelText("Image file")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
  });

  it("파일을 선택하면 replaceMediaBlockFile을 호출하고 loading을 보여준다", () => {
    const replaceMediaBlockFile = vi.fn(() => new Promise<never>(() => {}));
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
      isUploadEnabled: () => true,
      replaceMediaBlockFile,
    });
    renderToolbar(controller);
    fireEvent.click(screen.getByRole("button", { name: "Replace file" }));

    const file = new File(["x"], "new.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image file"), {
      target: { files: [file] },
    });

    expect(replaceMediaBlockFile).toHaveBeenCalledWith("media-1", file);
    expect(screen.getByRole("status")).not.toBeNull();
  });

  it("교체 성공 시 view로 돌아가 갱신된 url/name을 반영한다", async () => {
    let callCount = 0;
    const controller = fakeController({
      getSelectionMediaBlock: () => {
        callCount += 1;
        // 첫 조회(마운트)는 교체 전 값, 이후(교체 성공 재조회)는 새 값.
        return callCount === 1
          ? filledImageBlock
          : {
              ...filledImageBlock,
              url: "https://example.com/dir/new.png",
              name: "new.png",
            };
      },
      isUploadEnabled: () => true,
      replaceMediaBlockFile: () =>
        Promise.resolve<ReplaceMediaFileResult>({ ok: true, value: undefined }),
      getMediaUploadState: () => null,
    });
    renderToolbar(controller);
    fireEvent.click(screen.getByRole("button", { name: "Replace file" }));

    const file = new File(["x"], "new.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image file"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Rename" })).not.toBeNull();
    });
    const download = screen.getByRole("link", { name: "Download" });
    expect(download.getAttribute("href")).toBe(
      "https://example.com/dir/new.png",
    );
    expect(download.getAttribute("download")).toBe("new.png");
  });

  it("교체 실패 시 에러와 Retry를 보여주고 view로 돌아가지 않는다(기존 값 유지)", async () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
      isUploadEnabled: () => true,
      replaceMediaBlockFile: () =>
        Promise.resolve<ReplaceMediaFileResult>({ ok: true, value: undefined }),
      getMediaUploadState: () => ({
        status: "error",
        code: "UPLOAD_FAILED",
        message: "교체 실패",
      }),
    });
    renderToolbar(controller);
    fireEvent.click(screen.getByRole("button", { name: "Replace file" }));

    const file = new File(["x"], "new.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image file"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("교체 실패");
    });
    expect(screen.getByRole("button", { name: "Retry" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
  });

  it("Retry 클릭 시 같은 File로 replaceMediaBlockFile을 재호출한다", async () => {
    let callCount = 0;
    const replaceMediaBlockFile = vi.fn(() => {
      callCount += 1;
      return Promise.resolve<ReplaceMediaFileResult>({
        ok: true,
        value: undefined,
      });
    });
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
      isUploadEnabled: () => true,
      replaceMediaBlockFile,
      getMediaUploadState: () =>
        callCount < 2
          ? { status: "error", code: "UPLOAD_FAILED", message: "실패" }
          : null,
    });
    renderToolbar(controller);
    fireEvent.click(screen.getByRole("button", { name: "Replace file" }));

    const file = new File(["x"], "new.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image file"), {
      target: { files: [file] },
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Retry" })).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(replaceMediaBlockFile).toHaveBeenCalledTimes(2);
    });
    expect(replaceMediaBlockFile).toHaveBeenNthCalledWith(1, "media-1", file);
    expect(replaceMediaBlockFile).toHaveBeenNthCalledWith(2, "media-1", file);
  });

  it("uploading 중 Cancel 클릭 시 cancelMediaUpload를 호출하고 view로 돌아간다(기존 값 유지)", () => {
    const replaceMediaBlockFile = vi.fn(() => new Promise<never>(() => {}));
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
      isUploadEnabled: () => true,
      replaceMediaBlockFile,
    });
    renderToolbar(controller);
    fireEvent.click(screen.getByRole("button", { name: "Replace file" }));

    const file = new File(["x"], "new.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image file"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(controller.commands.cancelMediaUpload).toHaveBeenCalledWith(
      "media-1",
    );
    const download = screen.getByRole("link", { name: "Download" });
    expect(download.getAttribute("href")).toBe(
      "https://example.com/dir/photo.png",
    );
  });

  it("에러 상태에서 Cancel 클릭 시 재시도 없이 view(기존 값)로 돌아간다", async () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
      isUploadEnabled: () => true,
      replaceMediaBlockFile: () =>
        Promise.resolve<ReplaceMediaFileResult>({ ok: true, value: undefined }),
      getMediaUploadState: () => ({
        status: "error",
        code: "UPLOAD_FAILED",
        message: "교체 실패",
      }),
    });
    renderToolbar(controller);
    fireEvent.click(screen.getByRole("button", { name: "Replace file" }));

    const file = new File(["x"], "new.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image file"), {
      target: { files: [file] },
    });
    await waitFor(() => {
      expect(screen.getByRole("alert")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Rename" })).not.toBeNull();
    const download = screen.getByRole("link", { name: "Download" });
    expect(download.getAttribute("href")).toBe(
      "https://example.com/dir/photo.png",
    );
  });
});
