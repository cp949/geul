// @vitest-environment jsdom

/**
 * MediaToolbar 컴포넌트: url 있는 미디어 블록 선택 시 rename/caption/
 * delete/download 4개 control 노출, 빈 블록(url 없음)에는 렌더링하지
 * 않음(FilePanel과 상호 배타), rename/caption의 draft/Save/Cancel 편집과
 * 실패 시 에러 표시, delete의 명령 호출, download 링크의 href/download
 * 속성, selectionchange에 따른 표시·숨김 전환, Escape/바깥 클릭에 따른
 * 닫힘과 focus 복원 차이를 검증한다(RD-004 DELTA-01).
 */

import type { MediaBlockKind } from "@cp949/geul-core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
};

type CommandResult = { ok: boolean; error?: { code: string } };

type FakeControllerOptions = {
  getSelectionMediaBlock?: () => SelectionMediaBlock | null;
  setMediaBlockName?: (blockId: string, name: string) => CommandResult;
  setMediaBlockCaption?: (blockId: string, caption: string) => CommandResult;
  deleteBlock?: (blockId: string) => CommandResult;
};

const fakeController = ({
  getSelectionMediaBlock = () => null,
  setMediaBlockName = () => ({ ok: true }),
  setMediaBlockCaption = () => ({ ok: true }),
  deleteBlock = () => ({ ok: true }),
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
  replaceDocument: vi.fn(),
  commands: {
    setMediaBlockName: vi.fn(setMediaBlockName),
    setMediaBlockCaption: vi.fn(setMediaBlockCaption),
    deleteBlock: vi.fn(deleteBlock),
  },
});

const emptyImageBlock: SelectionMediaBlock = {
  blockId: "media-1",
  kind: "image",
  url: null,
  name: null,
  caption: null,
};

const filledImageBlock: SelectionMediaBlock = {
  blockId: "media-1",
  kind: "image",
  url: "https://example.com/dir/photo.png",
  name: "photo.png",
  caption: null,
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

  it("url 있는 미디어 블록을 선택하면 4개 control이 보인다", () => {
    const controller = fakeController({
      getSelectionMediaBlock: () => filledImageBlock,
    });
    renderToolbar(controller);

    expect(
      screen.getByRole("toolbar", { name: "Media toolbar" }),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Rename" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Edit caption" })).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Delete media block" }),
    ).not.toBeNull();
    expect(screen.getByRole("link", { name: "Download" })).not.toBeNull();
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
});
