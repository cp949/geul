/**
 * StaticToolbar 블록 타입 메뉴가 열린 채 스크롤해도 트리거 아래에 붙어
 * 있는지 확인한다(RD-003 사후 리뷰, G-UI-001).
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007 "레이아웃 기하"): 메뉴는 열릴
 * 때의 viewport 좌표에 fixed로 그려지고, 트리거는 스크롤 컨테이너 안에서
 * 움직인다. jsdom은 실제 스크롤과 레이아웃을 만들지 못한다. 재측정 호출
 * 배선은 단위 테스트(static-toolbar-block-type-menu.test.tsx)가 소유한다.
 */
import { test } from "@playwright/test";

import { expectOverlayFollowsAnchor } from "./support/anchor-gap.js";
import { openShowcasePage } from "./support/showcase.js";

test("메뉴가 열린 채 스크롤해도 메뉴가 트리거 아래에 붙어 있다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editable = page.getByRole("textbox", { name: "Editor" });
  await editable.locator('[data-geul-block-id$="block-3"]').click();
  const trigger = page.getByRole("button", { name: "Block type" });
  const menu = page.getByRole("listbox", { name: "Block type" });
  await trigger.click();

  // 툴바가 스크롤 영역 안에서 위로 밀리도록 스크롤 가능한 조상을 모두 민다.
  await expectOverlayFollowsAnchor(page, trigger, menu);
});
