// @vitest-environment jsdom

/**
 * FilePanel 컴포넌트: url 없는 미디어 블록 선택 시 자동 열림, URL 제출
 * 시 setMediaBlockUrl 호출과 이름 초깃값(마지막 path segment) 추출·표시,
 * 거부된 URL의 인라인 메시지, Escape/바깥 클릭에 따른 닫힘과 focus
 * 복원 차이(RD-003 DELTA-01), Upload 탭의 파일 선택·loading/에러·
 * retry·cancel(RD-003 DELTA-02)을 검증한다.
 */

import {
  DEFAULT_DICTIONARY,
  type Dictionary,
  type EditorController,
  type EditorError,
  type MediaBlockKind,
} from "@cp949/geul-core";
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
  // 드래그·드롭/paste가 uploadFile 콜백 없이 만든 로컬 프리뷰(ADR 0015).
  // 기본값 []는 "로컬 프리뷰 없음"(대부분의 테스트가 전제하는 상태)이다.
  getPendingLocalPreviews?: () => { blockId: string; file: File }[];
  dictionary?: Dictionary;
};

const fakeController = ({
  getSelectionMediaBlock = () => null,
  setMediaBlockUrl = () => ({ ok: true }),
  isUploadEnabled = () => false,
  getMediaUploadState = () => null,
  uploadMediaFile = () => Promise.resolve({ ok: true, value: undefined }),
  getPendingLocalPreviews = () => [],
  dictionary,
}: FakeControllerOptions = {}) => ({
  mount: vi.fn((element: HTMLElement) => {
    const editable = document.createElement("div");
    // link-toolbar.test.tsx와 같은 이유 — jsdom은 contentEditable IDL
    // 프로퍼티를 속성으로 반영하지 않는다.
    editable.setAttribute("contenteditable", "true");
    // 대상 미디어 블록의 렌더 DOM(RD-002 DELTA-01 계약) — FilePanel의
    // readBlockBounds가 이 selector로 앵커 좌표를 찾는다.
    const mediaBlockElement = document.createElement("div");
    mediaBlockElement.setAttribute("data-geul-block-id", "media-1");
    editable.append(mediaBlockElement);
    element.append(editable);
  }),
  unmount: vi.fn(),
  destroy: vi.fn(),
  getDocument: vi.fn(),
  getSelectionMediaBlock: vi.fn(getSelectionMediaBlock),
  isUploadEnabled: vi.fn(isUploadEnabled),
  getMediaUploadState: vi.fn(getMediaUploadState),
  getPendingLocalPreviews: vi.fn(getPendingLocalPreviews),
  getDictionary: vi.fn(() => dictionary ?? DEFAULT_DICTIONARY),
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

  it("url은 없어도 로컬 프리뷰가 있는 미디어 블록을 선택하면 렌더링하지 않는다(드래그·드롭 UI 겹침 회귀, 2026-09-11 사용자 보고)", () => {
    // uploadFile 콜백 없이 드래그·드롭/paste로 삽입된 미디어는 url이
    // 계속 null이지만 로컬 프리뷰(ADR 0015)로 이미 이미지가 보인다.
    // url===null만 보고 패널을 열면 이미 보이는 이미지 위에 곧바로
    // 겹쳐 뜬다 — getPendingLocalPreviews()로 이 블록을 알아채 url이
    // 있는 경우와 동일하게 취급해야 한다.
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
      getPendingLocalPreviews: () => [
        { blockId: emptyImageBlock.blockId, file: new File(["x"], "x.png") },
      ],
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

  it("패널이 열린 뒤 대상 블록이 사라지면(undo 등) 다음 재관측에서 패널이 닫힌다", () => {
    // QA-067 — undo로 빈 미디어 블록이 사라져 selection이 더 이상
    // NodeSelection이 아니게 된 뒤에도(getSelectionMediaBlock이 null을
    // 반환) 패널이 열린 채로 멈춰 있던 결함의 회귀 테스트. 키보드만으로
    // undo하면 마우스 아웃사이드 클릭·Escape가 없어 editingRef가 영영
    // true로 굳어버렸다 — keyup(예: ctrl+z의 keyup)만으로도 재관측이
    // 실제로 갱신돼야 한다.
    let selectionMediaBlock: SelectionMediaBlock | null = emptyImageBlock;
    const controller = fakeController({
      getSelectionMediaBlock: () => selectionMediaBlock,
    });
    renderPanel(controller);
    expect(screen.getByRole("toolbar", { name: "File panel" })).not.toBeNull();

    selectionMediaBlock = null;
    fireEvent.keyUp(document, { key: "z", ctrlKey: true });

    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("이미 같은 블록에 열려 있으면 재관측이 입력 중인 draft를 지우지 않는다", () => {
    // 위 회귀 테스트의 반대편 계약 — 같은 블록에 대해 selection이 계속
    // NodeSelection으로 재관측돼도(타이핑 중 keyup 등) 이미 입력 중인
    // draft·activeTab 등 로컬 상태를 되돌리면 안 된다.
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
    });
    renderPanel(controller);

    const input = screen.getByRole("textbox", { name: "Image URL" });
    fireEvent.change(input, {
      target: { value: "https://example.com/dir/photo.png" },
    });
    fireEvent.keyUp(document, { key: "o" });

    expect(screen.getByRole("textbox", { name: "Image URL" })).toHaveProperty(
      "value",
      "https://example.com/dir/photo.png",
    );
  });

  it("kind별로 URL 입력 라벨이 다르다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => ({ ...emptyImageBlock, kind: "video" }),
    });
    renderPanel(controller);

    expect(screen.getByRole("textbox", { name: "Video URL" })).not.toBeNull();
  });

  // 2026-09-11 피드백 — 무엇을 입력해야 하는지 input만 보고는 알 수 없다는
  // 사용자 confusion을 반영한다. urlInputAriaLabel과 같은 {kind} 토큰
  // 치환 관용구를 쓴다(위 "kind별로 URL 입력 라벨이 다르다"와 같은 패턴).
  it("URL 입력에 kind별 placeholder가 보인다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => ({ ...emptyImageBlock, kind: "video" }),
    });
    renderPanel(controller);

    expect(screen.getByRole("textbox", { name: "Video URL" })).toHaveProperty(
      "placeholder",
      "Paste Video URL",
    );
  });

  it("Embed 버튼 텍스트와 하단 안내 caption이 kind별로 치환된다(Notion parity, 2026-09-12)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => ({ ...emptyImageBlock, kind: "video" }),
    });
    renderPanel(controller);

    const saveButton = screen.getByRole("button", { name: "Save URL" });
    expect(saveButton.textContent).toBe("Embed Video");
    expect(
      screen.getByText("Works with any Video link on the web"),
    ).not.toBeNull();
  });

  it("dictionary override 시 컨테이너·탭·URL 라벨·Save URL(aria-label≠텍스트)·Close가 바뀐다(EXT-009)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
      isUploadEnabled: () => true,
      dictionary: {
        ...DEFAULT_DICTIONARY,
        toolbar: {
          ...DEFAULT_DICTIONARY.toolbar,
          kindNames: { ...DEFAULT_DICTIONARY.toolbar.kindNames, image: "사진" },
          filePanel: {
            ...DEFAULT_DICTIONARY.toolbar.filePanel,
            ariaLabel: "파일 패널",
            embedTab: "삽입",
            uploadTab: "업로드",
            urlInputAriaLabel: "{kind} 링크",
            urlInputPlaceholder: "{kind} 링크 붙여넣기",
            saveUrl: "URL 저장하기",
            save: "저장",
            closeAriaLabel: "파일 패널 닫기",
            close: "닫기",
          },
        },
      },
    });
    renderPanel(controller);

    expect(screen.getByRole("toolbar", { name: "파일 패널" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "삽입" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "업로드" })).toBeTruthy();
    // 기본 활성 탭이 업로드다(Notion parity, 2026-09-12) — Embed 필드를
    // 보려면 삽입 탭으로 전환해야 한다.
    fireEvent.click(screen.getByRole("tab", { name: "삽입" }));
    const urlInput = screen.getByRole("textbox", { name: "사진 링크" });
    expect(urlInput).toBeTruthy();
    expect(urlInput).toHaveProperty("placeholder", "사진 링크 붙여넣기");
    const saveButton = screen.getByRole("button", { name: "URL 저장하기" });
    expect(saveButton.textContent).toBe("저장");
    // 닫기는 아이콘 전용 버튼(2026-09-12, 사용자 지시)이라 close 문구는
    // 화면에 보이는 textContent가 아니라 title(hover tooltip)로 반영된다
    // — aria-label(accessible name)은 closeAriaLabel 단일 소스로 남는다.
    const closeButton = screen.getByRole("button", { name: "파일 패널 닫기" });
    expect(closeButton.textContent).toBe("");
    expect(closeButton.getAttribute("title")).toBe("닫기");
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

  it("dictionary override 시 거부 메시지(Unsupported media URL)가 바뀐다(EXT-009)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
      setMediaBlockUrl: () => ({
        ok: false,
        error: { code: "LINK_HREF_REJECTED" },
      }),
      dictionary: {
        ...DEFAULT_DICTIONARY,
        status: {
          ...DEFAULT_DICTIONARY.status,
          unsupportedMediaUrl: "지원하지 않는 미디어 URL",
        },
      },
    });
    renderPanel(controller);

    fireEvent.change(screen.getByRole("textbox", { name: "Image URL" }), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save URL" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "지원하지 않는 미디어 URL",
    );
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

  // 2026-09-13 사용자 보고 — Close로 닫은 뒤 남은 빈 미디어 블록(회색
  // 영역)을 다시 클릭해도 패널이 다시 열리지 않던 회귀. dismissedBlockIdRef
  // 가 "같은 이벤트의 지연된 잔여물"과 "새 클릭·재진입"을 구분 못 해
  // 생겼다(gestureSeqRef 주석 참고, file-panel.tsx).
  it("Close 직후 새 pointerdown 없이 도착하는 지연 이벤트는 재오픈시키지 않는다(기존 레이스 방지 유지)", async () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
    });
    renderPanel(controller);

    fireEvent.click(screen.getByRole("button", { name: "Close file panel" }));
    expect(screen.queryByRole("toolbar")).toBeNull();

    // editingRef의 setTimeout(0) 창이 끝난 뒤에도, 새 pointerdown·keydown
    // 없이 도착하는 mouseup(지연된 잔여 이벤트를 흉내낸다)은 여전히
    // 막아야 한다 — 이게 dismissedBlockIdRef의 원래 목적이다.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.mouseUp(document);

    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("Close 직후 같은 빈 블록(회색 영역)을 다시 클릭하면 패널이 재오픈된다(2026-09-13 버그 수정)", async () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
    });
    renderPanel(controller);

    fireEvent.click(screen.getByRole("button", { name: "Close file panel" }));
    expect(screen.queryByRole("toolbar")).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));
    // 회색 영역 재클릭 — pointerdown이 뒤따르는 mouseup보다 먼저 온다.
    fireEvent.pointerDown(document.body);
    fireEvent.mouseUp(document);

    expect(screen.getByRole("toolbar", { name: "File panel" })).not.toBeNull();
  });

  it("Close 직후 키보드로 같은 빈 블록에 재진입해도 패널이 재오픈된다(2026-09-13 버그 수정)", async () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
    });
    renderPanel(controller);

    fireEvent.click(screen.getByRole("button", { name: "Close file panel" }));
    expect(screen.queryByRole("toolbar")).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));
    // 화살표 키로 같은 블록에 재진입 — keydown이 뒤따르는 keyup보다
    // 먼저 온다.
    fireEvent.keyDown(document, { key: "ArrowRight" });
    fireEvent.keyUp(document, { key: "ArrowRight" });

    expect(screen.getByRole("toolbar", { name: "File panel" })).not.toBeNull();
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

  it("uploadFile 등록 시 Embed/Upload 탭이 보이고 기본 활성 탭은 Upload다(Notion parity, 2026-09-12 — RD-003-DELTA-02 기본 Embed 결정 번복)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
      isUploadEnabled: () => true,
    });
    renderPanel(controller);

    const embedTab = screen.getByRole("tab", { name: "Embed" });
    const uploadTab = screen.getByRole("tab", { name: "Upload" });
    expect(uploadTab.getAttribute("aria-selected")).toBe("true");
    expect(embedTab.getAttribute("aria-selected")).toBe("false");
    expect(document.activeElement).toBe(screen.getByLabelText("Image file"));
  });

  it("uploadFile 미등록 시(단일 Embed 모드)에는 여전히 URL 입력이 기본이고 초점을 받는다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
    });
    renderPanel(controller);

    expect(screen.queryByRole("tab")).toBeNull();
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

    // 기본 활성 탭이 이미 Upload라 전환을 실제로 검증하려면 Embed로
    // 먼저 옮긴 뒤 되돌아와야 한다.
    fireEvent.click(screen.getByRole("tab", { name: "Embed" }));
    fireEvent.click(screen.getByRole("tab", { name: "Upload" }));

    expect(screen.queryByRole("textbox", { name: "Image URL" })).toBeNull();
    expect(screen.getByLabelText("Image file")).not.toBeNull();
  });

  it("Embed 탭으로 전환하면 URL 입력에 초점이 간다(2026-09-12 — 기본 탭 Upload 전환에 맞춰 Embed 탭 초점도 전환 시 부여하도록 일반화)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
      isUploadEnabled: () => true,
    });
    renderPanel(controller);

    fireEvent.click(screen.getByRole("tab", { name: "Embed" }));

    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Image URL" }),
    );
  });

  it("파일 업로드 버튼 클릭 시 숨은 file input의 파일 선택 대화상자를 연다(Notion parity, 2026-09-12)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
      isUploadEnabled: () => true,
    });
    renderPanel(controller);

    const fileInput = screen.getByLabelText("Image file") as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, "click").mockImplementation(() => {});

    fireEvent.click(screen.getByRole("button", { name: "Upload file" }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
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

  it("업로드가 성공(pending null)하면 패널이 자동으로 닫히고 편집기로 focus를 복원한다(2026-09-12, 사용자 지시 — RD-003-DELTA-02.md '결정' 3 번복)", async () => {
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
    const editable = getEditable();
    fireEvent.click(screen.getByRole("tab", { name: "Upload" }));

    const file = new File(["x"], "photo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image file"), {
      target: { files: [file] },
    });

    // 예전엔 idle로 돌아가 재업로드 가능 상태를 유지했지만, 성공한
    // 이미지 위에 빈 Upload 패널이 계속 남는 문제가 실사용에서 보고돼
    // Close 버튼·Escape와 같은 dismissPanel 경로로 자동으로 닫는다.
    await waitFor(() => {
      expect(screen.queryByRole("toolbar")).toBeNull();
    });
    expect(document.activeElement).toBe(editable);
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

describe("FilePanel portalTarget(슬라이스4 RD-003 DELTA-04)", () => {
  it("지정하면 그 요소 하위에 렌더한다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
    });
    const portalTarget = document.createElement("div");
    document.body.appendChild(portalTarget);
    render(
      withProvider(
        controller,
        <>
          <FilePanel portalTarget={portalTarget} />
          <EditorContent />
        </>,
      ),
    );

    const panel = screen.getByRole("toolbar", { name: "File panel" });
    expect(portalTarget.contains(panel)).toBe(true);

    portalTarget.remove();
  });

  it("지정하지 않으면 기존 위치(부모 트리 내부)에 렌더한다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
    });
    const { container } = renderPanel(controller);

    const panel = screen.getByRole("toolbar", { name: "File panel" });
    expect(container.contains(panel)).toBe(true);
  });
});

describe("FilePanel component override(슬라이스4 RD-001 DELTA-04)", () => {
  const CustomFilePanel = ({ editor }: { editor: EditorController }) => (
    <button
      onClick={() => editor.commands.setMediaBlockUrl("media-1", "https://x")}
      type="button"
    >
      Custom save
    </button>
  );

  it("지정하면 소비자 컴포넌트가 렌더되고 editor를 받는다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
    });
    render(
      withProvider(
        controller,
        <>
          <FilePanel component={CustomFilePanel} />
          <EditorContent />
        </>,
      ),
    );

    const button = screen.getByRole("button", { name: "Custom save" });
    fireEvent.click(button);

    expect(controller.commands.setMediaBlockUrl).toHaveBeenCalledWith(
      "media-1",
      "https://x",
    );
    expect(screen.queryByRole("button", { name: "Save URL" })).toBeNull();
  });

  it("지정해도 표시 판정은 wrapper가 그대로 유지한다", () => {
    const controller = fakeController();
    render(withProvider(controller, <FilePanel component={CustomFilePanel} />));

    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Custom save" })).toBeNull();
  });
});
