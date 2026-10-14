/**
 * 접힌 toggleListItem 바로 뒤 블록 선두 Backspace가 숨은 자손이 아니라 가장
 * 바깥 접힌 toggle의 라벨 끝에 병합되는 계약을 확인한다(Issue #253).
 *
 * 숨은 그룹은 display:none이라 시각적으로 존재하지 않는다. findMergeTarget은
 * 문서 순서상 이전 텍스트블록인 마지막 숨은 자손 끝을 돌려주므로, 그대로 병합하면
 * 뒤 블록 텍스트가 보이지 않는 곳으로 사라진다. joinBackwardAtBlockStart가
 * 병합 위치를 라벨 끝으로 보정한다. 접힘과 숨은 자손은 그대로다.
 *
 * 다루는 축: 라벨 병합·접힘 유지·캐럿, 중첩 접힘, 펼친 부모의 접힌 마지막 자식,
 * 뒤 블록 자식 승격, 스키마 유효성, dispatch 1회·undo 1회, 보정이 걸리지 않는
 * 회귀(펼친 toggle·divider 자식·자식 없는 접힌 toggle).
 *
 * 접힌 toggle 라벨 끝 Delete는 반대로 숨은 자손이 아니라 보이는 다음 블록과
 * 병합한다(Issue #419). 정방향 탐색이 라벨 바로 뒤에서 시작하면 숨은 첫 자식이
 * 병합 대상이 돼 그 글자가 라벨로 빨려 들어가거나(문단), 숨은 divider를 건너뛰고
 * 더 안쪽 숨은 글자를 가져가거나(divider), 숨은 codeBlock이 흡수된다. 탐색을 접힌
 * 컨테이너 뒤에서 시작해 막는다. 숨은 자손은 그대로 남는다.
 *
 * Delete 쪽 다루는 축: 숨은 첫 자식 4종(문단·접힌 toggle·divider·codeBlock)의
 * 라벨 병합과 숨은 자손 불변, 펼친 부모의 접힌 마지막 자식, 뒤 블록 자식 승격, 보이는
 * 다음 블록이 codeBlock일 때의 기존 흡수, 가시 다음 블록이 없는 문서 끝(paragraph를
 * 막은 설정)의 키 소비, dispatch 1회·undo 1회, 보정이 걸리지 않는 회귀(자식 없는
 * 접힌 toggle·펼친 toggle).
 *
 * jsdom은 접힌 toggle 안 브라우저 캐럿 이동을 재현하지 못한다(ADR-0007).
 * 입력이 실제로 들어가는 위치는 e2e
 * (showcase-static-toolbar-collapsed-toggle-backspace.spec.ts,
 * showcase-static-toolbar-collapsed-toggle-delete.spec.ts)가 소유한다.
 */
import type { Editor as TiptapEditor } from "@tiptap/core";
import { undoDepth } from "@tiptap/pm/history";
import type { Node as PmNode } from "@tiptap/pm/model";
import { describe, expect, it, vi } from "vitest";

import { createEditor } from "../../src/index.js";
import { contentTextStart, dispatchKeydown } from "../block-test-support.js";
import {
  codeBlockBlock,
  dividerBlock,
  documentOf,
  mounted,
  mountTiptapEditor,
  paragraphBlock,
  sequentialIds,
  toggleBlock,
} from "../editor-controller-support.js";
import {
  denyBlockTypes,
  expectKeyConsumedUnchanged,
  expectSchemaValid,
} from "./block-join-test-support.js";

/**
 * 케이스별로 서로 다른 접힌 toggle·뒤 블록 쌍을 쓰는 단일 fixture.
 * - c1: 접힘. 자식 c1a·c1b. 뒤 문단 n1.
 * - c2: 접힘. 자식 c2a(접힘, 자식 c2a1). 뒤 문단 n2.
 * - p1: 펼침. 자식 p1x와 c3(접힘, 자식 c3a). 뒤 문단 n3.
 * - c4: 접힘. 자식 divider d4뿐. 뒤 문단 n4.
 * - c5: 접힘. 자식 없음. 뒤 문단 n5.
 * - e1: 펼침. 자식 e1a. 뒤 문단 n6.
 * - c6: 접힘. 자식 c6a. 뒤 문단 n7(자식 n7a).
 */
const fixture = () =>
  mounted(
    documentOf(
      toggleBlock("c1", "접힘1", {
        collapsed: true,
        children: [
          paragraphBlock("c1a", "숨은A"),
          paragraphBlock("c1b", "숨은B"),
        ],
      }),
      paragraphBlock("n1", "뒤1"),
      toggleBlock("c2", "접힘2", {
        collapsed: true,
        children: [
          toggleBlock("c2a", "안쪽접힘", {
            collapsed: true,
            children: [paragraphBlock("c2a1", "깊은숨김")],
          }),
        ],
      }),
      paragraphBlock("n2", "뒤2"),
      toggleBlock("p1", "펼친부모", {
        children: [
          paragraphBlock("p1x", "부모자식"),
          toggleBlock("c3", "접힘3", {
            collapsed: true,
            children: [paragraphBlock("c3a", "숨은3")],
          }),
        ],
      }),
      paragraphBlock("n3", "뒤3"),
      toggleBlock("c4", "접힘4", {
        collapsed: true,
        children: [dividerBlock("d4")],
      }),
      paragraphBlock("n4", "뒤4"),
      toggleBlock("c5", "접힘5", { collapsed: true }),
      paragraphBlock("n5", "뒤5"),
      toggleBlock("e1", "펼침1", { children: [paragraphBlock("e1a", "보임")] }),
      paragraphBlock("n6", "뒤6"),
      toggleBlock("c6", "접힘6", {
        collapsed: true,
        children: [paragraphBlock("c6a", "숨은6")],
      }),
      {
        id: "n7",
        type: "paragraph",
        content: [{ text: "뒤7" }],
        children: [paragraphBlock("n7a", "승격대상")],
      },
    ),
  );

/** blockId 컨테이너와 문서 위치를 찾는다. 없으면 던진다. */
const findContainer = (
  tiptap: Pick<TiptapEditor, "state">,
  blockId: string,
): { node: PmNode; pos: number } => {
  let found: { node: PmNode; pos: number } | null = null;
  tiptap.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name === "blockContainer" && node.attrs.blockId === blockId) {
      found = { node, pos };
      return false;
    }
    return true;
  });
  if (found === null) throw new Error(`blockContainer ${blockId} 조회 실패`);
  return found;
};

/** 컨테이너가 문서에 있는지. */
const hasContainer = (
  tiptap: Pick<TiptapEditor, "state">,
  blockId: string,
): boolean => {
  try {
    findContainer(tiptap, blockId);
    return true;
  } catch {
    return false;
  }
};

/** 컨테이너 라벨(첫 자식 blockContent)의 텍스트. */
const labelOf = (
  tiptap: Pick<TiptapEditor, "state">,
  blockId: string,
): string => findContainer(tiptap, blockId).node.firstChild?.textContent ?? "";

/** 컨테이너 숨은 그룹 직속 자식 id 목록. 그룹이 없으면 빈 배열이다. */
const groupChildIds = (
  tiptap: Pick<TiptapEditor, "state">,
  blockId: string,
): string[] => {
  const group = findContainer(tiptap, blockId).node.maybeChild(1);
  if (group === null) return [];
  const ids: string[] = [];
  group.forEach((child) => ids.push(child.attrs.blockId as string));
  return ids;
};

/** 컨테이너 숨은 그룹 안 모든 문단의 텍스트(문서 순서). */
const groupTexts = (
  tiptap: Pick<TiptapEditor, "state">,
  blockId: string,
): string[] => {
  const group = findContainer(tiptap, blockId).node.maybeChild(1);
  const texts: string[] = [];
  group?.descendants((node) => {
    if (node.isTextblock) texts.push(node.textContent);
    return true;
  });
  return texts;
};

/** 라벨 끝 위치. 병합 전 상태에서 계산해야 접합점과 같다. */
const labelEnd = (tiptap: Pick<TiptapEditor, "state">, blockId: string) =>
  contentTextStart(tiptap, blockId) +
  (findContainer(tiptap, blockId).node.firstChild?.content.size ?? 0);

/** 뒤 블록 선두에 캐럿을 두고 Backspace keydown을 실 디스패치한다. */
const backspaceAtStart = (tiptap: TiptapEditor, blockId: string): boolean => {
  tiptap.commands.setTextSelection(contentTextStart(tiptap, blockId));
  return dispatchKeydown(tiptap, "Backspace");
};

describe("접힌 toggle 바로 뒤 블록 선두 Backspace는 라벨 끝에 병합한다(#253)", () => {
  it("숨은 자손이 아니라 접힌 toggle 라벨 끝에 뒤 문단 텍스트를 붙이고 숨은 자손은 그대로 둔다", () => {
    const { tiptap } = fixture();
    const hiddenIdsBefore = groupChildIds(tiptap, "c1");
    const hiddenTextsBefore = groupTexts(tiptap, "c1");

    const handled = backspaceAtStart(tiptap, "n1");

    expect(handled).toBe(true);
    expect(labelOf(tiptap, "c1")).toBe("접힘1뒤1");
    expect(hasContainer(tiptap, "n1")).toBe(false);
    expect(groupChildIds(tiptap, "c1")).toEqual(hiddenIdsBefore);
    expect(groupTexts(tiptap, "c1")).toEqual(hiddenTextsBefore);
    expect(groupTexts(tiptap, "c1")).toEqual(["숨은A", "숨은B"]);
  });

  it("병합 뒤에도 접힌 toggle은 collapsed: true를 유지한다", () => {
    const { tiptap } = fixture();

    backspaceAtStart(tiptap, "n1");

    // 병합이 일어났음을 먼저 확인한다. 병합이 숨은 그룹으로 새면 접힘 유지만으로는 구분되지 않는다.
    expect(labelOf(tiptap, "c1")).toBe("접힘1뒤1");
    expect(findContainer(tiptap, "c1").node.firstChild?.attrs.collapsed).toBe(
      true,
    );
  });

  it("캐럿은 라벨의 기존 텍스트 끝(접합점)이고 빈 TextSelection이며 숨은 자손 안이 아니다", () => {
    const { tiptap } = fixture();
    const expectedCaret = labelEnd(tiptap, "c1");

    backspaceAtStart(tiptap, "n1");

    // 가드가 숨은 자손 안 캐럿을 라벨 끝으로 되돌려도 같은 위치가 되므로 병합 결과를 함께 확인한다.
    expect(labelOf(tiptap, "c1")).toBe("접힘1뒤1");
    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.from).toBe(expectedCaret);
    expect(selection.$from.parent).toBe(
      findContainer(tiptap, "c1").node.firstChild,
    );
    expect(selection.$from.parentOffset).toBe("접힘1".length);
  });

  it("접힌 toggle 안에 접힌 toggle이 있으면 가장 바깥 접힌 toggle 라벨에 병합한다", () => {
    const { tiptap } = fixture();

    backspaceAtStart(tiptap, "n2");

    expect(labelOf(tiptap, "c2")).toBe("접힘2뒤2");
    expect(hasContainer(tiptap, "n2")).toBe(false);
    // 안쪽 접힌 toggle과 그 자손은 그대로다.
    expect(labelOf(tiptap, "c2a")).toBe("안쪽접힘");
    expect(groupChildIds(tiptap, "c2")).toEqual(["c2a"]);
    expect(groupTexts(tiptap, "c2")).toEqual(["안쪽접힘", "깊은숨김"]);
    expect(tiptap.state.selection.$from.parent).toBe(
      findContainer(tiptap, "c2").node.firstChild,
    );
  });

  it("펼친 부모 목록의 마지막 자식이 접힌 toggle이면 부모 뒤 블록은 그 접힌 toggle 라벨에 병합한다", () => {
    const { tiptap } = fixture();

    backspaceAtStart(tiptap, "n3");

    expect(labelOf(tiptap, "c3")).toBe("접힘3뒤3");
    expect(hasContainer(tiptap, "n3")).toBe(false);
    expect(groupChildIds(tiptap, "c3")).toEqual(["c3a"]);
    expect(groupTexts(tiptap, "c3")).toEqual(["숨은3"]);
    // 펼친 부모의 라벨은 바뀌지 않는다.
    expect(labelOf(tiptap, "p1")).toBe("펼친부모");
  });

  it("뒤 블록의 자식은 숨은 그룹이 아니라 제거된 블록 위치로 승격한다", () => {
    const { tiptap } = fixture();

    backspaceAtStart(tiptap, "n7");

    expect(labelOf(tiptap, "c6")).toBe("접힘6뒤7");
    expect(hasContainer(tiptap, "n7")).toBe(false);
    // 숨은 그룹에는 원래 자손만 있다.
    expect(groupChildIds(tiptap, "c6")).toEqual(["c6a"]);
    // 승격된 n7a는 c6 바로 뒤 최상위 형제다.
    const { doc } = tiptap.state;
    const topIds: string[] = [];
    doc.forEach((child) => topIds.push(child.attrs.blockId as string));
    const c6Index = topIds.indexOf("c6");
    expect(topIds[c6Index + 1]).toBe("n7a");
    expect(labelOf(tiptap, "n7a")).toBe("승격대상");
  });

  it("보정 병합 결과는 스키마 유효 트리다(단순·중첩·펼친 부모)", () => {
    const cases = [
      ["c1", "n1", "접힘1뒤1"],
      ["c2", "n2", "접힘2뒤2"],
      ["c3", "n3", "접힘3뒤3"],
    ] as const;
    for (const [toggleId, nextId, merged] of cases) {
      const { tiptap } = fixture();
      backspaceAtStart(tiptap, nextId);
      expect(labelOf(tiptap, toggleId)).toBe(merged);
      expectSchemaValid(tiptap);
    }
  });

  it("Backspace 1회는 dispatch 1회이고 undo 1회로 원래 문서가 돌아온다", () => {
    const { tiptap } = fixture();
    const beforeJson = tiptap.state.doc.toJSON();
    // 캐럿 배치 dispatch는 spy 전에 끝낸다.
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "n1"));
    const dispatch = vi.spyOn(tiptap.view, "dispatch");

    dispatchKeydown(tiptap, "Backspace");

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(labelOf(tiptap, "c1")).toBe("접힘1뒤1");
    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });
});

describe("접힌 toggle 보정이 걸리지 않는 Backspace 회귀(#253)", () => {
  it("펼친 toggle 뒤 블록 Backspace는 마지막 자손에 병합한다", () => {
    const { tiptap } = fixture();

    backspaceAtStart(tiptap, "n6");

    expect(labelOf(tiptap, "e1")).toBe("펼침1");
    expect(labelOf(tiptap, "e1a")).toBe("보임뒤6");
    expect(hasContainer(tiptap, "n6")).toBe(false);
  });

  it("자식이 divider뿐인 접힌 toggle 뒤 블록 Backspace는 라벨에 병합하고 divider를 그대로 둔다", () => {
    const { tiptap } = fixture();

    backspaceAtStart(tiptap, "n4");

    expect(labelOf(tiptap, "c4")).toBe("접힘4뒤4");
    expect(groupChildIds(tiptap, "c4")).toEqual(["d4"]);
    expect(findContainer(tiptap, "c4").node.firstChild?.attrs.collapsed).toBe(
      true,
    );
  });

  it("자식 없는 접힌 toggle 뒤 블록 Backspace는 라벨에 병합한다", () => {
    const { tiptap } = fixture();

    backspaceAtStart(tiptap, "n5");

    expect(labelOf(tiptap, "c5")).toBe("접힘5뒤5");
    expect(hasContainer(tiptap, "n5")).toBe(false);
    expect(groupChildIds(tiptap, "c5")).toEqual([]);
  });
});

/**
 * Delete 전용 fixture. Backspace fixture와 접힌 toggle·뒤 블록 짝이 달라 따로 둔다.
 * - a1: 접힘. 숨은 자식 문단 a1a·a1b. 뒤 문단 m1(자식 m1a).
 * - a2: 접힘. 숨은 첫 자식이 접힌 toggle a2a(자식 a2a1). 뒤 문단 m2.
 * - a3: 접힘. 숨은 첫 자식이 divider d3, 그 뒤 문단 a3b. 뒤 문단 m3.
 * - a4: 접힘. 숨은 첫 자식이 codeBlock k4. 뒤 문단 m4.
 * - p1: 펼침. 자식 p1x와 a5(접힘, 자식 a5a). 뒤 문단 m5.
 * - a6: 접힘. 숨은 자식 a6a. 뒤 codeBlock k6.
 * - c1: 접힘. 자식 없음. 뒤 문단 m6.
 * - e1: 펼침. 자식 e1a. 뒤 문단 m7.
 */
const deleteFixture = () =>
  mounted(
    documentOf(
      toggleBlock("a1", "접힘1", {
        collapsed: true,
        children: [
          paragraphBlock("a1a", "숨은A"),
          paragraphBlock("a1b", "숨은B"),
        ],
      }),
      {
        id: "m1",
        type: "paragraph",
        content: [{ text: "뒤1" }],
        children: [paragraphBlock("m1a", "승격대상")],
      },
      toggleBlock("a2", "접힘2", {
        collapsed: true,
        children: [
          toggleBlock("a2a", "안쪽접힘", {
            collapsed: true,
            children: [paragraphBlock("a2a1", "깊은숨김")],
          }),
        ],
      }),
      paragraphBlock("m2", "뒤2"),
      toggleBlock("a3", "접힘3", {
        collapsed: true,
        children: [dividerBlock("d3"), paragraphBlock("a3b", "숨은3b")],
      }),
      paragraphBlock("m3", "뒤3"),
      toggleBlock("a4", "접힘4", {
        collapsed: true,
        children: [codeBlockBlock("k4", "숨은코드")],
      }),
      paragraphBlock("m4", "뒤4"),
      toggleBlock("p1", "펼친부모", {
        children: [
          paragraphBlock("p1x", "부모자식"),
          toggleBlock("a5", "접힘5", {
            collapsed: true,
            children: [paragraphBlock("a5a", "숨은5")],
          }),
        ],
      }),
      paragraphBlock("m5", "뒤5"),
      toggleBlock("a6", "접힘6", {
        collapsed: true,
        children: [paragraphBlock("a6a", "숨은6")],
      }),
      codeBlockBlock("k6", "뒤코드"),
      toggleBlock("c1", "자식없음", { collapsed: true }),
      paragraphBlock("m6", "뒤6"),
      toggleBlock("e1", "펼침1", { children: [paragraphBlock("e1a", "보임")] }),
      paragraphBlock("m7", "뒤7"),
    ),
  );

/** 컨테이너 숨은 그룹의 JSON(id·타입·글자·collapsed 포함). 그룹이 없으면 null이다. */
const groupJson = (
  tiptap: Pick<TiptapEditor, "state">,
  blockId: string,
): unknown =>
  findContainer(tiptap, blockId).node.maybeChild(1)?.toJSON() ?? null;

/** 라벨 끝에 캐럿을 두고 Delete keydown을 실 디스패치한다. */
const deleteAtLabelEnd = (tiptap: TiptapEditor, blockId: string): boolean => {
  tiptap.commands.setTextSelection(labelEnd(tiptap, blockId));
  return dispatchKeydown(tiptap, "Delete");
};

describe("접힌 toggle 라벨 끝 Delete는 보이는 다음 블록과 병합한다(#419)", () => {
  it("숨은 첫 자식이 문단이면 숨은 글자가 아니라 뒤 문단 텍스트를 라벨에 붙이고 숨은 자손은 그대로 둔다", () => {
    const { tiptap } = deleteFixture();
    const hiddenBefore = groupJson(tiptap, "a1");

    const handled = deleteAtLabelEnd(tiptap, "a1");

    expect(handled).toBe(true);
    expect(labelOf(tiptap, "a1")).toBe("접힘1뒤1");
    expect(hasContainer(tiptap, "m1")).toBe(false);
    expect(groupJson(tiptap, "a1")).toEqual(hiddenBefore);
    expect(groupTexts(tiptap, "a1")).toEqual(["숨은A", "숨은B"]);
    expect(findContainer(tiptap, "a1").node.firstChild?.attrs.collapsed).toBe(
      true,
    );
  });

  it("숨은 첫 자식이 접힌 toggle이면 같은 병합이고 안쪽 toggle의 id·글자·collapsed가 그대로다", () => {
    const { tiptap } = deleteFixture();
    const hiddenBefore = groupJson(tiptap, "a2");

    deleteAtLabelEnd(tiptap, "a2");

    expect(labelOf(tiptap, "a2")).toBe("접힘2뒤2");
    expect(hasContainer(tiptap, "m2")).toBe(false);
    expect(groupJson(tiptap, "a2")).toEqual(hiddenBefore);
    expect(labelOf(tiptap, "a2a")).toBe("안쪽접힘");
    expect(findContainer(tiptap, "a2a").node.firstChild?.attrs.collapsed).toBe(
      true,
    );
  });

  it("숨은 첫 자식이 divider이면 divider 뒤 숨은 문단이 아니라 뒤 문단과 병합한다", () => {
    const { tiptap } = deleteFixture();
    const hiddenBefore = groupJson(tiptap, "a3");

    deleteAtLabelEnd(tiptap, "a3");

    expect(labelOf(tiptap, "a3")).toBe("접힘3뒤3");
    expect(hasContainer(tiptap, "m3")).toBe(false);
    expect(groupJson(tiptap, "a3")).toEqual(hiddenBefore);
    expect(groupChildIds(tiptap, "a3")).toEqual(["d3", "a3b"]);
    expect(labelOf(tiptap, "a3b")).toBe("숨은3b");
  });

  it("숨은 첫 자식이 codeBlock이면 그 codeBlock이 아니라 뒤 문단과 병합하고 codeBlock이 그대로다", () => {
    const { tiptap } = deleteFixture();
    const hiddenBefore = groupJson(tiptap, "a4");

    deleteAtLabelEnd(tiptap, "a4");

    expect(labelOf(tiptap, "a4")).toBe("접힘4뒤4");
    expect(hasContainer(tiptap, "m4")).toBe(false);
    expect(groupJson(tiptap, "a4")).toEqual(hiddenBefore);
    expect(groupChildIds(tiptap, "a4")).toEqual(["k4"]);
    expect(labelOf(tiptap, "k4")).toBe("숨은코드");
  });

  it("펼친 부모 목록의 마지막 자식이 접힌 toggle이면 부모 뒤 블록과 병합한다", () => {
    const { tiptap } = deleteFixture();

    deleteAtLabelEnd(tiptap, "a5");

    expect(labelOf(tiptap, "a5")).toBe("접힘5뒤5");
    expect(hasContainer(tiptap, "m5")).toBe(false);
    expect(groupChildIds(tiptap, "a5")).toEqual(["a5a"]);
    expect(groupTexts(tiptap, "a5")).toEqual(["숨은5"]);
    expect(labelOf(tiptap, "p1")).toBe("펼친부모");
  });

  it("뒤 블록의 자식은 숨은 그룹이 아니라 제거된 블록 위치로 승격한다", () => {
    const { tiptap } = deleteFixture();

    deleteAtLabelEnd(tiptap, "a1");

    expect(groupChildIds(tiptap, "a1")).toEqual(["a1a", "a1b"]);
    // 승격된 m1a는 a1 바로 뒤 최상위 형제다.
    const topIds: string[] = [];
    tiptap.state.doc.forEach((child) =>
      topIds.push(child.attrs.blockId as string),
    );
    expect(topIds[topIds.indexOf("a1") + 1]).toBe("m1a");
    expect(labelOf(tiptap, "m1a")).toBe("승격대상");
  });

  it("보이는 다음 블록이 codeBlock이면 기존 흡수 규칙으로 라벨 뒤에 붙이고 숨은 자손은 그대로 둔다", () => {
    const { tiptap } = deleteFixture();
    const hiddenBefore = groupJson(tiptap, "a6");

    deleteAtLabelEnd(tiptap, "a6");

    expect(labelOf(tiptap, "a6")).toBe("접힘6뒤코드");
    expect(hasContainer(tiptap, "k6")).toBe(false);
    expect(groupJson(tiptap, "a6")).toEqual(hiddenBefore);
    expect(groupTexts(tiptap, "a6")).toEqual(["숨은6"]);
  });

  it("병합 뒤 캐럿은 라벨의 기존 글자 끝(접합점)이고 병합 결과는 스키마 유효 트리다", () => {
    const { tiptap } = deleteFixture();
    const expectedCaret = labelEnd(tiptap, "a1");

    deleteAtLabelEnd(tiptap, "a1");

    expect(labelOf(tiptap, "a1")).toBe("접힘1뒤1");
    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.from).toBe(expectedCaret);
    expect(selection.$from.parent).toBe(
      findContainer(tiptap, "a1").node.firstChild,
    );
    expect(selection.$from.parentOffset).toBe("접힘1".length);
    expectSchemaValid(tiptap);
  });

  it("Delete 1회는 dispatch 1회이고 undo 1회로 원래 문서가 돌아온다", () => {
    const { tiptap } = deleteFixture();
    const beforeJson = tiptap.state.doc.toJSON();
    // 캐럿 배치 dispatch는 spy 전에 끝낸다.
    tiptap.commands.setTextSelection(labelEnd(tiptap, "a1"));
    const dispatch = vi.spyOn(tiptap.view, "dispatch");

    dispatchKeydown(tiptap, "Delete");

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(labelOf(tiptap, "a1")).toBe("접힘1뒤1");
    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });
});

describe("접힌 toggle 보정이 걸리지 않는 Delete 회귀(#419)", () => {
  it("자식 없는 접힌 toggle 라벨 끝 Delete는 뒤 블록과 병합한다", () => {
    const { tiptap } = deleteFixture();

    deleteAtLabelEnd(tiptap, "c1");

    expect(labelOf(tiptap, "c1")).toBe("자식없음뒤6");
    expect(hasContainer(tiptap, "m6")).toBe(false);
    expect(groupChildIds(tiptap, "c1")).toEqual([]);
    expect(findContainer(tiptap, "c1").node.firstChild?.attrs.collapsed).toBe(
      true,
    );
  });

  it("펼친 toggle 라벨 끝 Delete는 보이는 첫 자식을 라벨에 병합한다", () => {
    const { tiptap } = deleteFixture();

    deleteAtLabelEnd(tiptap, "e1");

    expect(labelOf(tiptap, "e1")).toBe("펼침1보임");
    expect(hasContainer(tiptap, "e1a")).toBe(false);
    expect(hasContainer(tiptap, "m7")).toBe(true);
  });
});

describe("paragraph를 막은 설정의 문서 끝 접힌 toggle 라벨 끝 Delete(#419)", () => {
  // 보이는 다음 블록이 없고 숨은 자손만 있다. 병합 대상이 없어 키만 소비한다.
  const mountBlocked = (blocks: ReturnType<typeof toggleBlock>[]) => {
    const editor = createEditor({
      initialDocument: documentOf(...blocks),
      createId: sequentialIds("id"),
      enabledBlockTypes: denyBlockTypes(["paragraph"]),
    });
    return mountTiptapEditor(editor);
  };

  const expectConsumedOnly = (tiptap: TiptapEditor, blockId: string): void => {
    tiptap.commands.setTextSelection(labelEnd(tiptap, blockId));
    const selection = tiptap.state.selection;
    const depth = undoDepth(tiptap.state);

    expectKeyConsumedUnchanged(tiptap, () => dispatchKeydown(tiptap, "Delete"));

    expect(tiptap.state.selection.eq(selection)).toBe(true);
    expect(undoDepth(tiptap.state)).toBe(depth);
  };

  it("문서 끝 접힌 toggle은 숨은 자손과 병합하지 않고 키만 소비한다", () => {
    const { tiptap } = mountBlocked([
      toggleBlock("t", "끝", {
        collapsed: true,
        children: [toggleBlock("h", "숨은토글")],
      }),
    ]);

    expectConsumedOnly(tiptap, "t");
    expect(labelOf(tiptap, "t")).toBe("끝");
    expect(labelOf(tiptap, "h")).toBe("숨은토글");
  });

  it("펼친 부모의 접힌 마지막 자식이 문서 끝이어도 키만 소비한다", () => {
    const { tiptap } = mountBlocked([
      toggleBlock("p", "부모", {
        children: [
          toggleBlock("t", "끝", {
            collapsed: true,
            children: [toggleBlock("h", "숨은토글")],
          }),
        ],
      }),
    ]);

    expectConsumedOnly(tiptap, "t");
    expect(labelOf(tiptap, "t")).toBe("끝");
    expect(labelOf(tiptap, "h")).toBe("숨은토글");
  });
});
