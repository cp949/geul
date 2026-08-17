import { expect, type Page, test } from "@playwright/test";

const openDemo = async (page: Page) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Editor" });
  const editable = editor.locator('[contenteditable="true"]');
  await expect(editable).toBeVisible();
  return { editor, editable };
};

test("서식 툴바 버튼이 데모 앱의 전역 button 리셋을 이기고 의도한 크기로 렌더링된다", async ({
  page,
}) => {
  // apps/demo/src/app.css는 layer 없는(unlayered) 전역 `button { ... }` 리셋을
  // 이미 갖고 있다(border-radius 0.45rem, padding 0.65rem 0.85rem 등). 우리
  // Tailwind 유틸리티가 실수로 @layer utilities에 다시 감싸이면 이 소비자
  // 리셋에 항상 패배해 아래 값이 데모 쪽 값으로 바뀐다(Issue #4 구현 게이트 2).
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
      // Tailwind의 border-0은 border-style을 "none"이 아닌 공유
      // --tw-border-style(기본값 solid)로 둔 채 border-width만 0으로
      // 만든다 — 0 너비 테두리는 style과 무관하게 보이지 않으므로 실제
      // 렌더링을 좌우하는 건 width다.
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
  // 이긴다" 테스트(위)와 tailwind-build.test.ts의 @layer 부재 검증이
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

test("블록 메뉴 구분선이 0폭으로 붕괴하지 않고 메뉴 폭을 채운다", async ({
  page,
}) => {
  // preflight를 생략했으므로 hr에는 UA 스타일 margin-inline: auto가 남는다.
  // flex column 컨테이너에서 cross-axis(가로) auto margin은 stretch를
  // 무효화해 hr이 콘텐츠 폭(0)으로 붕괴한다 — 마이그레이션 전 CSS는
  // `margin: 0.25rem 0`으로 좌우 margin 0을 명시해 stretch가 적용됐다.
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("Hello R1");

  await editable.locator("p").first().hover();
  await page.getByRole("button", { name: "Drag to reorder" }).click();

  const menu = page.getByRole("menu", { name: "Block menu" });
  await expect(menu).toBeVisible();

  const separator = menu.locator("hr");
  const width = await separator.evaluate(
    (element) => element.getBoundingClientRect().width,
  );

  // 메뉴 w-40(160px)에서 border 2px + p-1 8px를 뺀 콘텐츠 폭 150px.
  expect(width).toBe(150);
});

test("페이지에 동일한 --tw-shadow @property가 중복 등록돼도 box-shadow가 깨지지 않는다", async ({
  page,
}) => {
  // 소비자가 자신의 별도 Tailwind 인스턴스를 페이지에 함께 로드하면 우리
  // dist/styles.css가 실제로 등록하는 @property(--tw-shadow 등, prefix가
  // 안 붙는 내부 상태 변수)와 같은 이름이 중복 등록될 수 있다(Issue #4
  // 구현 게이트 3). 동일 syntax/initial-value로 재등록해도 box-shadow
  // 렌더링이 깨지지 않음을 확인한다 — Tailwind v4의 모든 릴리스가 이
  // 변수들에 같은 initial-value(0 0 #0000)를 쓰므로 이것이 현실적인
  // 공존 시나리오다.
  //
  // 알려진 한계(실측): shadow 유틸리티는 --tw-shadow만 요소 로컬로
  // 설정하고 체인의 나머지(--tw-ring-shadow 등)는 @property
  // initial-value에 의존하므로, 제3자가 그 변수를 *다른* initial-value로
  // 재등록하면(@property는 문서 전역 last-registration-wins) 그 값이
  // 체인에 주입된다. --tw-* 네임스페이스에 대한 적대적 등록은 어떤
  // 라이브러리도 방어할 수 없는 침해로 보고 수용한다.
  const { editable } = await openDemo(page);
  await page.addStyleTag({
    content: `
      @property --tw-shadow {
        syntax: "*";
        inherits: false;
        initial-value: 0 0 #0000;
      }
      @property --tw-shadow-color {
        syntax: "*";
        inherits: false;
      }
    `,
  });
  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Control+A");

  const toolbar = page.getByRole("toolbar", { name: "Formatting" });
  await expect(toolbar).toBeVisible();

  const boxShadow = await toolbar.evaluate(
    (element) => getComputedStyle(element).boxShadow,
  );

  expect(boxShadow).not.toBe("none");
  expect(boxShadow).toContain("rgba(0, 0, 0, 0.15)");
});
