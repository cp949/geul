/**
 * EditorController.subscribe 계약 테스트(Issue #218, UI-017 spec §2).
 * 발화(문서·selection·stored mark·replaceDocument), 미발화(해제·destroy·
 * 거절·no-op), 호출 시점, listener 집합 의미, 부작용 없음을 고정한다.
 *
 * 거절·no-op 케이스는 문서·revision·onChange·편집기 상태가 그대로임도
 * 함께 단언한다(G-EDT-001). createProductionEditor 수준의 정규화 구간과
 * appendTransaction 되돌림은 editor-controller-subscription-assembly.test.ts가
 * 소유한다. mount()된 editor의 정리는 mountTiptapEditor가 등록하는 module
 * scope afterEach에 위임한다(G-TST-003).
 *
 * Issue #262: listener 안 getBlockTypeBlocker가 자식 유무를 낡은 모델이
 * 아니라 통지 시점 편집기 상태로 판정함을 네 경로로 고정한다. Enter로
 * 만든 새 블록처럼 모델에 아직 없는 블록도 같은 상태로 판정한다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import {
  createEditor,
  type DocumentChangeEvent,
  type EditorController,
} from "../src/index.js";
import { dispatchKeydown } from "./block-test-support.js";
import {
  documentOf,
  editorState,
  mountTiptapEditor,
  paragraphBlock,
  setBoldStoredMark,
} from "./editor-controller-support.js";

/**
 * 마지막 블록이 문단이라 로드 시 정규화가 일어나지 않는 3블록 문서.
 * block-2가 heading이라 selection 이동으로 블록 타입 변화를 볼 수 있다.
 */
function threeBlockDocument(): Document {
  return documentOf(
    paragraphBlock("block-1", "hello"),
    { id: "block-2", type: "heading", level: 1, content: [{ text: "title" }] },
    paragraphBlock("block-3", "tail"),
  );
}

/**
 * 문단 a 밑에 자식 문단 c를 둔 문서. 마지막 블록이 문단이라 로드 시
 * 정규화가 일어나지 않는다.
 */
function parentChildDocument(): Document {
  return documentOf(
    paragraphBlock("a", "parent", [paragraphBlock("c", "child")]),
    paragraphBlock("tail", "tail"),
  );
}

/**
 * a와 c가 형제 문단인 문서. c를 들여쓰면 a의 자식이 된다.
 */
function siblingDocument(): Document {
  return documentOf(
    paragraphBlock("a", "parent"),
    paragraphBlock("c", "child"),
    paragraphBlock("tail", "tail"),
  );
}

/**
 * 문서를 마운트하고, listener 안에서 a의 Code 변환 사유를 조회해 쌓는다.
 * 명령 뒤 같은 조회와 비교하도록 조회 함수도 함께 돌려준다.
 */
function mountedWithCodeBlockerLog(document: Document) {
  const editor = createEditor({ initialDocument: document });
  const mountedParts = mountTiptapEditor(editor);
  const queryCodeBlocker = () =>
    editor.getBlockTypeBlocker("a", { type: "codeBlock" });
  const seen: Array<ReturnType<typeof queryCodeBlocker>> = [];
  editor.subscribe(() => {
    seen.push(queryCodeBlocker());
  });
  return { editor, seen, queryCodeBlocker, ...mountedParts };
}

/**
 * onChange 이벤트를 모으며 마운트한 편집기와 호출 횟수를 세는 listener를
 * 만든다. subscribe는 호출자가 직접 한다(등록 방식을 케이스가 고르게 한다).
 */
function mountedWithChanges(options?: {
  onBeforeChange?: () => boolean | void;
}) {
  const changes: DocumentChangeEvent[] = [];
  const editor = createEditor({
    initialDocument: threeBlockDocument(),
    onChange: (event) => changes.push(event),
    ...(options?.onBeforeChange === undefined
      ? {}
      : { onBeforeChange: options.onBeforeChange }),
  });
  const mountedParts = mountTiptapEditor(editor);
  const counter = { count: 0 };
  const listener = () => {
    counter.count += 1;
  };
  return { editor, changes, counter, listener, ...mountedParts };
}

describe("에디터 컨트롤러 subscribe 발화", () => {
  it("문서 변경 명령이 성공하면 listener를 1회 호출하고 onChange도 1회만 발생한다", () => {
    const { editor, changes, counter, listener } = mountedWithChanges();
    editor.subscribe(listener);

    expect(editor.commands.setText("block-1", "changed")).toEqual({
      ok: true,
      value: undefined,
    });

    expect(counter.count).toBe(1);
    expect(changes).toHaveLength(1);
    expect(editor.getDocument().revision).toBe(1);
  });

  it("listener를 등록해도 문서 변경은 undo 1회로 복원된다", () => {
    const { editor, changes, counter, listener } = mountedWithChanges();
    const original = editor.getDocument().blocks;
    editor.subscribe(listener);
    editor.commands.setText("block-1", "changed");

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });

    expect(editor.getDocument().blocks).toEqual(original);
    expect(changes.map((change) => change.reason)).toEqual(["local", "undo"]);
    expect(counter.count).toBe(2);
  });

  it("selection만 바뀌면 listener를 호출하고 문서·revision·onChange는 바꾸지 않는다", () => {
    const { editor, changes, counter, listener, tiptap } = mountedWithChanges();
    editor.subscribe(listener);
    const before = editorState(editor, tiptap);

    expect(editor.setTextCursorPosition("block-2", "end")).toEqual({
      ok: true,
      value: undefined,
    });

    expect(counter.count).toBe(1);
    expect(editorState(editor, tiptap).document).toEqual(before.document);
    expect(editorState(editor, tiptap).tiptapDocument).toEqual(
      before.tiptapDocument,
    );
    expect(changes).toEqual([]);
  });

  it("stored mark만 바뀌어도 listener를 호출하고 문서는 바꾸지 않는다", () => {
    const { editor, changes, counter, listener, tiptap } = mountedWithChanges();
    editor.subscribe(listener);
    const before = editorState(editor, tiptap);

    setBoldStoredMark(tiptap);

    expect(counter.count).toBe(1);
    expect(editorState(editor, tiptap).document).toEqual(before.document);
    expect(editorState(editor, tiptap).selection).toEqual(before.selection);
    expect(changes).toEqual([]);
  });

  it("마운트되지 않은 상태의 replaceDocument 성공은 listener를 정확히 1회 호출한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: threeBlockDocument(),
      onChange: (event) => changes.push(event),
    });
    const counter = { count: 0 };
    editor.subscribe(() => {
      counter.count += 1;
    });

    expect(
      editor.replaceDocument(
        documentOf(paragraphBlock("replaced-1", "replaced")),
      ),
    ).toEqual({ ok: true, value: undefined });

    expect(counter.count).toBe(1);
    expect(changes.map((change) => change.reason)).toEqual(["replace"]);
  });

  it("마운트된 상태의 replaceDocument는 1회 이상 호출하고 교체 뒤 편집 통지도 이어진다", () => {
    const { editor, counter, listener } = mountedWithChanges();
    editor.subscribe(listener);

    expect(
      editor.replaceDocument(
        documentOf(
          paragraphBlock("replaced-1", "replaced"),
          paragraphBlock("replaced-2", "tail"),
        ),
      ),
    ).toEqual({ ok: true, value: undefined });
    expect(counter.count).toBeGreaterThanOrEqual(1);
    const afterReplace = counter.count;

    expect(editor.setTextCursorPosition("replaced-2", "end")).toEqual({
      ok: true,
      value: undefined,
    });

    expect(counter.count).toBe(afterReplace + 1);
  });
});

describe("에디터 컨트롤러 subscribe 미발화", () => {
  it("해제 함수를 호출한 뒤에는 listener를 호출하지 않는다", () => {
    const { editor, counter, listener } = mountedWithChanges();
    const unsubscribe = editor.subscribe(listener);
    editor.setTextCursorPosition("block-2", "end");
    expect(counter.count).toBe(1);

    unsubscribe();
    editor.setTextCursorPosition("block-3", "end");

    expect(counter.count).toBe(1);
  });

  it("destroy() 뒤에는 listener를 호출하지 않고 파괴 뒤 subscribe는 등록하지 않는다", () => {
    const { editor, changes, counter, listener } = mountedWithChanges();
    editor.subscribe(listener);
    editor.destroy();
    const lateCounter = { count: 0 };

    const lateUnsubscribe = editor.subscribe(() => {
      lateCounter.count += 1;
    });
    const rejected = editor.replaceDocument(
      documentOf(paragraphBlock("replaced-1", "replaced")),
    );

    expect(rejected.ok).toBe(false);
    expect(editor.setTextCursorPosition("block-2", "end").ok).toBe(false);
    expect(counter.count).toBe(0);
    expect(lateCounter.count).toBe(0);
    expect(changes).toEqual([]);
    expect(() => lateUnsubscribe()).not.toThrow();
  });

  it("onBeforeChange가 거절한 변경은 listener를 호출하지 않고 상태를 바꾸지 않는다", () => {
    let beforeChangeCalls = 0;
    const { editor, changes, counter, listener, tiptap } = mountedWithChanges({
      onBeforeChange: () => {
        beforeChangeCalls += 1;
        return false;
      },
    });
    editor.subscribe(listener);
    const before = editorState(editor, tiptap);

    const result = editor.commands.setText("block-1", "changed");

    expect(result.ok).toBe(false);
    expect(beforeChangeCalls).toBe(1);
    expect(counter.count).toBe(0);
    expect(changes).toEqual([]);
    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("onBeforeChange가 등록돼 있어도 selection만 바꾸는 정상 transaction은 호출한다", () => {
    const { editor, changes, counter, listener } = mountedWithChanges({
      onBeforeChange: () => false,
    });
    editor.subscribe(listener);

    expect(editor.setTextCursorPosition("block-2", "end")).toEqual({
      ok: true,
      value: undefined,
    });

    expect(counter.count).toBe(1);
    expect(changes).toEqual([]);
  });

  it("같은 위치로 selection을 다시 설정하면 listener를 호출하지 않는다", () => {
    const { editor, changes, counter, listener, tiptap } = mountedWithChanges();
    editor.setTextCursorPosition("block-2", "end");
    editor.subscribe(listener);
    const before = editorState(editor, tiptap);

    expect(editor.setTextCursorPosition("block-2", "end")).toEqual({
      ok: true,
      value: undefined,
    });

    expect(counter.count).toBe(0);
    expect(changes).toEqual([]);
    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("접힌 캐럿에서 COMMAND_NOT_APPLICABLE로 끝나는 명령은 listener를 호출하지 않는다", () => {
    const { editor, changes, counter, listener, tiptap } = mountedWithChanges();
    editor.subscribe(listener);
    const before = editorState(editor, tiptap);

    expect(editor.commands.toggleBold()).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "toggleBold" },
    });

    expect(counter.count).toBe(0);
    expect(changes).toEqual([]);
    expect(editorState(editor, tiptap)).toEqual(before);
  });
});

describe("에디터 컨트롤러 subscribe 호출 시점", () => {
  it("listener 호출 시점에 getSelectionBlockType이 새 selection의 블록을 반환한다", () => {
    const { editor } = mountedWithChanges();
    const seen: Array<string | undefined> = [];
    editor.subscribe(() => {
      seen.push(editor.getSelectionBlockType()?.blockType.type);
    });

    editor.setTextCursorPosition("block-2", "end");

    expect(seen).toEqual(["heading"]);
  });

  it("listener 호출 시점에 getSelectionMarks가 새 stored mark를 반환한다", () => {
    const { editor, tiptap } = mountedWithChanges();
    const seen: string[][] = [];
    editor.subscribe(() => {
      seen.push(editor.getSelectionMarks());
    });

    setBoldStoredMark(tiptap);

    expect(seen).toEqual([["bold"]]);
  });

  it("bold 텍스트 끝 캐럿에서 서식을 끄면 getSelectionMarks가 비어 있는 상태로 listener를 호출한다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        {
          id: "bold-1",
          type: "paragraph",
          content: [{ text: "hello", marks: [{ type: "bold" }] }],
        },
        paragraphBlock("tail-1", "tail"),
      ),
    });
    const { tiptap } = mountTiptapEditor(editor);
    editor.setTextCursorPosition("bold-1", "end");
    expect(editor.getSelectionMarks()).toEqual(["bold"]);
    const seen: string[][] = [];
    editor.subscribe(() => {
      seen.push(editor.getSelectionMarks());
    });

    tiptap.commands.toggleBold();

    expect(seen).toEqual([[]]);
  });
});

describe("listener 안 getBlockTypeBlocker는 명령 완료 뒤 조회와 같다", () => {
  it("자식 시작 Backspace로 부모에 병합하면 listener 안 마지막 조회가 null이다", () => {
    const { editor, seen, queryCodeBlocker, tiptap } =
      mountedWithCodeBlockerLog(parentChildDocument());
    expect(editor.setTextCursorPosition("c", "start").ok).toBe(true);
    seen.length = 0;

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("a", "parentchild"),
      paragraphBlock("tail", "tail"),
    ]);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toBeNull();
    expect(queryCodeBlocker()).toBeNull();
  });

  it("removeBlocks로 자식을 지우면 listener 안 마지막 조회가 null이다", () => {
    const { editor, seen, queryCodeBlocker } = mountedWithCodeBlockerLog(
      parentChildDocument(),
    );

    expect(editor.removeBlocks(["c"]).ok).toBe(true);

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toBeNull();
    expect(queryCodeBlocker()).toBeNull();
  });

  it("outdentBlock으로 자식을 내어쓰면 listener 안 마지막 조회가 null이다", () => {
    const { editor, seen, queryCodeBlocker } = mountedWithCodeBlockerLog(
      parentChildDocument(),
    );

    expect(editor.commands.outdentBlock("c")).toEqual({
      ok: true,
      value: undefined,
    });

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toBeNull();
    expect(queryCodeBlocker()).toBeNull();
  });

  it("indentBlock으로 형제를 자식으로 만들면 listener 안 마지막 조회가 HAS_CHILDREN이다", () => {
    const { editor, seen, queryCodeBlocker } =
      mountedWithCodeBlockerLog(siblingDocument());

    expect(editor.commands.indentBlock("c")).toEqual({
      ok: true,
      value: undefined,
    });

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toBe("HAS_CHILDREN");
    expect(queryCodeBlocker()).toBe("HAS_CHILDREN");
  });

  it("Enter로 만든 새 블록의 listener 안 마지막 조회가 null이다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        paragraphBlock("a", "parent"),
        paragraphBlock("tail", "tail"),
      ),
    });
    const { tiptap } = mountTiptapEditor(editor);
    expect(editor.setTextCursorPosition("a", "end").ok).toBe(true);
    // 통지 시점에는 새 블록이 편집기에만 있고 저장 모델에는 아직 없다.
    const queryCaretCodeBlocker = () => {
      const caret = editor.getSelectionBlockType();
      return caret === null
        ? "no-caret"
        : editor.getBlockTypeBlocker(caret.blockId, { type: "codeBlock" });
    };
    const seen: Array<ReturnType<typeof queryCaretCodeBlocker>> = [];
    editor.subscribe(() => {
      seen.push(queryCaretCodeBlocker());
    });

    expect(dispatchKeydown(tiptap, "Enter")).toBe(true);

    expect(editor.getSelectionBlockType()?.blockId).not.toBe("a");
    expect(editor.getDocument().blocks).toHaveLength(3);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toBeNull();
    expect(queryCaretCodeBlocker()).toBeNull();
  });
});

describe("에디터 컨트롤러 subscribe listener 집합 의미", () => {
  it("같은 함수를 중복 등록해도 1개로 취급해 변경당 1회만 호출한다", () => {
    const { editor, counter, listener } = mountedWithChanges();
    editor.subscribe(listener);
    editor.subscribe(listener);

    editor.setTextCursorPosition("block-2", "end");

    expect(counter.count).toBe(1);
  });

  it("중복 등록의 두 번째 해제 함수도 같은 항목을 지운다", () => {
    const { editor, counter, listener } = mountedWithChanges();
    const first = editor.subscribe(listener);
    const second = editor.subscribe(listener);

    second();
    editor.setTextCursorPosition("block-2", "end");
    expect(() => first()).not.toThrow();

    expect(counter.count).toBe(0);
  });

  it("등록 순서대로 호출한다", () => {
    const { editor } = mountedWithChanges();
    const order: string[] = [];
    editor.subscribe(() => order.push("a"));
    editor.subscribe(() => order.push("b"));
    editor.subscribe(() => order.push("c"));

    editor.setTextCursorPosition("block-2", "end");

    expect(order).toEqual(["a", "b", "c"]);
  });

  it("listener 안에서 해제한 listener는 같은 라운드에서도 호출하지 않는다", () => {
    const { editor } = mountedWithChanges();
    const order: string[] = [];
    let unsubscribeB: () => void = () => {};
    editor.subscribe(() => {
      order.push("a");
      unsubscribeB();
    });
    unsubscribeB = editor.subscribe(() => order.push("b"));

    editor.setTextCursorPosition("block-2", "end");
    editor.setTextCursorPosition("block-3", "end");

    expect(order).toEqual(["a", "a"]);
  });

  it("listener가 자신을 해제하면 그 라운드는 호출되고 다음 변경부터는 호출되지 않는다", () => {
    const { editor } = mountedWithChanges();
    const order: string[] = [];
    const unsubscribeSelf = editor.subscribe(() => {
      order.push("self");
      unsubscribeSelf();
    });
    editor.subscribe(() => order.push("other"));

    editor.setTextCursorPosition("block-2", "end");
    editor.setTextCursorPosition("block-3", "end");

    expect(order).toEqual(["self", "other", "other"]);
  });

  it("listener 안에서 새로 등록한 listener는 다음 변경부터 호출한다", () => {
    const { editor } = mountedWithChanges();
    const order: string[] = [];
    const late = () => order.push("late");
    let registered = false;
    editor.subscribe(() => {
      order.push("a");
      if (!registered) {
        registered = true;
        editor.subscribe(late);
      }
    });

    editor.setTextCursorPosition("block-2", "end");
    expect(order).toEqual(["a"]);

    editor.setTextCursorPosition("block-3", "end");
    expect(order).toEqual(["a", "a", "late"]);
  });

  it("unmount() 뒤 다시 mount()해도 listener를 유지한다", () => {
    const { editor, counter, listener } = mountedWithChanges();
    editor.subscribe(listener);

    editor.unmount();
    mountTiptapEditor(editor);
    editor.setTextCursorPosition("block-2", "end");

    expect(counter.count).toBe(1);
  });

  it("listener 예외를 감싸지 않고 호출자에게 전파한다", () => {
    const { editor } = mountedWithChanges();
    editor.subscribe(() => {
      throw new Error("listener 실패");
    });

    expect(() => editor.setTextCursorPosition("block-2", "end")).toThrow(
      "listener 실패",
    );
  });
});

describe("에디터 컨트롤러 subscribe 부작용 없음", () => {
  it("subscribe와 해제 호출은 문서·revision·onChange·undo 스택을 바꾸지 않는다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor: EditorController = createEditor({
      initialDocument: threeBlockDocument(),
      onChange: (event) => changes.push(event),
    });
    const before = editor.getDocument();

    const unsubscribe = editor.subscribe(() => {});
    unsubscribe();

    expect(editor.getDocument()).toEqual(before);
    expect(changes).toEqual([]);
    expect(editor.commands.undo()).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "undo" },
    });
  });
});
