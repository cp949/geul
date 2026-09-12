/**
 * Media resize handle 포인터 드래그 조립 지식(`G-TST-002` — 두 번째
 * 스펙 파일이 필요로 하는 시점에 공용화). `media-resize-handle.spec.ts`(demo,
 * RD-001 DELTA-03)가 원 소유자였고,
 * `showcase-composite-media-resize.spec.ts`(showcase 미리보기 반영 검증)가
 * 두 번째 소비자다.
 */
import type { Locator, Page } from "@playwright/test";

export type Point = { x: number; y: number };

/**
 * 핸들 중심으로 마우스를 옮기고 누른다 — 이후 `dragTo`가 이 중심 좌표
 * 기준으로 상대 이동한다(핸들 박스의 좌측 상단이 아니라 실제로 누른
 * 지점에서부터 움직여야 포인터 이동량 dx가 정확하다).
 */
export const beginDrag = async (
  page: Page,
  handle: Locator,
): Promise<Point> => {
  const box = await handle.boundingBox();
  if (box === null) throw new Error("핸들 bounding box 없음");
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  return center;
};

/** `beginDrag`가 누른 지점에서 x축으로 dx만큼(y 고정) 옮긴다. */
export const dragTo = (page: Page, start: Point, dx: number): Promise<void> =>
  page.mouse.move(start.x + dx, start.y, { steps: 5 });
