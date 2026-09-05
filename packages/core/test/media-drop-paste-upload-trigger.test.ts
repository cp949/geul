/**
 * MediaDropPasteExtension(RD-002 DELTA-01)이 삽입한 media 블록이 drop/paste
 * 직후 실제 uploadFile 콜백을 트리거하는지(RD-002 DELTA-02, roadmap
 * `_works/roadmap/RD-002.md`)를 검증한다. 트리거는 fire-and-forget이라
 * 반환 Promise를 테스트가 직접 await할 수 없다 — getMediaUploadState/
 * onUploadStateChange 관찰과 flushMicrotasks로 완료를 확인한다. 업로드
 * 파이프라인 자체(경합 가드·URL 정책·name 유지 등)는
 * editor-controller-media-upload.test.ts가 이미 고정했으므로 여기서
 * 반복하지 않고, "drop/paste가 그 파이프라인을 실제로 트리거하는가"와
 * "다중 파일이 서로 독립적으로 성공/실패하는가"만 다룬다.
 */
import { describe, expect, it } from "vitest";

import { findBlockPosition } from "../src/block-position.js";
import {
  createEditor,
  type UploadFile,
  type UploadResult,
} from "../src/index.js";
import {
  dropFiles,
  pasteFiles,
  withUnhandledErrorTracking,
} from "./clipboard-test-support.js";
import {
  documentOf,
  mediaBlock,
  mountTiptapEditor,
  paragraphBlock,
  sequentialIds,
  tailParagraphBlock,
} from "./editor-controller-support.js";

/** 이름·MIME만 지정한 File을 만든다(media-drop-paste-extension.test.ts와 동일 패턴). */
const fileOf = (name: string, type: string): File =>
  new File([], name, { type });

/**
 * uploadFile을 테스트가 원하는 시점에 resolve할 수 있게 호출을 쌓아 두는
 * mock(editor-controller-media-upload.test.ts::controllableUploadFile과 같은
 * 형태 — 3번째 소비 파일이 아니라 아직 공용 승격 대상이 아니다, G-TST-002).
 */
const controllableUploadFile = (): {
  uploadFile: UploadFile;
  pending: { file: File; resolve: (r: UploadResult) => void }[];
} => {
  const pending: { file: File; resolve: (r: UploadResult) => void }[] = [];
  const uploadFile: UploadFile = (file) =>
    new Promise((resolve) => {
      pending.push({ file, resolve });
    });
  return { uploadFile, pending };
};

/**
 * 마이크로태스크 큐를 모두 비운다. drop/paste 트리거가 만드는 업로드
 * Promise 체인은 설계상 fire-and-forget이라 테스트가 직접 await할 수 없다
 * — pending 항목을 resolve한 뒤 그 체인(session.uploadMediaFile 나머지
 * 부분)이 다 실행되게 매크로태스크 경계로 넘긴다.
 */
const flushMicrotasks = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

describe("drop/paste 업로드 트리거", () => {
  it("paste한 파일이 삽입 직후 uploadFile을 호출하고, 성공 결과가 url/name을 attrs로 반영한다", async () => {
    const { uploadFile, pending } = controllableUploadFile();
    const editor = createEditor({
      initialDocument: documentOf(
        paragraphBlock("p-1", "hello"),
        tailParagraphBlock,
      ),
      createId: sequentialIds("id"),
      uploadFile,
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    const containerPos = findBlockPosition(tiptap.state.doc, "p-1");
    if (containerPos === null) throw new Error("fixture 준비 실패");
    tiptap.commands.setTextSelection(containerPos + 2 + "hello".length);

    withUnhandledErrorTracking((errors) => {
      pasteFiles(editable, [fileOf("photo.png", "image/png")]);

      // paste가 media 블록을 삽입하는 동시에 트리거도 같은 동기 구간에서
      // beginMediaUpload까지 실행한다 — await 지점 이전이라 여기서 이미
      // pending·uploading 상태를 관찰할 수 있다.
      expect(pending).toHaveLength(1);
      expect(editor.getMediaUploadState("id-1")).toBe("uploading");
      expect(errors).toEqual([]);
    });

    pending[0]!.resolve({
      status: "success",
      url: "https://example.com/photo.png",
      name: "photo.png",
    });
    await flushMicrotasks();

    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "hello"),
      mediaBlock("image", "id-1", {
        url: "https://example.com/photo.png",
        name: "photo.png",
      }),
      tailParagraphBlock,
    ]);
    expect(editor.getMediaUploadState("id-1")).toBeNull();
  });

  it("파일 2개를 한 번에 drop하면 각각 독립적으로 업로드되어 한쪽 실패가 다른 쪽 성공에 영향을 주지 않는다", async () => {
    const { uploadFile, pending } = controllableUploadFile();
    const editor = createEditor({
      initialDocument: documentOf(
        paragraphBlock("p-1", "hello"),
        tailParagraphBlock,
      ),
      createId: sequentialIds("id"),
      uploadFile,
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    const containerPos = findBlockPosition(tiptap.state.doc, "p-1");
    if (containerPos === null) throw new Error("fixture 준비 실패");
    tiptap.view.posAtCoords = () => ({
      pos: containerPos + 2,
      inside: containerPos,
    });

    withUnhandledErrorTracking((errors) => {
      dropFiles(
        editable,
        [fileOf("a.png", "image/png"), fileOf("b.mp4", "video/mp4")],
        { clientX: 0, clientY: 0 },
      );

      // D2 체이닝 순서(DELTA-01) 그대로 첫 파일이 id-1, 두 번째가 id-2다 —
      // 트리거가 파일-블록 짝을 어긋내면 아래 개별 resolve가 잘못된
      // 블록에 반영된다.
      expect(pending).toHaveLength(2);
      expect(pending[0]!.file.name).toBe("a.png");
      expect(pending[1]!.file.name).toBe("b.mp4");
      expect(errors).toEqual([]);
    });

    pending[0]!.resolve({
      status: "error",
      code: "NETWORK_ERROR",
      message: "업로드 실패",
    });
    pending[1]!.resolve({
      status: "success",
      url: "https://example.com/b.mp4",
    });
    await flushMicrotasks();

    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("p-1", "hello"),
      mediaBlock("image", "id-1"),
      mediaBlock("video", "id-2", { url: "https://example.com/b.mp4" }),
      tailParagraphBlock,
    ]);
    expect(editor.getMediaUploadState("id-1")).toEqual({
      status: "error",
      code: "NETWORK_ERROR",
      message: "업로드 실패",
    });
    expect(editor.getMediaUploadState("id-2")).toBeNull();
  });
});
