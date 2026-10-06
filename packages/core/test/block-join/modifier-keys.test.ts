/**
 * Backspace·Delete와 같은 방향 동작을 가진 수식 키 조합이 BlockJoin 병합
 * 경로를 타는 계약을 확인한다(Issue #276).
 *
 * Tiptap Keymap은 Shift-Backspace·Mod-Backspace를 backward, Mod-Delete를
 * forward 핸들러에 묶는다. 이 키가 BlockJoin을 거치지 않으면 PM joinBackward가
 * 뒤 블록을 앞 블록의 자식으로 중첩하거나 접힌 toggle의 숨은 자손에 병합한다.
 * Mac·iOS에서는 Tiptap macKeymap의 Ctrl-h·Alt-Backspace(backward)와
 * Ctrl-d·Ctrl-Alt-Backspace·Alt-Delete·Alt-d(forward)도 같은 핸들러에 묶인다.
 *
 * 동등 검증은 같은 fixture를 두 번 만들어 Backspace(또는 Delete)와 대상 키를
 * 각각 누르고, 소비 여부·editorState(문서·selection·stored mark)·dispatch 횟수가
 * 같은지 대조한다. 기대값을 새로 쓰지 않아 #202·#253 계약을 그대로 상속한다.
 *
 * 다루는 축: 접힌 toggle 뒤 문단·codeBlock 선두·toggle 헤더·divider 뒤 문단의
 * backward 동등, 문단 끝 Mod-Delete 동등, 블록 중간·범위 선택 게이트, Mac
 * 전용 키 동등, 비Mac에서 Mac 전용 키 미소비.
 *
 * 키 소비는 view.someProp("handleKeyDown", ...) 실 디스패치로 검증한다. 실제
 * Mac 브라우저 동작은 이 파일 범위 밖이고 바인딩 존재만 증명한다.
 */
import type { Document } from "@cp949/geul-model";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  contentTextStart,
  dispatchKeydown,
  dispatchModifiedKeydown,
  dispatchTextInput,
} from "../block-test-support.js";
import {
  codeBlockBlock,
  dividerBlock,
  documentOf,
  editorState,
  mounted,
  paragraphBlock,
  toggleBlock,
} from "../editor-controller-support.js";

type Modifiers = Parameters<typeof dispatchModifiedKeydown>[2];
type Direction = "backward" | "forward";

/** 대조할 키. 기준 키(Backspace·Delete)와 같은 방향 동작이어야 한다. */
interface KeyCase {
  readonly label: string;
  readonly key: string;
  readonly modifiers: Modifiers;
}

const SHIFT_BACKSPACE: KeyCase = {
  label: "Shift-Backspace",
  key: "Backspace",
  modifiers: { shiftKey: true },
};
const MOD_BACKSPACE: KeyCase = {
  label: "Mod-Backspace",
  key: "Backspace",
  modifiers: { ctrlKey: true },
};
const MOD_DELETE: KeyCase = {
  label: "Mod-Delete",
  key: "Delete",
  modifiers: { ctrlKey: true },
};

/** Mac·iOS에서만 Tiptap keymap이 backward에 묶는 키. */
const MAC_BACKWARD: readonly KeyCase[] = [
  { label: "Alt-Backspace", key: "Backspace", modifiers: { altKey: true } },
  { label: "Ctrl-h", key: "h", modifiers: { ctrlKey: true } },
];
/** Mac·iOS에서만 Tiptap keymap이 forward에 묶는 키. */
const MAC_FORWARD: readonly KeyCase[] = [
  { label: "Ctrl-d", key: "d", modifiers: { ctrlKey: true } },
  { label: "Alt-Delete", key: "Delete", modifiers: { altKey: true } },
  { label: "Alt-d", key: "d", modifiers: { altKey: true } },
  {
    label: "Ctrl-Alt-Backspace",
    key: "Backspace",
    modifiers: { ctrlKey: true, altKey: true },
  },
];

/**
 * navigator.platform을 스텁한다. Tiptap isMacOS()가 addKeyboardShortcuts
 * 시점에 읽으므로 에디터를 마운트하기 전에 호출한다. 해제는 afterEach가
 * 보장한다(G-TST-003).
 */
const platformSpies: Array<{ mockRestore: () => void }> = [];
const stubPlatform = (platform: string): void => {
  platformSpies.push(
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform),
  );
};
afterEach(() => {
  for (const spy of platformSpies.splice(0)) spy.mockRestore();
});

/**
 * 접힌 toggle c1(숨은 자식 c1a) 바로 뒤 문단 n1, 앞 문단 a1 뒤 codeBlock k1,
 * 문단 a2 뒤 toggle 헤더 t2, 문단 a3 뒤 divider d3 뒤 문단 n3, 문단 e4 뒤
 * 접힌 toggle c4(숨은 자식 c4a)를 한 문서에 둔다. 케이스마다 새로 마운트한다.
 */
const fixture = () =>
  mounted(
    documentOf(
      toggleBlock("c1", "접힘1", {
        collapsed: true,
        children: [paragraphBlock("c1a", "숨은1")],
      }),
      paragraphBlock("n1", "뒤1"),
      paragraphBlock("a1", "앞1"),
      codeBlockBlock("k1", "코드"),
      paragraphBlock("a2", "앞2"),
      toggleBlock("t2", "헤더2", {
        children: [paragraphBlock("t2a", "자식2")],
      }),
      paragraphBlock("a3", "앞3"),
      dividerBlock("d3"),
      paragraphBlock("n3", "뒤3"),
      paragraphBlock("e4", "끝4"),
      toggleBlock("c4", "접힘4", {
        collapsed: true,
        children: [paragraphBlock("c4a", "숨은4")],
      }),
    ),
  );

type Mounted = ReturnType<typeof fixture>;

/** 캐럿·선택을 두는 위치. 블록 텍스트의 선두·끝·중간(1글자 뒤)·1글자 범위. */
interface Place {
  readonly blockId: string;
  readonly at: "start" | "end" | "middle" | "range";
}

/** blockId 블록 콘텐츠 노드의 텍스트 길이. */
const textSizeOf = (tiptap: Mounted["tiptap"], blockId: string): number => {
  let size = 0;
  tiptap.state.doc.descendants((node) => {
    if (node.type.name === "blockContainer" && node.attrs.blockId === blockId) {
      size = node.firstChild?.content.size ?? 0;
      return false;
    }
    return true;
  });
  return size;
};

const placeSelection = (tiptap: Mounted["tiptap"], place: Place): void => {
  const start = contentTextStart(tiptap, place.blockId);
  if (place.at === "start") {
    tiptap.commands.setTextSelection(start);
  } else if (place.at === "end") {
    tiptap.commands.setTextSelection(start + textSizeOf(tiptap, place.blockId));
  } else if (place.at === "middle") {
    tiptap.commands.setTextSelection(start + 1);
  } else {
    tiptap.commands.setTextSelection({ from: start, to: start + 1 });
  }
};

/** 새 fixture에서 한 키를 누르고 소비·상태·dispatch 횟수를 돌려준다. */
const press = (
  place: Place,
  key: string,
  modifiers: Modifiers,
  options: { useDispatchKeydown?: boolean } = {},
) => {
  const { editor, tiptap } = fixture();
  placeSelection(tiptap, place);
  const before = editorState(editor, tiptap);
  const dispatch = vi.spyOn(tiptap.view, "dispatch");
  const handled =
    options.useDispatchKeydown === true
      ? dispatchKeydown(tiptap, key)
      : dispatchModifiedKeydown(tiptap, key, modifiers);
  return {
    before,
    handled,
    state: editorState(editor, tiptap),
    dispatchCount: dispatch.mock.calls.length,
  };
};

/** 기준 키(수식 없는 Backspace 또는 Delete). */
const pressBase = (place: Place, direction: Direction) =>
  press(place, direction === "backward" ? "Backspace" : "Delete", undefined, {
    useDispatchKeydown: true,
  });

/**
 * 대상 키 결과가 같은 fixture의 기준 키 결과와 소비 여부·editorState·dispatch
 * 횟수까지 같음을 단언하고 대상 키 결과를 돌려준다. 호출부가 결과가 실제
 * 병합인지 덧붙여 확인해 동등 검증이 공허해지는 것을 막는다.
 */
const expectSameAsBase = (
  place: Place,
  direction: Direction,
  keyCase: KeyCase,
) => {
  const base = pressBase(place, direction);
  const actual = press(place, keyCase.key, keyCase.modifiers);
  expect(actual.handled).toBe(base.handled);
  expect(actual.state).toEqual(base.state);
  expect(actual.dispatchCount).toBe(base.dispatchCount);
  return actual;
};

const topIds = (result: { state: { document: Document } }): string[] =>
  result.state.document.blocks.map((block) => block.id);

describe("접힌 toggle 뒤 문단 선두 Shift-Backspace·Mod-Backspace는 Backspace와 같다(#276)", () => {
  it.each([SHIFT_BACKSPACE, MOD_BACKSPACE])(
    "$label: 라벨 끝에 병합하고 숨은 자손은 그대로 둔다",
    (keyCase) => {
      const result = expectSameAsBase(
        { blockId: "n1", at: "start" },
        "backward",
        keyCase,
      );

      expect(result.handled).toBe(true);
      expect(result.dispatchCount).toBe(1);
      const toggle = result.state.document.blocks[0];
      expect(JSON.stringify(toggle)).toContain("접힘1뒤1");
      expect(JSON.stringify(toggle)).toContain("숨은1");
      expect(topIds(result)).not.toContain("n1");
    },
  );
});

describe("codeBlock 선두 Shift-Backspace·Mod-Backspace는 Backspace와 같다(#276)", () => {
  it.each([SHIFT_BACKSPACE, MOD_BACKSPACE])(
    "$label: 문서를 바꾸지 않고 키를 소비한다",
    (keyCase) => {
      const result = expectSameAsBase(
        { blockId: "k1", at: "start" },
        "backward",
        keyCase,
      );

      expect(result.handled).toBe(true);
      expect(result.dispatchCount).toBe(0);
      expect(result.state.document).toEqual(result.before.document);
    },
  );
});

describe("toggle 헤더 선두 Shift-Backspace·Mod-Backspace는 Backspace와 같다(#276)", () => {
  it.each([SHIFT_BACKSPACE, MOD_BACKSPACE])(
    "$label: 앞 블록의 자식으로 중첩하지 않고 헤더를 문단으로 바꾼다",
    (keyCase) => {
      const result = expectSameAsBase(
        { blockId: "t2", at: "start" },
        "backward",
        keyCase,
      );

      expect(result.handled).toBe(true);
      expect(result.dispatchCount).toBe(1);
      // a2는 자식이 없고 t2는 최상위에 남는다.
      expect(topIds(result)).toContain("t2");
      const a2 = result.state.document.blocks.find((b) => b.id === "a2");
      expect(JSON.stringify(a2)).not.toContain("children");
    },
  );
});

describe("divider 뒤 문단 선두 Shift-Backspace·Mod-Backspace는 Backspace와 같다(#276)", () => {
  it.each([SHIFT_BACKSPACE, MOD_BACKSPACE])(
    "$label: divider를 선택하지 않고 앞 문단과 병합한다",
    (keyCase) => {
      const result = expectSameAsBase(
        { blockId: "n3", at: "start" },
        "backward",
        keyCase,
      );

      expect(result.handled).toBe(true);
      expect(result.dispatchCount).toBe(1);
      expect(result.state.selection).toMatchObject({ type: "text" });
      expect(topIds(result)).toContain("d3");
      expect(topIds(result)).not.toContain("n3");
    },
  );
});

describe("문단 끝 Mod-Delete는 Delete와 같다(#276)", () => {
  it("뒤 접힌 toggle을 자식으로 중첩하지 않고 라벨을 문단 끝에 병합한다", () => {
    const result = expectSameAsBase(
      { blockId: "e4", at: "end" },
      "forward",
      MOD_DELETE,
    );

    expect(result.handled).toBe(true);
    expect(result.dispatchCount).toBe(1);
    const e4 = result.state.document.blocks.find((b) => b.id === "e4");
    expect(JSON.stringify(e4)).toContain("끝4접힘4");
    expect(topIds(result)).not.toContain("c4");
  });
});

describe("블록 경계가 아니면 수식 키 삭제를 소비하지 않는다(#276)", () => {
  it.each([SHIFT_BACKSPACE, MOD_BACKSPACE, MOD_DELETE])(
    "블록 중간 캐럿의 $label: 키를 소비하지 않고 문서를 바꾸지 않는다",
    (keyCase) => {
      const result = press(
        { blockId: "n1", at: "middle" },
        keyCase.key,
        keyCase.modifiers,
      );

      expect(result.handled).toBe(false);
      expect(result.state.document).toEqual(result.before.document);
    },
  );

  it.each([
    { keyCase: SHIFT_BACKSPACE, direction: "backward" as const },
    { keyCase: MOD_BACKSPACE, direction: "backward" as const },
    { keyCase: MOD_DELETE, direction: "forward" as const },
  ])(
    "범위 선택의 $keyCase.label: 기준 키와 같은 결과다",
    ({ keyCase, direction }) => {
      // 범위 삭제는 BlockJoin이 아니라 기본 keymap 몫이다. 기준 키와 같아야 한다.
      const result = expectSameAsBase(
        { blockId: "n1", at: "range" },
        direction,
        keyCase,
      );

      expect(result.state.document).not.toEqual(result.before.document);
    },
  );
});

describe("Mac·iOS 전용 키는 Backspace·Delete와 같은 BlockJoin 경로를 탄다(#276)", () => {
  it.each(MAC_BACKWARD)(
    "Mac에서 $label: 접힌 toggle 뒤 문단 선두에서 Backspace와 같다",
    (keyCase) => {
      stubPlatform("MacIntel");

      const result = expectSameAsBase(
        { blockId: "n1", at: "start" },
        "backward",
        keyCase,
      );

      expect(result.handled).toBe(true);
      expect(result.dispatchCount).toBe(1);
      expect(JSON.stringify(result.state.document.blocks[0])).toContain(
        "접힘1뒤1",
      );
    },
  );

  it.each(MAC_FORWARD)(
    "Mac에서 $label: 문단 끝에서 Delete와 같다",
    (keyCase) => {
      stubPlatform("MacIntel");

      const result = expectSameAsBase(
        { blockId: "e4", at: "end" },
        "forward",
        keyCase,
      );

      expect(result.handled).toBe(true);
      expect(result.dispatchCount).toBe(1);
      expect(topIds(result)).not.toContain("c4");
    },
  );
});

describe("비Mac에서는 Mac 전용 키를 BlockJoin이 소비하지 않는다(#276)", () => {
  it.each([
    ...MAC_BACKWARD.map((keyCase) => ({
      keyCase,
      place: { blockId: "n1", at: "start" } as const satisfies Place,
    })),
    ...MAC_FORWARD.map((keyCase) => ({
      keyCase,
      place: { blockId: "e4", at: "end" } as const satisfies Place,
    })),
  ])(
    "$keyCase.label: 키를 소비하지 않고 문서를 바꾸지 않는다",
    ({ keyCase, place }) => {
      stubPlatform("Win32");

      const result = press(place, keyCase.key, keyCase.modifiers);

      expect(result.handled).toBe(false);
      expect(result.dispatchCount).toBe(0);
      expect(result.state.document).toEqual(result.before.document);
    },
  );
});

/**
 * 문단 target의 marker 뒤에 공백을 입력해 input rule 변환을 만든 직후의 상태에서
 * 키를 누르고 결과 문서를 돌려준다. target 뒤에 tail을 둬 trailing 문단 보정과
 * 섞이지 않게 한다.
 */
const pressAfterInputRule = (
  marker: string,
  key: string,
  modifiers: Modifiers,
  options: { useDispatchKeydown?: boolean } = {},
) => {
  const { editor, tiptap } = mounted(
    documentOf(
      paragraphBlock("a", "앞"),
      paragraphBlock("target", marker),
      paragraphBlock("tail", "꼬리"),
    ),
  );
  tiptap.commands.setTextSelection(
    contentTextStart(tiptap, "target") + marker.length,
  );
  expect(dispatchTextInput(tiptap, " ")).toBe(true);
  const handled =
    options.useDispatchKeydown === true
      ? dispatchKeydown(tiptap, key)
      : dispatchModifiedKeydown(tiptap, key, modifiers);
  return { handled, blocks: editor.getDocument().blocks };
};

describe("input rule 변환 직후 수식 Backspace는 Backspace와 같이 marker를 복원한다(#276)", () => {
  const MARKERS = ["#", ">", "-", "1."] as const;

  describe.each(MARKERS)("marker %s", (marker) => {
    it.each([SHIFT_BACKSPACE, MOD_BACKSPACE])(
      "$label: 변환을 되돌리고 블록을 지우지 않는다",
      (keyCase) => {
        const base = pressAfterInputRule(marker, "Backspace", undefined, {
          useDispatchKeydown: true,
        });
        const actual = pressAfterInputRule(
          marker,
          keyCase.key,
          keyCase.modifiers,
        );

        expect(actual.handled).toBe(base.handled);
        expect(actual.blocks).toEqual(base.blocks);
        // 복원된 문단이 target id를 유지하고 marker 글자를 되돌려 가진다.
        const restored = actual.blocks.find((block) => block.id === "target");
        expect(restored?.type).toBe("paragraph");
        expect(JSON.stringify(restored)).toContain(marker);
      },
    );

    it.each(MAC_BACKWARD)("Mac $label: 변환을 되돌린다", (keyCase) => {
      stubPlatform("MacIntel");
      const base = pressAfterInputRule(marker, "Backspace", undefined, {
        useDispatchKeydown: true,
      });
      const actual = pressAfterInputRule(
        marker,
        keyCase.key,
        keyCase.modifiers,
      );

      expect(actual.handled).toBe(base.handled);
      expect(actual.blocks).toEqual(base.blocks);
    });
  });
});

/** 빈 codeBlock k를 앞 문단 a와 뒤 문단 b 사이에 두고 캐럿을 k에 둔다. */
const pressInEmptyCodeBlock = (
  key: string,
  modifiers: Modifiers,
  options: { useDispatchKeydown?: boolean } = {},
) => {
  const { editor, tiptap } = mounted(
    documentOf(
      paragraphBlock("a", "앞"),
      codeBlockBlock("k", ""),
      paragraphBlock("b", "뒤"),
    ),
  );
  tiptap.commands.setTextSelection(contentTextStart(tiptap, "k"));
  const handled =
    options.useDispatchKeydown === true
      ? dispatchKeydown(tiptap, key)
      : dispatchModifiedKeydown(tiptap, key, modifiers);
  return { handled, blocks: editor.getDocument().blocks };
};

describe("빈 codeBlock의 수식 Delete는 Delete와 같이 블록을 삭제한다(#276)", () => {
  it("Mod-Delete: 빈 codeBlock을 삭제하고 뒤 문단을 흡수하지 않는다", () => {
    const base = pressInEmptyCodeBlock("Delete", undefined, {
      useDispatchKeydown: true,
    });
    const actual = pressInEmptyCodeBlock(MOD_DELETE.key, MOD_DELETE.modifiers);

    expect(actual.handled).toBe(base.handled);
    expect(actual.blocks).toEqual(base.blocks);
    expect(actual.blocks.map((block) => block.id)).not.toContain("k");
  });

  it.each(MAC_FORWARD)("Mac $label: 빈 codeBlock을 삭제한다", (keyCase) => {
    stubPlatform("MacIntel");
    const base = pressInEmptyCodeBlock("Delete", undefined, {
      useDispatchKeydown: true,
    });
    const actual = pressInEmptyCodeBlock(keyCase.key, keyCase.modifiers);

    expect(actual.handled).toBe(base.handled);
    expect(actual.blocks).toEqual(base.blocks);
  });
});
