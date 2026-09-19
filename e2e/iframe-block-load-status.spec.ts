/**
 * iframe 블록(CUS-001~004, roadmap Issue #212) — 로딩 타임아웃 휴리스틱
 * UI(RD-004 완료 조건 3). `packages/react/test/iframe-load-status.test.tsx`가
 * 가짜 타이머로 이미 결정적으로 고정한 로직(5000ms 안에 `load`가 없으면
 * 표시, 뒤늦은 load로 정정, src 교체 시 재판정)을 다시 검증하지 않는다 —
 * 여기서는 실제 Chromium 네트워크·타이머로 그 UI가 정말 나타나고 사라지는지
 * 두 가지 경로(정상 로드/미로드)만 확인한다. `page.route()`로 네트워크를
 * 대체해 실제 인터넷 접속이나 example.com의 실제 응답 시간에 의존하지
 * 않는다.
 */
import { type Route, expect, test } from "@playwright/test";

import { insertFilledIframe, openDemo } from "./support/demo.js";

const IFRAME_LOAD_TIMEOUT_MS = 5000;
// 실제 타이머가 걸리는 벽시계 시간이라 정확히 5000ms에 맞춰 확인하면
// 타이밍 경합이 생긴다 — 여유를 둔다.
const WAIT_PAST_TIMEOUT_MS = IFRAME_LOAD_TIMEOUT_MS + 300;

const TIMEOUT_LABEL =
  "This may have failed to load, or the site may have blocked embedding.";

test("정상 로드하면 5초가 지나도 타임아웃 문구가 뜨지 않는다", async ({
  page,
}) => {
  const url = "https://example.com/instant-load";
  await page.route(url, (route) =>
    route.fulfill({
      body: "<html><body>ok</body></html>",
      contentType: "text/html",
    }),
  );

  const { editable } = await openDemo(page);
  const iframe = await insertFilledIframe(page, editable, url);
  const wrapper = editable
    .locator("[data-geul-block-id]")
    .filter({ has: page.locator("iframe") });

  await expect(iframe).toHaveAttribute("src", url);
  await page.waitForTimeout(WAIT_PAST_TIMEOUT_MS);

  await expect(wrapper).not.toHaveAttribute("data-geul-iframe-load-status");
});

test("load가 발생하지 않으면 5초 뒤 타임아웃 문구가 뜨고, 뒤늦게 로드에 성공하면 사라진다", async ({
  page,
}) => {
  const url = "https://example.com/never-loads";
  // route를 fulfill/abort/continue 어느 쪽도 즉시 호출하지 않고 Promise로
  // 보류한다 — 요청이 영원히 pending이라 iframe의 `load` 이벤트가 결코
  // 발생하지 않는다(실제 네트워크 타임아웃을 기다리는 대신 결정적으로
  // 재현). let 변수에 콜백 안에서 대입하는 방식은 TS가 이후 참조를
  // `never`로 좁혀버려(콜백 경계를 넘는 재대입을 narrowing에 반영하지
  // 못함) Promise 기반으로 캡처한다.
  let resolvePendingRoute: (route: Route) => void;
  const pendingRoutePromise = new Promise<Route>((resolve) => {
    resolvePendingRoute = resolve;
  });
  await page.route(url, (route) => resolvePendingRoute(route));

  const { editable } = await openDemo(page);
  await insertFilledIframe(page, editable, url);
  const wrapper = editable
    .locator("[data-geul-block-id]")
    .filter({ has: page.locator("iframe") });

  await page.waitForTimeout(WAIT_PAST_TIMEOUT_MS);

  await expect(wrapper).toHaveAttribute(
    "data-geul-iframe-load-status",
    "timeout",
  );
  await expect(wrapper).toHaveAttribute(
    "data-geul-iframe-load-status-label",
    TIMEOUT_LABEL,
  );

  // 보류해 둔 요청을 이제 완료시켜 뒤늦은 load를 재현한다(오탐 정정).
  const pendingRoute = await pendingRoutePromise;
  await pendingRoute.fulfill({
    body: "<html><body>ok</body></html>",
    contentType: "text/html",
  });

  await expect(wrapper).not.toHaveAttribute("data-geul-iframe-load-status");
});
