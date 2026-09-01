/**
 * checkListItem node의 production 등록과 EditorController load/save 경계를
 * 검증한다(Issue #38 슬라이스 6 RD-001 DELTA-02 완료 조건). checked true/false,
 * top-level·nested children round trip과 replaceDocument 경로를 다룬다.
 * 시각 표시(마커·체크박스 UI)는 이 DELTA 범위가 아니다 — 이후 DELTA가 다룬다.
 */
import type { Block, Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import {
  documentOf,
  liveSchema,
  mountTiptapEditor,
  paragraphBlock,
  paragraphDocument,
} from "./editor-controller-support.js";

/** listItemBlock은 ListItemBlockType(bullet/numbered)만 받으므로 여기서 checkListItem 리터럴을 직접 만든다. */
const checkListItemBlock = (
  id: string,
  text: string,
  checked: boolean,
  children?: Block[],
): Block => ({
  id,
  type: "checkListItem",
  checked,
  content: text === "" ? [] : [{ text }],
  ...(children === undefined ? {} : { children }),
});

const tailParagraph = paragraphBlock("tail", "꼬리");

/** checked true/false와 임의 children 배치를 한 번에 관찰하는 문서. */
const checkListItemDocument = (): Document =>
  documentOf(
    checkListItemBlock("check-checked", "checked", true, [
      paragraphBlock("check-checked-child", "arbitrary child"),
    ]),
    checkListItemBlock("check-unchecked", "unchecked", false),
    tailParagraph,
  );

describe("production 스키마 등록", () => {
  it("checkListItem node가 checked 속성과 함께 등록되고 외부 parse는 열지 않는다", () => {
    const schema = liveSchema();
    const check = schema.nodes.checkListItem;
    if (check === undefined) throw new Error("checkListItem node가 없다");

    expect(Object.keys(check.spec.attrs ?? {})).toEqual(["checked"]);
    expect(check.create().attrs).toEqual({ checked: false });
    expect(check.spec.parseDOM ?? []).toEqual([]);
  });
});

describe("createEditor round trip", () => {
  it("checkListItem의 checked·content·children이 getDocument()에 그대로 보존된다", () => {
    const editor = createEditor({ initialDocument: checkListItemDocument() });
    try {
      expect(editor.getDocument()).toEqual(checkListItemDocument());
    } finally {
      editor.destroy();
    }
  });

  it("replaceDocument로 checkListItem 문서를 로드해도 같은 round trip 계약이 적용된다", () => {
    const editor = createEditor({ initialDocument: paragraphDocument("이전") });
    try {
      expect(editor.replaceDocument(checkListItemDocument())).toEqual({
        ok: true,
        value: undefined,
      });
      expect(editor.getDocument()).toEqual({
        ...checkListItemDocument(),
        revision: 1,
      });
    } finally {
      editor.destroy();
    }
  });

  it("checkListItem이 mount된 DOM에 존재하고 checked attrs가 PM 문서에 보존된다", () => {
    const editor = createEditor({ initialDocument: checkListItemDocument() });
    try {
      const { tiptap, editable } = mountTiptapEditor(editor);

      const container = editable.querySelector<HTMLElement>(
        '[data-be-block-id="check-checked"]',
      );
      if (container === null) throw new Error("check-checked 조회 실패");
      expect(
        container.querySelector("[data-be-check-list-item]"),
      ).not.toBeNull();

      let checkedAttr: unknown;
      tiptap.state.doc.descendants((node) => {
        if (
          node.type.name === "checkListItem" &&
          node.textContent === "checked"
        ) {
          checkedAttr = node.attrs.checked;
        }
      });
      expect(checkedAttr).toBe(true);
    } finally {
      editor.destroy();
    }
  });
});
