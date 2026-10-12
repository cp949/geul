// @vitest-environment jsdom

/**
 * media-source-apply.ts의 규칙을 직접 겨냥한 스위트. File Panel과 Media
 * Toolbar가 이 규칙을 같이 쓴다. 두 컴포넌트의 오케스트레이션은
 * file-panel.test.tsx와 media-toolbar*.test.tsx가 검증하고, 이 파일은 그
 * 아래 순수 규칙만 편집기 마운트 없이 겨냥한다(ADR-0007). 가짜 commands로는
 * core 시그니처와 어긋나도 못 잡으므로, 마지막 스위트는 실제 core 명령으로
 * 라우팅과 name 적용을 확인한다. onBeforeChange 거절은 편집기를 마운트해야
 * 재현돼(마운트 전에는 미디어 명령이 거치지 않는다) 그 케이스만 jsdom에
 * 마운트한다.
 */

import {
  createEditor,
  DEFAULT_DICTIONARY,
  type Block,
  type CreateEditorOptions,
  type EditorController,
  type EditorError,
  type MediaBlockKind,
} from "@cp949/geul-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyMediaUrl,
  canReplaceMedia,
  canUploadMedia,
} from "../src/media-source-apply.js";

const KINDS: readonly MediaBlockKind[] = [
  "image",
  "video",
  "audio",
  "file",
  "iframe",
];

const uploadEditor = (enabled: boolean) => ({ isUploadEnabled: () => enabled });

describe("canUploadMedia", () => {
  it.each(KINDS)(
    "업로드가 켜져 있으면 %s는 iframe만 제외하고 허용한다",
    (kind) => {
      expect(canUploadMedia(uploadEditor(true), kind)).toBe(kind !== "iframe");
    },
  );

  it.each(KINDS)("업로드가 꺼져 있으면 %s를 허용하지 않는다", (kind) => {
    expect(canUploadMedia(uploadEditor(false), kind)).toBe(false);
  });
});

describe("canReplaceMedia", () => {
  it.each(KINDS)("업로드가 켜져 있으면 %s의 Replace를 연다", (kind) => {
    expect(canReplaceMedia(uploadEditor(true), kind)).toBe(true);
  });

  it.each(KINDS)(
    "업로드가 꺼져 있으면 %s는 iframe만 Replace를 연다(#373)",
    (kind) => {
      expect(canReplaceMedia(uploadEditor(false), kind)).toBe(
        kind === "iframe",
      );
    },
  );
});

describe("applyMediaUrl", () => {
  const okResult = { ok: true as const, value: undefined };

  const fakeEditor = (error?: EditorError, block?: unknown) => {
    const setIframeSrc = vi.fn(() =>
      error === undefined ? okResult : { ok: false as const, error },
    );
    const setMediaBlockUrl = vi.fn(() =>
      error === undefined ? okResult : { ok: false as const, error },
    );
    const getBlock = vi.fn(() => block);
    return {
      editor: {
        commands: { setIframeSrc, setMediaBlockUrl },
        getBlock,
      } as unknown as Pick<EditorController, "commands" | "getBlock">,
      setIframeSrc,
      setMediaBlockUrl,
      getBlock,
    };
  };

  it("iframe는 setIframeSrc로 보내고 마지막 path segment를 name으로 넘긴다", () => {
    const { editor, setIframeSrc, setMediaBlockUrl } = fakeEditor();
    const result = applyMediaUrl(
      editor,
      { blockId: "b1", kind: "iframe", draft: "https://example.com/embed/doc" },
      DEFAULT_DICTIONARY,
    );
    expect(result).toEqual({ ok: true, name: "doc" });
    expect(setIframeSrc).toHaveBeenCalledWith(
      "b1",
      "https://example.com/embed/doc",
      "doc",
    );
    expect(setMediaBlockUrl).not.toHaveBeenCalled();
  });

  it.each(["image", "video", "audio", "file"] as const)(
    "%s는 setMediaBlockUrl로 보낸다",
    (kind) => {
      const { editor, setIframeSrc, setMediaBlockUrl } = fakeEditor();
      const result = applyMediaUrl(
        editor,
        { blockId: "b1", kind, draft: "https://example.com/a/pic.png" },
        DEFAULT_DICTIONARY,
      );
      expect(result).toEqual({ ok: true, name: "pic.png" });
      expect(setMediaBlockUrl).toHaveBeenCalledWith(
        "b1",
        "https://example.com/a/pic.png",
        "pic.png",
      );
      expect(setIframeSrc).not.toHaveBeenCalled();
    },
  );

  it("name 추출에 실패하면 name을 undefined로 넘긴다", () => {
    const { editor, setMediaBlockUrl } = fakeEditor();
    const result = applyMediaUrl(
      editor,
      { blockId: "b1", kind: "image", draft: "https://example.com/" },
      DEFAULT_DICTIONARY,
    );
    expect(result).toEqual({ ok: true, name: undefined });
    expect(setMediaBlockUrl).toHaveBeenCalledWith(
      "b1",
      "https://example.com/",
      undefined,
    );
  });

  it("iframe URL 거절은 reason별 문구를 돌려준다", () => {
    const { editor } = fakeEditor({
      code: "IFRAME_URL_NOT_ALLOWED",
      reason: "PRIVATE_NETWORK_BLOCKED",
    });
    const result = applyMediaUrl(
      editor,
      { blockId: "b1", kind: "iframe", draft: "http://10.0.0.1/x" },
      DEFAULT_DICTIONARY,
    );
    expect(result).toEqual({
      ok: false,
      rejectedMessage:
        DEFAULT_DICTIONARY.status.iframeUrlRejected.privateNetworkBlocked,
    });
  });

  describe("COMMAND_NOT_APPLICABLE는 현재 블록과 대조해 해석한다(Issue #384)", () => {
    const DRAFT = "https://example.com/a/pic.png";
    const notApplicable = (kind: MediaBlockKind): EditorError => ({
      code: "COMMAND_NOT_APPLICABLE",
      command: kind === "iframe" ? "setIframeSrc" : "setMediaBlockUrl",
    });
    const unsupported = {
      ok: false,
      rejectedMessage: DEFAULT_DICTIONARY.status.unsupportedMediaUrl,
    };

    it.each(KINDS)(
      "%s의 현재 블록 url과 name이 요청과 같으면 거절 문구 없이 ok를 돌려준다",
      (kind) => {
        const { editor, getBlock } = fakeEditor(notApplicable(kind), {
          id: "b1",
          type: kind,
          url: DRAFT,
          name: "pic.png",
        });
        const result = applyMediaUrl(
          editor,
          { blockId: "b1", kind, draft: DRAFT },
          DEFAULT_DICTIONARY,
        );
        expect(result).toEqual({ ok: true, name: "pic.png" });
        expect(getBlock).toHaveBeenCalledWith("b1");
      },
    );

    it("name 추출에 실패하는 URL이어도 url이 같으면 현재 블록 name을 돌려준다", () => {
      const draft = "https://example.com/";
      const { editor } = fakeEditor(notApplicable("image"), {
        id: "b1",
        type: "image",
        url: draft,
        name: "custom",
      });
      const result = applyMediaUrl(
        editor,
        { blockId: "b1", kind: "image", draft },
        DEFAULT_DICTIONARY,
      );
      expect(result).toEqual({ ok: true, name: "custom" });
    });

    it.each(KINDS)(
      "%s의 getBlock이 undefined면 거절 문구를 돌려준다",
      (kind) => {
        const { editor } = fakeEditor(notApplicable(kind), undefined);
        const result = applyMediaUrl(
          editor,
          { blockId: "b1", kind, draft: DRAFT },
          DEFAULT_DICTIONARY,
        );
        expect(result).toEqual(unsupported);
      },
    );

    it.each(KINDS)(
      "%s의 현재 블록 url이 요청과 다르면 거절 문구를 돌려준다(호스트 거절)",
      (kind) => {
        const { editor } = fakeEditor(notApplicable(kind), {
          id: "b1",
          type: kind,
          url: "https://example.com/a/old.png",
          name: "pic.png",
        });
        const result = applyMediaUrl(
          editor,
          { blockId: "b1", kind, draft: DRAFT },
          DEFAULT_DICTIONARY,
        );
        expect(result).toEqual(unsupported);
      },
    );

    it.each(KINDS)(
      "%s의 현재 블록 url이 같고 name이 URL 끝 segment와 달라도 ok이고 현재 name을 돌려준다(Issue #388)",
      (kind) => {
        const { editor } = fakeEditor(notApplicable(kind), {
          id: "b1",
          type: kind,
          url: DRAFT,
          name: "custom",
        });
        const result = applyMediaUrl(
          editor,
          { blockId: "b1", kind, draft: DRAFT },
          DEFAULT_DICTIONARY,
        );
        expect(result).toEqual({ ok: true, name: "custom" });
      },
    );

    it("url이 없는 블록(미디어가 아닌 블록)은 거절 문구를 돌려준다", () => {
      const { editor } = fakeEditor(notApplicable("image"), {
        id: "b1",
        type: "paragraph",
        content: [],
      });
      const result = applyMediaUrl(
        editor,
        { blockId: "b1", kind: "image", draft: DRAFT },
        DEFAULT_DICTIONARY,
      );
      expect(result).toEqual(unsupported);
    });

    it("COMMAND_NOT_APPLICABLE가 아닌 거절은 같은 url이어도 거절 문구를 돌려준다", () => {
      const { editor } = fakeEditor(
        { code: "BLOCK_NOT_FOUND", blockId: "b1" },
        { id: "b1", type: "image", url: DRAFT, name: "pic.png" },
      );
      const result = applyMediaUrl(
        editor,
        { blockId: "b1", kind: "image", draft: DRAFT },
        DEFAULT_DICTIONARY,
      );
      expect(result).toEqual(unsupported);
    });

    it("호출 전에 현재 블록을 읽는다(같은 url이면 name을 넘기지 않기 위해, Issue #388)", () => {
      const { editor, getBlock, setMediaBlockUrl } = fakeEditor(undefined, {
        id: "b1",
        type: "image",
        url: DRAFT,
        name: "custom",
      });
      applyMediaUrl(
        editor,
        { blockId: "b1", kind: "image", draft: DRAFT },
        DEFAULT_DICTIONARY,
      );
      expect(getBlock).toHaveBeenCalledWith("b1");
      expect(getBlock.mock.invocationCallOrder[0]).toBeLessThan(
        setMediaBlockUrl.mock.invocationCallOrder[0] ?? 0,
      );
    });
  });

  describe("현재 블록 url과 같은 URL은 name을 넘기지 않는다(Issue #388)", () => {
    const DRAFT = "https://example.com/a/pic.png";
    it.each(KINDS)(
      "%s는 name 인자 undefined로 호출하고 현재 블록 name을 돌려준다",
      (kind) => {
        const { editor, setIframeSrc, setMediaBlockUrl } = fakeEditor(
          undefined,
          { id: "b1", type: kind, url: DRAFT, name: "내가 바꾼 이름" },
        );
        const result = applyMediaUrl(
          editor,
          { blockId: "b1", kind, draft: DRAFT },
          DEFAULT_DICTIONARY,
        );
        expect(result).toEqual({ ok: true, name: "내가 바꾼 이름" });
        expect(
          (kind === "iframe" ? setIframeSrc : setMediaBlockUrl).mock.calls,
        ).toEqual([["b1", DRAFT, undefined]]);
      },
    );

    it("현재 name이 빈 문자열이면 빈 문자열을 돌려주고 name을 넘기지 않는다", () => {
      const { editor, setMediaBlockUrl } = fakeEditor(undefined, {
        id: "b1",
        type: "image",
        url: DRAFT,
        name: "",
      });
      const result = applyMediaUrl(
        editor,
        { blockId: "b1", kind: "image", draft: DRAFT },
        DEFAULT_DICTIONARY,
      );
      expect(result).toEqual({ ok: true, name: "" });
      expect(setMediaBlockUrl.mock.calls).toEqual([["b1", DRAFT, undefined]]);
    });

    it("현재 name이 없으면 name을 undefined로 돌려주고 넘기지 않는다", () => {
      const { editor, setMediaBlockUrl } = fakeEditor(undefined, {
        id: "b1",
        type: "image",
        url: DRAFT,
      });
      const result = applyMediaUrl(
        editor,
        { blockId: "b1", kind: "image", draft: DRAFT },
        DEFAULT_DICTIONARY,
      );
      expect(result).toEqual({ ok: true, name: undefined });
      expect(setMediaBlockUrl.mock.calls).toEqual([["b1", DRAFT, undefined]]);
    });

    it.each(KINDS)(
      "%s의 현재 블록 url이 다르면 새 URL 끝 segment를 name으로 넘긴다(기존 동작)",
      (kind) => {
        const { editor, setIframeSrc, setMediaBlockUrl } = fakeEditor(
          undefined,
          {
            id: "b1",
            type: kind,
            url: "https://example.com/a/old.png",
            name: "내가 바꾼 이름",
          },
        );
        const result = applyMediaUrl(
          editor,
          { blockId: "b1", kind, draft: DRAFT },
          DEFAULT_DICTIONARY,
        );
        expect(result).toEqual({ ok: true, name: "pic.png" });
        expect(
          (kind === "iframe" ? setIframeSrc : setMediaBlockUrl).mock.calls,
        ).toEqual([["b1", DRAFT, "pic.png"]]);
      },
    );

    it("url 비교는 정확 일치다(끝 슬래시가 다르면 다른 URL이다)", () => {
      const { editor, setMediaBlockUrl } = fakeEditor(undefined, {
        id: "b1",
        type: "image",
        url: `${DRAFT}/`,
        name: "내가 바꾼 이름",
      });
      applyMediaUrl(
        editor,
        { blockId: "b1", kind: "image", draft: DRAFT },
        DEFAULT_DICTIONARY,
      );
      expect(setMediaBlockUrl.mock.calls).toEqual([["b1", DRAFT, "pic.png"]]);
    });
  });

  it("COMMAND_NOT_APPLICABLE가 아닌 거절(BLOCK_NOT_FOUND)은 거절 문구를 유지한다", () => {
    const { editor } = fakeEditor({
      code: "BLOCK_NOT_FOUND",
      blockId: "b1",
    });
    const result = applyMediaUrl(
      editor,
      { blockId: "b1", kind: "image", draft: "https://example.com/a.png" },
      DEFAULT_DICTIONARY,
    );
    expect(result).toEqual({
      ok: false,
      rejectedMessage: DEFAULT_DICTIONARY.status.unsupportedMediaUrl,
    });
  });

  it("다른 kind의 거절은 일반 문구를 돌려준다", () => {
    const { editor } = fakeEditor({
      code: "LINK_HREF_REJECTED",
    } as EditorError);
    const result = applyMediaUrl(
      editor,
      { blockId: "b1", kind: "image", draft: "javascript:alert(1)" },
      DEFAULT_DICTIONARY,
    );
    expect(result).toEqual({
      ok: false,
      rejectedMessage: DEFAULT_DICTIONARY.status.unsupportedMediaUrl,
    });
  });
});

describe("applyMediaUrl(실제 core 명령)", () => {
  const OLD_URL = "https://www.youtube.com/embed/old";

  const mediaBlock = (
    kind: MediaBlockKind,
    url: string,
    name: string = url.slice(url.lastIndexOf("/") + 1),
  ): Block => ({ id: "m1", type: kind, url, name }) as Block;

  // 단언이 실패해도 편집기가 다음 테스트로 새지 않게 afterEach가 destroy한다.
  const created: EditorController[] = [];
  afterEach(() => {
    for (const editor of created.splice(0)) editor.destroy();
  });

  const realEditor = (
    kind: MediaBlockKind,
    url: string = OLD_URL,
    onBeforeChange?: CreateEditorOptions["onBeforeChange"],
    name?: string,
  ) => {
    const editor = createEditor({
      ...(onBeforeChange === undefined ? {} : { onBeforeChange }),
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [mediaBlock(kind, url, name)],
      },
      iframeEmbed: {
        providers: [
          {
            name: "YouTube",
            match: { type: "wildcard", pattern: "*.youtube.com" },
          },
        ],
      },
    });
    created.push(editor);
    return editor;
  };

  const blockOf = (editor: EditorController) => editor.getDocument().blocks[0];

  it("iframe는 setIframeSrc 경로로 허용 URL과 name을 함께 적용한다", () => {
    const editor = realEditor("iframe");
    const result = applyMediaUrl(
      editor,
      {
        blockId: "m1",
        kind: "iframe",
        draft: "https://www.youtube.com/embed/new",
      },
      DEFAULT_DICTIONARY,
    );
    expect(result).toEqual({ ok: true, name: "new" });
    expect(blockOf(editor)).toMatchObject({
      url: "https://www.youtube.com/embed/new",
      name: "new",
    });
  });

  it("iframe 정책이 거절한 URL은 거절 문구를 돌려주고 문서를 바꾸지 않는다", () => {
    const editor = realEditor("iframe");
    const before = editor.getDocument();
    const result = applyMediaUrl(
      editor,
      { blockId: "m1", kind: "iframe", draft: "https://vimeo.com/embed/x" },
      DEFAULT_DICTIONARY,
    );
    expect(result).toEqual({
      ok: false,
      rejectedMessage:
        DEFAULT_DICTIONARY.status.iframeUrlRejected.notWhitelisted,
    });
    expect(editor.getDocument()).toEqual(before);
  });

  it.each(["image", "video", "audio", "file", "iframe"] as const)(
    "%s에 현재 값과 같은 URL을 다시 적용하면 ok이고 문서가 바뀌지 않는다(Issue #384)",
    (kind) => {
      const editor = realEditor(kind);
      const before = editor.getDocument();
      const result = applyMediaUrl(
        editor,
        { blockId: "m1", kind, draft: OLD_URL },
        DEFAULT_DICTIONARY,
      );
      expect(result).toEqual({ ok: true, name: "old" });
      expect(editor.getDocument()).toEqual(before);
    },
  );

  it.each(KINDS)(
    "%s에 사용자 name이 있는 블록의 같은 URL 재적용은 name을 지키고 문서를 바꾸지 않는다(Issue #388)",
    (kind) => {
      const editor = realEditor(kind, OLD_URL, undefined, "내가 바꾼 이름");
      const before = editor.getDocument();
      const result = applyMediaUrl(
        editor,
        { blockId: "m1", kind, draft: OLD_URL },
        DEFAULT_DICTIONARY,
      );
      expect(result).toEqual({ ok: true, name: "내가 바꾼 이름" });
      expect(editor.getDocument().revision).toBe(before.revision);
      expect(editor.getDocument()).toEqual(before);
    },
  );

  it.each(KINDS)(
    "%s의 name이 빈 문자열인 블록의 같은 URL 재적용은 빈 문자열로 남는다(Issue #388)",
    (kind) => {
      const editor = realEditor(kind, OLD_URL, undefined, "");
      const before = editor.getDocument();
      const result = applyMediaUrl(
        editor,
        { blockId: "m1", kind, draft: OLD_URL },
        DEFAULT_DICTIONARY,
      );
      expect(result).toEqual({ ok: true, name: "" });
      expect(blockOf(editor)).toMatchObject({ name: "" });
      expect(editor.getDocument()).toEqual(before);
    },
  );

  it.each(KINDS)(
    "%s에 사용자 name이 있어도 다른 URL을 적용하면 name이 새 URL 끝 segment로 바뀐다(#374 특성화)",
    (kind) => {
      const editor = realEditor(kind, OLD_URL, undefined, "내가 바꾼 이름");
      const result = applyMediaUrl(
        editor,
        {
          blockId: "m1",
          kind,
          draft: "https://www.youtube.com/embed/new",
        },
        DEFAULT_DICTIONARY,
      );
      expect(result).toEqual({ ok: true, name: "new" });
      expect(blockOf(editor)).toMatchObject({
        url: "https://www.youtube.com/embed/new",
        name: "new",
      });
    },
  );

  it("정책이 막는 iframe URL은 같은 값이어도 거절 문구를 돌려준다(검증이 같은 값 판정보다 먼저다)", () => {
    const blockedUrl = "https://vimeo.com/embed/x";
    const editor = realEditor("iframe", blockedUrl);
    const before = editor.getDocument();
    const result = applyMediaUrl(
      editor,
      { blockId: "m1", kind: "iframe", draft: blockedUrl },
      DEFAULT_DICTIONARY,
    );
    expect(result).toEqual({
      ok: false,
      rejectedMessage:
        DEFAULT_DICTIONARY.status.iframeUrlRejected.notWhitelisted,
    });
    expect(editor.getDocument()).toEqual(before);
  });

  it("지원하지 않는 URL은 unsupportedMediaUrl 문구로 거절한다", () => {
    const editor = realEditor("image");
    const result = applyMediaUrl(
      editor,
      { blockId: "m1", kind: "image", draft: "javascript:alert(1)" },
      DEFAULT_DICTIONARY,
    );
    expect(result).toEqual({
      ok: false,
      rejectedMessage: DEFAULT_DICTIONARY.status.unsupportedMediaUrl,
    });
  });

  it("image는 name을 넘겨도 거절된 URL이면 문서를 바꾸지 않는다", () => {
    const editor = realEditor("image");
    const before = editor.getDocument();
    const result = applyMediaUrl(
      editor,
      { blockId: "m1", kind: "image", draft: "javascript:alert(1)" },
      DEFAULT_DICTIONARY,
    );
    expect(result.ok).toBe(false);
    expect(editor.getDocument()).toEqual(before);
  });

  it.each([
    ["image", "https://example.com/a/new.png"],
    ["iframe", "https://www.youtube.com/embed/new"],
  ] as const)(
    "onBeforeChange가 거절한 %s의 다른 URL 저장은 거절 문구를 돌려주고 문서를 바꾸지 않는다(Issue #384 F1)",
    (kind, draft) => {
      const editor = realEditor(kind, OLD_URL, () => false);
      editor.mount(document.createElement("div"));
      const before = editor.getDocument();
      const result = applyMediaUrl(
        editor,
        { blockId: "m1", kind, draft },
        DEFAULT_DICTIONARY,
      );
      expect(result).toEqual({
        ok: false,
        rejectedMessage: DEFAULT_DICTIONARY.status.unsupportedMediaUrl,
      });
      expect(editor.getDocument()).toEqual(before);
    },
  );
});
