/**
 * media-source-apply.ts의 규칙을 직접 겨냥한 스위트. File Panel과 Media
 * Toolbar가 이 규칙을 같이 쓴다. 두 컴포넌트의 오케스트레이션은
 * file-panel.test.tsx와 media-toolbar*.test.tsx가 검증하고, 이 파일은 그
 * 아래 순수 규칙만 편집기 마운트 없이 겨냥한다(ADR-0007).
 */

import {
  DEFAULT_DICTIONARY,
  type EditorController,
  type EditorError,
  type MediaBlockKind,
} from "@cp949/geul-core";
import { describe, expect, it, vi } from "vitest";

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

  const fakeEditor = (error?: EditorError) => {
    const setIframeSrc = vi.fn(() =>
      error === undefined ? okResult : { ok: false as const, error },
    );
    const setMediaBlockUrl = vi.fn(() =>
      error === undefined ? okResult : { ok: false as const, error },
    );
    return {
      editor: {
        commands: { setIframeSrc, setMediaBlockUrl },
      } as unknown as Pick<EditorController, "commands">,
      setIframeSrc,
      setMediaBlockUrl,
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
