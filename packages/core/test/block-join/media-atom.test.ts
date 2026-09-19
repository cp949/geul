/**
 * 빈 미디어 블록(file/image/video/audio, 자식 0개 atom)을 클릭으로
 * NodeSelection 선택한 뒤 Backspace/Delete가 실제로 그 블록을 지우는지
 * 확인한다.
 *
 * QA-090 커밋(6552c4a, 2026-09-08)이 "이 경로는 안 먹는다"는 결함을
 * 기록했었다 — resolveSelectionAwareState(selection-aware-state.ts)가
 * 자식 0개 atom의 NodeSelection을 native DOM selection과 재동기화할 때
 * view.posAtDOM 결과가 어긋나 "stale"로 오판하고, block-join-extension.ts의
 * joinBackwardAtBlockStart가 방어적으로 키만 삼킨다는 진단이었다. 그
 * 커밋 메시지 자체가 "소스 추적 확인(코드 수정 안 함)"이라 실측 재현은
 * 없었다.
 *
 * 2026-09-13 재조사: divider.test.ts와 같은 DOM 부착 round-trip(아래)과
 * 실 Chromium e2e 4가지 변형(문서 유일 블록·앞뒤 블록 있음·Delete·CDP
 * 무지연 클릭+keydown) 전부에서 정상 삭제됐다 — 오판이 재현되지 않는다.
 * resolveSelectionAwareState가 이 NodeSelection을 그대로 인식해(anchor/head
 * 일치) live state를 반환하므로 selectionIsStale이 false로 남고,
 * joinBackwardAtBlockStart는 non-stale·caretContext null 분기에서 false를
 * 반환해 기본 keymap의 deleteSelection으로 폴스루한다 — divider가 두 번째
 * 키에서 타는 경로와 같다. 이 파일은 그 정상 동작을 회귀로 고정한다.
 */
import { describe, expect, it, vi } from "vitest";

import type { MediaBlockKind } from "../../src/index.js";
import { contentTextStart, dispatchKeydown } from "../block-test-support.js";
import {
  documentOf,
  expectMediaBlockNodeSelection,
  mediaBlock,
  mounted,
  notApplicable,
  okResult,
  paragraphBlock,
  selectBlockNode,
} from "../editor-controller-support.js";
import { countNodes } from "./block-join-test-support.js";

// "iframe"(CUS-001~004)은 core에 IframeBlockExtension이 아직 없어 제외한다
// — RD-002가 자체 join/backspace 회귀 테스트를 추가할 때까지.
const kinds: Exclude<MediaBlockKind, "iframe">[] = [
  "file",
  "image",
  "video",
  "audio",
];

describe.each(kinds)(
  "빈 %s 블록 NodeSelection에서 Backspace/Delete",
  (kind) => {
    it.each(["Backspace", "Delete"] as const)(
      "DOM에 붙은 NodeSelection에서 %s가 블록을 지운다",
      (key) => {
        // 뒤에도 실 paragraph를 둔다 — trailing-block-extension.ts(UI-010)의
        // "문서는 항상 자식 없는 paragraph로 끝나야 한다" 불변식이 media를
        // 마지막 블록으로 두면 mount 시점에 trailing paragraph를 자동
        // 추가해 기대값이 그 auto-fill에 흔들린다.
        const { editor, editable, tiptap } = mounted(
          documentOf(
            paragraphBlock("p-1", "one"),
            mediaBlock(kind, "media-1"),
            paragraphBlock("p-2", "two"),
          ),
        );
        selectBlockNode(tiptap, "media-1");
        expectMediaBlockNodeSelection(tiptap, "media-1", kind);

        // divider.test.ts의 DOM round-trip 계약과 동일 — DOM에 실제로 붙이고
        // view.focus()로 NodeSelection을 native selection에 투영시킨 뒤에야
        // resolveSelectionAwareState의 재동기화 경로를 제대로 거친다.
        const container = editable.parentElement;
        if (container === null) throw new Error("편집기 컨테이너 조회 실패");
        document.body.append(container);
        const coordsAtPos = vi
          .spyOn(tiptap.view, "coordsAtPos")
          .mockReturnValue({ left: 0, right: 0, top: 0, bottom: 0 });

        try {
          tiptap.view.focus();
          const handled = dispatchKeydown(tiptap, key);

          expect(handled).toBe(true);
          expect(editor.getDocument().blocks).toEqual([
            paragraphBlock("p-1", "one"),
            paragraphBlock("p-2", "two"),
          ]);
        } finally {
          coordsAtPos.mockRestore();
          container.remove();
        }
      },
    );
  },
);

/**
 * 텍스트가 미디어 atom에 인접한 경계에서의 Backspace/Delete(Issue #202
 * RD-002) — divider.test.ts의 "divider 인접 Backspace/Delete(skip-and-merge)"
 * 와 같은 계약을 4종 미디어에 그대로 적용한다. 위 describe와는 무관한
 * 경로다 — 여긴 캐럿이 텍스트에 있고 미디어가 시각적으로 인접할 때이고,
 * 위는 미디어 자신이 이미 NodeSelection으로 선택된 경우다.
 */
describe.each(kinds)(
  "%s 인접 Backspace/Delete가 건너뛰어 병합한다(skip-and-merge, Issue #202 RD-002)",
  (kind) => {
    it("Backspace가 %s를 건너뛰어 이전 텍스트블록에 병합한다", () => {
      // 뒤에 실 paragraph(tail)를 둔다 — 병합 뒤 미디어 atom이 최상위
      // 마지막 블록이 되면 trailing-block-extension.ts(UI-010) 불변식이
      // trailing paragraph를 자동 추가해 기대값이 흔들린다.
      const { editor, tiptap, changes } = mounted(
        documentOf(
          paragraphBlock("p-1", "one"),
          mediaBlock(kind, "m-1"),
          paragraphBlock("p-2", "two"),
          paragraphBlock("tail", ""),
        ),
      );

      tiptap.commands.setTextSelection(contentTextStart(tiptap, "p-2"));
      const handled = dispatchKeydown(tiptap, "Backspace");

      expect(handled).toBe(true);
      // 미디어 블록은 지워지지 않고 그대로 남는다 — p-2가 소멸해 그
      // 내용만 p-1에 흡수된다.
      expect(editor.getDocument().blocks).toEqual([
        paragraphBlock("p-1", "onetwo"),
        mediaBlock(kind, "m-1"),
        paragraphBlock("tail", ""),
      ]);
      expect(countNodes(tiptap, kind)).toBe(1);
      expect(tiptap.state.selection.empty).toBe(true);
      expect(changes).toHaveLength(1);

      expect(editor.commands.undo()).toEqual(okResult);
      expect(editor.getDocument().blocks).toEqual([
        paragraphBlock("p-1", "one"),
        mediaBlock(kind, "m-1"),
        paragraphBlock("p-2", "two"),
        paragraphBlock("tail", ""),
      ]);
      expect(editor.commands.undo()).toEqual(notApplicable("undo"));
    });

    it("Delete가 %s를 건너뛰어 다음 텍스트블록과 결합한다", () => {
      const { editor, tiptap, changes } = mounted(
        documentOf(
          paragraphBlock("p-1", "one"),
          mediaBlock(kind, "m-1"),
          paragraphBlock("p-2", "two"),
          paragraphBlock("tail", ""),
        ),
      );

      tiptap.commands.setTextSelection(
        contentTextStart(tiptap, "p-1") + "one".length,
      );
      const handled = dispatchKeydown(tiptap, "Delete");

      expect(handled).toBe(true);
      expect(editor.getDocument().blocks).toEqual([
        paragraphBlock("p-1", "onetwo"),
        mediaBlock(kind, "m-1"),
        paragraphBlock("tail", ""),
      ]);
      expect(countNodes(tiptap, kind)).toBe(1);
      expect(tiptap.state.selection.empty).toBe(true);
      expect(changes).toHaveLength(1);

      expect(editor.commands.undo()).toEqual(okResult);
      expect(editor.getDocument().blocks).toEqual([
        paragraphBlock("p-1", "one"),
        mediaBlock(kind, "m-1"),
        paragraphBlock("p-2", "two"),
        paragraphBlock("tail", ""),
      ]);
      expect(editor.commands.undo()).toEqual(notApplicable("undo"));
    });
  },
);
