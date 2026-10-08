/**
 * 기본·표 셀 붙여넣기 계획 테스트가 공유하는 마운트와 클립보드 fixture를 소유한다.
 * 같은 문서·선택 조립을 써 계획 결과를 대조한다(G-TST-002).
 */
import type { Block } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

import { createEditor } from "../src/index.js";
import type { PasteClipboard } from "../src/paste-plan-types.js";
import { contentTextStart } from "./block-test-support.js";
import {
  documentOf,
  mountTiptapEditor,
  sequentialIds,
} from "./list-item-block-type-support.js";

export const SOH = String.fromCharCode(1);
export const TAB = String.fromCharCode(9);

/** PM이 파싱한 slice 자리다. 기본 계획은 이 slice를 그대로 넣는다. */
export const PM_SLICE = new Slice(Fragment.empty, 0, 0);

/**
 * 문서를 마운트하고 anchor→head 위치를 TextSelection으로 둔다. head를
 * 생략하면 캐럿이다.
 */
export const mountAt = (
  blocks: Block[],
  anchor: (tiptap: TiptapEditor) => number,
  head: (tiptap: TiptapEditor) => number = anchor,
): TiptapEditor => {
  const editor = createEditor({
    initialDocument: documentOf(...blocks),
    createId: sequentialIds("id"),
  });
  const { tiptap } = mountTiptapEditor(editor);
  tiptap.view.dispatch(
    tiptap.state.tr.setSelection(
      TextSelection.create(tiptap.state.doc, anchor(tiptap), head(tiptap)),
    ),
  );
  return tiptap;
};

/** 블록 텍스트 시작 + offset 위치를 만든다. */
export const at =
  (id: string, offset: number) =>
  (tiptap: TiptapEditor): number =>
    contentTextStart(tiptap, id) + offset;

/** 클립보드 값을 만든다. plain은 서식 없이 붙여넣기 신호다. */
export const clip = (
  text: string,
  html = "",
  plain = false,
): PasteClipboard => ({
  html,
  text,
  plain,
});
