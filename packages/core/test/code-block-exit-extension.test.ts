/**
 * CodeBlockExitExtension이 codeBlock 전용 Enter(double 개행 종료)·Delete
 * (빈 블록 삭제) 계약을 지키는지 검증한다(RD-003 DELTA-02). 종료 조건이
 * 아니면 이 확장은 `false`로 물러난다 — Enter는 Tiptap 코어 내장
 * `Keymap` 확장의 `newlineInCode` 폴백(구현 조사로 확정, RD-003-DELTA-02.md
 * "배경" 참고)이, 비어 있지 않은 codeBlock의 경계 Delete는
 * block-join-extension.ts의 기존 경계 no-op이 대신 처리한다 — 둘 다
 * jsdom에서 실제 커맨드 실행으로 완전히 재현되므로(네이티브 브라우저
 * 폴백 아님) 여기서 함께 고정한다.
 *
 * codeBlock이 문서 최상위 "마지막 블록"이면 TrailingBlockExtension이 항상
 * 그 뒤에 맨몸 paragraph(첫 자동 id "id-1")를 붙인다(codeBlock은
 * endsWithChildlessParagraph를 절대 만족 못 함, trailing-block-extension.ts)
 * — 아래 fixture 다수가 이 자동 삽입을 기대값에 그대로 반영한다.
 */
import { describe, expect, it } from "vitest";

import { contentTextStart, dispatchKeydown } from "./block-test-support.js";
import {
  codeBlockBlock,
  documentOf,
  mounted,
  paragraphBlock,
} from "./editor-controller-support.js";

describe("codeBlock Enter double 개행 종료", () => {
  it("트레일링 개행 뒤 Enter는 그 개행을 지우고 다음 형제 문단 선두로 캐럿을 옮긴다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        codeBlockBlock("target", "code\n"),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, "target") + "code\n".length,
    );

    expect(dispatchKeydown(tiptap, "Enter")).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      codeBlockBlock("target", "code"),
      paragraphBlock("tail", "꼬리"),
    ]);
  });

  it("codeBlock이 문서 마지막 블록이면(TrailingBlockExtension이 자동으로 붙인 trailing 문단) 그 문단 선두로 캐럿을 옮긴다", () => {
    const { editor, tiptap } = mounted(
      documentOf(codeBlockBlock("target", "code\n")),
    );
    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, "target") + "code\n".length,
    );

    expect(dispatchKeydown(tiptap, "Enter")).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      codeBlockBlock("target", "code"),
      paragraphBlock("id-1", ""),
    ]);
  });

  it("직전 글자가 개행이 아니면 Enter는 종료 대신 일반 개행을 삽입한다(Tiptap 코어 newlineInCode 폴백)", () => {
    const { editor, tiptap } = mounted(
      documentOf(codeBlockBlock("target", "code")),
    );
    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, "target") + "code".length,
    );

    expect(dispatchKeydown(tiptap, "Enter")).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      codeBlockBlock("target", "code\n"),
      paragraphBlock("id-1", ""),
    ]);
  });

  it("완전히 빈 codeBlock의 첫 Enter는 종료 대신 일반 개행을 삽입한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(codeBlockBlock("target", "")),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target"));

    expect(dispatchKeydown(tiptap, "Enter")).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      codeBlockBlock("target", "\n"),
      paragraphBlock("id-1", ""),
    ]);
  });

  it("캐럿이 절대 끝이 아니면(중간 개행 뒤 코드가 더 있음) 그 위치에 일반 개행을 삽입한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(codeBlockBlock("target", "a\nb")),
    );
    // "a\n" 뒤, "b" 앞 — 개행 바로 뒤지만 절대 끝은 아니다.
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target") + 2);

    expect(dispatchKeydown(tiptap, "Enter")).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      codeBlockBlock("target", "a\n\nb"),
      paragraphBlock("id-1", ""),
    ]);
  });

  it("들여쓴 codeBlock이 자신의 blockGroup 안 마지막 자식이면(다음 형제 없음) 종료 대신 일반 개행을 삽입한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("parent", "부모", [codeBlockBlock("target", "code\n")]),
      ),
    );
    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, "target") + "code\n".length,
    );

    expect(dispatchKeydown(tiptap, "Enter")).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("parent", "부모", [codeBlockBlock("target", "code\n\n")]),
      paragraphBlock("id-1", ""),
    ]);
  });
});

describe("빈 codeBlock Delete 삭제", () => {
  it("빈 codeBlock 전체를 삭제한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("head", "머리"),
        codeBlockBlock("target", ""),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target"));

    expect(dispatchKeydown(tiptap, "Delete")).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("head", "머리"),
      paragraphBlock("tail", "꼬리"),
    ]);
  });

  it("들여쓴 blockGroup의 유일한 자식이면 그 blockGroup째로 삭제한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("parent", "부모", [codeBlockBlock("target", "")]),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target"));

    expect(dispatchKeydown(tiptap, "Delete")).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("parent", "부모"),
      paragraphBlock("tail", "꼬리"),
    ]);
  });

  it("codeBlock이 비어 있지 않으면 이 확장은 물러나고 기존 경계 no-op이 대신 소비한다(회귀 없음)", () => {
    const { editor, tiptap } = mounted(
      documentOf(codeBlockBlock("target", "code"), paragraphBlock("tail", "")),
    );
    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, "target") + "code".length,
    );

    expect(dispatchKeydown(tiptap, "Delete")).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      codeBlockBlock("target", "code"),
      paragraphBlock("tail", ""),
    ]);
  });
});
