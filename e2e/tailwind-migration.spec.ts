import { expect, test } from "@playwright/test";

import { openDemo } from "./support/demo.js";

test("서식 툴바 버튼이 데모 앱의 전역 button 리셋을 이기고 의도한 크기로 렌더링된다", async ({
  page,
}) => {
  // apps/demo/src/app.css는 layer 없는(unlayered) 전역 `button { ... }` 리셋을
  // 이미 갖고 있다(border-radius 0.45rem, padding 0.65rem 0.85rem 등). 우리
  // styles.scss(SCSS 전환, 아키텍처 리뷰 03.html)가 실수로 @layer 안에
  // 감싸이면 이 소비자 리셋에 항상 패배해 아래 값이 데모 쪽 값으로 바뀐다
  // (원래 Issue #4 구현 게이트 2 — SCSS는 아무도 @layer를 안 쓰면 애초에
  // 안 생기지만, 이 회귀 감지 자체는 전처리기와 무관하게 유효하다).
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Control+A");

  const boldButton = page.getByRole("button", { name: "Bold" });
  await expect(boldButton).toBeVisible();

  const style = await boldButton.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      borderRadius: computed.borderRadius,
      borderWidth: computed.borderWidth,
      paddingBlock: computed.paddingTop,
      paddingInline: computed.paddingLeft,
      minWidth: computed.minWidth,
      backgroundColor: computed.backgroundColor,
    };
  });

  expect(style.borderRadius).toBe("4px");
  expect(style.borderWidth).toBe("0px");
  expect(style.paddingBlock).toBe("4px");
  expect(style.paddingInline).toBe("6px");
  expect(style.minWidth).toBe("28px");
  expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
});

test("소비자 CSS가 styles.css 뒤에 로드되면 동일 명시도에서 소비자 오버라이드가 이긴다", async ({
  page,
}) => {
  // 소비자가 우리 styles.css *뒤에* 자신의 CSS를 로드하면(흔한 번들러 순서)
  // 동일 명시도(0,1,0) 규칙은 일반 소스 순서에 따라 소비자가 이겨야 한다 —
  // 소비자가 평범한 CSS로 우리 UI를 오버라이드할 수 있다는 계약이다.
  // 주의: named layer 회귀는 이 시나리오로 구분할 수 없다(layered여도
  // 소비자가 이긴다). layer 회귀 감지는 "먼저 로드된 소비자 리셋을
  // 이긴다" 테스트(위)와 style-build.test.ts의 @layer 부재 검증이
  // 담당한다.
  const { editable } = await openDemo(page);
  await page.addStyleTag({
    content: `
      [role="toolbar"] { background: rgb(17, 17, 17); box-shadow: none; }
    `,
  });
  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Control+A");

  const toolbar = page.getByRole("toolbar", { name: "Formatting" });
  await expect(toolbar).toBeVisible();

  const backgroundColor = await toolbar.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );

  expect(backgroundColor).toBe("rgb(17, 17, 17)");
});

test("블록 메뉴 구분선이 0폭으로 붕괴하지 않고 메뉴 폭을 채운다 @core", async ({
  page,
}) => {
  // 전역 리셋을 소비자 문서에 강제하지 않으므로(styles.scss는 .geul-* 클래스
  // 스코프 안에서만 규칙을 낸다) hr에는 UA 스타일 margin-inline: auto가
  // 남는다. flex column 컨테이너에서 cross-axis(가로) auto margin은
  // stretch를 무효화해 hr이 콘텐츠 폭(0)으로 붕괴한다 —
  // .geul-block-menu__divider가 margin-inline: 0을 명시해 stretch가
  // 적용되게 막는다.
  //
  // @core: 이 파일의 @core 태그는 원래 "--tw-shadow @property 중복 등록"
  // 테스트(Issue #89 재판정)에 있었다. 그 테스트는 SCSS 전환으로 삭제됐고
  // (아래 주석), ADR 0007의 예외 규칙("삭제가 태그 붙은 테스트를 지우는
  // 경우는 자격 있는 형제 테스트로 태그를 옮긴다")에 따라 이 테스트로
  // 옮겼다 — UA 기본 스타일(hr margin-inline: auto)과 flexbox auto-margin
  // stretch 상호작용은 엔진마다 처리가 갈릴 수 있는 시나리오다.
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("Hello R1");

  await editable.locator("p").first().hover();
  await page.getByRole("button", { name: "Drag to reorder" }).click();

  const menu = page.getByRole("menu", { name: "Block menu" });
  await expect(menu).toBeVisible();

  // RD-003 DELTA-02가 색상·정렬 섹션 앞에 구분선을 하나 더 추가해 이제
  // 블록 메뉴 안에 hr이 2개다 — 같은 .geul-block-menu__divider 클래스를
  // 공유하는 동형 요소라 첫 번째만 재도 이 규칙(margin-inline: 0)이
  // 적용되는지는 동일하게 증명된다.
  const separator = menu.locator("hr").first();
  const width = await separator.evaluate(
    (element) => element.getBoundingClientRect().width,
  );

  // 메뉴 width: 10rem(160px)에서 border 2px + padding 8px(0.25rem × 2)를
  // 뺀 콘텐츠 폭 150px.
  expect(width).toBe(150);
});

// 이전에 여기 있던 "--tw-shadow @property 중복 등록" 테스트(Issue #4 구현
// 게이트 3)는 Tailwind v4 고유의 전역 @property 셰도우 체인 메커니즘을
// 검증했다. styles.scss는 box-shadow를 리터럴 값으로만 쓰고 CSS
// @property를 전혀 등록하지 않으므로(SCSS 전환, 아키텍처 리뷰 03.html)
// 이 충돌 시나리오 자체가 재현 불가능해졌다 — 삭제가 맞다, 다른 계층으로
// 옮길 대상이 없다.
