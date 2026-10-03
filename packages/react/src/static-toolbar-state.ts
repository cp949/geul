import type { EditorController } from "@cp949/geul-core";
import { useCallback, useEffect, useState } from "react";

import {
  computeFormattingToolbarState,
  type FormattingToolbarState,
} from "./formatting-toolbar-state.js";

const sameFlatRecord = (
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean => {
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => left[key] === right[key])
  );
};

/**
 * 두 상태가 화면에 같은 결과를 낳는지 비교한다. `subscribe`는 타이핑마다
 * 발화하므로 같은 상태면 재렌더를 생략하는 근거가 된다. 블록 타입
 * 설명자(`{ type, level }` 등)는 값만 가진 평평한 객체라 키별로 비교한다.
 */
export const isSameStaticToolbarState = (
  left: FormattingToolbarState,
  right: FormattingToolbarState,
): boolean =>
  left.isMediaBlockSelected === right.isMediaBlockSelected &&
  left.isCellRangeSelected === right.isCellRangeSelected &&
  left.activeMarks.length === right.activeMarks.length &&
  left.activeMarks.every((mark, index) => mark === right.activeMarks[index]) &&
  (left.nestingActions === null || right.nestingActions === null
    ? left.nestingActions === right.nestingActions
    : sameFlatRecord(left.nestingActions, right.nestingActions)) &&
  (left.multiBlockSelection === null || right.multiBlockSelection === null
    ? left.multiBlockSelection === right.multiBlockSelection
    : left.multiBlockSelection.blockIds.length ===
        right.multiBlockSelection.blockIds.length &&
      left.multiBlockSelection.blockIds.every(
        (blockId, index) =>
          blockId === right.multiBlockSelection?.blockIds[index],
      ) &&
      (left.multiBlockSelection.blockType === null ||
      right.multiBlockSelection.blockType === null
        ? left.multiBlockSelection.blockType ===
          right.multiBlockSelection.blockType
        : sameFlatRecord(
            left.multiBlockSelection.blockType,
            right.multiBlockSelection.blockType,
          ))) &&
  (left.blockSelection === null || right.blockSelection === null
    ? left.blockSelection === right.blockSelection
    : left.blockSelection.blockId === right.blockSelection.blockId &&
      sameFlatRecord(
        left.blockSelection.blockType,
        right.blockSelection.blockType,
      ));

/**
 * StaticToolbar의 표시 상태를 `editor.subscribe()` 통지로 갱신한다.
 *
 * DOM 이벤트(`selectionchange`·`mouseup`)에 기대지 않는다. 빠른 클릭에서는
 * ProseMirror가 selection을 반영하기 전에 그 이벤트가 먼저 처리돼 이전
 * 블록 상태가 남는다. 통지는 편집기 상태가 바뀐 뒤에 오므로 이 순서에
 * 영향받지 않는다. 명령 호출·undo처럼 DOM 이벤트가 없는 변경도 같은
 * 경로로 반영된다.
 *
 * listener 안에서는 조회만 한다 — 통지가 변경 처리 도중에 일어나므로
 * 편집 명령을 부르면 바깥 명령의 결과와 `onChange`가 어긋난다.
 */
export const useStaticToolbarState = (editor: EditorController) => {
  const [state, setState] = useState<FormattingToolbarState>(() =>
    computeFormattingToolbarState(editor),
  );

  const refresh = useCallback(() => {
    const next = computeFormattingToolbarState(editor);
    setState((previous) =>
      isSameStaticToolbarState(previous, next) ? previous : next,
    );
  }, [editor]);

  useEffect(() => {
    const unsubscribe = editor.subscribe(refresh);
    // 첫 렌더와 구독 등록 사이에 일어난 변경을 놓치지 않는다.
    refresh();
    return unsubscribe;
  }, [editor, refresh]);

  return { state };
};
