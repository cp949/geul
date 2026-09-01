/**
 * `setBlockType`이 heading의 `isToggleable`을 설정/해제하는 경로(RD-004
 * DELTA-02)를 EditorController 경계에서 검증한다. 생성(다른 타입 →
 * `isToggleable: true` heading), 명시 해제 시 `collapsed` 동반 리셋(model
 * 불변식 보호 — 그러지 않으면 `readEditorDocument`가 `TypeError`를 던진다),
 * `isSameType` 판정이 level뿐 아니라 `isToggleable`도 비교하는지를 다룬다.
 * level만 바꾸는 기존 호출이 `isToggleable`·`collapsed`를 캐리포워드하는
 * 회귀(RD-003 트랙-3 F1)는 `editor-controller-heading-levels.test.ts`가 이미
 * 소유해 여기서 중복하지 않는다. 트라이앵글 클릭·Slash·Turn into UI는
 * 범위 밖이다(RD-004.md DELTA-03·DELTA-04).
 */
import type { Block } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import {
  documentOf,
  editorState,
  mounted,
  notApplicable,
  okResult,
  paragraphBlock,
  restored,
} from "./editor-controller-support.js";

/**
 * heading 리터럴을 만든다. isToggleable/collapsed는 지정할 때만 필드를
 * 채운다 — `toggle-collapse-commands.test.ts`의 headingBlock과 같은 이유로
 * 이 파일 전용 빌더로 둔다(G-TST-002 대상 아님, checkListItemBlock 선례와
 * 동일하게 파일마다 독립 빌더를 둔다).
 */
const headingBlock = (
  id: string,
  level: 1 | 2 | 3 | 4 | 5 | 6,
  text: string,
  options?: { isToggleable?: boolean; collapsed?: boolean },
): Block => ({
  id,
  type: "heading",
  level,
  content: text === "" ? [] : [{ text }],
  ...(options?.isToggleable === undefined
    ? {}
    : { isToggleable: options.isToggleable }),
  ...(options?.collapsed === undefined ? {} : { collapsed: options.collapsed }),
});

describe("setBlockType heading isToggleable", () => {
  it("paragraph에서 isToggleable: true인 heading으로 바꾸면 collapsed 없이 켜지고 undo 한 번으로 복원된다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("target", "제목"),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    const before = editorState(editor, tiptap);

    expect(
      editor.commands.setBlockType("target", {
        type: "heading",
        level: 2,
        isToggleable: true,
      }),
    ).toEqual(okResult);

    const heading = editor.getDocument().blocks[0];
    expect(heading).toEqual(
      headingBlock("target", 2, "제목", { isToggleable: true }),
    );
    expect(heading).not.toHaveProperty("collapsed");

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("isToggleable:true·collapsed:true인 heading에 같은 level로 isToggleable:false를 명시하면 collapsed도 함께 사라지고 undo로 복원된다", () => {
    const source = headingBlock("target", 3, "제목", {
      isToggleable: true,
      collapsed: true,
    });
    const { editor, tiptap } = mounted(
      documentOf(source, paragraphBlock("tail", "꼬리")),
    );
    const before = editorState(editor, tiptap);

    // isToggleable을 false로 되돌리면서 collapsed를 그대로 두면 model
    // 불변식(collapsed는 isToggleable:true인 heading만 가능)을 어긴
    // DOCUMENT_INVALID 문서가 만들어져 readEditorDocument가 TypeError를
    // 던진다 — 이 호출이 예외 없이 성공해야 그 리셋이 실제로 동작한다.
    expect(() =>
      editor.commands.setBlockType("target", {
        type: "heading",
        level: 3,
        isToggleable: false,
      }),
    ).not.toThrow();

    const heading = editor.getDocument().blocks[0];
    expect(heading).toEqual(headingBlock("target", 3, "제목"));
    expect(heading).not.toHaveProperty("isToggleable");
    expect(heading).not.toHaveProperty("collapsed");

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("같은 level·같은 명시 isToggleable 재적용은 COMMAND_NOT_APPLICABLE이고 상태가 무변경이다", () => {
    const source = headingBlock("target", 4, "제목", { isToggleable: true });
    const { editor, tiptap } = mounted(
      documentOf(source, paragraphBlock("tail", "꼬리")),
    );
    const before = editorState(editor, tiptap);

    expect(
      editor.commands.setBlockType("target", {
        type: "heading",
        level: 4,
        isToggleable: true,
      }),
    ).toEqual(notApplicable("setBlockType"));

    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("같은 level이라도 isToggleable이 현재 값과 다르면 거절하지 않고 실제로 적용한다", () => {
    // isSameType 판정이 level만 비교하면 이 호출을 잘못 COMMAND_NOT_APPLICABLE로
    // 거절해야 한다(회귀 변이) — isToggleable도 함께 비교해야 통과한다.
    const source = headingBlock("target", 4, "제목");
    const { editor } = mounted(
      documentOf(source, paragraphBlock("tail", "꼬리")),
    );

    expect(
      editor.commands.setBlockType("target", {
        type: "heading",
        level: 4,
        isToggleable: true,
      }),
    ).toEqual(okResult);

    expect(editor.getDocument().blocks[0]).toEqual(
      headingBlock("target", 4, "제목", { isToggleable: true }),
    );
  });
});
