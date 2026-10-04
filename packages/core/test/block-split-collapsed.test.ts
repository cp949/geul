/**
 * BlockSplitExtension과 네이티브 join의 collapsed 캐럿 계약을
 * 확인한다(D22/D23/D24) — 빈 자식 블록 선두 Backspace(join), 문단·
 * heading Enter split(끝 split은 빈 문단, 그 외는 원본 타입 복사)이
 * 스키마 유효 트리를 만드는지를 collapsed 캐럿 축에서만 다룬다. 범위
 * 선택 Enter 계약은 block-split-range.test.ts가 소유한다.
 *
 * 접힌 toggle 라벨 Enter(#252)는 파일 끝 describe가 소유한다 — 숨은 그룹이
 * 아니라 접힌 container 뒤 형제로 새 블록이 생긴다.
 *
 * 키 소비는 real DOM KeyboardEvent(pressEnter)로 시뮬레이션한다 — 이
 * 커맨드는 addKeyboardShortcuts로만 등록돼 editor.commands로 노출되지
 * 않는다(G-WKS-001). block-test-support.ts의 dispatchKeydown(synthetic
 * view.someProp 호출)과는 다른 경로이므로 통합하지 않는다.
 *
 * tiptap-to-model.test.ts에서 책임별로 분리했다.
 */
import { type Document } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as PmNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import { createEditor } from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  dividerBlock,
  documentOf,
  mounted,
  mountTiptapEditor,
  paragraphBlock,
  paragraphDocument,
  sequentialIds,
  toggleBlock,
} from "./editor-controller-support.js";

// Enter 키다운을 real DOM KeyboardEvent로 시뮬레이션한다 — 이 커맨드는
// BlockSplitExtension.addKeyboardShortcuts()로 등록돼 PM keymap
// 플러그인이 실제 keydown 이벤트로만 트리거된다(editor.commands.xxx로
// 노출하지 않는다 — 계획 "적용 계약과 가이드" G-WKS-001).
const pressEnter = (editable: HTMLElement) => {
  editable.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }),
  );
};

describe("네이티브 split/join 유효성(D22)", () => {
  it("빈 자식 블록 선두 Backspace(join) 결과는 스키마 유효 트리다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("root"),
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

    const emptyChildParagraph = schema.nodes.paragraph!.create();
    const childContainer = schema.nodes.blockContainer!.create(
      { blockId: "child-1" },
      emptyChildParagraph,
    );
    if (rootEnd === null) throw new Error("rootEnd 조회 실패");
    const blockGroup = schema.nodes.blockGroup!.create(null, childContainer);
    tiptap.view.dispatch(tiptap.state.tr.insert(rootEnd, blockGroup));

    let caretPos: number | null = null;
    tiptap.state.doc.descendants((node, pos) => {
      if (caretPos !== null) return false;
      if (node.type.name === "paragraph" && node.textContent === "") {
        caretPos = pos + 1;
        return false;
      }
      return true;
    });
    if (caretPos === null) throw new Error("caretPos 조회 실패");
    tiptap.commands.setTextSelection(caretPos);

    // Backspace 키맵 체인(StarterKit 기본, keymap.ts handleBackspace의
    // 실사용 구간과 동형) — 커스텀 keymap을 추가하지 않는다(D21).
    const ok = tiptap.commands.first(({ commands }) => [
      () => commands.deleteSelection(),
      () => commands.joinBackward(),
      () => commands.selectNodeBackward(),
    ]);

    expect(ok).toBe(true);
    expect(() =>
      schema.nodeFromJSON(tiptap.state.doc.toJSON()).check(),
    ).not.toThrow();
  });

  it("자식이 없는 최상위 블록 콘텐츠 끝에서 Enter를 시뮬레이션하면 새 블록이 원본의 형제로 삽입된다(D24)", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("Parent"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    const schema = tiptap.schema;

    let rootContentStart: number | null = null;
    tiptap.state.doc.descendants((node, pos) => {
      if (rootContentStart !== null) return false;
      if (node.type.name === "paragraph") {
        rootContentStart = pos + 1;
        return false;
      }
      return true;
    });
    if (rootContentStart === null)
      throw new Error("rootContentStart 조회 실패");

    // "Parent" 텍스트 끝에 캐럿을 둔다.
    tiptap.commands.setTextSelection(rootContentStart + "Parent".length);

    pressEnter(editable);

    // (a) 스키마 유효 — 변이(depth 1 splitBlock으로 되돌림)라면 무동작이라
    // 아래 구조 assert가 실패한다.
    expect(() =>
      schema.nodeFromJSON(tiptap.state.doc.toJSON()).check(),
    ).not.toThrow();

    // D24: 자식이 전혀 없던 블록이므로 새 컨테이너는 첫 자식이 아니라
    // 문서 최상위의 다음 형제로 들어간다 — blockGroup은 만들어지지 않는다
    // (변이: 첫 자식으로 되돌리면 doc.childCount가 1로 남고 이 assert가
    // 실패한다).
    expect(tiptap.state.doc.childCount).toBe(2);

    const originalContainer = tiptap.state.doc.child(0);
    expect(originalContainer.type.name).toBe("blockContainer");
    expect(originalContainer.attrs.blockId).toBe("block-1"); // 원본 blockId 불변
    expect(originalContainer.childCount).toBe(1); // blockGroup 없음(자식 없음)
    expect(originalContainer.firstChild?.textContent).toBe("Parent"); // 끝에서 split — 원본 텍스트 불변

    const newContainer = tiptap.state.doc.child(1);
    expect(newContainer.type.name).toBe("blockContainer");
    expect(newContainer.firstChild?.textContent).toBe("");
    expect(typeof newContainer.attrs.blockId).toBe("string");
    expect((newContainer.attrs.blockId as string).length).toBeGreaterThan(0);
    expect(newContainer.attrs.blockId).not.toBe("block-1");
  });

  it("자식이 없는 최상위 블록 콘텐츠 중간에서 Enter를 시뮬레이션해도 형제로 삽입되고 분할된 텍스트 순서가 보존된다(D24)", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("HelloWorld"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    const schema = tiptap.schema;

    let rootContentStart: number | null = null;
    tiptap.state.doc.descendants((node, pos) => {
      if (rootContentStart !== null) return false;
      if (node.type.name === "paragraph") {
        rootContentStart = pos + 1;
        return false;
      }
      return true;
    });
    if (rootContentStart === null)
      throw new Error("rootContentStart 조회 실패");

    // "Hello" 와 "World" 사이에 캐럿을 둔다.
    tiptap.commands.setTextSelection(rootContentStart + "Hello".length);

    pressEnter(editable);

    expect(() =>
      schema.nodeFromJSON(tiptap.state.doc.toJSON()).check(),
    ).not.toThrow();

    expect(tiptap.state.doc.childCount).toBe(2);
    const originalContainer = tiptap.state.doc.child(0);
    const newContainer = tiptap.state.doc.child(1);
    // 변이: 앞/뒤 텍스트가 뒤바뀌거나 유실되면 이 두 assert가 실패한다.
    expect(originalContainer.firstChild?.textContent).toBe("Hello");
    expect(newContainer.firstChild?.textContent).toBe("World");
    expect(originalContainer.attrs.blockId).toBe("block-1");
    expect(newContainer.attrs.blockId).not.toBe("block-1");
  });

  it("자식 딸린 블록 콘텐츠 끝에서 Enter를 시뮬레이션하면 새 블록이 원본의 첫 자식으로 삽입되고 기존 자식 귀속은 불변이다(D22/D23)", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("Parent"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    const schema = tiptap.schema;

    let rootEnd: number | null = null;
    let rootContentStart: number | null = null;
    tiptap.state.doc.descendants((node, pos) => {
      if (rootEnd !== null) return false;
      if (node.type.name === "blockContainer") {
        // pos + 1은 컨테이너 진입(paragraph 노드 자신의 위치) — 텍스트
        // 안으로 들어가려면 paragraph의 여는 토큰도 지나야 한다(pos + 2).
        rootContentStart = pos + 2;
        rootEnd = pos + node.nodeSize - 1;
        return false;
      }
      return true;
    });

    const childParagraph = schema.nodes.paragraph!.create(
      null,
      schema.text("Child"),
    );
    const childContainer = schema.nodes.blockContainer!.create(
      { blockId: "child-1" },
      childParagraph,
    );
    if (rootEnd === null) throw new Error("rootEnd 조회 실패");
    if (rootContentStart === null) {
      throw new Error("rootContentStart 조회 실패");
    }
    const blockGroup = schema.nodes.blockGroup!.create(null, childContainer);
    tiptap.view.dispatch(tiptap.state.tr.insert(rootEnd, blockGroup));
    const beforeSplitJson = tiptap.state.doc.toJSON();
    // history 경계를 명시적으로 닫는다 — split 트랜잭션의 replaceWith
    // 범위가 이 setup 삽입 범위와 겹쳐 PM history의 isAdjacentTo 병합
    // 휴리스틱이 시간차와 무관하게 둘을 한 undo 그룹으로 합친다. 무동작
    // closeHistory 트랜잭션(steps 0)을 끼워 넣으면 history 상태의
    // prevTime이 0으로 리셋되고, 이어지는 split 트랜잭션은 그 리셋만으로
    // 무조건 새 그룹이 된다(prosemirror-history applyTransaction: 0-step
    // 트랜잭션도 closeHistoryKey 메타를 조기에 반영하고 반환한다).
    tiptap.view.dispatch(closeHistory(tiptap.state.tr));

    // "Parent" 텍스트 끝(부모 자신의 콘텐츠 끝, 자식 앞)에 캐럿을 둔다.
    tiptap.commands.setTextSelection(rootContentStart + "Parent".length);

    pressEnter(editable);

    // (a) 스키마 유효
    expect(() =>
      schema.nodeFromJSON(tiptap.state.doc.toJSON()).check(),
    ).not.toThrow();

    const rootNode = tiptap.state.doc.child(0);
    expect(rootNode.type.name).toBe("blockContainer");
    expect(rootNode.attrs.blockId).toBe("block-1"); // 원본 blockId 불변
    expect(rootNode.firstChild?.textContent).toBe("Parent"); // 끝에서 split — 원본 텍스트 불변
    expect(rootNode.childCount).toBe(2);

    const group = rootNode.child(1);
    expect(group.type.name).toBe("blockGroup");
    expect(group.childCount).toBe(2);

    // (e) 새 블록이 첫 자식이다(D23) — 변이(다음 형제로 두는 형태)라면
    // group.child(0)이 child-1이 되어 아래 assert가 실패한다.
    const newContainer = group.child(0);
    expect(newContainer.type.name).toBe("blockContainer");
    expect(newContainer.firstChild?.textContent).toBe("");
    // (c) 새 blockId 부여
    expect(typeof newContainer.attrs.blockId).toBe("string");
    expect((newContainer.attrs.blockId as string).length).toBeGreaterThan(0);
    expect(newContainer.attrs.blockId).not.toBe("block-1");
    expect(newContainer.attrs.blockId).not.toBe("child-1");

    // (b) 기존 자식 귀속 불변 — child-1은 내용·id 그대로 두 번째 자식으로
    // 보존된다. 변이(naive depth-2 split으로 기존 blockGroup 전체가
    // 이관되는 형태)라면 child-1이 새 컨테이너 쪽으로 옮겨가 이 assert가
    // 실패한다.
    const existingChild = group.child(1);
    expect(existingChild.type.name).toBe("blockContainer");
    expect(existingChild.attrs.blockId).toBe("child-1");
    expect(existingChild.firstChild?.textContent).toBe("Child");

    // (d) 결정적 — 캐럿이 새 블록 텍스트 시작에 위치한다(G-EDT-001).
    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(newContainer.firstChild);
    expect(selection.$from.parentOffset).toBe(0);

    // undo 1회로 split 전체가 복원된다 — replaceWith+setSelection이 같은
    // tr·단일 dispatch로 끝났다는 증거(G-EDT-001).
    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeSplitJson);
  });

  it("자식 딸린 블록 콘텐츠 중간에서 Enter를 시뮬레이션해도 (a)~(e)가 성립하고 분할된 텍스트 앞/뒤 순서가 보존된다(D22/D23)", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("Parent"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    const schema = tiptap.schema;

    let rootEnd: number | null = null;
    let rootContentStart: number | null = null;
    tiptap.state.doc.descendants((node, pos) => {
      if (rootEnd !== null) return false;
      if (node.type.name === "blockContainer") {
        // pos + 1은 컨테이너 진입(paragraph 노드 자신의 위치) — 텍스트
        // 안으로 들어가려면 paragraph의 여는 토큰도 지나야 한다(pos + 2).
        rootContentStart = pos + 2;
        rootEnd = pos + node.nodeSize - 1;
        return false;
      }
      return true;
    });

    const childParagraph = schema.nodes.paragraph!.create(
      null,
      schema.text("Child"),
    );
    const childContainer = schema.nodes.blockContainer!.create(
      { blockId: "child-1" },
      childParagraph,
    );
    if (rootEnd === null) throw new Error("rootEnd 조회 실패");
    if (rootContentStart === null) {
      throw new Error("rootContentStart 조회 실패");
    }
    const blockGroup = schema.nodes.blockGroup!.create(null, childContainer);
    tiptap.view.dispatch(tiptap.state.tr.insert(rootEnd, blockGroup));
    const beforeSplitJson = tiptap.state.doc.toJSON();
    // history 경계를 명시적으로 닫는다 — split 트랜잭션의 replaceWith
    // 범위가 이 setup 삽입 범위와 겹쳐 PM history의 isAdjacentTo 병합
    // 휴리스틱이 시간차와 무관하게 둘을 한 undo 그룹으로 합친다. 무동작
    // closeHistory 트랜잭션(steps 0)을 끼워 넣으면 history 상태의
    // prevTime이 0으로 리셋되고, 이어지는 split 트랜잭션은 그 리셋만으로
    // 무조건 새 그룹이 된다(prosemirror-history applyTransaction: 0-step
    // 트랜잭션도 closeHistoryKey 메타를 조기에 반영하고 반환한다).
    tiptap.view.dispatch(closeHistory(tiptap.state.tr));

    // "Parent" 중간("Par" | "ent")에 캐럿을 둔다 — 끝(조건2)과 다른 축인
    // 오프바이원 함정을 잡는 위치다.
    tiptap.commands.setTextSelection(rootContentStart + "Par".length);

    pressEnter(editable);

    // (a) 스키마 유효
    expect(() =>
      schema.nodeFromJSON(tiptap.state.doc.toJSON()).check(),
    ).not.toThrow();

    const rootNode = tiptap.state.doc.child(0);
    expect(rootNode.type.name).toBe("blockContainer");
    expect(rootNode.attrs.blockId).toBe("block-1");
    // 분할된 앞 텍스트가 원본에 남는다(뒤바뀌면 "ent"가 된다).
    expect(rootNode.firstChild?.textContent).toBe("Par");
    expect(rootNode.childCount).toBe(2);

    const group = rootNode.child(1);
    expect(group.type.name).toBe("blockGroup");
    expect(group.childCount).toBe(2);

    // (e) 새 블록이 첫 자식이다(D23)
    const newContainer = group.child(0);
    expect(newContainer.type.name).toBe("blockContainer");
    // 분할된 뒤 텍스트가 새 블록으로 간다(유실·뒤바뀜이면 실패).
    expect(newContainer.firstChild?.textContent).toBe("ent");
    // (c) 새 blockId 부여
    expect(typeof newContainer.attrs.blockId).toBe("string");
    expect((newContainer.attrs.blockId as string).length).toBeGreaterThan(0);
    expect(newContainer.attrs.blockId).not.toBe("block-1");
    expect(newContainer.attrs.blockId).not.toBe("child-1");

    // (b) 기존 자식 귀속 불변
    const existingChild = group.child(1);
    expect(existingChild.type.name).toBe("blockContainer");
    expect(existingChild.attrs.blockId).toBe("child-1");
    expect(existingChild.firstChild?.textContent).toBe("Child");

    // (d) 결정적 — 캐럿이 새 블록 텍스트 시작("ent" 앞)에 위치한다.
    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(newContainer.firstChild);
    expect(selection.$from.parentOffset).toBe(0);

    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeSplitJson);
  });

  /**
   * level 2 heading 블록 하나짜리 문서 — 블록 끝 Enter의 새 블록 타입
   * 규칙(끝 split은 빈 문단, 그 외는 원본 타입 복사)을 검증하는 출발점이다.
   */
  const headingDocument = (text: string): Document => ({
    formatVersion: 1,
    revision: 0,
    blocks: [{ id: "block-1", type: "heading", level: 2, content: [{ text }] }],
  });

  /**
   * 문서 첫 heading의 텍스트 시작 위치를 찾는다 — 위 문단 케이스들의
   * rootContentStart 조회와 같은 역할, 대상 노드 타입만 다르다.
   */
  const headingTextStart = (doc: import("@tiptap/pm/model").Node): number => {
    let start: number | null = null;
    doc.descendants((node, pos) => {
      if (start !== null) return false;
      if (node.type.name === "heading") {
        start = pos + 1;
        return false;
      }
      return true;
    });
    if (start === null) throw new Error("heading 조회 실패");
    return start;
  };

  it("heading 콘텐츠 끝에서 Enter를 시뮬레이션하면 새 블록은 heading 복사가 아니라 빈 문단이다", () => {
    const editor = createEditor({
      initialDocument: headingDocument("Title"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    const schema = tiptap.schema;

    // "Title" 텍스트 끝에 캐럿을 둔다.
    tiptap.commands.setTextSelection(
      headingTextStart(tiptap.state.doc) + "Title".length,
    );

    pressEnter(editable);

    expect(() =>
      schema.nodeFromJSON(tiptap.state.doc.toJSON()).check(),
    ).not.toThrow();

    // childCount 3 = heading + split이 만든 새 블록 + 로드 시점 trailing
    // paragraph(UI-010, heading으로 끝나는 문서라 로드에 추가됨).
    expect(tiptap.state.doc.childCount).toBe(3);
    const originalContainer = tiptap.state.doc.child(0);
    // 원본은 그대로 heading이다.
    expect(originalContainer.firstChild?.type.name).toBe("heading");
    expect(originalContainer.firstChild?.attrs.level).toBe(2);
    expect(originalContainer.firstChild?.textContent).toBe("Title");

    // dev(StarterKit splitBlock + defaultBlockAt)의 "제목 뒤 Enter로 본문
    // 입력" 흐름 — 블록 끝 split의 새 블록은 같은 level heading 복사가
    // 아니라 빈 문단이다.
    const newContainer = tiptap.state.doc.child(1);
    expect(newContainer.firstChild?.type.name).toBe("paragraph");
    expect(newContainer.firstChild?.textContent).toBe("");
  });

  it("heading 콘텐츠 중간에서 Enter를 시뮬레이션하면 분할된 뒤쪽은 기존대로 같은 level의 heading이다", () => {
    const editor = createEditor({
      initialDocument: headingDocument("Title"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    const schema = tiptap.schema;

    // "Ti"와 "tle" 사이에 캐럿을 둔다 — 끝 split(빈 문단 규칙)이 중간
    // split까지 침범하지 않는지 고정한다.
    tiptap.commands.setTextSelection(
      headingTextStart(tiptap.state.doc) + "Ti".length,
    );

    pressEnter(editable);

    expect(() =>
      schema.nodeFromJSON(tiptap.state.doc.toJSON()).check(),
    ).not.toThrow();

    // childCount 3 = 분할된 heading 둘 + 로드 시점 trailing paragraph
    // (UI-010, heading으로 끝나는 문서라 로드에 추가됨).
    expect(tiptap.state.doc.childCount).toBe(3);
    const originalContainer = tiptap.state.doc.child(0);
    expect(originalContainer.firstChild?.type.name).toBe("heading");
    expect(originalContainer.firstChild?.attrs.level).toBe(2);
    expect(originalContainer.firstChild?.textContent).toBe("Ti");

    // 중간 split은 원본 타입·attrs 복사 유지.
    const newContainer = tiptap.state.doc.child(1);
    expect(newContainer.firstChild?.type.name).toBe("heading");
    expect(newContainer.firstChild?.attrs.level).toBe(2);
    expect(newContainer.firstChild?.textContent).toBe("tle");
  });

  it("자식 딸린 heading 콘텐츠 끝에서 Enter를 시뮬레이션해도 첫 자식 새 블록은 빈 문단이다(D23)", () => {
    const editor = createEditor({
      initialDocument: headingDocument("Title"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
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

    // "Title" 텍스트 끝(자식 앞)에 캐럿을 둔다.
    tiptap.commands.setTextSelection(
      headingTextStart(tiptap.state.doc) + "Title".length,
    );

    pressEnter(editable);

    expect(() =>
      schema.nodeFromJSON(tiptap.state.doc.toJSON()).check(),
    ).not.toThrow();

    const rootNode = tiptap.state.doc.child(0);
    expect(rootNode.firstChild?.type.name).toBe("heading");
    expect(rootNode.firstChild?.textContent).toBe("Title");
    expect(rootNode.childCount).toBe(2);

    const group = rootNode.child(1);
    expect(group.type.name).toBe("blockGroup");
    expect(group.childCount).toBe(2);

    // 첫 자식으로 들어간 새 블록(D23)도 끝 split이므로 빈 문단이다.
    const newContainer = group.child(0);
    expect(newContainer.firstChild?.type.name).toBe("paragraph");
    expect(newContainer.firstChild?.textContent).toBe("");

    // 기존 자식 귀속 불변.
    const existingChild = group.child(1);
    expect(existingChild.attrs.blockId).toBe("child-1");
    expect(existingChild.firstChild?.textContent).toBe("Child");
  });
});

describe("접힌 toggle 라벨 Enter(#252)", () => {
  const LABEL = "접힌토글";

  /**
   * fixture. 접힌 toggle마다 뒤에 보이는 문단을 둔다.
   * - c1: 접힘, 자식 문단 c1a·c1b. 뒤는 a1.
   * - c2: 접힘, 자식 divider d2. 뒤는 a2.
   * - e1: 펼침, 자식 문단 e1a. 뒤는 a3.
   * - c3: 접힘, 자식 없음. 뒤는 a4.
   * - c4: 접힘, 빈 라벨, 자식 문단 c4a. 뒤는 a5.
   * - p1: 펼침. 자식 pc(문단), c5(접힘, 자식 c5a). 뒤는 a6.
   * - tail: 꼬리 문단.
   */
  const fixture = () =>
    mounted(
      documentOf(
        toggleBlock("c1", LABEL, {
          collapsed: true,
          children: [
            paragraphBlock("c1a", "숨김1"),
            paragraphBlock("c1b", "숨김2"),
          ],
        }),
        paragraphBlock("a1", "뒤1"),
        toggleBlock("c2", LABEL, {
          collapsed: true,
          children: [dividerBlock("d2")],
        }),
        paragraphBlock("a2", "뒤2"),
        toggleBlock("e1", LABEL, {
          children: [paragraphBlock("e1a", "보이는 자식")],
        }),
        paragraphBlock("a3", "뒤3"),
        toggleBlock("c3", LABEL, { collapsed: true }),
        paragraphBlock("a4", "뒤4"),
        {
          id: "c4",
          type: "toggleListItem",
          content: [],
          collapsed: true,
          children: [paragraphBlock("c4a", "숨김4")],
        },
        paragraphBlock("a5", "뒤5"),
        toggleBlock("p1", "부모", {
          children: [
            paragraphBlock("pc", "보이는 자식"),
            toggleBlock("c5", LABEL, {
              collapsed: true,
              children: [paragraphBlock("c5a", "숨김5")],
            }),
          ],
        }),
        paragraphBlock("a6", "뒤6"),
        paragraphBlock("tail", "꼬리"),
      ),
    );

  type Mounted = ReturnType<typeof fixture>;

  /** blockId의 blockContainer 노드를 찾는다. */
  const containerOf = (tiptap: TiptapEditor, blockId: string): PmNode => {
    let found: PmNode | null = null;
    tiptap.state.doc.descendants((node) => {
      if (found !== null) return false;
      if (
        node.type.name === "blockContainer" &&
        node.attrs.blockId === blockId
      ) {
        found = node;
        return false;
      }
      return true;
    });
    if (found === null) throw new Error(`blockContainer ${blockId} 조회 실패`);
    return found;
  };

  /** 컨테이너의 blockGroup 자식 blockId 목록. 그룹이 없으면 빈 배열이다. */
  const childIds = (container: PmNode): string[] => {
    const group = container.childCount > 1 ? container.child(1) : null;
    const ids: string[] = [];
    group?.forEach((child) => ids.push(child.attrs.blockId as string));
    return ids;
  };

  /** 문서 최상위 blockContainer의 blockId 목록. */
  const topLevelIds = (tiptap: TiptapEditor): string[] => {
    const ids: string[] = [];
    tiptap.state.doc.forEach((child) =>
      ids.push(child.attrs.blockId as string),
    );
    return ids;
  };

  /** 캐럿을 pos의 빈 TextSelection으로 둔다. */
  const placeCaret = (tiptap: TiptapEditor, pos: number): void => {
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(TextSelection.create(tiptap.state.doc, pos)),
    );
  };

  /** 캐럿을 pos에 두고 Enter를 한 번 누른다. */
  const enterAt = ({ editable, tiptap }: Mounted, pos: number): void => {
    placeCaret(tiptap, pos);
    pressEnter(editable);
  };

  const labelStart = (tiptap: TiptapEditor, id: string): number =>
    contentTextStart(tiptap, id);
  const labelMiddle = (tiptap: TiptapEditor, id: string): number =>
    contentTextStart(tiptap, id) + 2;
  const labelEnd = (tiptap: TiptapEditor, id: string): number =>
    contentTextStart(tiptap, id) + LABEL.length;

  /** 접힌 c1 라벨의 Enter 결과로 생긴 새 형제 컨테이너. 원본 바로 뒤다. */
  const newSiblingOfC1 = (tiptap: TiptapEditor): PmNode => {
    const ids = topLevelIds(tiptap);
    expect(ids.slice(0, 3)).toEqual(["c1", ids[1], "a1"]);
    return containerOf(tiptap, ids[1]!);
  };

  /** 캐럿이 container 라벨 텍스트 시작인 빈 TextSelection인지 단언한다. */
  const expectCaretAtStartOf = (tiptap: TiptapEditor, container: PmNode) => {
    const { selection } = tiptap.state;
    expect(selection).toBeInstanceOf(TextSelection);
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(container.firstChild);
    expect(selection.$from.parentOffset).toBe(0);
  };

  describe("라벨 끝", () => {
    it("새 빈 toggleListItem이 원본 컨테이너 바로 뒤 형제로 생기고 숨은 그룹은 그대로다", () => {
      const m = fixture();
      enterAt(m, labelEnd(m.tiptap, "c1"));

      const sibling = newSiblingOfC1(m.tiptap);
      expect(sibling.firstChild?.type.name).toBe("toggleListItem");
      expect(sibling.firstChild?.textContent).toBe("");
      expect(sibling.childCount).toBe(1);

      const original = containerOf(m.tiptap, "c1");
      expect(original.firstChild?.textContent).toBe(LABEL);
      expect(childIds(original)).toEqual(["c1a", "c1b"]);
      // 접힌 그룹 안에 새 블록이 없다.
      expect(childIds(original)).not.toContain(sibling.attrs.blockId as string);
    });

    it("새 형제는 collapsed가 없고 원본은 접힘을 유지한다", () => {
      const m = fixture();
      enterAt(m, labelEnd(m.tiptap, "c1"));

      const sibling = newSiblingOfC1(m.tiptap);
      expect(sibling.firstChild?.attrs.collapsed).not.toBe(true);
      expect(containerOf(m.tiptap, "c1").firstChild?.attrs.collapsed).toBe(
        true,
      );
    });

    it("캐럿은 새 형제 텍스트 시작의 빈 TextSelection이고 숨은 자손 안이 아니다", () => {
      const m = fixture();
      enterAt(m, labelEnd(m.tiptap, "c1"));

      const sibling = newSiblingOfC1(m.tiptap);
      expectCaretAtStartOf(m.tiptap, sibling);
      const hidden = new Set(childIds(containerOf(m.tiptap, "c1")));
      const { $from } = m.tiptap.state.selection;
      for (let depth = 0; depth <= $from.depth; depth += 1) {
        expect(hidden.has($from.node(depth).attrs.blockId as string)).toBe(
          false,
        );
      }
    });
  });

  it("라벨 중간 Enter는 앞 조각이 원본(접힘·자식 유지), 뒤 조각이 새 형제로 가고 캐럿은 새 형제 시작이다", () => {
    const m = fixture();
    enterAt(m, labelMiddle(m.tiptap, "c1"));

    const original = containerOf(m.tiptap, "c1");
    expect(original.firstChild?.textContent).toBe("접힌");
    expect(original.firstChild?.attrs.collapsed).toBe(true);
    expect(childIds(original)).toEqual(["c1a", "c1b"]);

    const sibling = newSiblingOfC1(m.tiptap);
    expect(sibling.firstChild?.type.name).toBe("toggleListItem");
    expect(sibling.firstChild?.textContent).toBe("토글");
    expect(sibling.firstChild?.attrs.collapsed).not.toBe(true);
    expect(sibling.childCount).toBe(1);
    expectCaretAtStartOf(m.tiptap, sibling);
  });

  it("라벨 시작 Enter는 원본이 빈 접힌 라벨·자식 유지, 새 형제가 전체 텍스트를 받고 캐럿은 새 형제 시작이다", () => {
    const m = fixture();
    enterAt(m, labelStart(m.tiptap, "c1"));

    const original = containerOf(m.tiptap, "c1");
    expect(original.firstChild?.textContent).toBe("");
    expect(original.firstChild?.attrs.collapsed).toBe(true);
    expect(childIds(original)).toEqual(["c1a", "c1b"]);

    const sibling = newSiblingOfC1(m.tiptap);
    expect(sibling.firstChild?.type.name).toBe("toggleListItem");
    expect(sibling.firstChild?.textContent).toBe(LABEL);
    expect(sibling.firstChild?.attrs.collapsed).not.toBe(true);
    expect(sibling.childCount).toBe(1);
    expectCaretAtStartOf(m.tiptap, sibling);
  });

  it("라벨 안 범위 선택 Enter는 선택을 지운 뒤 같은 규칙으로 분할하고 dispatch는 1회다", () => {
    const m = fixture();
    const start = labelStart(m.tiptap, "c1");
    m.tiptap.view.dispatch(
      m.tiptap.state.tr.setSelection(
        TextSelection.create(m.tiptap.state.doc, start + 1, start + 3),
      ),
    );
    const dispatch = vi.spyOn(m.tiptap.view, "dispatch");

    pressEnter(m.editable);

    expect(dispatch).toHaveBeenCalledTimes(1);
    const original = containerOf(m.tiptap, "c1");
    expect(original.firstChild?.textContent).toBe("접");
    expect(original.firstChild?.attrs.collapsed).toBe(true);
    expect(childIds(original)).toEqual(["c1a", "c1b"]);
    const sibling = newSiblingOfC1(m.tiptap);
    expect(sibling.firstChild?.textContent).toBe("글");
    expectCaretAtStartOf(m.tiptap, sibling);
  });

  it("펼친 부모의 마지막 자식인 접힌 toggle Enter는 새 형제를 같은 부모 그룹의 접힌 container 바로 뒤에 만든다", () => {
    const m = fixture();
    enterAt(m, labelEnd(m.tiptap, "c5"));

    const parent = containerOf(m.tiptap, "p1");
    const ids = childIds(parent);
    expect(ids).toHaveLength(3);
    expect(ids.slice(0, 2)).toEqual(["pc", "c5"]);
    expect(ids[2]).not.toBe("c5a");

    const original = containerOf(m.tiptap, "c5");
    expect(childIds(original)).toEqual(["c5a"]);
    const sibling = containerOf(m.tiptap, ids[2]!);
    expect(sibling.firstChild?.type.name).toBe("toggleListItem");
    expect(sibling.firstChild?.textContent).toBe("");
    expectCaretAtStartOf(m.tiptap, sibling);
    // 최상위 순서는 그대로다.
    expect(topLevelIds(m.tiptap)).toContain("a6");
  });

  describe.each([
    ["라벨 끝", "c1", labelEnd],
    ["라벨 중간", "c1", labelMiddle],
    ["라벨 시작", "c1", labelStart],
    ["중첩 접힌 toggle 라벨 끝", "c5", labelEnd],
  ] as const)("%s", (_name, id, position) => {
    it("결과 문서는 스키마 유효 트리다", () => {
      const m = fixture();
      const hiddenBefore = childIds(containerOf(m.tiptap, id));
      enterAt(m, position(m.tiptap, id));

      // 새 블록이 숨은 그룹 밖 형제인 구조에서 유효해야 한다.
      expect(childIds(containerOf(m.tiptap, id))).toEqual(hiddenBefore);
      expect(() =>
        m.tiptap.schema.nodeFromJSON(m.tiptap.state.doc.toJSON()).check(),
      ).not.toThrow();
    });

    it("Enter 1회는 dispatch 1회이고 undo 1회로 원래 문서가 돌아온다", () => {
      const m = fixture();
      const before = m.tiptap.state.doc.toJSON();
      const hiddenBefore = childIds(containerOf(m.tiptap, id));
      placeCaret(m.tiptap, position(m.tiptap, id));
      // 캐럿 이동이 history 항목이 되지 않지만 경계를 닫아 둔다.
      m.tiptap.view.dispatch(closeHistory(m.tiptap.state.tr));
      const dispatch = vi.spyOn(m.tiptap.view, "dispatch");

      pressEnter(m.editable);

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(m.tiptap.state.doc.toJSON()).not.toEqual(before);
      // 새 블록이 숨은 그룹 밖 형제인 구조에서 undo가 원래 문서를 되돌린다.
      expect(childIds(containerOf(m.tiptap, id))).toEqual(hiddenBefore);
      m.tiptap.commands.undo();
      expect(m.tiptap.state.doc.toJSON()).toEqual(before);
    });
  });

  describe("변경 없는 경로 회귀 고정", () => {
    it("펼친 toggle(자식 있음) 라벨 끝 Enter는 새 블록이 첫 자식으로 생긴다(D23)", () => {
      const m = fixture();
      enterAt(m, labelEnd(m.tiptap, "e1"));

      const original = containerOf(m.tiptap, "e1");
      const ids = childIds(original);
      expect(ids).toHaveLength(2);
      expect(ids[1]).toBe("e1a");
      expect(ids[0]).not.toBe("e1a");
      const created = containerOf(m.tiptap, ids[0]!);
      expectCaretAtStartOf(m.tiptap, created);
      // 최상위 형제는 생기지 않는다.
      expect(topLevelIds(m.tiptap)).toContain("e1");
      expect(topLevelIds(m.tiptap).indexOf("a3")).toBe(
        topLevelIds(m.tiptap).indexOf("e1") + 1,
      );
    });

    it("자식 없는 접힌 toggle Enter는 형제를 만든다(D24)", () => {
      const m = fixture();
      enterAt(m, labelEnd(m.tiptap, "c3"));

      const ids = topLevelIds(m.tiptap);
      const at = ids.indexOf("c3");
      expect(ids[at + 2]).toBe("a4");
      const sibling = containerOf(m.tiptap, ids[at + 1]!);
      expect(containerOf(m.tiptap, "c3").childCount).toBe(1);
      expect(sibling.firstChild?.type.name).toBe("toggleListItem");
      expect(sibling.firstChild?.textContent).toBe("");
      expect(sibling.firstChild?.attrs.collapsed).not.toBe(true);
      expectCaretAtStartOf(m.tiptap, sibling);
    });

    it("숨은 자식이 있는 빈 접힌 toggle Enter는 paragraph로 전환되고 자식이 유지된다", () => {
      const m = fixture();
      const topBefore = topLevelIds(m.tiptap);
      enterAt(m, contentTextStart(m.tiptap, "c4"));

      const original = containerOf(m.tiptap, "c4");
      expect(original.firstChild?.type.name).toBe("paragraph");
      expect(childIds(original)).toEqual(["c4a"]);
      // 새 블록이 생기지 않는다.
      expect(topLevelIds(m.tiptap)).toEqual(topBefore);
      expectCaretAtStartOf(m.tiptap, original);
    });
  });
});
