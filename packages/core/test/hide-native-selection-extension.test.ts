/**
 * CellSelection을 제외한 비가시 selection(NodeSelection·GapCursor)일 때만
 * 편집기 루트에 `geul-hide-selection` 클래스를 붙이는 계약을 고정한다
 * (Issue #239). react의 `.geul-hide-selection *` 규칙(caret-color·
 * ::selection 투명화)이 이 클래스에만 걸린다.
 *
 * prosemirror-view가 비가시 selection(NodeSelection·GapCursor·CellSelection)
 * 전부에 붙이는 `ProseMirror-hideselection`에 같은 규칙을 걸면 표 셀 범위
 * 선택 때 10,000셀의 스타일 재계산이 일어난다 — CellSelection·TextSelection
 * 에서는 이 클래스가 없어야 한다.
 */
import { GapCursor } from "@tiptap/pm/gapcursor";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { describe, expect, it } from "vitest";

import { findBlockPosition } from "../src/block-position.js";
import { createEditor } from "../src/index.js";
import {
  documentOf,
  mediaBlock,
  mountTiptapEditor,
  oneCellTableBlock,
  paragraphBlock,
} from "./editor-controller-support.js";
import { selectCellRange } from "./table-test-support.js";

const HIDE_SELECTION_CLASS = "geul-hide-selection";

const mountFixture = () => {
  const editor = createEditor({
    initialDocument: documentOf(
      paragraphBlock("p-1", "문단"),
      mediaBlock("image", "img-1", { url: "https://example.com/a.png" }),
      oneCellTableBlock("table-1"),
      paragraphBlock("tail", "꼬리"),
    ),
  });
  return mountTiptapEditor(editor);
};

// 문서 맨 앞이 표다. GapCursor 생성자는 위치를 검증하지 않으므로 위치 0에
// 직접 만든다(이 스키마에서 GapCursor.valid는 모든 위치에서 false다).
const mountGapFixture = () => {
  const editor = createEditor({
    initialDocument: documentOf(
      oneCellTableBlock("table-1"),
      mediaBlock("image", "img-1", { url: "https://example.com/a.png" }),
      paragraphBlock("tail", "꼬리"),
    ),
  });
  return mountTiptapEditor(editor);
};

describe("비가시 selection 네이티브 선택 숨김 클래스", () => {
  it("TextSelection에서는 루트에 geul-hide-selection이 없다", () => {
    const { editable, tiptap } = mountFixture();

    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(
        TextSelection.near(tiptap.state.doc.resolve(2)),
      ),
    );

    expect(editable.classList.contains(HIDE_SELECTION_CLASS)).toBe(false);
  });

  it("미디어 블록 NodeSelection에서는 루트에 geul-hide-selection이 붙는다", () => {
    const { editable, tiptap } = mountFixture();
    const position = findBlockPosition(tiptap.state.doc, "img-1");
    if (position === null) throw new Error("img-1 조회 실패");

    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(
        NodeSelection.create(tiptap.state.doc, position),
      ),
    );

    expect(tiptap.state.selection).toBeInstanceOf(NodeSelection);
    expect(editable.classList.contains(HIDE_SELECTION_CLASS)).toBe(true);
    // 기본 클래스를 덮어쓰지 않고 병합한다.
    expect(editable.classList.contains("ProseMirror")).toBe(true);
  });

  it("NodeSelection에서 TextSelection으로 돌아오면 클래스가 떨어진다", () => {
    const { editable, tiptap } = mountFixture();
    const position = findBlockPosition(tiptap.state.doc, "img-1");
    if (position === null) throw new Error("img-1 조회 실패");
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(
        NodeSelection.create(tiptap.state.doc, position),
      ),
    );
    expect(editable.classList.contains(HIDE_SELECTION_CLASS)).toBe(true);

    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(
        TextSelection.near(tiptap.state.doc.resolve(2)),
      ),
    );

    expect(editable.classList.contains(HIDE_SELECTION_CLASS)).toBe(false);
  });

  it("GapCursor에서는 루트에 geul-hide-selection이 붙는다", () => {
    const { editable, tiptap } = mountGapFixture();

    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(new GapCursor(tiptap.state.doc.resolve(0))),
    );

    // 전제: GapCursor는 prosemirror-view가 hideselection을 붙이는 비가시
    // selection이다.
    expect(tiptap.state.selection).toBeInstanceOf(GapCursor);
    expect(tiptap.state.selection.visible).toBe(false);
    expect(editable.classList.contains(HIDE_SELECTION_CLASS)).toBe(true);
  });

  it("NodeSelection에서 GapCursor로 바뀌어도 클래스가 유지된다", () => {
    const { editable, tiptap } = mountGapFixture();
    const position = findBlockPosition(tiptap.state.doc, "img-1");
    if (position === null) throw new Error("img-1 조회 실패");
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(
        NodeSelection.create(tiptap.state.doc, position),
      ),
    );
    expect(editable.classList.contains(HIDE_SELECTION_CLASS)).toBe(true);

    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(new GapCursor(tiptap.state.doc.resolve(0))),
    );

    expect(tiptap.state.selection).toBeInstanceOf(GapCursor);
    expect(editable.classList.contains(HIDE_SELECTION_CLASS)).toBe(true);
  });

  it("CellSelection에서는 루트에 geul-hide-selection이 붙지 않는다", () => {
    const { editable, tiptap } = mountFixture();

    selectCellRange(tiptap, "cell-1", "cell-1");

    // 전제: 실제로 CellSelection이다.
    expect(tiptap.state.selection).toBeInstanceOf(CellSelection);
    expect(editable.classList.contains(HIDE_SELECTION_CLASS)).toBe(false);
  });

  it("attributeOverrides.editor의 class와 병합한다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        mediaBlock("image", "img-1", { url: "https://example.com/a.png" }),
        paragraphBlock("tail", "꼬리"),
      ),
      attributeOverrides: { editor: { class: "consumer-class" } },
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    const position = findBlockPosition(tiptap.state.doc, "img-1");
    if (position === null) throw new Error("img-1 조회 실패");

    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(
        NodeSelection.create(tiptap.state.doc, position),
      ),
    );

    expect(editable.classList.contains("consumer-class")).toBe(true);
    expect(editable.classList.contains(HIDE_SELECTION_CLASS)).toBe(true);
    expect(editable.classList.contains("ProseMirror")).toBe(true);
  });
});
