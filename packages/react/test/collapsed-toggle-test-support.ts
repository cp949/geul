/**
 * 접힌 toggle 안 블록을 다루는 오버레이 테스트의 공용 fixture(G-TST-002).
 * media-captions·code-block-captions 테스트가 같은 문서 모양과 접힘 조작을
 * 쓴다(Issue #288).
 */
import type { Block, EditorController } from "@cp949/geul-core";
import { act } from "@testing-library/react";

import type { MountBlockEditorOptions } from "./mount-editor.js";

type InitialBlocks = NonNullable<MountBlockEditorOptions["initialBlocks"]>;

/** 접힘 조작 대상 toggle의 id. */
export const TOGGLE_ID = "tg";

/**
 * 문단 p1, toggle tg(자식 `child`) 문서를 만든다. 접힘은 자식 DOM에
 * `data-geul-collapsed-hidden` 표식을 붙인다. 자식은 rect가 스텁돼 레이아웃으로는
 * 숨김을 알 수 없다. 표식만이 판정 근거가 된다.
 */
export const toggleWithChild = (
  child: Block,
  collapsed: boolean,
): InitialBlocks => [
  { id: "p1", type: "paragraph", content: [{ text: "문단" }] },
  {
    id: TOGGLE_ID,
    type: "toggleListItem",
    content: [{ text: "toggle" }],
    collapsed,
    children: [child],
  },
];

/**
 * 호스트 API로 toggle을 접거나 펼친다. DOM 이벤트(resize·selectionchange·keyup)를
 * 보내지 않는다. 오버레이가 문서 변경 구독만으로 따라가야 하는 경로다.
 */
export const toggleCollapseByHostApi = (editor: EditorController): void => {
  act(() => {
    editor.commands.toggleListItemCollapse(TOGGLE_ID);
  });
};
