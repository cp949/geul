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
 * aria-checked·명령 호출과 실패 처리(슬라이스5 RD-002 DELTA-02)를 검증한다.
 * image/video 전용 정렬 버튼 3개(좌/중/우)의 노출 조건(audio/file 제외)·
 * aria-checked·클릭(같은 값 재클릭 시 null 해제)·실패 처리도 검증한다
 * (Issue #154, MED-009).
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

import { EditorContent, MediaToolbar } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { queryMountedEditable } from "./query-mounted-editable.js";

// link-toolbar.test.tsx/file-panel.test.tsx와 같은 이유(@testing-library/react가
// 전역 afterEach/teardown이 함수일 때만 자동 cleanup을 등록하는데, 저장소
// vitest.config.ts는 globals:true가 아니라 자동 등록이 없다).
// vi.restoreAllMocks()는 그릴링 C4 안전망 테스트가 거는 개별 엘리먼트
// getBoundingClientRect spy(use-clamped-menu-position.test.tsx와 같은
// 패턴)를 테스트마다 되돌린다 — vitest.config.ts에 restoreMocks 설정이
// 없어 명시적으로 불러야 한다.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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
  setMediaBlockUrl?: (blockId: string, url: string) => CommandResult;
  dictionary?: Dictionary;
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
  setMediaBlockUrl = () => ({ ok: true }),
  dictionary,
}: FakeControllerOptions = {}) => ({
  mount: vi.fn((element: HTMLElement) => {
    const editable = document.createElement("div");
    // jsdom은 contentEditable IDL 프로퍼티를 속성으로 반영하지 않는다
    // (link-toolbar.test.tsx/file-panel.test.tsx와 같은 이유).
    editable.setAttribute("contenteditable", "true");
    // 대상 미디어 블록의 렌더 DOM(RD-002 DELTA-01 계약) — MediaToolbar의
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
  getDictionary: vi.fn(() => dictionary ?? DEFAULT_DICTIONARY),
  replaceDocument: vi.fn(),
  commands: {
    setMediaBlockName: vi.fn(setMediaBlockName),
    setMediaBlockCaption: vi.fn(setMediaBlockCaption),
    setMediaShowPreview: vi.fn(setMediaShowPreview),
    setMediaTextAlignment: vi.fn(setMediaTextAlignment),
    deleteBlock: vi.fn(deleteBlock),
    replaceMediaBlockFile: vi.fn(replaceMediaBlockFile),
    setMediaBlockUrl: vi.fn(setMediaBlockUrl),
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

// Issue #203 RD-004 DELTA-02 — view 모드의 옛 개별 control(rename/caption/
// preview/align/replace/download/delete)이 전부 `⋯` more 메뉴 항목으로
// 옮겨갔다. 이 헬퍼로 메뉴를 먼저 열고, 그 뒤 각 항목을
// `getByRole("menuitem", { name: ... })`(align은 아이콘 전용이라 여전히
// aria-label로 찾는다)로 찾아 클릭한다 — dictionary override와 무관하게
// moreAriaLabel은 이 파일의 어떤 테스트도 override하지 않아 항상
// "More media options"로 고정돼 있다.
const openMoreMenu = () => {
  fireEvent.click(screen.getByRole("button", { name: "More media options" }));
};

describe("MediaToolbar 미디어 편집 toolbar", () => {
  it("선택된 미디어 블록이 없으면 렌더링하지 않는다", () => {
    renderToolbar(fakeController());

    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("dictionary override 시 컨테이너·more 메뉴 항목(텍스트 노출, EXT-009)이 바뀐다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
      dictionary: {
        ...DEFAULT_DICTIONARY,
        toolbar: {
          ...DEFAULT_DICTIONARY.toolbar,
          media: {
            ...DEFAULT_DICTIONARY.toolbar.media,
            ariaLabel: "미디어 툴바",
            replaceAriaLabel: "파일 교체하기",
            replace: "교체",
            deleteAriaLabel: "미디어 블록 삭제하기",
            delete: "삭제",
          },
        },
      },
    });
    renderToolbar(controller);

    expect(screen.getByRole("toolbar", { name: "미디어 툴바" })).toBeTruthy();
    openMoreMenu();
    const deleteItem = screen.getByRole("menuitem", {
      name: "미디어 블록 삭제하기",
    });
    expect(deleteItem).toBeTruthy();
    // Issue #203 RD-004 DELTA-02 이후 Delete는 more 메뉴의 텍스트 항목이라
    // dictionary override(deleteAriaLabel)가 accessible name과 visible
    // text 둘 다에 반영된다 — 과거 icon 버튼이었을 때는 aria-label에만
    // 반영되고 textContent는 항상 빈 문자열이었다.
    expect(deleteItem.textContent).toBe("미디어 블록 삭제하기");
  });

  it("url 없는 미디어 블록을 선택하면 렌더링하지 않는다(FilePanel 담당)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => emptyImageBlock,
    });
    renderToolbar(controller);

    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("url 있는 미디어 블록을 선택하면 more 메뉴에 5개 control이 보인다(image/video/audio, 슬라이스5 RD-002 DELTA-02)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);

    expect(
      screen.getByRole("toolbar", { name: "Media toolbar" }),
    ).not.toBeNull();
    openMoreMenu();
    expect(screen.getByRole("menuitem", { name: "Rename" })).not.toBeNull();
    expect(
      screen.getByRole("menuitem", { name: "Edit caption" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Preview" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("menuitem", { name: "Delete media block" }),
    ).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Download" })).not.toBeNull();
  });

  it("file 대상은 more 메뉴에 Preview 토글 항목이 없다(4개 control, 슬라이스5 RD-002 DELTA-02)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledFileBlock,
    });
    renderToolbar(controller);

    openMoreMenu();
    expect(screen.getByRole("menuitem", { name: "Rename" })).not.toBeNull();
    expect(
      screen.getByRole("menuitem", { name: "Edit caption" }),
    ).not.toBeNull();
    expect(
      screen.queryByRole("menuitemcheckbox", { name: "Preview" }),
    ).toBeNull();
    expect(
      screen.getByRole("menuitem", { name: "Delete media block" }),
    ).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Download" })).not.toBeNull();
  });

  it("Preview 메뉴 항목은 현재 showPreview 값을 aria-checked로 반영한다(슬라이스5 RD-002 DELTA-02)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => ({
        ...filledImageBlock,
        showPreview: false,
      }),
    });
    renderToolbar(controller);

    openMoreMenu();
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Preview" })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("Preview 클릭 시 setMediaShowPreview를 반대 값으로 호출하고 aria-checked가 갱신된다(슬라이스5 RD-002 DELTA-02)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);

    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Preview" }));

    expect(controller.commands.setMediaShowPreview).toHaveBeenCalledWith(
      "media-1",
      false,
    );
    // Issue #203 RD-004 DELTA-02 — Preview는 토글 항목이라 클릭해도 메뉴를
    // 닫지 않는다(01-계획.md "범위 밖" — 여러 상태를 이어서 확인할 수
    // 있어야 한다). 메뉴가 계속 열려 있으므로 재조회 없이 바로 확인한다.
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Preview" })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("Preview 토글이 거부되면 aria-checked를 바꾸지 않고 에러를 표시한다(슬라이스5 RD-002 DELTA-02)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
      setMediaShowPreview: () => ({
        ok: false,
        error: { code: "BLOCK_NOT_FOUND" },
      }),
    });
    renderToolbar(controller);

    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Preview" }));

    expect(screen.getByRole("alert")).not.toBeNull();
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Preview" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("url 있는 image/video 블록을 선택하면 more 메뉴에 정렬 항목 3개가 보인다(Issue #154, MED-009)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);

    openMoreMenu();
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Align left" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Align center" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Align right" }),
    ).not.toBeNull();
  });

  it("file/audio 대상은 more 메뉴에 정렬 항목이 없다(Issue #154, MED-009)", () => {
    const fileController = fakeController({
      getSelectionMediaBlock: () => filledFileBlock,
    });
    renderToolbar(fileController);
    openMoreMenu();
    expect(
      screen.queryByRole("menuitemcheckbox", { name: "Align left" }),
    ).toBeNull();
    cleanup();

    const audioController = fakeController({
      getSelectionMediaBlock: () => filledAudioBlock,
    });
    renderToolbar(audioController);
    openMoreMenu();
    expect(
      screen.queryByRole("menuitemcheckbox", { name: "Align left" }),
    ).toBeNull();
  });

  it("정렬 항목은 현재 textAlignment 값을 aria-checked로 반영한다(Issue #154, MED-009)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => ({
        ...filledImageBlock,
        textAlignment: "center",
      }),
    });
    renderToolbar(controller);

    openMoreMenu();
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Align left" })
        .getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Align center" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Align right" })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("정렬 항목 클릭 시 setMediaTextAlignment를 호출하고 aria-checked가 갱신된다(Issue #154, MED-009)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);

    openMoreMenu();
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Align right" }),
    );

    expect(controller.commands.setMediaTextAlignment).toHaveBeenCalledWith(
      "media-1",
      "right",
    );
    // Align도 Preview와 같은 이유로 클릭해도 메뉴가 열린 채 남는다 —
    // 재조회 없이 바로 확인한다.
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Align right" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("이미 활성인 정렬 항목을 다시 클릭하면 null로 해제한다(Issue #154, MED-009)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => ({
        ...filledImageBlock,
        textAlignment: "right",
      }),
    });
    renderToolbar(controller);

    openMoreMenu();
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Align right" }),
    );

    expect(controller.commands.setMediaTextAlignment).toHaveBeenCalledWith(
      "media-1",
      null,
    );
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Align right" })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("정렬 변경이 거부되면 aria-checked를 바꾸지 않고 에러를 표시한다(Issue #154, MED-009)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
      setMediaTextAlignment: () => ({
        ok: false,
        error: { code: "BLOCK_NOT_FOUND" },
      }),
    });
    renderToolbar(controller);

    openMoreMenu();
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Align left" }),
    );

    expect(screen.getByRole("alert")).not.toBeNull();
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Align left" })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("Rename 클릭 시 현재 이름을 기본값으로 편집 입력에 초점이 간다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);

    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));

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

    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Image name" }), {
      target: { value: "renamed.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    expect(controller.commands.setMediaBlockName).toHaveBeenCalledWith(
      "media-1",
      "renamed.png",
    );
    expect(screen.queryByRole("textbox", { name: "Image name" })).toBeNull();
    // Issue #203 RD-004 DELTA-02 — 저장 완료 후 view로 돌아가면 more
    // 메뉴는 닫힌 채 `⋯` 트리거만 남는다(finishEditing이 명시적으로
    // moreMenuOpen을 false로 되돌린다) — Rename 항목을 다시 보려면 메뉴를
    // 새로 열어야 한다.
    expect(screen.queryByRole("menuitem", { name: "Rename" })).toBeNull();
    openMoreMenu();
    expect(screen.getByRole("menuitem", { name: "Rename" })).not.toBeNull();
  });

  it("dictionary override 시 {kind} 템플릿과 Save name aria-label이 바뀐다(EXT-009)", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
      dictionary: {
        ...DEFAULT_DICTIONARY,
        toolbar: {
          ...DEFAULT_DICTIONARY.toolbar,
          kindNames: { ...DEFAULT_DICTIONARY.toolbar.kindNames, image: "사진" },
          media: {
            ...DEFAULT_DICTIONARY.toolbar.media,
            nameInputAriaLabel: "{kind} 이름",
            saveNameAriaLabel: "이름 저장",
          },
        },
      },
    });
    renderToolbar(controller);

    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));

    expect(screen.getByRole("textbox", { name: "사진 이름" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "이름 저장" })).not.toBeNull();
  });

  it("Enter로도 이름을 제출한다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);

    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
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

    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    expect(controller.commands.setMediaBlockName).not.toHaveBeenCalled();
    openMoreMenu();
    expect(screen.getByRole("menuitem", { name: "Rename" })).not.toBeNull();
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

    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
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

    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
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

  it("이름 편집을 마치면 위치·Preview·정렬 상태가 편집 전 값 그대로 유지된다(그릴링 C4 안전망)", () => {
    // showPreview는 filledImageBlock 기본값(true)을 그대로 쓴다 —
    // aria-checked={showPreview === true}라 false/null 회귀 둘 다
    // "false"로 렌더돼 구분이 안 된다. true로 시작해야 회귀 시 "false"로
    // 갈라져 실제로 검증력이 있다.
    const controller = fakeController({
      getSelectionMediaBlock: () => ({
        ...filledImageBlock,
        textAlignment: "center",
      }),
    });
    renderToolbar(controller);
    const blockElement = getEditable().querySelector(
      '[data-geul-block-id="media-1"]',
    );
    if (blockElement === null) throw new Error("media block DOM missing");
    const toolbar = () => screen.getByRole("toolbar");
    const initialLeft = toolbar().style.left;
    const initialTop = toolbar().style.top;

    // finishEditing이 carryMediaInfo 대신 readBlockBounds를 다시 부르면
    // 이 새 rect가 반영돼 left/top이 바뀐다 — 지금은 toolbarState를 그대로
    // 캐리해야 한다(updateFromSelection만 이 값을 다시 읽는다).
    vi.spyOn(blockElement, "getBoundingClientRect").mockReturnValue({
      left: 400,
      top: 300,
      right: 420,
      bottom: 310,
      x: 400,
      y: 300,
      width: 20,
      height: 10,
      toJSON: () => ({}),
    } as DOMRect);

    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    expect(toolbar().style.left).toBe(initialLeft);
    expect(toolbar().style.top).toBe(initialTop);
    // finishEditing이 view로 돌아오며 메뉴를 닫으므로(moreMenuOpen 초기화)
    // Preview·정렬 상태를 다시 보려면 메뉴를 새로 연다.
    openMoreMenu();
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Preview" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Align center" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("Caption 클릭 시 현재 caption을 기본값으로 편집 입력에 초점이 간다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => ({
        ...filledImageBlock,
        caption: "지금 caption",
      }),
    });
    renderToolbar(controller);

    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit caption" }));

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

    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit caption" }));
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

    openMoreMenu();
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Delete media block" }),
    );

    expect(controller.commands.deleteBlock).toHaveBeenCalledWith("media-1");
  });

  it("delete가 거부되면 에러를 표시한다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
      deleteBlock: () => ({ ok: false, error: { code: "BLOCK_NOT_FOUND" } }),
    });
    renderToolbar(controller);

    openMoreMenu();
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Delete media block" }),
    );

    expect(screen.getByRole("alert")).not.toBeNull();
  });

  it("Download 항목이 href와 download 속성을 렌더한다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);

    openMoreMenu();
    // Issue #203 RD-004 DELTA-02 — Download는 more 메뉴 안 `<a role="menuitem">`
    // 항목이다(role="menu" 자식은 링크가 아니라 menuitem이어야 하는 ARIA
    // 계약, media-toolbar.tsx 주석 참고) — 과거의 role="link"가 아니다.
    const download = screen.getByRole("menuitem", { name: "Download" });
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

    openMoreMenu();
    const download = screen.getByRole("menuitem", { name: "Download" });
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
    // `[data-geul-block-id]` 밖의 fixed 오버레이 div다(여기선 그 모양만
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
    handle.setAttribute("data-geul-media-resize-handle", "right");
    document.body.append(handle);

    fireEvent.pointerDown(handle);

    expect(screen.queryByRole("toolbar")).not.toBeNull();
    handle.remove();
  });
});

// 사용자 스크린샷 — 이미지를 리사이즈 핸들로 드래그하는 동안 toolbar가 옛
// 위치에 그대로 떠 이미지를 가린다. media-resize-handles.tsx는 드래그
// 중 element(host)에 `data-geul-media-resizing-block-id`를 쓴다
// (media-resize-handles.test.tsx "리사이즈 중 element에 남기는..." 참고) —
// 여기선 MediaToolbar가 그 속성을 관찰해 숨기고, 드래그가 끝나면 다시
// 보여주는 쪽만 검증한다(속성을 쓰는 쪽 검증과 분리, 두 컴포넌트는 여전히
// 서로를 모른다).
describe("리사이즈 중 toolbar를 숨긴다(사용자 스크린샷)", () => {
  const setResizing = (blockId: string | null) => {
    const element = screen.getByRole("textbox", { name: "Editor" });
    if (blockId === null) {
      element.removeAttribute("data-geul-media-resizing-block-id");
    } else {
      element.setAttribute("data-geul-media-resizing-block-id", blockId);
    }
  };

  it("현재 보이는 블록의 리사이즈가 시작되면 toolbar를 숨긴다", async () => {
    renderToolbar(
      fakeController({ getSelectionMediaBlock: () => filledImageBlock }),
    );
    expect(screen.queryByRole("toolbar")).not.toBeNull();

    setResizing("media-1");

    await waitFor(() => expect(screen.queryByRole("toolbar")).toBeNull());
  });

  it("드래그가 끝나면(속성 제거) toolbar를 다시 보여준다", async () => {
    renderToolbar(
      fakeController({ getSelectionMediaBlock: () => filledImageBlock }),
    );
    setResizing("media-1");
    await waitFor(() => expect(screen.queryByRole("toolbar")).toBeNull());

    setResizing(null);

    await waitFor(() => expect(screen.queryByRole("toolbar")).not.toBeNull());
  });

  it("다른 블록의 리사이즈는 지금 보이는 toolbar에 영향을 주지 않는다", async () => {
    renderToolbar(
      fakeController({ getSelectionMediaBlock: () => filledImageBlock }),
    );

    setResizing("media-other");

    // waitFor 없이 동기 단언 — 숨김이 아예 트리거되지 않아야 하므로 기다릴
    // 대상 자체가 없다(다른 블록 id라 상태 갱신은 일어나되 hide 조건만
    // 거짓이어야 한다).
    await Promise.resolve();
    expect(screen.queryByRole("toolbar")).not.toBeNull();
  });
});

describe("MediaToolbar Replace 트리거(RD-003 DELTA-03)", () => {
  it("uploadFile 미등록 시 more 메뉴에 Replace 항목이 보이지 않는다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);

    openMoreMenu();
    expect(screen.queryByRole("menuitem", { name: "Replace file" })).toBeNull();
  });

  it("uploadFile 등록 시 more 메뉴에 Replace 항목이 보이고 클릭하면 file input이 나타난다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
      isUploadEnabled: () => true,
    });
    renderToolbar(controller);

    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Replace file" }));

    expect(screen.getByLabelText("Image file")).not.toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Rename" })).toBeNull();
  });

  it("파일을 선택하면 replaceMediaBlockFile을 호출하고 loading을 보여준다", () => {
    const replaceMediaBlockFile = vi.fn(() => new Promise<never>(() => {}));
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
      isUploadEnabled: () => true,
      replaceMediaBlockFile,
    });
    renderToolbar(controller);
    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Replace file" }));

    const file = new File(["x"], "new.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image file"), {
      target: { files: [file] },
    });

    expect(replaceMediaBlockFile).toHaveBeenCalledWith("media-1", file);
    expect(screen.getByRole("status")).not.toBeNull();
  });

  it("dictionary override 시 Uploading… 상태 문구가 바뀐다(EXT-009)", () => {
    const replaceMediaBlockFile = vi.fn(() => new Promise<never>(() => {}));
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
      isUploadEnabled: () => true,
      replaceMediaBlockFile,
      dictionary: {
        ...DEFAULT_DICTIONARY,
        status: { ...DEFAULT_DICTIONARY.status, uploading: "업로드 중…" },
      },
    });
    renderToolbar(controller);
    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Replace file" }));

    const file = new File(["x"], "new.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image file"), {
      target: { files: [file] },
    });

    expect(screen.getByRole("status").textContent).toBe("업로드 중…");
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
    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Replace file" }));

    const file = new File(["x"], "new.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image file"), {
      target: { files: [file] },
    });

    // Issue #203 RD-004 DELTA-02 — finishReplacing이 view로 돌아오며 more
    // 메뉴를 닫으므로(startReplacing이 이미 moreMenuOpen을 false로 되돌린
    // 채였다) "view로 돌아갔다"는 신호를 옛 Rename 버튼 대신 `⋯` 트리거
    // 재등장으로 확인한다.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "More media options" }),
      ).not.toBeNull();
    });
    openMoreMenu();
    const download = screen.getByRole("menuitem", { name: "Download" });
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
    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Replace file" }));

    const file = new File(["x"], "new.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image file"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("교체 실패");
    });
    expect(screen.getByRole("button", { name: "Retry" })).not.toBeNull();
    // view로 돌아가지 않았으므로 `⋯` 트리거(view 모드 전용)가 없다.
    expect(
      screen.queryByRole("button", { name: "More media options" }),
    ).toBeNull();
  });

  it("dictionary override 시 사전조건 실패 메시지(Upload could not start.)가 바뀐다(EXT-009)", async () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
      isUploadEnabled: () => true,
      replaceMediaBlockFile: () =>
        Promise.resolve<ReplaceMediaFileResult>({
          ok: false,
          error: { code: "BLOCK_NOT_FOUND", blockId: "media-1" },
        }),
      dictionary: {
        ...DEFAULT_DICTIONARY,
        status: {
          ...DEFAULT_DICTIONARY.status,
          uploadCouldNotStart: "업로드를 시작할 수 없습니다.",
        },
      },
    });
    renderToolbar(controller);
    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Replace file" }));

    const file = new File(["x"], "new.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image file"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "업로드를 시작할 수 없습니다.",
      );
    });
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
    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Replace file" }));

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
    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Replace file" }));

    const file = new File(["x"], "new.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image file"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(controller.commands.cancelMediaUpload).toHaveBeenCalledWith(
      "media-1",
    );
    openMoreMenu();
    const download = screen.getByRole("menuitem", { name: "Download" });
    expect(download.getAttribute("href")).toBe(
      "https://example.com/dir/photo.png",
    );
  });

  it("Replace를 취소하면 위치·Preview·정렬 상태가 교체 전 값 그대로 유지된다(그릴링 C4 안전망)", () => {
    // showPreview는 filledImageBlock 기본값(true)을 그대로 쓴다 — 위 rename
    // 테스트와 같은 이유(false/null 회귀가 aria-checked="false"로 뭉개진다).
    const controller = fakeController({
      getSelectionMediaBlock: () => ({
        ...filledImageBlock,
        textAlignment: "center",
      }),
      isUploadEnabled: () => true,
    });
    renderToolbar(controller);
    const blockElement = getEditable().querySelector(
      '[data-geul-block-id="media-1"]',
    );
    if (blockElement === null) throw new Error("media block DOM missing");
    const toolbar = () => screen.getByRole("toolbar");
    const initialLeft = toolbar().style.left;
    const initialTop = toolbar().style.top;

    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Replace file" }));

    // cancelReplacing이 carryMediaInfo 대신 readBlockTopRightBounds를 다시
    // 부르면 이 새 rect가 반영된다 — 지금은 replacing 진입 시 캐리해 둔
    // 값을 그대로 되돌려야 한다(core를 다시 조회하지 않는다,
    // cancelReplacing 주석 참고).
    vi.spyOn(blockElement, "getBoundingClientRect").mockReturnValue({
      left: 400,
      top: 300,
      right: 420,
      bottom: 310,
      x: 400,
      y: 300,
      width: 20,
      height: 10,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(toolbar().style.left).toBe(initialLeft);
    expect(toolbar().style.top).toBe(initialTop);
    // cancelReplacing도 view로 돌아오며 메뉴를 닫으므로(startReplacing이
    // 이미 moreMenuOpen을 false로 되돌린 채였다) 다시 연다.
    openMoreMenu();
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Preview" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Align center" })
        .getAttribute("aria-checked"),
    ).toBe("true");
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
    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Replace file" }));

    const file = new File(["x"], "new.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image file"), {
      target: { files: [file] },
    });
    await waitFor(() => {
      expect(screen.getByRole("alert")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.getByRole("button", { name: "More media options" }),
    ).not.toBeNull();
    openMoreMenu();
    const download = screen.getByRole("menuitem", { name: "Download" });
    expect(download.getAttribute("href")).toBe(
      "https://example.com/dir/photo.png",
    );
  });
});

describe("MediaToolbar Replace Embed 탭(2026-09-12, 사용자 지시 — 다시 업로드 및 Embed 탭이 있는 팝업)", () => {
  it("Replace 클릭 시 Upload가 기본 활성 탭이고 Embed 탭도 함께 보인다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
      isUploadEnabled: () => true,
    });
    renderToolbar(controller);

    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Replace file" }));

    const uploadTab = screen.getByRole("tab", { name: "Upload" });
    const embedTab = screen.getByRole("tab", { name: "Embed" });
    expect(uploadTab.getAttribute("aria-selected")).toBe("true");
    expect(embedTab.getAttribute("aria-selected")).toBe("false");
    // 기본 탭이 Upload라 file input이 탭 전환 없이 바로 보인다.
    expect(screen.getByLabelText("Image file")).not.toBeNull();
  });

  it("Embed 탭 클릭 시 URL 입력·저장 버튼이 보이고 file input은 사라진다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
      isUploadEnabled: () => true,
    });
    renderToolbar(controller);
    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Replace file" }));

    fireEvent.click(screen.getByRole("tab", { name: "Embed" }));

    expect(screen.getByRole("textbox", { name: "Image URL" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Save URL" })).not.toBeNull();
    expect(screen.queryByLabelText("Image file")).toBeNull();
  });

  it("Embed 탭에서 URL을 저장하면 setMediaBlockUrl을 호출하고 view로 돌아가 갱신된 url/name을 반영한다", async () => {
    let callCount = 0;
    const setMediaBlockUrl = vi.fn(() => ({ ok: true }));
    const setMediaBlockName = vi.fn(() => ({ ok: true }));
    const controller = fakeController({
      getSelectionMediaBlock: () => {
        callCount += 1;
        // 첫 조회(마운트)는 교체 전 값, 이후(URL 적용 성공 재조회)는 새 값
        // — "교체 성공 시 view로 돌아가..." 테스트와 같은 패턴.
        return callCount === 1
          ? filledImageBlock
          : {
              ...filledImageBlock,
              url: "https://example.com/dir/new-name.png",
              name: "new-name.png",
            };
      },
      isUploadEnabled: () => true,
      setMediaBlockUrl,
      setMediaBlockName,
    });
    renderToolbar(controller);
    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Replace file" }));
    fireEvent.click(screen.getByRole("tab", { name: "Embed" }));

    fireEvent.change(screen.getByRole("textbox", { name: "Image URL" }), {
      target: { value: "https://example.com/dir/new-name.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save URL" }));

    expect(setMediaBlockUrl).toHaveBeenCalledWith(
      "media-1",
      "https://example.com/dir/new-name.png",
    );
    expect(setMediaBlockName).toHaveBeenCalledWith("media-1", "new-name.png");
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "More media options" }),
      ).not.toBeNull();
    });
    openMoreMenu();
    const download = screen.getByRole("menuitem", { name: "Download" });
    expect(download.getAttribute("href")).toBe(
      "https://example.com/dir/new-name.png",
    );
  });

  it("Embed 탭에서 거부된 URL이면 거부 메시지를 표시하고 view로 돌아가지 않는다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
      isUploadEnabled: () => true,
      setMediaBlockUrl: () => ({
        ok: false,
        error: { code: "LINK_HREF_REJECTED" },
      }),
    });
    renderToolbar(controller);
    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Replace file" }));
    fireEvent.click(screen.getByRole("tab", { name: "Embed" }));

    fireEvent.change(screen.getByRole("textbox", { name: "Image URL" }), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save URL" }));

    expect(screen.getByRole("alert")).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "More media options" }),
    ).toBeNull();
  });

  it("Embed 탭에서도 Cancel(닫기) 클릭 시 교체 전 값 그대로 view로 돌아간다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
      isUploadEnabled: () => true,
    });
    renderToolbar(controller);
    openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Replace file" }));
    fireEvent.click(screen.getByRole("tab", { name: "Embed" }));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.getByRole("button", { name: "More media options" }),
    ).not.toBeNull();
    openMoreMenu();
    const download = screen.getByRole("menuitem", { name: "Download" });
    expect(download.getAttribute("href")).toBe(
      "https://example.com/dir/photo.png",
    );
  });
});

describe("MediaToolbar portalTarget(슬라이스4 RD-003 DELTA-03)", () => {
  it("지정하면 그 요소 하위에 렌더한다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    const portalTarget = document.createElement("div");
    document.body.appendChild(portalTarget);
    render(
      withProvider(
        controller,
        <>
          <MediaToolbar portalTarget={portalTarget} />
          <EditorContent />
        </>,
      ),
    );

    const toolbar = screen.getByRole("toolbar", { name: "Media toolbar" });
    expect(portalTarget.contains(toolbar)).toBe(true);

    portalTarget.remove();
  });

  it("지정하지 않으면 기존 위치(부모 트리 내부)에 렌더한다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    const { container } = renderToolbar(controller);

    const toolbar = screen.getByRole("toolbar", { name: "Media toolbar" });
    expect(container.contains(toolbar)).toBe(true);
  });
});

describe("MediaToolbar component override(슬라이스4 RD-001 DELTA-03)", () => {
  const CustomMediaToolbar = ({ editor }: { editor: EditorController }) => (
    <button
      onClick={() => editor.commands.deleteBlock("media-1")}
      type="button"
    >
      Custom delete
    </button>
  );

  it("지정하면 소비자 컴포넌트가 렌더되고 editor를 받는다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    render(
      withProvider(
        controller,
        <>
          <MediaToolbar component={CustomMediaToolbar} />
          <EditorContent />
        </>,
      ),
    );

    const button = screen.getByRole("button", { name: "Custom delete" });
    fireEvent.click(button);

    expect(controller.commands.deleteBlock).toHaveBeenCalledWith("media-1");
    expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
  });

  it("지정해도 표시 판정은 wrapper가 그대로 유지한다", () => {
    const controller = fakeController();
    render(
      withProvider(controller, <MediaToolbar component={CustomMediaToolbar} />),
    );

    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Custom delete" })).toBeNull();
  });
});
