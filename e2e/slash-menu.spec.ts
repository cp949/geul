/**
 * Slash menu의 검색·키보드·블록 추가 배선과 fixed overlay viewport clamp를
 * 실제 Chromium event 순서로 검증한다. 방향키로 캐럿이 `/` 블록을 벗어나면
 * 닫히는 계약도 여기서 고정한다(Issue #229).
 */
import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  CLAMP_BOUNDARY_MIN_MARGIN_PX,
  expectOverlayWithinViewport,
} from "./support/clamp.js";
import { expectCaretMenuFollowsCaret } from "./support/caret-gap.js";
import { openDemo } from "./support/demo.js";
import {
  lastKeydownPrevented,
  recordKeydownPrevented,
} from "./support/keydown-prevented.js";
import {
  LEAVE_KEYS,
  MAX_LEAVE_ATTEMPTS,
  readCaretBlockText,
  readEnterState,
  recordEnterState,
} from "./support/trigger-leave-block.js";
import { yieldFrame } from "./support/yield-frame.js";

test("'/' 입력에 검색 가능한 메뉴를 열고 항목을 고르면 블록을 변환한다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("/head");

  await expect(menu).toBeVisible();
  // "head"는 label 부분 일치로 heading 1-6을 매치한다.
  await expect(page.getByRole("option")).toHaveCount(6);

  await page.getByRole("option", { name: /^Heading 1/ }).click();

  await expect(menu).not.toBeVisible();
  await expect(editable.locator("h1")).toHaveText("");
  // heading 변환으로 문서가 heading으로 끝나면 trailing paragraph(UI-010)가
  // 자동 추가된다 — 남는 문단은 그 빈 문단 하나다.
  await expect(editable.locator("p")).toHaveCount(1);
  await expect(editable.locator("p")).toHaveText("");
});

test("슬래시 메뉴 선택을 undo 1회로 복원한다", async ({ page }) => {
  const { editable } = await openDemo(page);

  await editable.click();
  await page.keyboard.type("/h2");
  await page.getByRole("option", { name: /^Heading 2/ }).click();
  await expect(editable.locator("h2")).toHaveCount(1);

  await page.keyboard.press("Control+z");

  await expect(editable.locator("h2")).toHaveCount(0);
  await expect(editable.locator("p")).toHaveText("/h2");
});

test("키보드만으로 메뉴 항목을 이동하고 선택한다", async ({ page }) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("/");
  await expect(menu).toBeVisible();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(menu).not.toBeVisible();
  await expect(editable.locator("h1")).toHaveCount(1);
});

test("aria-activedescendant가 강조된 옵션을 가리키고 ArrowDown으로 갱신된다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("/head");
  await expect(menu).toBeVisible();

  const firstOption = page.getByRole("option", { name: /^Heading 1/ });
  await expect(editable).toHaveAttribute(
    "aria-activedescendant",
    await firstOption.evaluate((element) => element.id),
  );

  await page.keyboard.press("ArrowDown");
  const secondOption = page.getByRole("option").nth(1);
  await expect(editable).toHaveAttribute(
    "aria-activedescendant",
    await secondOption.evaluate((element) => element.id),
  );

  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(editable).not.toHaveAttribute("aria-activedescendant", /.+/);
});

test("글머리 목록 항목을 클릭하면 실제 목록으로 바꾸고 편집기 초점을 복구한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("/bullet");
  await expect(menu).toBeVisible();

  await menu.getByRole("option", { name: /Bulleted List/ }).click();

  await expect(menu).toHaveCount(0);
  const listItem = editable.locator("[data-geul-list-marker]").first();
  await expect(listItem).toHaveAttribute("data-geul-list-marker", "•");
  await expect(
    listItem.locator("[data-geul-bullet-list-item]"),
  ).toHaveAttribute("data-placeholder", "List item");
  await expect(editable).toBeFocused();

  await page.keyboard.type("첫 목록");
  await expect(listItem).toContainText("첫 목록");
});

test("체크 목록 항목을 Slash로 만들고 마커 클릭으로 checked를 토글한다 (RD-001 DELTA-06)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("/check");
  await expect(menu).toBeVisible();

  await menu.getByRole("option", { name: /Check List/ }).click();

  await expect(menu).toHaveCount(0);
  const listItem = editable.locator("[data-geul-check-list-item]").first();
  await expect(editable).toBeFocused();

  await page.keyboard.type("할 일");
  await expect(listItem).toContainText("할 일");

  const marker = listItem.locator("[data-geul-check-marker]");
  await expect(marker).toHaveAttribute("data-geul-checked", "false");
  await marker.click();
  await expect(marker).toHaveAttribute("data-geul-checked", "true");
});

test("토글 목록 항목을 Slash로 만들고 마커 클릭으로 collapsed를 토글한다 (RD-004 DELTA-04)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("/toggle");
  await expect(menu).toBeVisible();

  await menu.getByRole("option", { name: /Toggle List/ }).click();

  await expect(menu).toHaveCount(0);
  const listItem = editable.locator("[data-geul-toggle-list-item]").first();
  await expect(editable).toBeFocused();

  await page.keyboard.type("할 일");
  await expect(listItem).toContainText("할 일");

  const marker = listItem.locator("[data-geul-toggle-marker]");
  await expect(marker).toHaveAttribute("data-geul-collapsed", "false");
  await marker.click();
  await expect(marker).toHaveAttribute("data-geul-collapsed", "true");
});

// Issue #211: 후보 0건 상태에서 Enter를 누르면 SlashMenu의 keydown 핸들러가
// event.preventDefault()를 호출하지 않아 ProseMirror 기본 Enter(블록 분할)로
// 폴스루했다. 메뉴는 열린 채 유지되고 블록은 분할되지 않아야 한다.
test("후보가 없을 때 Enter를 눌러도 블록이 분할되지 않는다 (Issue #211)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("/zzzznomatch");
  await expect(menu).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(0);

  await page.keyboard.press("Enter");

  await expect(menu).toBeVisible();
  await expect(editable.locator("p")).toHaveCount(1);
  await expect(editable.locator("p")).toHaveText("/zzzznomatch");
});

test("Escape로 메뉴를 닫으면 블록은 그대로 둔다", async ({ page }) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("/head");
  await expect(menu).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(menu).not.toBeVisible();
  await expect(editable.locator("p")).toHaveText("/head");
  await expect(editable).toBeFocused();
});

test("슬래시 메뉴 바깥을 클릭하면 메뉴를 닫고 클릭한 컨트롤로 초점을 옮긴다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("/head");
  await expect(menu).toBeVisible();

  const saveButton = page.getByRole("button", { name: "Save JSON" });
  await saveButton.click();

  await expect(menu).toHaveCount(0);
  await expect(saveButton).toBeFocused();
});

// ADR-0013 회귀(Issue #155): useDismissibleOverlay의 소비처 중
// 구조가 다른 대표 3곳 중 하나(트리거가 텍스트 커서고 앵커가 DOM 요소가
// 아니다). Slash menu도 `position: fixed`로 올바르게 스타일돼 있어(다른
// 대표 소비처 media-toolbar와 달리 페이지 layout에 영향을 주지 않는다)
// 원인 수정을 되돌려도 이 e2e는 계속 GREEN이다(실측 확인) — Issue #155가
// 실제로 재현되는 소비처는 아니지만, ADR-0013이 요구하는 "바깥 클릭은
// 예외 없이 dismiss와 클릭 대상의 동작을 함께 실행한다" 계약을 이 구조에서도
// 고정한다.
test("슬래시 메뉴가 열린 채로 바깥의 Save JSON을 클릭하면 메뉴가 닫히고 Save JSON도 실행된다(ADR-0013)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });
  const source = page.getByLabel("Document source");
  await expect(source).toHaveValue("");

  await editable.click();
  await page.keyboard.type("/head");
  await expect(menu).toBeVisible();

  await page.getByRole("button", { name: "Save JSON" }).click();

  await expect(menu).toHaveCount(0);
  await expect(source).not.toHaveValue("");
});

test("hover 시 나타나는 블록 추가 버튼으로 블록을 넣고 그 블록의 메뉴를 연다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("first block");
  await editable.locator("p").first().hover();

  const addBlockButton = page.getByRole("button", { name: "Add block" });
  await expect(addBlockButton).toBeVisible();
  await addBlockButton.click();

  await expect(menu).toBeVisible();
  await expect(editable.locator("p")).toHaveCount(2);

  await page.getByRole("option", { name: /Text/ }).click();
  await page.keyboard.type("second block");

  await expect(editable.locator("p").first()).toHaveText("first block");
  await expect(editable.locator("p").last()).toHaveText("second block");
});

test("서식 툴바의 select로 블록 종류를 바꿔도 내용을 보존한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);

  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Control+A");

  const blockTypeSelect = page.getByRole("combobox", { name: "Block type" });
  await expect(blockTypeSelect).toHaveValue("paragraph");

  await blockTypeSelect.selectOption("heading-2");

  await expect(editable.locator("h2")).toHaveText("Hello R1");

  await page.keyboard.press("Control+z");
  await expect(editable.locator("h2")).toHaveCount(0);
  await expect(editable.locator("p")).toHaveText("Hello R1");
});

test("문서 하단에서 슬래시 메뉴를 열어도 Audio 항목까지 뷰포트 안에서 클릭할 수 있다 (PIT-0011)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("first");
  for (let index = 0; index < 30; index += 1) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(`line ${index}`);
  }
  // 슬래시 질의는 블록 텍스트 전체가 "/..."와 일치해야 인식된다
  // (parseSlashQuery: /^\/(\S*)$/) — "line 29" 뒤에 그냥 "/"를 이어치면
  // 블록 텍스트가 "line 29/"가 되어 매치되지 않는다. Enter로 새 빈
  // 블록을 만든 뒤 그 블록에 "/"를 친다. 긴 문서를 계속 타이핑하는
  // 동안 브라우저가 캐럿을 뷰포트 안으로 계속 스크롤해 따라오므로,
  // 이 시점의 캐럿(=새 빈 블록)은 뷰포트 하단 근처에 있다.
  await page.keyboard.press("Enter");
  await page.keyboard.type("/");

  const menu = page.getByRole("listbox", { name: "Slash menu" });
  await expect(menu).toBeVisible();

  const menuBox = await menu.boundingBox();
  const viewportSize = page.viewportSize();
  expect(menuBox).not.toBeNull();
  expect(viewportSize).not.toBeNull();
  expect((menuBox?.y ?? 0) + (menuBox?.height ?? 0)).toBeLessThanOrEqual(
    (viewportSize?.height ?? 0) - CLAMP_BOUNDARY_MIN_MARGIN_PX,
  );

  // 클램프가 없으면 마지막 항목이 뷰포트 밖으로 나가 클릭이 "element is
  // outside of the viewport"로 타임아웃한다(PIT-0011 실측 시나리오). 슬래시
  // 메뉴의 마지막 항목은 공용 블록 순서(paragraph → heading 1-6 → quote →
  // code) 뒤 table → divider → file → image → video → audio가 이어져
  // Audio다(RD-003 DELTA-01, media 4종 추가로 Divider에서 밀려남).
  await expect(menu.getByRole("option", { name: /Code/ })).toBeVisible();
  await menu.getByRole("option", { name: /^Audio/ }).click();
  // 빈 미디어 블록은 콘텐츠 없는 div라 화면 크기가 0이다(RD-002 core 렌더
  // 전용, react 빈 상태 CSS는 아직 없다) — toBeVisible()은 0x0 요소를
  // "hidden"으로 판정하므로 존재 여부만 본다.
  await expect(editable.locator('[data-geul-media-empty="audio"]')).toHaveCount(
    1,
  );
});

test("스크롤·뷰포트 변경 후 슬래시 메뉴가 caret을 따르고 마지막 목록 항목을 클릭한다 (PIT-0011)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const blocks = Array.from({ length: 31 }, (_, index) => ({
    id: `slash-${index}`,
    type: "paragraph",
    content: index === 15 ? [] : [{ text: `line ${index}` }],
  }));
  await page
    .getByLabel("Document source")
    .fill(JSON.stringify({ formatVersion: 1, revision: 0, blocks }));
  await page.getByRole("button", { name: "Load JSON" }).click();

  const target = editable.locator('[data-geul-block-id="slash-15"] > p');
  await target.evaluate((element) =>
    element.scrollIntoView({ block: "center" }),
  );
  await target.click();
  await page.keyboard.type("/");

  const menu = page.getByRole("listbox", { name: "Slash menu" });
  await expect(menu).toBeVisible();
  await page.evaluate(() => window.scrollBy(0, 80));

  await expect
    .poll(async () => {
      const caret = await page.evaluate(() =>
        document.getSelection()?.getRangeAt(0).getBoundingClientRect().toJSON(),
      );
      const box = await menu.boundingBox();
      if (caret === undefined || box === null) return Number.POSITIVE_INFINITY;
      return Math.abs(box.y - caret.bottom);
    })
    .toBeLessThan(24);

  await page.setViewportSize({ width: 320, height: 300 });
  await expectOverlayWithinViewport(menu, page);
  await menu.getByRole("option", { name: /Numbered List/ }).click();

  await expect(
    editable.locator("[data-geul-list-marker]").first(),
  ).toHaveAttribute("data-geul-list-marker", "1.");
  await expect(editable).toBeFocused();
});

// Issue #227: Alt+ArrowDown은 브라우저·OS 단축키 조합이다. 열린 메뉴는
// preventDefault로 삼키거나 하이라이트를 옮기지 않는다.
test("수식 키 + 방향키는 하이라이트를 옮기지 않고 기본 동작을 막지 않는다 (Issue #227)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });
  const highlighted = menu.locator('[role="option"][aria-selected="true"]');

  await editable.click();
  await yieldFrame(page);
  await page.keyboard.type("/");
  await expect(menu).toBeVisible();
  // 수식 키 없는 ArrowDown으로 강조를 첫 항목 밖으로 옮겨 기준값을 만든다.
  await page.keyboard.press("ArrowDown");
  const before = await highlighted.getAttribute("id");
  expect(before).not.toBeNull();
  expect(before).not.toBe(
    await menu.getByRole("option").first().getAttribute("id"),
  );
  await expect(editable).toHaveAttribute("aria-activedescendant", before ?? "");
  await recordKeydownPrevented(page);

  await page.keyboard.press("Alt+ArrowDown");

  expect(await lastKeydownPrevented(page)).toEqual({
    key: "ArrowDown",
    prevented: false,
  });
  await expect(highlighted).toHaveAttribute("id", before ?? "");
  await expect(menu).toBeVisible();
});

/**
 * alpha / `/head` / gamma 세 블록을 만들고 메뉴를 연 채 `/head` 끝에 캐럿을 둔다.
 * 클릭·키 입력 직후 PM state가 DOM selection을 따라잡지 못하거나 병렬 부하에서
 * 이동 키가 사라지는 실행이 있어, 셋업 전체를 `toPass` 재시도로 감싼다
 * (G-EDT-002, G-TST-001). 매 시도는 페이지를 새로 연다.
 */
const openHeadBetweenBlocks = async (page: Page) => {
  const menu = page.getByRole("listbox", { name: "Slash menu" });
  let editable: Locator | undefined;
  await expect(async () => {
    ({ editable } = await openDemo(page));
    await editable.click();
    await yieldFrame(page);
    await page.keyboard.type("alpha");
    await page.keyboard.press("Enter");
    await page.keyboard.type("beta");
    await page.keyboard.press("Enter");
    await page.keyboard.type("gamma");
    await page.keyboard.press("ArrowUp");
    await yieldFrame(page);
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await yieldFrame(page);
    await page.keyboard.type("/head");
    await expect(menu).toBeVisible({ timeout: 1_000 });
    await expect(editable.locator("p")).toHaveText(
      ["alpha", "/head", "gamma"],
      {
        timeout: 1_000,
      },
    );
  }).toPass({ timeout: 15_000 });
  if (editable === undefined) throw new Error("편집 영역을 찾지 못했다");
  return { editable, menu };
};

// Issue #229: selectionchange 리스너가 PM 리스너보다 먼저 호출돼 낡은
// state.selection을 읽었다. 방향키로 `/head` 블록을 벗어나도 메뉴가 열린 채
// 남았고 이어 누른 Enter가 캐럿 블록이 아닌 `/head` 블록을 변환했다.
for (const key of ["ArrowRight", "Control+ArrowUp", "Control+End"]) {
  test(`${key}로 캐럿이 /head 블록을 벗어나면 메뉴가 닫히고 Enter가 /head 블록을 변환하지 않는다 (Issue #229)`, async ({
    page,
  }) => {
    const { editable, menu } = await openHeadBetweenBlocks(page);

    await page.keyboard.press(key);
    // 전제: 캐럿이 /head 블록 밖으로 나갔다.
    await expect
      .poll(async () => {
        const text = await readCaretBlockText(page);
        return text !== null && text !== "/head";
      })
      .toBe(true);
    await page.waitForTimeout(150);

    await expect(menu).toHaveCount(0);
    await page.keyboard.press("Enter");

    await expect(editable.locator("h1, h2, h3, h4, h5, h6")).toHaveCount(0);
    await expect(
      editable.locator("p").filter({ hasText: /^\/head$/ }),
    ).toHaveCount(1);
    await expect(menu).toHaveCount(0);
  });
}

// Issue #229: 같은 블록 안의 캐럿 이동과 query 편집은 메뉴를 닫지 않는다.
test("같은 블록 안에서 ArrowLeft·Backspace는 메뉴를 유지하고 query를 갱신한다 (Issue #229)", async ({
  page,
}) => {
  const { editable, menu } = await openHeadBetweenBlocks(page);

  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => readCaretBlockText(page)).toBe("/head");
  await page.waitForTimeout(150);
  await expect(menu).toBeVisible();

  // 캐럿이 "/hea|d"에 있으므로 Backspace는 "/hed"를 만든다. 질의가 갱신돼
  // Heading 항목이 빠진다.
  await page.keyboard.press("Backspace");
  await expect(editable.locator("p").nth(1)).toHaveText("/hed");
  await expect(menu.getByRole("option", { name: /^Heading 1/ })).toHaveCount(0);
  await expect(menu).toBeVisible();
});

// Issue #234 RD-004: 캐럿 메뉴는 열린 채 스크롤해도 캐럿 하단에 붙는다.
// 위 PIT-0011 테스트의 24px 허용 오차는 좌표 어긋남을 못 잡는다.
test("슬래시 메뉴가 열린 채 window를 스크롤해도 캐럿 하단에 붙어 있다 (Issue #234)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/");
  const menu = page.getByRole("listbox", { name: "Slash menu" });
  await expect(menu).toBeVisible();

  await expectCaretMenuFollowsCaret(page, menu);
});

// Issue #258: 이동 키 직후(0ms)의 Enter는 PM state가 낡아 이전 `/he` 블록을
// 변환했다. 확정은 DOM selection의 캐럿 블록을 확인한다. Issue #229의 150ms
// 재읽기 계약과 같은 이동 키를 쓴다.

/** `alpha` 블록과 그 뒤 `/he` 블록을 만들고 메뉴가 열린 상태로 둔다. */
const openHeAfterAlpha = async (page: Page) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });
  await editable.click();
  await yieldFrame(page);
  await page.keyboard.type("alpha");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/he");
  await expect(menu).toBeVisible();
  return { editable, menu };
};

for (const leave of LEAVE_KEYS) {
  for (const wait of leave.waits) {
    test(`/he 블록을 ${leave.name}로 떠난 ${wait}ms 뒤 Enter는 블록을 변환하지 않는다 (Issue #258)`, async ({
      page,
    }) => {
      for (let attempt = 1; attempt <= MAX_LEAVE_ATTEMPTS; attempt += 1) {
        const { editable, menu } = await openHeAfterAlpha(page);
        await recordEnterState(page, ".geul-slash-menu");

        for (const key of leave.press) await page.keyboard.press(key);
        if (wait > 0) {
          await page.waitForTimeout(wait);
          if ((await readCaretBlockText(page)) === "/he") continue;
          // 재읽기가 끝난 뒤에는 Enter 없이도 메뉴가 닫혀 있다.
          await expect(menu).toHaveCount(0);
        }
        await page.keyboard.press("Enter");
        const enter = await readEnterState(page);
        if (enter?.caretBlock === "/he") continue;

        await expect(menu).toHaveCount(0);
        await expect(editable.locator("h1, h2, h3, h4, h5, h6")).toHaveCount(0);
        // 캐럿이 떠난 `/he` 블록은 텍스트 그대로 남는다.
        if (leave.keepsTrigger) {
          await expect(
            editable.locator("p").filter({ hasText: /^\/he$/ }),
          ).toHaveCount(1);
        }
        // 0ms는 두 경로가 모두 유효하다. Enter 때 메뉴가 아직 열려 있으면 가드가
        // 그 Enter를 소비하므로 문서가 변하지 않아야 한다. 즉시 읽기가 먼저
        // 메뉴를 닫았으면 Enter가 편집기에서 평소대로 동작한다.
        if (enter?.pickerOpen === true) {
          await expect(editable.locator("p")).toHaveText(["alpha", "/he"]);
        }
        return;
      }
      throw new Error(
        `${MAX_LEAVE_ATTEMPTS}번 시도해도 이동이 유지되지 않았다`,
      );
    });
  }
}

// Issue #258 회귀 보호: 블록 추가 버튼("+")으로 연 메뉴는 새 빈 블록에 캐럿이
// 놓인 채 열린다. 가드가 이 경로의 정상 Enter 확정을 막으면 안 된다.
test("블록 추가 버튼으로 연 메뉴에서 키보드로 항목을 고르면 블록을 변환한다 (Issue #258)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("first block");
  await editable.locator("p").first().hover();
  await page.getByRole("button", { name: "Add block" }).click();
  await expect(menu).toBeVisible();
  await expect(editable.locator("p")).toHaveCount(2);

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(menu).toHaveCount(0);
  await expect(editable.locator("h1")).toHaveCount(1);
  await expect(editable.locator("p").first()).toHaveText("first block");
});
