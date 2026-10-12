/**
 * 세션 종료·문서 교체 때의 로컬 프리뷰 정리 스윕(Issue #390)을 고정한다.
 *
 * 스윕은 세션이 쥔 대기 목록(문서에서 빠졌지만 복구 불가 판정 전인 프리뷰)을
 * 훑는다. 그 목록은 lifecycle 확장이 제자리에서 바꾸는 살아있는 Map이다.
 * 정리 콜백이 동기로 undo해 대기 항목을 문서로 되살리면 확장이 순회 중인
 * Map에서 그 항목을 지운다. 스윕이 Map을 그대로 순회하면 그 항목은 문서
 * 스캔에도 대기 목록에도 남지 않아 통지되지 않고, blob URL이 샌다.
 * 스윕은 시작 시점의 항목을 모두 통지해야 한다.
 */
import { describe, expect, it } from "vitest";
import {
  documentOf,
  mediaBlock,
  paragraphBlock,
  mountedWithLocalPreviewCleanup,
  tailParagraphBlock,
} from "./editor-controller-support.js";

const testFile = () => new File(["binary"], "a.png", { type: "image/png" });

describe("로컬 프리뷰 스윕 중 정리 콜백이 대기 항목을 되살리는 경우", () => {
  it.each(["destroy", "replaceDocument"] as const)(
    "%s의 스윕은 시작 시점의 대기 항목을 모두 통지한다",
    async (trigger) => {
      let undone = false;
      const { editor, localPreviewCleared } = mountedWithLocalPreviewCleanup(
        documentOf(
          mediaBlock("image", "m-1"),
          mediaBlock("image", "m-2"),
          tailParagraphBlock,
        ),
        {
          onLocalPreviewCleanup: () => {
            if (undone) return;
            undone = true;
            // 마지막 편집(m-2 삭제)을 되돌려 m-2의 프리뷰를 문서로 되살린다.
            editor.commands.undo();
          },
        },
      );
      await editor.commands.uploadMediaFile("m-1", testFile());
      await editor.commands.uploadMediaFile("m-2", testFile());
      editor.commands.deleteBlock("m-1");
      editor.commands.deleteBlock("m-2");

      if (trigger === "destroy") {
        editor.destroy();
      } else {
        editor.replaceDocument(
          documentOf(paragraphBlock("p-9", "x"), tailParagraphBlock),
        );
      }

      expect(localPreviewCleared.map((cleared) => cleared.blockId)).toEqual([
        "m-1",
        "m-2",
      ]);
    },
  );
});
