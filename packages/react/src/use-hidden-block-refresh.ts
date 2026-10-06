import type { EditorController } from "@cp949/geul-core";
import { useEffect, useState } from "react";

import { findElementByAttribute } from "./find-by-attribute.js";
import { isHiddenBlockElement } from "./hidden-block.js";

/**
 * `blockId` 블록이 접힘에 가려지거나 다시 드러날 때 호출 컴포넌트를 다시
 * 렌더한다. 포인터 이동·selectionchange·keyup 없이도 hover 블록이 접힐 수
 * 있다(undo, 외부 command). 렌더가 앵커를 새로 읽어 숨은 블록을 거른다.
 *
 * 문서 변경 때마다 렌더하지 않는다. 숨김 여부가 바뀔 때만 렌더해 hover 중
 * 타이핑마다 레이아웃을 읽지 않게 한다. 접힘은 자식 DOM을 다시 그려 표식
 * 속성 변화만으로는 알 수 없다(Issue #280).
 */
export const useHiddenBlockRefresh = (
  editor: EditorController,
  element: HTMLElement | null,
  blockId: string | null,
): void => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (blockId === null || element === null) return;
    const readHidden = () => {
      const block = findElementByAttribute(
        element,
        null,
        "data-geul-block-id",
        blockId,
      );
      return block !== null && isHiddenBlockElement(block);
    };
    let wasHidden = readHidden();
    return editor.subscribe(() => {
      const hidden = readHidden();
      if (hidden === wasHidden) return;
      wasHidden = hidden;
      setTick((tick) => tick + 1);
    });
  }, [editor, element, blockId]);
};

/**
 * `selector`에 걸린 요소 중 보이는 블록의 목록이 바뀔 때 호출 컴포넌트를 다시
 * 렌더한다. 인스턴스 전체를 매 렌더 DOM에서 모으는 오버레이(caption)용이다.
 * 단일 hover 블록을 보는 `useHiddenBlockRefresh`의 다중 블록판이다(Issue #288).
 *
 * 숨김·펼침·삭제·추가가 모두 "보이는 목록의 변화"라 한 경로로 잡힌다.
 * 목록은 문서 순서의 blockId 열이라 순서가 바뀌어도 렌더한다. 문서 변경마다
 * 렌더하지 않는다. 목록이 그대로인 변경(다른 블록의 타이핑)은 렌더하지 않는다.
 * 레이아웃을 읽지 않는다. `closest`·`getAttribute`만 쓴다.
 *
 * `selector`는 호출부의 모듈 스코프 상수로 넘긴다. blockId는 매칭 요소 자신
 * 또는 가장 가까운 조상의 `data-geul-block-id`에서 읽는다.
 */
export const useHiddenBlocksRefresh = (
  editor: EditorController,
  element: HTMLElement | null,
  selector: string,
): void => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (element === null) return;
    const readVisibleBlockIds = () => {
      const ids: string[] = [];
      for (const match of element.querySelectorAll(selector)) {
        if (isHiddenBlockElement(match)) continue;
        const blockId = match
          .closest("[data-geul-block-id]")
          ?.getAttribute("data-geul-block-id");
        if (blockId !== null && blockId !== undefined) ids.push(blockId);
      }
      // id는 임의 문자열이라 구분자 충돌 없이 비교하려면 직렬화한다.
      return JSON.stringify(ids);
    };
    let previous = readVisibleBlockIds();
    return editor.subscribe(() => {
      const next = readVisibleBlockIds();
      if (next === previous) return;
      previous = next;
      setTick((tick) => tick + 1);
    });
  }, [editor, element, selector]);
};
