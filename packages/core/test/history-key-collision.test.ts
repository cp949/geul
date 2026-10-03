/**
 * 같은 이름의 `PluginKey("history")`가 `prosemirror-history`보다 먼저 만들어져
 * history 플러그인의 키가 `"history$1"`이 되어도 undo·redo가 각각
 * `DocumentChangeEvent.reason`을 `"undo"`·`"redo"`로 보고하는지 검증한다.
 *
 * `PluginKey`의 키 문자열은 모듈 로드 순서가 정한다. 선점은
 * `prosemirror-history`를 import하기 전에 해야 하므로 이 파일만 core 모듈을
 * 동적으로 불러온다. 정상 키(`"history$"`) 환경은
 * history-change-reason.test.ts의 진입점 표가 소유한다.
 */
import { PluginKey } from "@tiptap/pm/state";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { EditorController } from "../src/index.js";

const BLOCK_ID = "collision-block";
const BASE_TEXT = "abc";
const TYPED_TEXT = "X";

type Core = typeof import("../src/index.js");
type BlockSupport = typeof import("./block-test-support.js");
type ControllerSupport = typeof import("./editor-controller-support.js");

let core: Core;
let blockSupport: BlockSupport;
let controllerSupport: ControllerSupport;
const cleanups: Array<() => void> = [];

/** `PluginKey`의 키 문자열. 타입 선언에는 없지만 런타임에 존재한다. */
const keyNameOf = (key: PluginKey | undefined): string | undefined =>
  (key as { key?: string } | undefined)?.key;

beforeAll(async () => {
  const squatter = new PluginKey("history");
  // 선점이 실제로 history 플러그인의 키를 바꾸는지 먼저 확인한다.
  expect(keyNameOf(squatter)).toBe("history$");
  core = await import("../src/index.js");
  blockSupport = await import("./block-test-support.js");
  controllerSupport = await import("./editor-controller-support.js");
  const { history } = await import("@tiptap/pm/history");
  expect(keyNameOf(history().spec.key)).toBe("history$1");
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

type Recorded = { change: string[]; beforeChange: string[] };

/** 한 글자를 입력해 undo 스택을 만든 마운트 편집기를 돌려준다. */
const mountTypedEditor = () => {
  const recorded: Recorded = { change: [], beforeChange: [] };
  const editor: EditorController = core.createEditor({
    initialDocument: controllerSupport.documentOf(
      controllerSupport.paragraphBlock(BLOCK_ID, BASE_TEXT),
    ),
    createId: controllerSupport.sequentialIds("id"),
    onChange: (event) => recorded.change.push(event.reason),
    onBeforeChange: ({ changes }) => {
      recorded.beforeChange.push(changes.reason);
    },
  });
  cleanups.push(() => editor.destroy());
  const mount = controllerSupport.mountTiptapEditor(editor);
  mount.tiptap.commands.setTextSelection(
    blockSupport.contentTextStart(mount.tiptap, BLOCK_ID) + BASE_TEXT.length,
  );
  blockSupport.typeNativeText(mount.tiptap, TYPED_TEXT);
  expect(mount.tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
  recorded.change.length = 0;
  recorded.beforeChange.length = 0;
  return { editor, tiptap: mount.tiptap, recorded };
};

describe('history 키가 "history$1"일 때 DocumentChangeEvent.reason', () => {
  it("키보드·폴백 경로의 redo는 redo로 보고한다", () => {
    const { editor, tiptap, recorded } = mountTypedEditor();
    expect(editor.commands.undo().ok).toBe(true);
    recorded.change.length = 0;
    recorded.beforeChange.length = 0;

    // runDocumentCommand를 거치지 않는 직접 dispatch 경로다.
    expect(tiptap.commands.redo()).toBe(true);

    expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
    expect(recorded.beforeChange).toEqual(["redo"]);
    expect(recorded.change).toEqual(["redo"]);
  });

  it("키보드·폴백 경로의 undo는 undo로 보고한다", () => {
    const { tiptap, recorded } = mountTypedEditor();

    expect(tiptap.commands.undo()).toBe(true);

    expect(tiptap.state.doc.textContent).toBe(BASE_TEXT);
    expect(recorded.beforeChange).toEqual(["undo"]);
    expect(recorded.change).toEqual(["undo"]);
  });

  it("history가 아닌 입력은 local로 보고한다", () => {
    const { tiptap, recorded } = mountTypedEditor();

    blockSupport.typeNativeText(tiptap, "Z");

    expect(recorded.beforeChange).toEqual(["local"]);
    expect(recorded.change).toEqual(["local"]);
  });
});
