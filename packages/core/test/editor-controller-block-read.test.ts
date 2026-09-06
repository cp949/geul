import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import { documentOf, paragraphBlock } from "./editor-controller-support.js";

// parent-1 뒤에 형제 after-1을 두고, parent-1 안에 child-1/child-2를 둔다 —
// prev/next가 형제 범위를 넘어(child-2 다음이 after-1) 부모 경계를
// 건너가는지, getParentBlock이 depth 1에서만 부모를 보고하는지를 한 fixture로
// 검증한다(완료 조건 2·3).
const beforeBlock = paragraphBlock("before-1", "before");
const childOne = paragraphBlock("child-1", "one");
const childTwo = paragraphBlock("child-2", "two");
const parentBlock = paragraphBlock("parent-1", "parent", [childOne, childTwo]);
const afterBlock = paragraphBlock("after-1", "after");

const nestedSiblingDocument = () =>
  documentOf(beforeBlock, parentBlock, afterBlock);

describe("에디터 컨트롤러 블록 읽기·순회 API(DOC-004)", () => {
  describe("getBlock", () => {
    it("최상위 블록을 조회한다", () => {
      const editor = createEditor({ initialDocument: nestedSiblingDocument() });

      expect(editor.getBlock("before-1")).toMatchObject({
        id: "before-1",
        content: [{ text: "before" }],
      });
    });

    it("depth 1 자식 블록도 조회한다(완료 조건 1)", () => {
      const editor = createEditor({ initialDocument: nestedSiblingDocument() });

      expect(editor.getBlock("child-2")).toMatchObject({
        id: "child-2",
        content: [{ text: "two" }],
      });
    });

    it("존재하지 않는 blockId는 undefined를 반환한다", () => {
      const editor = createEditor({ initialDocument: nestedSiblingDocument() });

      expect(editor.getBlock("missing")).toBeUndefined();
    });
  });

  describe("getParentBlock", () => {
    it("depth 1 블록의 부모를 반환한다(완료 조건 3)", () => {
      const editor = createEditor({ initialDocument: nestedSiblingDocument() });

      expect(editor.getParentBlock("child-1")?.id).toBe("parent-1");
      expect(editor.getParentBlock("child-2")?.id).toBe("parent-1");
    });

    it("최상위 블록은 undefined를 반환한다", () => {
      const editor = createEditor({ initialDocument: nestedSiblingDocument() });

      expect(editor.getParentBlock("parent-1")).toBeUndefined();
      expect(editor.getParentBlock("before-1")).toBeUndefined();
    });

    it("존재하지 않는 blockId는 undefined를 반환한다", () => {
      const editor = createEditor({ initialDocument: nestedSiblingDocument() });

      expect(editor.getParentBlock("missing")).toBeUndefined();
    });
  });

  describe("getPrevBlock / getNextBlock", () => {
    it("자식의 마지막 블록 다음은 부모의 다음 형제다 — 형제 범위를 넘는다(완료 조건 2)", () => {
      const editor = createEditor({ initialDocument: nestedSiblingDocument() });

      expect(editor.getNextBlock("child-2")?.id).toBe("after-1");
      expect(editor.getPrevBlock("after-1")?.id).toBe("child-2");
    });

    it("부모의 다음은 첫 자식이다", () => {
      const editor = createEditor({ initialDocument: nestedSiblingDocument() });

      expect(editor.getNextBlock("parent-1")?.id).toBe("child-1");
      expect(editor.getPrevBlock("parent-1")?.id).toBe("before-1");
    });

    it("문서 처음·끝에서는 undefined를 반환한다", () => {
      const editor = createEditor({ initialDocument: nestedSiblingDocument() });

      expect(editor.getPrevBlock("before-1")).toBeUndefined();
      expect(editor.getNextBlock("after-1")).toBeUndefined();
    });

    it("존재하지 않는 blockId는 undefined를 반환한다", () => {
      const editor = createEditor({ initialDocument: nestedSiblingDocument() });

      expect(editor.getPrevBlock("missing")).toBeUndefined();
      expect(editor.getNextBlock("missing")).toBeUndefined();
    });
  });

  describe("forEachBlock", () => {
    it("기본값은 정순회로 자식을 부모 바로 뒤, 다음 형제 앞에 방문한다(완료 조건 4)", () => {
      const editor = createEditor({ initialDocument: nestedSiblingDocument() });
      const visited: string[] = [];

      editor.forEachBlock((block) => {
        visited.push(block.id);
      });

      expect(visited).toEqual([
        "before-1",
        "parent-1",
        "child-1",
        "child-2",
        "after-1",
      ]);
    });

    it("reverse: true는 정순회의 완전한 역순이다(완료 조건 4)", () => {
      const editor = createEditor({ initialDocument: nestedSiblingDocument() });
      const visited: string[] = [];

      editor.forEachBlock(
        (block) => {
          visited.push(block.id);
        },
        { reverse: true },
      );

      expect(visited).toEqual([
        "after-1",
        "child-2",
        "child-1",
        "parent-1",
        "before-1",
      ]);
    });

    it("콜백이 false를 반환하면 중첩 순회 전체를 즉시 중단한다(완료 조건 4)", () => {
      // 변이: false 반환이 현재 형제 루프만 끊고 상위 재귀는 계속되면
      // child-1 방문 후에도 child-2·after-1이 방문 목록에 남는다.
      const editor = createEditor({ initialDocument: nestedSiblingDocument() });
      const visited: string[] = [];

      editor.forEachBlock((block) => {
        visited.push(block.id);
        if (block.id === "child-1") return false;
      });

      expect(visited).toEqual(["before-1", "parent-1", "child-1"]);
    });

    it("reverse에서도 중첩 순회 중단이 상위 형제 루프까지 전파된다(완료 조건 4)", () => {
      // 변이: 중단이 parent-1의 자식 재귀에만 갇히면 before-1이 방문 목록에
      // 남는다.
      const editor = createEditor({ initialDocument: nestedSiblingDocument() });
      const visited: string[] = [];

      editor.forEachBlock(
        (block) => {
          visited.push(block.id);
          if (block.id === "child-2") return false;
        },
        { reverse: true },
      );

      expect(visited).toEqual(["after-1", "child-2"]);
    });

    it("parent 인자로 직계 부모를 전달하고 최상위에는 null을 전달한다", () => {
      const editor = createEditor({ initialDocument: nestedSiblingDocument() });
      const parents = new Map<string, string | null>();

      editor.forEachBlock((block, parent) => {
        parents.set(block.id, parent?.id ?? null);
      });

      expect(parents.get("before-1")).toBeNull();
      expect(parents.get("parent-1")).toBeNull();
      expect(parents.get("child-1")).toBe("parent-1");
      expect(parents.get("child-2")).toBe("parent-1");
      expect(parents.get("after-1")).toBeNull();
    });
  });
});
