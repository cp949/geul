import { expect, test } from "@playwright/test";

const openDemo = async (page: Parameters<typeof test>[0]["page"]) => {
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

test("서식 툴바 컨테이너가 소비자 CSS 로드 순서와 무관하게 의도한 스타일을 유지한다", async ({
  page,
}) => {
  // 소비자가 우리 styles.css *뒤에* 자신의 CSS를 로드해도(흔한 번들러 순서),
  // 우리 유틸리티가 unlayered인 이상 소비자의 평범한 규칙에 매번 지지는
  // 않는다는 것을 별도 스타일시트 주입으로 확인한다.
  await page.addStyleTag({
    content: `
      [role="toolbar"] { background: rgb(17, 17, 17); box-shadow: none; }
    `,
  });
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Control+A");

  const toolbar = page.getByRole("toolbar", { name: "Formatting" });
  await expect(toolbar).toBeVisible();

  const backgroundColor = await toolbar.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );

  // 클래스 셀렉터(0,1,0)가 클래스 셀렉터(0,1,0)와 부딪히면 일반 소스 순서
  // 규칙이 적용된다 — 이 값 자체는 "항상 이긴다"를 보장하지 않는다. 이
  // 테스트가 지키는 것은 우리 값이 white(#fff)로 남아있다는 사실이며,
  // 이는 우리 유틸리티가 named layer에 있지 않다는 방증이다(named layer라면
  // 소스 순서와 무관하게 100% 패배해 rgb(17, 17, 17)이 되어야 한다).
  expect(backgroundColor).toBe("rgb(255, 255, 255)");
});

test("페이지에 동일한 --tw-shadow @property가 중복 등록돼도 box-shadow가 깨지지 않는다", async ({
  page,
}) => {
  // 소비자가 자신의 별도 Tailwind 인스턴스를 페이지에 함께 로드하면 우리
  // dist/styles.css가 실제로 등록하는 @property(--tw-shadow 등, prefix가
  // 안 붙는 내부 상태 변수)와 같은 이름이 중복 등록될 수 있다(Issue #4
  // 구현 게이트 3). 동일 syntax/initial-value로 재등록해도 box-shadow
  // 렌더링이 깨지지 않음을 확인한다.
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
  const { editable } = await openDemo(page);
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
