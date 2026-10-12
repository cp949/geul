/**
 * runBlockAttrCommand가 블록 attrs 확정 명령의 공통 불변식을 한 곳에서
 * 지키는지 확인한다. 순서(파괴 가드 → 대상 찾기 → 종류 가드 → 값 검증 →
 * 같은 값 판정 → dispatch), 같은 값 재적용이 history 단위를 남기지 않는
 * 것(Issue #375), 성공이 undo 1회로 돌아오는 것, target 두 종류를 다룬다.
 * 개별 명령의 에러 코드와 값 정책은 editor-controller-* 통합 테스트가
 * 따로 증명한다.
 */
import type { JSONContent } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";

import {
  runBlockAttrCommand,
  type BlockAttrCommandDeps,
  type BlockAttrCommandSpec,
} from "../src/block-attr-command.js";
import { createTableFixtureEditor } from "./table-test-support.js";

const paragraph = (blockId: string, text: string): JSONContent => ({
  type: "blockContainer",
  attrs: { blockId },
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

const codeBlock = (blockId: string): JSONContent => ({
  type: "blockContainer",
  attrs: { blockId },
  content: [{ type: "codeBlock", content: [{ type: "text", text: "x" }] }],
});

const setup = (options: { isDestroyed?: boolean } = {}) => {
  const editor = createTableFixtureEditor({
    type: "doc",
    content: [paragraph("p-1", "one"), codeBlock("c-1")],
  });
  const deps: BlockAttrCommandDeps = {
    isDestroyed: options.isDestroyed ?? false,
    editor,
    runDocumentCommand: (command, _reason, body) => {
      return body()
        ? { ok: true, value: undefined }
        : { ok: false, error: { code: "COMMAND_NOT_APPLICABLE", command } };
    },
  };
  return { editor, deps };
};

const textColorSpec = (
  overrides: Partial<BlockAttrCommandSpec> = {},
): BlockAttrCommandSpec => ({
  command: "setBlockTextColor",
  blockId: "p-1",
  target: "block",
  appliesTo: (node) => node.type.name === "blockContainer",
  nextAttrs: (attrs) => ({ ...attrs, textColor: "red" }),
  ...overrides,
});

const notApplicable = (command: string) => ({
  ok: false,
  error: { code: "COMMAND_NOT_APPLICABLE", command },
});

describe("runBlockAttrCommand", () => {
  it("block 대상의 attrs를 바꾸고 undo 1회로 되돌린다", () => {
    const { editor, deps } = setup();
    const before = editor.state.doc;

    const result = runBlockAttrCommand(deps, textColorSpec());

    expect(result).toEqual({ ok: true, value: undefined });
    expect(editor.state.doc.firstChild?.attrs.textColor).toBe("red");
    expect(editor.commands.undo()).toBe(true);
    expect(editor.state.doc.eq(before)).toBe(true);
  });

  it("연속한 두 명령은 history 단위가 합쳐지지 않는다", () => {
    const { editor, deps } = setup();

    runBlockAttrCommand(deps, textColorSpec());
    runBlockAttrCommand(
      deps,
      textColorSpec({
        nextAttrs: (attrs) => ({ ...attrs, textColor: "blue" }),
      }),
    );

    expect(editor.commands.undo()).toBe(true);
    expect(editor.state.doc.firstChild?.attrs.textColor).toBe("red");
  });

  it("content 대상은 컨테이너가 아니라 콘텐츠 노드의 attrs를 바꾼다", () => {
    const { editor, deps } = setup();

    const result = runBlockAttrCommand(deps, {
      command: "setCodeBlockWrap",
      blockId: "c-1",
      target: "content",
      appliesTo: (node) => node.type.name === "codeBlock",
      nextAttrs: (attrs) => ({ ...attrs, wrap: true }),
    });

    expect(result).toEqual({ ok: true, value: undefined });
    const container = editor.state.doc.child(1);
    expect(container.attrs.wrap).toBeUndefined();
    expect(container.firstChild?.attrs.wrap).toBe(true);
  });

  it("같은 값 재적용은 dispatch하지 않고 거절한다(Issue #375)", () => {
    const { editor, deps } = setup();
    const dispatch = vi.spyOn(editor.view, "dispatch");

    const result = runBlockAttrCommand(
      deps,
      textColorSpec({ nextAttrs: (attrs) => ({ ...attrs }) }),
    );

    expect(result).toEqual(notApplicable("setBlockTextColor"));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("파괴된 세션은 대상을 찾기 전에 거절한다", () => {
    const { deps } = setup({ isDestroyed: true });
    const nextAttrs = vi.fn((attrs: Record<string, unknown>) => attrs);

    const result = runBlockAttrCommand(
      deps,
      textColorSpec({ blockId: "없음", nextAttrs }),
    );

    expect(result).toEqual(notApplicable("setBlockTextColor"));
    expect(nextAttrs).not.toHaveBeenCalled();
  });

  it("대상이 없으면 BLOCK_NOT_FOUND다", () => {
    const { deps } = setup();

    expect(
      runBlockAttrCommand(deps, textColorSpec({ blockId: "없음" })),
    ).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "없음" },
    });
    expect(
      runBlockAttrCommand(
        deps,
        textColorSpec({ blockId: "없음", target: "content" }),
      ),
    ).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "없음" },
    });
  });

  it("종류 가드가 값 검증보다 먼저이고, 실패 결과는 기본 또는 지정 에러다", () => {
    const { deps } = setup();
    const validate = vi.fn(() => null);

    expect(
      runBlockAttrCommand(
        deps,
        textColorSpec({ appliesTo: () => false, validate }),
      ),
    ).toEqual(notApplicable("setBlockTextColor"));
    expect(
      runBlockAttrCommand(
        deps,
        textColorSpec({
          appliesTo: () => false,
          unsupported: { code: "MEDIA_RESIZE_NOT_SUPPORTED" },
          validate,
        }),
      ),
    ).toEqual({ ok: false, error: { code: "MEDIA_RESIZE_NOT_SUPPORTED" } });
    expect(validate).not.toHaveBeenCalled();
  });

  it("값 검증 에러는 attrs 계산 없이 그대로 돌려준다", () => {
    const { editor, deps } = setup();
    const dispatch = vi.spyOn(editor.view, "dispatch");
    const nextAttrs = vi.fn((attrs: Record<string, unknown>) => attrs);

    const result = runBlockAttrCommand(
      deps,
      textColorSpec({
        validate: () => ({ code: "INVALID_COLOR", color: "nope" }),
        nextAttrs,
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "INVALID_COLOR", color: "nope" },
    });
    expect(nextAttrs).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
