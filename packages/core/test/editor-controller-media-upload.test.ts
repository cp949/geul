/**
 * upload 콜백 배선·`uploadMediaFile`/`cancelMediaUpload`·session pending
 * 상태 맵과 경합 가드(RD-001, Issue #152 슬라이스3 `MED-002` 일부, spec §4)와
 * `replaceMediaBlockFile`의 교체 유지 정책(RD-002, `MED-005`, spec §4.2)과
 * `isUploadEnabled()`(RD-003 DELTA-01, react Upload 탭 노출 판정 지점, spec
 * §6.1)를 고정한다.
 *
 * mock `UploadFile`은 즉시 resolve하지 않고 `pending` 배열에 resolver를
 * 쌓아 두는 controllable 형태다 — `uploadMediaFile`/`replaceMediaBlockFile`이
 * 반환하는 Promise가 실제로 콜백 완료를 기다리는지, 완료 전 상태(pending
 * "uploading")를 관찰할 수 있는지 검증하려면 콜백을 테스트가 직접 제어해야
 * 한다. react Upload UI(RD-003)는 이 DELTA 범위가 아니다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import type { UploadFile, UploadResult } from "../src/index.js";
import {
  createEditor,
  type CreateEditorOptions,
  type MediaUploadState,
} from "../src/index.js";
import {
  documentOf,
  editorState,
  mediaBlock,
  mountTiptapEditor,
  notApplicable,
  okResult,
  paragraphBlock,
  restored,
  sequentialIds,
  tailParagraphBlock,
} from "./editor-controller-support.js";

/** 콜백 호출을 테스트가 원하는 시점에 resolve할 수 있게 쌓아 두는 mock. */
const controllableUploadFile = (): {
  uploadFile: UploadFile;
  pending: {
    file: File;
    signal: AbortSignal;
    resolve: (r: UploadResult) => void;
  }[];
} => {
  const pending: {
    file: File;
    signal: AbortSignal;
    resolve: (r: UploadResult) => void;
  }[] = [];
  const uploadFile: UploadFile = (file, signal) =>
    new Promise((resolve) => {
      pending.push({ file, signal, resolve });
    });
  return { uploadFile, pending };
};

const testFile = (name = "photo.png") =>
  new File(["binary"], name, { type: "image/png" });

/**
 * `mounted()`(list-item-block-type-support.ts)와 같은 모양이되 `uploadFile`/
 * `onUploadStateChange`를 추가로 배선한다(editor-controller-table-paste.test.ts의
 * 로컬 override 전례).
 */
const mountedWithUpload = (
  initialDocument: Document,
  overrides: Pick<
    CreateEditorOptions,
    "uploadFile" | "onUploadStateChange"
  > = {},
) => {
  const changes: {
    revision: number;
    changedBlockIds: readonly string[];
    reason: string;
  }[] = [];
  const uploadStateChanges: {
    blockId: string;
    state: MediaUploadState | null;
  }[] = [];
  const editor = createEditor({
    initialDocument,
    createId: sequentialIds("id"),
    onChange: (event) => changes.push(event),
    onUploadStateChange: (blockId, state) =>
      uploadStateChanges.push({ blockId, state }),
    ...overrides,
  });
  return { editor, changes, uploadStateChanges, ...mountTiptapEditor(editor) };
};

describe("uploadMediaFile — 성공", () => {
  it("콜백을 실행하고 완료 전 pending 상태는 uploading이며, status: success 결과가 url(및 name)을 단일 트랜잭션으로 세팅하고 undo 1회로 복원된다", async () => {
    const { uploadFile, pending } = controllableUploadFile();
    const { editor, tiptap, changes, uploadStateChanges } = mountedWithUpload(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
      { uploadFile },
    );
    const before = editorState(editor, tiptap);

    const uploadPromise = editor.commands.uploadMediaFile("m-1", testFile());
    expect(pending).toHaveLength(1);
    expect(editor.getMediaUploadState("m-1")).toBe("uploading");
    expect(uploadStateChanges).toEqual([
      { blockId: "m-1", state: "uploading" },
    ]);

    pending[0]!.resolve({
      status: "success",
      url: "https://example.com/a.png",
      name: "a.png",
    });
    expect(await uploadPromise).toEqual(okResult);

    expect(editor.getDocument().blocks).toEqual([
      mediaBlock("image", "m-1", {
        url: "https://example.com/a.png",
        name: "a.png",
      }),
      tailParagraphBlock,
    ]);
    expect(editor.getMediaUploadState("m-1")).toBeNull();
    expect(uploadStateChanges).toEqual([
      { blockId: "m-1", state: "uploading" },
      { blockId: "m-1", state: null },
    ]);
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["m-1"], reason: "local" },
    ]);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("name 미지정 결과는 기존 name을 그대로 유지한다", async () => {
    const { uploadFile, pending } = controllableUploadFile();
    const { editor } = mountedWithUpload(
      documentOf(
        mediaBlock("file", "m-1", { name: "old.pdf" }),
        tailParagraphBlock,
      ),
      { uploadFile },
    );

    const uploadPromise = editor.commands.uploadMediaFile("m-1", testFile());
    pending[0]!.resolve({
      status: "success",
      url: "https://example.com/a.pdf",
    });
    await uploadPromise;

    expect(editor.getDocument().blocks).toEqual([
      mediaBlock("file", "m-1", {
        url: "https://example.com/a.pdf",
        name: "old.pdf",
      }),
      tailParagraphBlock,
    ]);
  });

  it("반환 url이 isSupportedLinkHref를 통과하지 못하면 문서를 바꾸지 않고 pending 상태를 LINK_HREF_REJECTED 에러로 남긴다", async () => {
    const { uploadFile, pending } = controllableUploadFile();
    const { editor, tiptap, changes } = mountedWithUpload(
      documentOf(mediaBlock("file", "m-1"), tailParagraphBlock),
      { uploadFile },
    );
    const before = editorState(editor, tiptap);

    const uploadPromise = editor.commands.uploadMediaFile("m-1", testFile());
    pending[0]!.resolve({ status: "success", url: "javascript:alert(1)" });
    expect(await uploadPromise).toEqual(okResult);

    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
    expect(editor.getMediaUploadState("m-1")).toEqual({
      status: "error",
      code: "LINK_HREF_REJECTED",
      message: expect.any(String),
    });
  });
});

describe("uploadMediaFile — 실패·취소", () => {
  it("status: error 결과는 문서 트랜잭션을 만들지 않고 pending 상태에만 code·message로 남는다", async () => {
    const { uploadFile, pending } = controllableUploadFile();
    const { editor, tiptap, changes } = mountedWithUpload(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
      { uploadFile },
    );
    const before = editorState(editor, tiptap);

    const uploadPromise = editor.commands.uploadMediaFile("m-1", testFile());
    pending[0]!.resolve({
      status: "error",
      code: "NETWORK_ERROR",
      message: "업로드 실패",
    });
    expect(await uploadPromise).toEqual(okResult);

    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
    expect(editor.getMediaUploadState("m-1")).toEqual({
      status: "error",
      code: "NETWORK_ERROR",
      message: "업로드 실패",
    });
  });

  it("status: cancelled 결과는 문서 트랜잭션을 만들지 않고 pending 상태를 지운다", async () => {
    const { uploadFile, pending } = controllableUploadFile();
    const { editor, tiptap, changes } = mountedWithUpload(
      documentOf(mediaBlock("video", "m-1"), tailParagraphBlock),
      { uploadFile },
    );
    const before = editorState(editor, tiptap);

    const uploadPromise = editor.commands.uploadMediaFile("m-1", testFile());
    pending[0]!.resolve({ status: "cancelled" });
    expect(await uploadPromise).toEqual(okResult);

    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
    expect(editor.getMediaUploadState("m-1")).toBeNull();
  });

  it("콜백이 reject하면 error 상태(UPLOAD_CALLBACK_THREW)로 흡수하고 문서를 바꾸지 않는다", async () => {
    const throwingUploadFile: UploadFile = () =>
      Promise.reject(new Error("boom"));
    const { editor, tiptap, changes } = mountedWithUpload(
      documentOf(mediaBlock("audio", "m-1"), tailParagraphBlock),
      { uploadFile: throwingUploadFile },
    );
    const before = editorState(editor, tiptap);

    const result = await editor.commands.uploadMediaFile("m-1", testFile());
    expect(result).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
    expect(editor.getMediaUploadState("m-1")).toEqual({
      status: "error",
      code: "UPLOAD_CALLBACK_THREW",
      message: expect.any(String),
    });
  });
});

describe("uploadMediaFile — 경합 가드", () => {
  it("업로드 중 대상 블록이 삭제되면 완료 결과를 무시하고 pending 상태를 지운다", async () => {
    const { uploadFile, pending } = controllableUploadFile();
    const { editor, tiptap, changes } = mountedWithUpload(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
      { uploadFile },
    );

    const uploadPromise = editor.commands.uploadMediaFile("m-1", testFile());
    expect(editor.commands.deleteBlock("m-1")).toEqual(okResult);
    const afterDelete = editorState(editor, tiptap);
    const changesAfterDelete = [...changes];

    pending[0]!.resolve({
      status: "success",
      url: "https://example.com/a.png",
    });
    expect(await uploadPromise).toEqual(okResult);

    expect(editorState(editor, tiptap)).toEqual(afterDelete);
    expect(changes).toEqual(changesAfterDelete);
    expect(editor.getMediaUploadState("m-1")).toBeNull();
  });

  it("같은 블록에 대한 두 번째 uploadMediaFile 호출은 이미 진행 중이라 COMMAND_NOT_APPLICABLE로 즉시 거절된다", async () => {
    const { uploadFile, pending } = controllableUploadFile();
    const { editor } = mountedWithUpload(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
      { uploadFile },
    );

    const first = editor.commands.uploadMediaFile("m-1", testFile());
    const second = await editor.commands.uploadMediaFile("m-1", testFile());
    expect(second).toEqual(notApplicable("uploadMediaFile"));
    expect(pending).toHaveLength(1);

    pending[0]!.resolve({ status: "cancelled" });
    await first;
  });
});

describe("uploadMediaFile — 사전 조건", () => {
  it("uploadFile 미등록 시 문서를 바꾸지 않고 COMMAND_NOT_APPLICABLE을 반환한다", async () => {
    const { editor, tiptap, changes } = mountedWithUpload(
      documentOf(mediaBlock("file", "m-1"), tailParagraphBlock),
    );
    const before = editorState(editor, tiptap);

    const result = await editor.commands.uploadMediaFile("m-1", testFile());
    expect(result).toEqual(notApplicable("uploadMediaFile"));
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
  });

  it("존재하지 않는 blockId는 BLOCK_NOT_FOUND이고 문서를 바꾸지 않는다", async () => {
    const { uploadFile } = controllableUploadFile();
    const { editor, tiptap, changes } = mountedWithUpload(
      documentOf(mediaBlock("file", "m-1"), tailParagraphBlock),
      { uploadFile },
    );
    const before = editorState(editor, tiptap);

    const result = await editor.commands.uploadMediaFile("missing", testFile());
    expect(result).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
  });

  it("media가 아닌 블록 대상은 COMMAND_NOT_APPLICABLE이고 문서를 바꾸지 않는다", async () => {
    const { uploadFile } = controllableUploadFile();
    const { editor, tiptap } = mountedWithUpload(
      documentOf(paragraphBlock("block-1", "text"), tailParagraphBlock),
      { uploadFile },
    );
    const before = editorState(editor, tiptap);

    const result = await editor.commands.uploadMediaFile("block-1", testFile());
    expect(result).toEqual(notApplicable("uploadMediaFile"));
    expect(editorState(editor, tiptap)).toEqual(before);
  });
});

describe("cancelMediaUpload", () => {
  it("등록된 AbortSignal을 abort하고, 이후 콜백이 cancelled로 resolve하면 pending 상태가 지워진다", async () => {
    const { uploadFile, pending } = controllableUploadFile();
    const { editor } = mountedWithUpload(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
      { uploadFile },
    );

    const uploadPromise = editor.commands.uploadMediaFile("m-1", testFile());
    expect(editor.commands.cancelMediaUpload("m-1")).toEqual(okResult);
    expect(pending[0]!.signal.aborted).toBe(true);

    pending[0]!.resolve({ status: "cancelled" });
    await uploadPromise;
    expect(editor.getMediaUploadState("m-1")).toBeNull();
  });

  it("진행 중인 업로드가 없으면 COMMAND_NOT_APPLICABLE이다(취소 뒤 재호출 포함)", () => {
    const { editor } = mountedWithUpload(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
    );
    expect(editor.commands.cancelMediaUpload("m-1")).toEqual(
      notApplicable("cancelMediaUpload"),
    );
  });
});

/**
 * `replaceMediaBlockFile`(RD-002, spec §4.2, `MED-005`)은 `uploadMediaFile`과
 * 같은 `runMediaUpload` 파이프라인을 command 이름만 다르게 재사용한다
 * (`_works/roadmap/result/RD-002-DELTA-01.md` "결정"). 경합 가드·동시 호출
 * 거절·`UPLOAD_CALLBACK_THREW`/`LINK_HREF_REJECTED` 흡수는 `uploadMediaFile`
 * 쪽에서 이미 고정했고 command 인자와 무관한 공용 로직이라 여기서
 * 반복하지 않는다 — 이 describe는 "교체 유지 정책"(성공 전까지 기존
 * url/name/caption/backgroundColor 불변)과 command 매개변수화 자체만 고정한다.
 */
describe("replaceMediaBlockFile — 성공", () => {
  it("기존 caption/backgroundColor를 유지한 채 새 url(및 name)로 교체되고 undo 1회로 복원된다", async () => {
    const { uploadFile, pending } = controllableUploadFile();
    const { editor, tiptap, changes } = mountedWithUpload(
      documentOf(
        mediaBlock("image", "m-1", {
          url: "https://example.com/old.png",
          name: "old.png",
          caption: "설명",
          backgroundColor: "#AABBCC",
        }),
        tailParagraphBlock,
      ),
      { uploadFile },
    );
    const before = editorState(editor, tiptap);

    const replacePromise = editor.commands.replaceMediaBlockFile(
      "m-1",
      testFile(),
    );
    expect(pending).toHaveLength(1);
    expect(editor.getMediaUploadState("m-1")).toBe("uploading");
    // 성공 전까지는 문서가 전혀 바뀌지 않는다(spec §4.2 "애초에 아무것도
    // 바꾸지 않는다").
    expect(editorState(editor, tiptap)).toEqual(before);

    pending[0]!.resolve({
      status: "success",
      url: "https://example.com/new.png",
      name: "new.png",
    });
    expect(await replacePromise).toEqual(okResult);

    expect(editor.getDocument().blocks).toEqual([
      mediaBlock("image", "m-1", {
        url: "https://example.com/new.png",
        name: "new.png",
        caption: "설명",
        backgroundColor: "#AABBCC",
      }),
      tailParagraphBlock,
    ]);
    expect(editor.getMediaUploadState("m-1")).toBeNull();
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["m-1"], reason: "local" },
    ]);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("name 미지정 결과는 기존 name을 그대로 유지한다", async () => {
    const { uploadFile, pending } = controllableUploadFile();
    const { editor } = mountedWithUpload(
      documentOf(
        mediaBlock("file", "m-1", {
          url: "https://example.com/old.pdf",
          name: "old.pdf",
        }),
        tailParagraphBlock,
      ),
      { uploadFile },
    );

    const replacePromise = editor.commands.replaceMediaBlockFile(
      "m-1",
      testFile(),
    );
    pending[0]!.resolve({
      status: "success",
      url: "https://example.com/new.pdf",
    });
    await replacePromise;

    expect(editor.getDocument().blocks).toEqual([
      mediaBlock("file", "m-1", {
        url: "https://example.com/new.pdf",
        name: "old.pdf",
      }),
      tailParagraphBlock,
    ]);
  });
});

describe("replaceMediaBlockFile — 실패·취소", () => {
  it("status: error 결과는 문서 트랜잭션을 만들지 않아 기존 url/name/caption/backgroundColor가 그대로 유지된다", async () => {
    const { uploadFile, pending } = controllableUploadFile();
    const { editor, tiptap, changes } = mountedWithUpload(
      documentOf(
        mediaBlock("image", "m-1", {
          url: "https://example.com/old.png",
          name: "old.png",
          caption: "설명",
          backgroundColor: "#AABBCC",
        }),
        tailParagraphBlock,
      ),
      { uploadFile },
    );
    const before = editorState(editor, tiptap);

    const replacePromise = editor.commands.replaceMediaBlockFile(
      "m-1",
      testFile(),
    );
    pending[0]!.resolve({
      status: "error",
      code: "NETWORK_ERROR",
      message: "업로드 실패",
    });
    expect(await replacePromise).toEqual(okResult);

    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
    expect(editor.getMediaUploadState("m-1")).toEqual({
      status: "error",
      code: "NETWORK_ERROR",
      message: "업로드 실패",
    });
  });

  it("status: cancelled 결과는 문서 트랜잭션을 만들지 않아 기존 url/name/caption/backgroundColor가 그대로 유지된다", async () => {
    const { uploadFile, pending } = controllableUploadFile();
    const { editor, tiptap, changes } = mountedWithUpload(
      documentOf(
        mediaBlock("video", "m-1", {
          url: "https://example.com/old.mp4",
          caption: "설명",
        }),
        tailParagraphBlock,
      ),
      { uploadFile },
    );
    const before = editorState(editor, tiptap);

    const replacePromise = editor.commands.replaceMediaBlockFile(
      "m-1",
      testFile(),
    );
    pending[0]!.resolve({ status: "cancelled" });
    expect(await replacePromise).toEqual(okResult);

    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
    expect(editor.getMediaUploadState("m-1")).toBeNull();
  });
});

describe("replaceMediaBlockFile — 사전 조건", () => {
  it("uploadFile 미등록 시 문서를 바꾸지 않고 COMMAND_NOT_APPLICABLE(command: replaceMediaBlockFile)을 반환한다", async () => {
    const { editor, tiptap, changes } = mountedWithUpload(
      documentOf(
        mediaBlock("file", "m-1", { url: "https://example.com/old.pdf" }),
        tailParagraphBlock,
      ),
    );
    const before = editorState(editor, tiptap);

    const result = await editor.commands.replaceMediaBlockFile(
      "m-1",
      testFile(),
    );
    // command 매개변수화 자체를 검증한다 — uploadMediaFile 쪽 로직을 그대로
    // 재사용해도 이 command 이름은 uploadMediaFile로 새지 않아야 한다
    // (RD-002-DELTA-01.md 완료 조건 4).
    expect(result).toEqual(notApplicable("replaceMediaBlockFile"));
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
  });
});

/**
 * `isUploadEnabled()`(RD-003 DELTA-01)는 react Upload 탭 노출 여부의 유일한
 * 판정 지점이다(spec §6.1 "uploadFile 콜백 등록 시만 노출"). `session
 * .uploadFile !== undefined`를 그대로 반영하므로 별도 pending 상태와는
 * 무관하다.
 */
describe("isUploadEnabled", () => {
  it("uploadFile 등록 시 true를 반환한다", () => {
    const { uploadFile } = controllableUploadFile();
    const { editor } = mountedWithUpload(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
      { uploadFile },
    );
    expect(editor.isUploadEnabled()).toBe(true);
  });

  it("uploadFile 미등록 시 false를 반환한다", () => {
    const { editor } = mountedWithUpload(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
    );
    expect(editor.isUploadEnabled()).toBe(false);
  });
});
