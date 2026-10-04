/**
 * 코드블록 언어 popover와 more 메뉴가 열린 채 스크롤·휠·리사이즈를 겪어도
 * 트리거를 한 박자 늦지 않고 따라가는지 실제 브라우저로 고정한다(Issue #249,
 * G-UI-001).
 *
 * 결함: 두 메뉴의 앵커를 툴바 좌표 상태를 deps로 둔 layout effect에서 쟀다.
 * 툴바 DOM 위치는 그 뒤에 적용돼 트리거 rect를 이동 전 위치로 읽었다. 스크롤이
 * 멈춘 뒤에도 마지막 증분만큼 간격이 남았다. jsdom은 레이아웃이 없어 이 순서를
 * 재현하지 못한다.
 *
 * 판정 기준은 gapY다. popover 상단에서 트리거 하단을 뺀 값이고 0이어야 한다.
 * 동작 뒤 두 단계로 판정한다(G-TST-001).
 * - 직후: 트리거가 움직인 것을 `expect.poll`로 관측한 뒤 `requestAnimationFrame`
 *   2회 뒤 단발로 잰다. 이 시점에 이미 0이어야 한다. 한 박자 늦게 따라가는
 *   결함을 여기서 잡는다.
 * - 이후: gapY가 0으로 유지·수렴하는지 `expect.poll`로 기다린다. 영구 어긋남은
 *   timeout까지 수렴하지 못해 실패한다.
 * 이슈 완료 기준 "스크롤 직후와 450ms 뒤"는 이 두 단계로 읽는다. 고정 대기는
 * 쓰지 않는다.
 *
 * 열린 메뉴는 스크롤 중에도 닫히지 않아야 하고(측정이 메뉴를 못 찾으면 실패),
 * 뷰포트 안에 남아야 한다(PIT-0011).
 */
import { expect, type Page, test } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";

/** gapY 허용 오차(px). */
const TOLERANCE = 0.5;

/** 시작할 때 코드블록 상단의 viewport y(px). */
const BLOCK_TOP_PX = 500;

/** 트리거 이동 관측과 gapY 수렴을 기다리는 최대 시간(ms). */
const POLL_TIMEOUT_MS = 3000;

type MenuCase = {
  title: string;
  triggerName: string;
  menuSelector: string;
};

const MENU_CASES: readonly MenuCase[] = [
  {
    title: "언어 popover",
    triggerName: "Code language",
    menuSelector: ".geul-code-block-language-popover",
  },
  {
    title: "more 메뉴",
    triggerName: "More code block options",
    menuSelector: ".geul-code-block-toolbar__more-menu",
  },
];

type Sample = {
  gapY: number;
  triggerX: number;
  triggerY: number;
  /** 메뉴 오른쪽 끝에서 트리거 오른쪽 끝을 뺀 값. topRight 메뉴는 0이다. */
  menuRightGapX: number;
  inViewport: boolean;
};

/**
 * 한 시점의 gapY, 트리거 상단 y, 메뉴가 뷰포트 안인지를 읽는다. 메뉴나 트리거가
 * 없으면 던진다. 스크롤 중 메뉴가 닫힌 경우를 이 오류가 잡는다.
 */
const readSample = (
  page: Page,
  triggerName: string,
  menuSelector: string,
): Promise<Sample> =>
  page.evaluate(
    ({ name, selector }) => {
      const trigger = document.querySelector(`[aria-label="${name}"]`);
      const menu = document.querySelector(selector);
      if (trigger === null) throw new Error(`트리거 없음: ${name}`);
      if (menu === null) throw new Error(`메뉴 없음: ${selector}`);
      // IconButton은 버튼 자신, 언어 트리거는 shell div 안 버튼이다. 둘 다 버튼
      // 경계를 잰다.
      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const view = trigger.ownerDocument.defaultView;
      if (view === null) throw new Error("window 없음");
      return {
        gapY: menuRect.top - triggerRect.bottom,
        triggerX: triggerRect.left,
        triggerY: triggerRect.top,
        menuRightGapX: menuRect.right - triggerRect.right,
        inViewport:
          menuRect.left >= 0 &&
          menuRect.top >= 0 &&
          menuRect.right <= view.innerWidth &&
          menuRect.bottom <= view.innerHeight,
      };
    },
    { name: triggerName, selector: menuSelector },
  );

const nextFrames = (page: Page, count: number) =>
  page.evaluate(
    (frames) =>
      new Promise<void>((resolve) => {
        const step = (left: number) =>
          left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1));
        step(frames);
      }),
    count,
  );

/**
 * 동작 뒤 gapY가 0인지 두 단계로 단언한다. `previousTriggerY`를 주면 먼저 트리거가
 * 그 위치에서 움직인 것을 기다린다. 안 움직이면 단언이 공허하다. 마지막 시점의
 * 트리거 상단 y를 돌려준다.
 */
const expectGapZero = async (
  page: Page,
  menu: MenuCase,
  label: string,
  previousTriggerY?: number,
): Promise<number> => {
  const read = () => readSample(page, menu.triggerName, menu.menuSelector);

  if (previousTriggerY !== undefined) {
    await expect
      .poll(async () => (await read()).triggerY, {
        message: `${label}: 트리거가 움직여야 한다`,
        timeout: POLL_TIMEOUT_MS,
      })
      .not.toBe(previousTriggerY);
  }

  // 직후. 트리거가 이미 움직인 뒤라 메뉴도 같은 커밋에서 따라가 있어야 한다.
  await nextFrames(page, 2);
  const early = await read();
  expect(Math.abs(early.gapY), `${label}: rAF 2회 뒤 gapY`).toBeLessThanOrEqual(
    TOLERANCE,
  );
  expect(early.inViewport, `${label}: rAF 2회 뒤 뷰포트 안`).toBe(true);

  // 이후. 0으로 유지·수렴하는지 기다린다.
  await expect
    .poll(
      async () => {
        const sample = await read();
        return Math.abs(sample.gapY) <= TOLERANCE && sample.inViewport;
      },
      {
        message: `${label}: gapY 수렴과 뷰포트 안`,
        timeout: POLL_TIMEOUT_MS,
      },
    )
    .toBe(true);
  return (await read()).triggerY;
};

/** 안쪽 스크롤 컨테이너의 scrollTop을 읽는다. */
const readAreaScrollTop = (page: Page) =>
  page.evaluate(() => {
    const area = document.querySelector<HTMLElement>('[class*="scrollArea"]');
    if (area === null) throw new Error("scrollArea 없음");
    return area.scrollTop;
  });

const setAreaScrollTop = (page: Page, top: number) =>
  page.evaluate((target) => {
    const area = document.querySelector<HTMLElement>('[class*="scrollArea"]');
    if (area === null) throw new Error("scrollArea 없음");
    area.scrollTop = target;
  }, top);

// 시작 뷰포트를 키워 popover가 아래쪽 viewport clamp에 걸리지 않게 한다. 마지막
// 단계에서 900x700으로 줄인다.
test.use({ viewport: { width: 1280, height: 1000 } });

for (const menu of MENU_CASES) {
  test(`${menu.title}가 열린 채 스크롤·휠·리사이즈를 겪어도 트리거와의 간격 gapY가 0이다`, async ({
    page,
  }) => {
    await openShowcasePage(page, "/examples/static-toolbar");
    await page.getByRole("button", { name: "샘플 불러오기" }).click();
    const editor = page.getByRole("textbox", { name: "Editor" });
    const codeBlock = editor.locator("pre").first();

    // 코드블록을 뷰포트 위쪽 끝에 두면 툴바가 viewport clamp에 걸려 스크롤을
    // 따라 움직이지 않는다. 휠 +400을 견디도록 아래쪽 여유를 두고 놓는다.
    await codeBlock.scrollIntoViewIfNeeded();
    await page.evaluate((targetTop) => {
      const pre = document.querySelector("pre");
      if (pre === null) throw new Error("코드블록 없음");
      window.scrollBy(0, pre.getBoundingClientRect().top - targetTop);
    }, BLOCK_TOP_PX);
    await codeBlock.hover();
    const trigger = page.getByRole("button", { name: menu.triggerName });
    await trigger.click();
    await expect(page.locator(menu.menuSelector)).toHaveCount(1);

    let triggerY = await expectGapZero(page, menu, "열림");

    // 안쪽 스크롤. 시작 위치를 기억해 복귀한다.
    const startTop = await readAreaScrollTop(page);
    await setAreaScrollTop(page, startTop + 60);
    triggerY = await expectGapZero(page, menu, "안쪽 +60", triggerY);
    await setAreaScrollTop(page, startTop + 180);
    triggerY = await expectGapZero(page, menu, "안쪽 +180", triggerY);
    await setAreaScrollTop(page, startTop);
    triggerY = await expectGapZero(page, menu, "안쪽 복귀", triggerY);

    // 창 스크롤.
    await page.evaluate(() => window.scrollBy(0, 120));
    triggerY = await expectGapZero(page, menu, "창 +120", triggerY);
    await page.evaluate(() => window.scrollTo(0, 0));
    triggerY = await expectGapZero(page, menu, "창 복귀", triggerY);

    // 휠. 포인터는 코드블록 왼쪽 끝에 둔다. 메뉴는 오른쪽 끝에 붙어 있어 메뉴가
    // 포인터 아래로 오지 않는다. 메뉴 위에서 돌리면 메뉴 목록이 스크롤된다.
    const box = await codeBlock.boundingBox();
    if (box === null) throw new Error("코드블록 위치를 얻지 못했다");
    await page.mouse.move(box.x + 20, box.y + box.height / 2);
    for (let step = 1; step <= 4; step += 1) {
      await page.mouse.wheel(0, 100);
      triggerY = await expectGapZero(
        page,
        menu,
        `휠 +100 (${step}/4)`,
        triggerY,
      );
    }
    await page.mouse.wheel(0, -60);
    await expectGapZero(page, menu, "휠 -60", triggerY);

    // 리사이즈. 트리거가 움직이는지는 보장하지 않는다.
    await page.setViewportSize({ width: 900, height: 700 });
    await expectGapZero(page, menu, "리사이즈 900x700");

    // 스크롤과 리사이즈를 겪어도 메뉴가 닫히지 않았다.
    await expect(page.locator(menu.menuSelector)).toHaveCount(1);
  });

  // 툴바 폭이 React 렌더 없이 바뀌면(형제 노드 삽입) topRight 툴바는 왼쪽 끝이
  // 움직여 트리거가 이동한다. 툴바의 ResizeObserver가 렌더를 강제해야 메뉴가
  // 따라간다. 뷰포트 오른쪽 clamp에 걸리면 clamp가 우연히 렌더를 일으켜 이
  // 보강 없이도 통과하므로, 넓은 뷰포트에서 clamp 없이 검증한다.
  test(`${menu.title}가 열린 채 툴바 폭이 렌더 없이 늘어나도 트리거를 따라간다`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openShowcasePage(page, "/examples/static-toolbar");
    await page.getByRole("button", { name: "샘플 불러오기" }).click();
    const editor = page.getByRole("textbox", { name: "Editor" });
    const codeBlock = editor.locator("pre").first();
    await codeBlock.scrollIntoViewIfNeeded();
    await codeBlock.hover();
    const trigger = page.getByRole("button", { name: menu.triggerName });
    await trigger.click();
    await expect(page.locator(menu.menuSelector)).toHaveCount(1);

    const triggerBefore = await readSample(
      page,
      menu.triggerName,
      menu.menuSelector,
    );
    await page.evaluate(() => {
      const container = document.querySelector(".geul-code-block-toolbar");
      if (container === null) throw new Error("툴바 없음");
      const span = document.createElement("span");
      span.className = "geul-code-block-toolbar__error";
      span.textContent =
        "폭을 크게 늘리기 위한 매우 긴 에러 메시지 텍스트 자리 표시자 문자열입니다";
      container.appendChild(span);
    });

    // 전제: 주입한 span이 트리거를 화면상 옮겼다. 안 옮기면 단언이 공허하다.
    await expect
      .poll(
        async () =>
          (await readSample(page, menu.triggerName, menu.menuSelector))
            .triggerX,
        { timeout: POLL_TIMEOUT_MS },
      )
      .not.toBe(triggerBefore.triggerX);
    await expect
      .poll(
        async () => {
          const sample = await readSample(
            page,
            menu.triggerName,
            menu.menuSelector,
          );
          return Math.abs(sample.menuRightGapX);
        },
        { timeout: POLL_TIMEOUT_MS },
      )
      .toBeLessThanOrEqual(TOLERANCE);
  });
}
