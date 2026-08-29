/**
 * production PM 스키마의 nestable/leaf 블록 컨테이너 계약을 검증한다.
 * CodeBlock의 자식 금지, 직접 block 멤버 비참여와 create/replace 공유 assembly를
 * 실제 EditorController 경계에서 고정한다.
 */
import type { NodeType } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import {
  liveSchema,
  mountTiptapEditor,
  paragraphDocument,
  requireNode,
} from "./editor-controller-support.js";

/**
 * 공개 NodeSpec.group 문자열을 ProseMirror의 공백 구분 group 목록으로 읽는다.
 * production 스키마의 정확한 group 귀속과 직접 block 비참여를 함께 판정한다.
 */
function nodeGroups(node: NodeType): string[] {
  return node.spec.group?.split(/\s+/).filter(Boolean) ?? [];
}

describe("CodeBlock production 스키마 계약", () => {
  it("production 스키마는 중첩 가능 content와 CodeBlock leaf group을 분리한다", () => {
    const schema = liveSchema();
    const paragraph = requireNode(schema, "paragraph");
    const heading = requireNode(schema, "heading");
    const quote = requireNode(schema, "quote");
    const codeBlock = requireNode(schema, "codeBlock");

    expect(nodeGroups(paragraph)).toEqual(["nestableBlockContent"]);
    expect(nodeGroups(heading)).toEqual(["nestableBlockContent"]);
    expect(nodeGroups(quote)).toEqual(["nestableBlockContent"]);
    expect(nodeGroups(codeBlock)).toEqual(["leafBlockContent"]);
  });

  it("CodeBlock container는 own blockGroup을 가질 수 없다", () => {
    const schema = liveSchema();
    const blockContainer = requireNode(schema, "blockContainer");
    const blockGroup = requireNode(schema, "blockGroup");
    const codeBlock = requireNode(schema, "codeBlock");
    const blockGroupNode = blockGroup.createAndFill();
    if (blockGroupNode === null) throw new Error("blockGroup fill failed");

    expect(() =>
      blockContainer.createChecked(null, codeBlock.create()),
    ).not.toThrow();
    expect(() =>
      blockContainer.createChecked(null, [codeBlock.create(), blockGroupNode]),
    ).toThrow();
  });

  it("CodeBlock은 doc과 blockGroup의 직접 member가 아니다", () => {
    const schema = liveSchema();
    const doc = requireNode(schema, "doc");
    const blockGroup = requireNode(schema, "blockGroup");
    const blockContainer = requireNode(schema, "blockContainer");
    const codeBlock = requireNode(schema, "codeBlock");

    expect(doc.contentMatch.matchType(codeBlock)).toBeNull();
    expect(blockGroup.contentMatch.matchType(codeBlock)).toBeNull();
    expect(nodeGroups(codeBlock)).not.toContain("block");
    expect(doc.contentMatch.defaultType).toBe(blockContainer);
    expect(blockGroup.contentMatch.defaultType).toBe(blockContainer);
  });

  it("create와 replace가 공유하는 production 스키마에 CodeBlock이 한 번 등록된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("before"),
    });
    const initialTiptap = mountTiptapEditor(editor).tiptap;

    expect(
      initialTiptap.extensionManager.extensions.filter(
        (extension) => extension.name === "codeBlock",
      ),
    ).toHaveLength(1);

    expect(editor.replaceDocument(paragraphDocument("after", 1))).toEqual({
      ok: true,
      value: undefined,
    });

    const replacementTiptap = mountTiptapEditor(editor).tiptap;
    expect(requireNode(replacementTiptap.schema, "codeBlock")).toBeDefined();
    expect(
      replacementTiptap.extensionManager.extensions.filter(
        (extension) => extension.name === "codeBlock",
      ),
    ).toHaveLength(1);
  });
});
