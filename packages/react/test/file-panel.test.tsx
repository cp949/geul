// @vitest-environment jsdom

/**
 * FilePanel 컴포넌트: url 없는 미디어 블록 선택 시 자동 열림, URL 제출
 * 시 setMediaBlockUrl 호출과 이름 초깃값(마지막 path segment) 추출·표시,
 * 거부된 URL의 인라인 메시지, Escape/바깥 클릭에 따른 닫힘과 focus
 * 복원 차이를 검증한다(RD-003 DELTA-01).
 */

import type { MediaBlockKind } from "@cp949/geul-core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

type FakeControllerOptions = {
  getSelectionMediaBlock?: () => SelectionMediaBlock | null;
  setMediaBlockUrl?: (
    blockId: string,
    url: string,
  ) => { ok: boolean; error?: { code: string } };
};

const fakeController = ({
  getSelectionMediaBlock = () => null,
  setMediaBlockUrl = () => ({ ok: true }),
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
  replaceDocument: vi.fn(),
  commands: {
    setMediaBlockUrl: vi.fn(setMediaBlockUrl),
    setMediaBlockName: vi.fn(() => ({ ok: true, value: undefined })),
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
