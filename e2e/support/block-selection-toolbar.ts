/**
 * `BlockSelectionToolbar`(`block-selection-toolbar.tsx`)의 로케이터 공용
 * 헬퍼. `block-selection.spec.ts`가 인라인으로 흩어 쓰던 `role="toolbar"`
 * name과 버튼 accessible name 문자열을 여기 한 곳으로 모은다 —
 * `table-handle.spec.ts`가 표 선택 진입점(Issue #149) e2e에서 처음 이
 * 파일을 재사용한다(G-TST-002). 블록 순서 조회(`domBlockIds`)는 이 파일이
 * 아니라 `./support/block-order.js`가 소유한다 — 툴바 로케이터와 성격이
 * 다르다.
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
