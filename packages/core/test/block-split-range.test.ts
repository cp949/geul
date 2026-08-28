/**
 * BlockSplitExtension의 범위 선택 Enter 계약을 확인한다(결함 1 수정 고정).
 * collapsed 캐럿 Enter의 D22/D23/D24 계약은 tiptap-to-model.test.ts의
 * "네이티브 split/join 유효성(D22)" 절이 소유하고, 이 파일은 범위 선택
 * 축만 다룬다 — 선택 삭제 후 그 캐럿 위치에서 collapsed 규칙으로 분할하고
 * (dev의 StarterKit splitBlock 의미론), 삭제와 분할이 단일 dispatch(undo
 * 1회 단위, G-EDT-001)여야 하며, 표 셀 안 범위에는 관여하지 않아야 한다.
 *
 * 키 소비(반환 true)는 view.someProp("handleKeyDown", ...) 실 디스패치로
 * 검증한다 — 이 커맨드는 addKeyboardShortcuts로만 등록돼 editor.commands로
 * 노출되지 않는다(G-WKS-001).
 */
import { type Document } from "@cp949/geul-model";
import { closeHistory } from "@tiptap/pm/history";
import { describe, expect, it, vi } from "vitest";

import { BlockSplitExtension } from "../src/block-split-extension.js";
import { createEditor } from "../src/index.js";
import { contentTextStart, dispatchKeydown } from "./block-test-support.js";
import {
  mountTiptapEditor,
  paragraphDocument,
  sequentialIds,
} from "./editor-controller-support.js";
import { cellJson, createTableFixtureEditor } from "./table-test-support.js";

/**
 * 최상위 문단 블록 두 개짜리 문서 — 두 블록을 가로지르는 범위 선택의
 * 출발점이다.
 */
const twoParagraphDocument = (): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    { id: "block-a", type: "paragraph", content: [{ text: "hello" }] },
    { id: "block-b", type: "paragraph", content: [{ text: "world" }] },
  ],
});

describe("범위 선택 Enter는 선택을 지운 캐럿 위치에서 분할한다", () => {
  it("한 블록 안 범위 선택 Enter는 키를 소비하고 [앞], [뒤] 두 블록으로 분할한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("ABCDEF"),
      createId: sequentialIds("id"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const schema = tiptap.schema;
    const textStart = contentTextStart(tiptap, "block-1");
    const beforeJson = tiptap.state.doc.toJSON();

    // "CD"를 선택한다: "AB|CD|EF".
    tiptap.commands.setTextSelection({
      from: textStart + 2,
      to: textStart + 4,
    });

    const handled = dispatchKeydown(tiptap, "Enter");

    // 키 소비 — false면 어떤 핸들러도 preventDefault하지 않아 실 브라우저
    // 에서 native contenteditable이 PM 몰래 DOM을 바꾼다(결함 1의 핵심).
    expect(handled).toBe(true);

    expect(() =>
      schema.nodeFromJSON(tiptap.state.doc.toJSON()).check(),
    ).not.toThrow();

    expect(tiptap.state.doc.childCount).toBe(2);
    const originalContainer = tiptap.state.doc.child(0);
    const newContainer = tiptap.state.doc.child(1);
    // 선택된 "CD"가 지워지고 앞/뒤가 각각 블록이 된다.
    expect(originalContainer.firstChild?.textContent).toBe("AB");
    expect(newContainer.firstChild?.textContent).toBe("EF");
    expect(originalContainer.attrs.blockId).toBe("block-1");
    // 새 블록은 BlockIdExtension이 같은 dispatch 안에서 새 id를 발급한다.
    expect(typeof newContainer.attrs.blockId).toBe("string");
    expect((newContainer.attrs.blockId as string).length).toBeGreaterThan(0);
    expect(newContainer.attrs.blockId).not.toBe("block-1");

    // 캐럿은 둘째 블록 텍스트 시작에 있다.
    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(newContainer.firstChild);
    expect(selection.$from.parentOffset).toBe(0);

    // 삭제+분할이 단일 dispatch(단일 undo 단위)다 — undo 1회로 선택 삭제
    // 전 문서가 통째로 복원된다(G-EDT-001).
    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });

  it("두 블록을 가로지르는 범위 선택 Enter는 경계 병합 후 분할해 [앞], [뒤] 두 블록을 남긴다", () => {
    const editor = createEditor({
      initialDocument: twoParagraphDocument(),
      createId: sequentialIds("id"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const schema = tiptap.schema;
    const beforeJson = tiptap.state.doc.toJSON();

    // block-a "he|llo" ~ block-b "w|orld"를 선택한다.
    tiptap.commands.setTextSelection({
      from: contentTextStart(tiptap, "block-a") + 2,
      to: contentTextStart(tiptap, "block-b") + 1,
    });

    const handled = dispatchKeydown(tiptap, "Enter");
    expect(handled).toBe(true);

    expect(() =>
      schema.nodeFromJSON(tiptap.state.doc.toJSON()).check(),
    ).not.toThrow();

    // 실측(PM deleteSelection): 두 컨테이너가 block-a의 id를 유지한 한
    // 컨테이너 "heorld"로 병합되고 캐럿이 "he|orld"에 남는다 — 이어지는
    // 분할이 ["he"], ["orld"] 두 블록을 만든다. 텍스트가 보존되고("he" +
    // "orld") 결과가 결정적이다.
    expect(tiptap.state.doc.childCount).toBe(2);
    const originalContainer = tiptap.state.doc.child(0);
    const newContainer = tiptap.state.doc.child(1);
    expect(originalContainer.firstChild?.textContent).toBe("he");
    expect(newContainer.firstChild?.textContent).toBe("orld");
    // 병합된 앞 블록은 block-a의 id를 유지하고, 뒤 블록은 병합으로 원본
    // block-b가 사라졌으므로 새 id를 받는다.
    expect(originalContainer.attrs.blockId).toBe("block-a");
    expect(typeof newContainer.attrs.blockId).toBe("string");
    expect((newContainer.attrs.blockId as string).length).toBeGreaterThan(0);
    expect(newContainer.attrs.blockId).not.toBe("block-a");
    expect(newContainer.attrs.blockId).not.toBe("block-b");

    // 캐럿은 뒤 블록 텍스트 시작에 있다.
    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(newContainer.firstChild);
    expect(selection.$from.parentOffset).toBe(0);

    // 병합·분할 전체가 undo 1회로 복원된다.
    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  });

  it("자식 딸린 블록 안 범위 선택 Enter는 새 블록을 원본의 첫 자식으로 넣고 기존 자식 귀속은 불변이다(D23)", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("ABCDEF"),
      createId: sequentialIds("id"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const schema = tiptap.schema;

    let rootEnd: number | null = null;
    tiptap.state.doc.descendants((node, pos) => {
      if (rootEnd !== null) return false;
      if (node.type.name === "blockContainer") {
        rootEnd = pos + node.nodeSize - 1;
        return false;
      }
      return true;
    });
    if (rootEnd === null) throw new Error("rootEnd 조회 실패");

    const childParagraph = schema.nodes.paragraph!.create(
      null,
      schema.text("Child"),
    );
    const childContainer = schema.nodes.blockContainer!.create(
      { blockId: "child-1" },
      childParagraph,
    );
    const blockGroup = schema.nodes.blockGroup!.create(null, childContainer);
    tiptap.view.dispatch(tiptap.state.tr.insert(rootEnd, blockGroup));
    const beforeSplitJson = tiptap.state.doc.toJSON();
    // setup 삽입과 split이 한 undo 그룹으로 병합되지 않게 history 경계를
    // 닫는다 — tiptap-to-model.test.ts D22 절과 같은 이유·같은 패턴.
    tiptap.view.dispatch(closeHistory(tiptap.state.tr));

    // 부모 텍스트의 "CD"를 선택한다: "AB|CD|EF".
    const textStart = contentTextStart(tiptap, "block-1");
    tiptap.commands.setTextSelection({
      from: textStart + 2,
      to: textStart + 4,
    });

    const handled = dispatchKeydown(tiptap, "Enter");
    expect(handled).toBe(true);

    expect(() =>
      schema.nodeFromJSON(tiptap.state.doc.toJSON()).check(),
    ).not.toThrow();

    const rootNode = tiptap.state.doc.child(0);
    expect(rootNode.type.name).toBe("blockContainer");
    expect(rootNode.attrs.blockId).toBe("block-1");
    expect(rootNode.firstChild?.textContent).toBe("AB");
    expect(rootNode.childCount).toBe(2);

    const group = rootNode.child(1);
    expect(group.type.name).toBe("blockGroup");
    expect(group.childCount).toBe(2);

    // 새 블록("EF")이 원본의 첫 자식이다(D23 — collapsed 경로와 같은 규칙).
    const newContainer = group.child(0);
    expect(newContainer.type.name).toBe("blockContainer");
    expect(newContainer.firstChild?.textContent).toBe("EF");
    expect(typeof newContainer.attrs.blockId).toBe("string");
    expect((newContainer.attrs.blockId as string).length).toBeGreaterThan(0);
    expect(newContainer.attrs.blockId).not.toBe("block-1");
    expect(newContainer.attrs.blockId).not.toBe("child-1");

    // 기존 자식 귀속 불변 — child-1은 내용·id 그대로 두 번째 자식이다.
    const existingChild = group.child(1);
    expect(existingChild.attrs.blockId).toBe("child-1");
    expect(existingChild.firstChild?.textContent).toBe("Child");

    // 캐럿은 새 블록 텍스트 시작에 있다.
    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(newContainer.firstChild);
    expect(selection.$from.parentOffset).toBe(0);

    // 삭제+분할이 undo 1회로 복원된다.
    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeSplitJson);
  });

  it("표 셀 안 범위 선택 Enter에 이 커맨드는 관여하지 않는다 — 삭제도 분할도 dispatch하지 않는다", () => {
    // 격리 fixture 에디터를 쓰는 이유: EditorController로 마운트하면 Tiptap
    // 코어 keymap의 splitBlock이 셀 자체를 분할해(기존 잠재 동작, 이 파일
    // 범위 밖) readEditorDocument가 throw한다. 여기서는 BlockSplitExtension
    // 자신이 dispatch하지 않는다는 계약만 격리해 고정한다.
    const editor = createTableFixtureEditor(
      {
        type: "doc",
        content: [
          {
            type: "table",
            attrs: {
              blockId: "table-1",
              columns: [{ id: "col-1", width: 160 }],
              headerRows: 0,
              headerColumns: 0,
            },
            content: [
              {
                type: "tableRow",
                attrs: { rowId: "row-1" },
                content: [
                  {
                    ...cellJson("cell-1", "col-1"),
                    content: [{ type: "text", text: "XY" }],
                  },
                ],
              },
            ],
          },
        ],
      },
      [BlockSplitExtension],
    );

    // 셀 텍스트 "X|Y"의 "X"를 범위 선택한다.
    let cellTextStart: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (cellTextStart !== null) return false;
      if (node.type.name === "tableCell") {
        cellTextStart = pos + 1;
        return false;
      }
      return true;
    });
    if (cellTextStart === null) throw new Error("tableCell 조회 실패");
    editor.commands.setTextSelection({
      from: cellTextStart,
      to: cellTextStart + 1,
    });

    const dispatchSpy = vi.spyOn(editor.view, "dispatch");
    dispatchKeydown(editor, "Enter");

    // BlockSplitExtension이 범위를 삭제한 뒤 분할에 실패해 삭제만 dispatch
    // 했다면(어중간한 dispatch) 코어 keymap 몫과 합쳐 2회가 된다 — 이
    // 확장 자신은 0회여야 한다. 남는 1회는 Tiptap 코어 keymap splitBlock의
    // 셀 분할(이 확장이 false를 반환한 뒤의 기존 동작)이다.
    expect(dispatchSpy.mock.calls.length).toBeLessThanOrEqual(1);
    dispatchSpy.mockRestore();

    // 이 확장의 분할이 실행됐다면 생겼을 blockContainer가 문서에 없다.
    let containerCount = 0;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "blockContainer") containerCount += 1;
      return true;
    });
    expect(containerCount).toBe(0);
  });
});
