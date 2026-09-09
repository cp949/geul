/**
 * 현재 DOM에 렌더된 최상위/중첩 블록의 blockId를 document order(전위
 * 순회)로 뽑는다. `block-selection.spec.ts`(다중 블록 선택 이동·삭제)와
 * `table-handle.spec.ts`(표 선택 진입점, Issue #149)가 같은 조회 지식을
 * 갖고 있다가 두 번째 사용처가 생겨 여기로 추출했다(G-TST-002).
 */
import type { Locator } from "@playwright/test";

export const domBlockIds = async (
  editable: Locator,
): Promise<(string | null)[]> =>
  editable
    .locator("[data-geul-block-id]")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-geul-block-id")),
    );
