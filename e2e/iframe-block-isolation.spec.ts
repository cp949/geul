/**
 * iframe 블록(CUS-001~004, roadmap Issue #212) — CSP·브라우저 격리
 * 재검증(Issue #214). `DEFAULT_IFRAME_SANDBOX`(iframe-block-extension.ts)가
 * `allow-same-origin`을 제외한다는 사실이 실제로 host(top) document 접근을
 * 막는지 실제 Chromium에서 검증한다.
 *
 * **same-origin으로 구성하는 이유(실측, 01-계획.md "## 결정" 참고)**:
 * 처음엔 데모 whitelist가 이미 허용하는 cross-origin URL("example.com")로
 * 시도했으나, cross-origin 구성에서는 일반 Same-Origin Policy가 sandbox
 * 설정과 무관하게 `window.parent.document` 접근을 항상 막아
 * `allow-same-origin`을 추가해도 이 e2e가 실패하지 않았다(회귀를 못 잡는
 * 거짓 통과). `allow-same-origin` 유무가 실제로 갈리는 유일한 구성은 iframe
 * 콘텐츠가 host와 **같은 origin**일 때다.
 *
 * protocol-relative 문자열("//127.0.0.1:5173/...")로 스킴 검사를 우회하는
 * 방안도 시도했으나 `document-structure-validation.ts`의
 * `isSupportedLinkHref`(model, iframe url 전용 정적 불변식 — host 설정과
 * 무관하게 항상 적용된다)가 "//"로 시작하는 url을 구조적으로 거절해
 * 실패했다(실측, "Unsupported media URL"). 대신 명시적 `http:` scheme의
 * 절대 URL을 쓴다 — `isSupportedLinkHref`는 `http:`/`https:` 둘 다
 * 허용하지만, `resolveIframeEmbedDecision`의 기본 `allowedProtocols`가
 * `["https:"]`뿐이라 `app.tsx`의 `DEMO_IFRAME_EMBED`에
 * `allowedProtocols: ["https:", "http:"]`를 추가했다(데모 전용 설정, 기존
 * iframe e2e 4개 회귀 없음 실측 확인). hostname 화이트리스트는
 * `DemoHostOrigin` provider(`pattern: "127.0.0.1"`)가 맡는다.
 */
import { expect, test } from "@playwright/test";

import { insertFilledIframe, openDemo } from "./support/demo.js";

// playwright.config.ts의 baseURL과 app.tsx DEMO_IFRAME_EMBED의
// "DemoHostOrigin" provider(hostname "127.0.0.1") 양쪽과 일치해야 한다.
const ISOLATION_FIXTURE_PATH = "/__e2e_isolation_fixture__";
const IFRAME_SRC = `http://127.0.0.1:5173${ISOLATION_FIXTURE_PATH}`;
const FIXTURE_URL = IFRAME_SRC;

// iframe 자신이 window.parent.document 접근을 try/catch로 시도하고 성공/
// 실패를 자기 자신의 DOM(#isolation-result의 data-result 속성)에 기록한다.
// 실제 네트워크·example.com 응답 시간에 의존하지 않도록 page.route()로
// 이 fixture를 직접 서빙한다(iframe-block-load-status.spec.ts와 동일 패턴).
const ISOLATION_FIXTURE_HTML = `<!doctype html>
<html>
<body>
<div id="isolation-result" data-result="pending">pending</div>
<script>
  let result;
  try {
    const doc = window.parent.document;
    void doc.title;
    result = "accessible:" + doc.title;
  } catch (e) {
    result = "blocked:" + e.name;
  }
  const el = document.getElementById("isolation-result");
  el.textContent = result;
  el.setAttribute("data-result", result);
</script>
</body>
</html>`;

test("host와 same-origin인 iframe도 sandbox 아래에서는 host document에 접근할 수 없다", async ({
  page,
}) => {
  await page.route(FIXTURE_URL, (route) =>
    route.fulfill({ body: ISOLATION_FIXTURE_HTML, contentType: "text/html" }),
  );

  const { editable } = await openDemo(page);

  // host 쪽에 마커를 심어 iframe이 실제로 host DOM을 변형하지 못했는지도
  // 보조로 확인한다(위 window.parent.document 접근 차단의 직접 증거는
  // 아니다 — 어차피 프레임 경계 때문에 postMessage 없이는 항상 불변이라
  // allow-same-origin 유무와 무관하게 통과한다. 방어적 증거로만 둔다).
  await page.evaluate(() => {
    document.body.setAttribute("data-e2e-host-marker", "untouched");
  });

  const iframe = await insertFilledIframe(page, editable, IFRAME_SRC);
  const frameLocator = iframe.contentFrame();

  await expect(frameLocator.locator("#isolation-result")).toHaveAttribute(
    "data-result",
    "blocked:SecurityError",
  );

  await expect(page.locator("body")).toHaveAttribute(
    "data-e2e-host-marker",
    "untouched",
  );
});
