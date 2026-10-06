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
