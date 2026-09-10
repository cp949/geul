// @vitest-environment jsdom
/**
 * core가 발생시키는 `onLocalPreviewCleanup`(Issue #168 roadmap RD-001
 * DELTA-05, RD-002 DELTA-02·03)을 `EditorProvider`(internal ownership)가
 * 실제 `URL.revokeObjectURL` DOM 호출로 옮기는 배선(RD-002 DELTA-03)을
 * 고정한다. "언제 신호가 나는지"는 core 레벨에서 이미 증명했다
 * (`packages/core/test/media-local-preview-cleanup.test.ts`) — 여기는
 * "신호가 나면 react가 revoke하는지"와, DELTA-03 "결정"이 고른 트리거
 * (세션 `destroy()`만, 재마운트 가능한 `unmount()`는 아님)가 실제로
 * 지켜지는지만 증명한다(계층별 최하위 증명 원칙).
 */
import type { CreateEditorOptions, EditorController } from "@cp949/geul-core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorContent, EditorProvider, useEditor } from "../src/index.js";

afterEach(cleanup);

// jsdom(30.x)의 URL은 Node 자체의 URL 클래스를 그대로 쓴다(실측 —
// `blob:nodedata:<uuid>` 형식이 Node 네이티브 구현의 결과다) — 별도
// 폴리필 없이 이미 동작하므로, vi.spyOn으로 실제 구현을 그대로 둔 채
// 호출만 관찰한다(revokeObjectURL도 실제로 revoke하되 호출 여부·인자만
// 검사 대상).
const mockCreateObjectURL = vi.spyOn(URL, "createObjectURL");
const mockRevokeObjectURL = vi.spyOn(URL, "revokeObjectURL");

afterEach(() => {
  mockCreateObjectURL.mockClear();
  mockRevokeObjectURL.mockClear();
});

const mediaDocument: CreateEditorOptions["initialDocument"] = {
  formatVersion: 1,
  revision: 0,
  blocks: [
    { id: "block-1", type: "image" },
    { id: "block-2", type: "paragraph", content: [{ text: "tail" }] },
  ],
};

const testFile = (name = "photo.png") =>
  new File(["binary"], name, { type: "image/png" });

/** 테스트 본문에서 `useEditor()`로 얻은 컨트롤러를 캡처하는 공용 자식. */
const CaptureEditor = (props: {
  onCapture: (editor: EditorController) => void;
}) => {
  const editor = useEditor();
  props.onCapture(editor);
  return null;
};

describe("EditorProvider — onLocalPreviewCleanup 배선(Issue #168 roadmap RD-002 DELTA-03)", () => {
  it("url이 확정되면 로컬 프리뷰 Blob URL이 revoke되고 화면은 새 url로 전환된다", async () => {
    let controller: EditorController | undefined;
    const view = render(
      <EditorProvider initialDocument={mediaDocument}>
        <CaptureEditor onCapture={(e) => (controller = e)} />
        <EditorContent />
      </EditorProvider>,
    );
    const host = screen.getByRole("textbox", { name: "Editor" });

    await controller?.commands.uploadMediaFile("block-1", testFile());
    const createdUrl = mockCreateObjectURL.mock.results[0]?.value as string;
    expect(createdUrl).toEqual(expect.stringMatching(/^blob:/));
    expect(host.querySelector("img")?.getAttribute("src")).toBe(createdUrl);
    expect(mockRevokeObjectURL).not.toHaveBeenCalled();

    expect(
      controller?.commands.setMediaBlockUrl(
        "block-1",
        "https://example.com/photo.png",
      ),
    ).toEqual({ ok: true, value: undefined });

    expect(mockRevokeObjectURL).toHaveBeenCalledOnce();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith(createdUrl);
    expect(host.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/photo.png",
    );

    view.unmount();
  });

  it("로컬 프리뷰가 있는 블록을 삭제한 직후 undo하면 revoke가 호출되지 않는다", async () => {
    let controller: EditorController | undefined;
    const view = render(
      <EditorProvider initialDocument={mediaDocument}>
        <CaptureEditor onCapture={(e) => (controller = e)} />
        <EditorContent />
      </EditorProvider>,
    );

    await controller?.commands.uploadMediaFile("block-1", testFile());
    expect(controller?.commands.deleteBlock("block-1")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(controller?.commands.undo()).toEqual({
      ok: true,
      value: undefined,
    });

    expect(mockRevokeObjectURL).not.toHaveBeenCalled();

    view.unmount();
  });

  it("url 확정도 삭제도 되지 않은 로컬 프리뷰는 EditorProvider(내부 소유) 언마운트 시 revoke된다", async () => {
    let controller: EditorController | undefined;
    const view = render(
      <EditorProvider initialDocument={mediaDocument}>
        <CaptureEditor onCapture={(e) => (controller = e)} />
        <EditorContent />
      </EditorProvider>,
    );

    await controller?.commands.uploadMediaFile("block-1", testFile());
    const createdUrl = mockCreateObjectURL.mock.results[0]?.value as string;
    expect(mockRevokeObjectURL).not.toHaveBeenCalled();

    view.unmount();

    expect(mockRevokeObjectURL).toHaveBeenCalledOnce();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith(createdUrl);
  });

  // DELTA-03 "결정" 회귀 가드 — 잔여 정리는 EditorController.destroy()에만
  // 걸어야 한다. 같은 컨트롤러를 유지한 채 EditorContent만 트리에서 뺐다
  // 다시 넣는 것은 EditorController.unmount()만 부르고 destroy()는 부르지
  // 않는다(RD-002-DELTA-03.md "결정" 참고) — 이 경로에서 revoke가 호출되면
  // 재마운트된 화면이 이미 지워진 Blob URL을 다시 그리려 해 깨진다.
  it("EditorContent만 껐다 켜도(같은 컨트롤러 유지) revoke되지 않고 재마운트 후에도 같은 Blob URL로 렌더된다", async () => {
    let controller: EditorController | undefined;
    const onCapture = (e: EditorController) => (controller = e);
    const view = render(
      <EditorProvider initialDocument={mediaDocument}>
        <CaptureEditor onCapture={onCapture} />
        <EditorContent />
      </EditorProvider>,
    );

    await controller?.commands.uploadMediaFile("block-1", testFile());
    const createdUrl = mockCreateObjectURL.mock.results[0]?.value as string;

    // EditorContent 제거 — editor.unmount()만 호출된다(EditorProvider는
    // 그대로 살아 있어 controller.destroy()는 아직 호출되지 않는다).
    view.rerender(
      <EditorProvider initialDocument={mediaDocument}>
        <CaptureEditor onCapture={onCapture} />
      </EditorProvider>,
    );
    expect(mockRevokeObjectURL).not.toHaveBeenCalled();

    // 다시 넣는다 — 같은 컨트롤러, 같은 Blob URL로 재마운트돼야 한다.
    view.rerender(
      <EditorProvider initialDocument={mediaDocument}>
        <CaptureEditor onCapture={onCapture} />
        <EditorContent />
      </EditorProvider>,
    );
    const host = screen.getByRole("textbox", { name: "Editor" });
    expect(host.querySelector("img")?.getAttribute("src")).toBe(createdUrl);
    expect(mockRevokeObjectURL).not.toHaveBeenCalled();

    view.unmount();
    expect(mockRevokeObjectURL).toHaveBeenCalledOnce();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith(createdUrl);
  });
});
