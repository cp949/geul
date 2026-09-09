/**
 * `BlockSelectionToolbar`(`block-selection-toolbar.tsx`)의 로케이터 공용
 * 헬퍼. `block-selection.spec.ts`가 인라인으로 흩어 쓰던 `role="toolbar"`
 * name과 버튼 accessible name 문자열을 여기 한 곳으로 모은다 —
 * `table-handle.spec.ts`가 표 선택 진입점(Issue #149) e2e에서 처음 이
 * 파일을 재사용한다(G-TST-002). `block-selection.spec.ts`의 기존 테스트는
 * 이 헬퍼로 바꾸지 않는다 — 그 파일을 건드리는 리팩터는 이번 범위 밖이다
 * (01-계획.md 5절).
 */
import type { Locator, Page } from "@playwright/test";

export const blockSelectionToolbar = (page: Page): Locator =>
  page.getByRole("toolbar", { name: "Block selection" });

export const deleteSelectedBlocksButton = (page: Page): Locator =>
  page.getByRole("button", { name: "Delete selected blocks" });

export const moveSelectionUpButton = (page: Page): Locator =>
  page.getByRole("button", { name: "Move selection up" });

export const moveSelectionDownButton = (page: Page): Locator =>
  page.getByRole("button", { name: "Move selection down" });

/**
 * 현재 DOM에 렌더된 최상위/중첩 블록의 blockId를 document order(전위
 * 순회)로 뽑는다. `block-selection.spec.ts`의 `domBlockIds`와 같은 조회지만,
 * 그 파일을 리팩터하지 않는다(01-계획.md 5절) — 이동/삭제 결과를 검증하는
 * `table-handle.spec.ts`의 새 e2e가 이 사본을 대신 쓴다.
 */
export const blockOrder = async (
  editable: Locator,
): Promise<(string | null)[]> =>
  editable
    .locator("[data-geul-block-id]")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-geul-block-id")),
    );
