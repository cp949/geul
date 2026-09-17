/**
 * Issue #38 슬라이스 4 RD-004 — CodeBlock의 demo 배선, plain source 스타일,
 * language 트리거·팝오버 실제 event·focus 순서와 Tab/Shift+Tab 브라우저
 * 동작을 검증한다. 저장형·revision·undo 계약은 core/react unit test가
 * 소유한다.
 * 슬라이스 9 RD-003 DELTA-01 — 펜스(```) native shorthand의 실제 브라우저
 * 타이핑 경로(keydown→composition→input→DOM mutation)도 이 파일이 검증한다
 * (ADR-0007, RD-003.md "결정" (c)). Notion 동일 UX 요청으로 트리거를 세 번째
 * 백틱 입력 즉시(공백 불필요)로 바꿨다 — "```js " 언어 즉석 지정 단축
 * 입력은 폐기했다(공존 불가능, block-type-input-rule-extension.ts 주석
 * 참고). 입력 규칙 로직 자체는 core 유닛 테스트
 * (block-type-input-rule-extension.test.ts)가 소유한다.
 * Issue #173(RD-002, roadmap "코드블록 언어 선택기 UX 개편") — language
 * combobox(입력=표시값)를 트리거 button + 팝오버(검색 input 분리)로
 * 바꿨다. 이전 "다음 블록 겹침 회피(뒤집기)" 동작은 폐기했다 — 트리거는
 * 코드블록 자신의 우상단에 작게 앵커링돼 아래 블록을 덮지 않는다
 * (RD-002.md "결정").
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { CLAMP_BOUNDARY_MIN_MARGIN_PX } from "./support/clamp.js";
import { openDemo } from "./support/demo.js";

/** Slash menu에서 현재 빈 블록을 CodeBlock으로 바꾸고 DOM 렌더를 기다린다. */
const insertCodeBlock = async (page: Page, editable: Locator) => {
  await editable.click();
  await page.keyboard.type("/code");
  await page.getByRole("option", { name: /Code/ }).click();
  const codeBlock = editable.locator("pre[data-geul-code-block]");
  await expect(codeBlock).toBeVisible();
  return codeBlock;
};

/** language 검색 팝오버를 연다(트리거 클릭) 후 검색 input을 반환한다. */
const openLanguagePopover = async (page: Page): Promise<Locator> => {
  await page.getByRole("button", { name: "Code language" }).click();
  return page.getByRole("combobox", { name: "Search for a language" });
};

/**
 * outer toolbar(`.geul-code-block-toolbar`)가 활성 CodeBlock의 우상단
 * 모서리에 붙어 있는지 poll로 확인한다(topRight anchor —
 * use-clamped-menu-position.ts). RD-001-DELTA-01(Issue #193)부터 위치
 * anchor를 갖는 쪽이 언어 trigger(inner button)가 아니라 outer toolbar
 * 전체다 — trigger는 그 안의 첫 자식일 뿐이라 복사·삭제 버튼이 뒤에
 * 붙으면서 더는 toolbar 우측 끝이 아니다. 뷰포트 clamp가 개입하지 않는
 * 범위(블록이 화면 가장자리에 바짝 붙지 않은 경우)에서만 정확히 0으로
 * 맞는다 — clamp 경계 확인은 `expectInsideViewport`가 한다.
 */
const expectTriggerAtBlockTopRight = async (
  codeBlock: Locator,
  toolbar: Locator,
) => {
  await expect
    .poll(async () => {
      const blockBox = await codeBlock.boundingBox();
      const toolbarBox = await toolbar.boundingBox();
      if (blockBox === null || toolbarBox === null) return null;
      return {
        right: Math.round(
          blockBox.x + blockBox.width - (toolbarBox.x + toolbarBox.width),
        ),
        top: Math.round(blockBox.y - toolbarBox.y),
      };
    })
    .toEqual({ right: 0, top: 0 });
};

/** fixed overlay가 네 viewport 경계의 공통 8px 여백 안에 있는지 확인한다. */
const expectInsideViewport = async (page: Page, overlay: Locator) => {
  await expect
    .poll(async () => {
      const box = await overlay.boundingBox();
      const viewport = page.viewportSize();
      if (box === null || viewport === null) return null;
      return {
        bottom:
          box.y + box.height <= viewport.height - CLAMP_BOUNDARY_MIN_MARGIN_PX,
        left: box.x >= CLAMP_BOUNDARY_MIN_MARGIN_PX,
        right:
          box.x + box.width <= viewport.width - CLAMP_BOUNDARY_MIN_MARGIN_PX,
        top: box.y >= CLAMP_BOUNDARY_MIN_MARGIN_PX,
      };
    })
    .toEqual({ bottom: true, left: true, right: true, top: true });
};

test("Slash /code는 빈 CodeBlock과 Code placeholder, plain monospace 스타일을 렌더한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const codeBlock = await insertCodeBlock(page, editable);
  const code = codeBlock.locator("code");

  await expect(code).toHaveText("");
  await expect(codeBlock).toHaveAttribute("data-placeholder", "Code");

  const style = await codeBlock.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      backgroundColor: computed.backgroundColor,
      borderStyle: computed.borderStyle,
      borderWidth: computed.borderWidth,
      fontFamily: computed.fontFamily,
      overflowX: computed.overflowX,
      paddingLeft: computed.paddingLeft,
      paddingTop: computed.paddingTop,
    };
  });
  expect(style.fontFamily.toLowerCase()).toContain("mono");
  expect(Number.parseFloat(style.paddingLeft)).toBeGreaterThan(0);
  expect(Number.parseFloat(style.paddingTop)).toBeGreaterThan(0);
  expect(style.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(style.borderStyle).toBe("solid");
  expect(Number.parseFloat(style.borderWidth)).toBeGreaterThan(0);
  expect(style.overflowX).toBe("auto");
});

test("펜스 ``` 입력은 스페이스 없이 production editor에서 즉시 codeBlock DOM으로 변환한다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("```");

  const codeBlock = editable.locator("pre[data-geul-code-block]");
  await expect(codeBlock).toBeVisible();
  await expect(codeBlock.locator("code")).toHaveText("");

  const trigger = page.getByRole("button", { name: "Code language" });
  await expect(trigger).toHaveText("Plain Text");
  await expect(editable).toBeFocused();
});

test("블록 메뉴의 Code는 기존 source를 표시한 채 DOM을 CodeBlock으로 바꾼다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("const value = 1;");

  await editable.locator("p").hover();
  await page
    .getByRole("button", { name: "Drag to reorder, click for options" })
    .click();
  const menu = page.getByRole("menu", { name: "Block menu" });
  await expect(menu.getByRole("menuitem", { name: "Code" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Code" }).click();

  await expect(editable.locator("pre[data-geul-code-block] code")).toHaveText(
    "const value = 1;",
  );
});

test("활성 CodeBlock의 블록 메뉴 Text를 실제 클릭해 source를 보존한 문단으로 되돌린다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const codeBlock = await insertCodeBlock(page, editable);
  await codeBlock.click();
  await page.keyboard.type("const answer = 42;");

  await codeBlock.hover();
  await page
    .getByRole("button", { name: "Drag to reorder, click for options" })
    .click();
  const menu = page.getByRole("menu", { name: "Block menu" });
  await menu.getByRole("menuitem", { name: "Text" }).click();

  await expect(editable.locator("pre[data-geul-code-block]")).toHaveCount(0);
  await expect(editable.locator("p").first()).toHaveText("const answer = 42;");
});

test("language 검색 Enter alias와 실제 option click은 트리거 라벨을 canonicalize하고 편집기로 초점을 복구한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertCodeBlock(page, editable);
  const trigger = page.getByRole("button", { name: "Code language" });

  let search = await openLanguagePopover(page);
  await search.fill("js");
  await search.press("Enter");
  await expect(trigger).toHaveText("JavaScript");
  await expect(editable).toBeFocused();

  search = await openLanguagePopover(page);
  await search.fill("py");
  const python = page.getByRole("option", { name: /Python/ });
  await expect(python).toBeVisible();
  // locator.click()의 실제 pointerdown → mouseup → click 순서를 사용한다.
  await python.click();
  await expect(trigger).toHaveText("Python");
  await expect(editable).toBeFocused();
});

test("Escape는 팝오버 검색을 취소하고 편집기로 초점을 복구한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertCodeBlock(page, editable);
  const trigger = page.getByRole("button", { name: "Code language" });
  const search = await openLanguagePopover(page);

  await search.fill("typescript");
  await search.press("Escape");

  await expect(trigger).toHaveText("Plain Text");
  await expect(
    page.getByRole("listbox", { name: "Code language suggestions" }),
  ).toHaveCount(0);
  await expect(editable).toBeFocused();
});

test("팝오버 검색 중 Save JSON을 클릭하면 commit 없이 취소하고 Save 초점을 유지한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertCodeBlock(page, editable);
  const trigger = page.getByRole("button", { name: "Code language" });
  const search = await openLanguagePopover(page);
  const save = page.getByRole("button", { name: "Save JSON" });

  await search.fill("typescript");
  await save.click();

  await expect(trigger).toHaveText("Plain Text");
  await expect(save).toBeFocused();
  await expect(search).toHaveCount(0);
});

test("CodeBlock의 Shift+Tab은 contenteditable 밖으로 순차 초점을 이동시킨다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const codeBlock = await insertCodeBlock(page, editable);
  // 빈 <code>는 자체 box가 0×0이므로 padding이 있는 <pre>를 클릭한다.
  await codeBlock.click();
  await expect(editable).toBeFocused();

  await page.keyboard.press("Shift+Tab");

  await expect(editable).not.toBeFocused();
  expect(
    await editable.evaluate(
      (element) =>
        element !== element.ownerDocument.activeElement &&
        !element.contains(element.ownerDocument.activeElement),
    ),
  ).toBe(true);
});

test("짧은 뷰포트에서 팝오버 크기가 바뀌어도 네 경계 안에서 Markdown을 클릭할 수 있다 (PIT-0011)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 240 });
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("line 0");
  for (let index = 1; index < 20; index += 1) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(`line ${index}`);
  }
  await page.keyboard.press("Enter");
  await page.keyboard.type("/code");
  await page.getByRole("option", { name: /Code/ }).click();

  const trigger = page.getByRole("button", { name: "Code language" });
  const search = await openLanguagePopover(page);
  const popover = page.locator(".geul-code-block-language-popover");
  const suggestions = page.getByRole("listbox", {
    name: "Code language suggestions",
  });

  await search.fill("md");
  await expect(suggestions.getByRole("option")).toHaveCount(1);
  await expectInsideViewport(page, popover);

  await search.fill("");
  await expect(suggestions.getByRole("option")).toHaveCount(12);
  await expectInsideViewport(page, popover);

  await suggestions.getByRole("option", { name: /Markdown/ }).click();
  await expect(trigger).toHaveText("Markdown");
  await expect(editable).toBeFocused();
});

test("scroll과 viewport resize 뒤 language 트리거가 활성 CodeBlock 우상단을 추적하고 좁은 화면에서도 팝오버가 네 경계 안에 머문다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 320 });
  const { editable } = await openDemo(page);
  await editable.click();
  for (let index = 0; index < 16; index += 1) {
    await page.keyboard.type(`line ${index}`);
    await page.keyboard.press("Enter");
  }
  await page.keyboard.type("/code");
  await page.getByRole("option", { name: /Code/ }).click();

  const codeBlock = editable.locator("pre[data-geul-code-block]");
  const trigger = page.getByRole("button", { name: "Code language" });
  // RD-001-DELTA-01(Issue #193) — 위치 anchor는 outer toolbar가 갖는다
  // (위 expectTriggerAtBlockTopRight 주석 참고). trigger는 클릭 등 버튼
  // 자체 동작에만 쓴다.
  const toolbar = page.locator(".geul-code-block-toolbar");
  await page.evaluate(() => {
    document.body.style.paddingBottom = "1000px";
  });
  await codeBlock.evaluate((element) =>
    element.scrollIntoView({ block: "center" }),
  );
  await expectTriggerAtBlockTopRight(codeBlock, toolbar);

  await page.evaluate(() => window.scrollBy(0, -40));
  await expectTriggerAtBlockTopRight(codeBlock, toolbar);

  await page.setViewportSize({ width: 200, height: 480 });
  await expectInsideViewport(page, toolbar);

  await trigger.click();
  const popover = page.locator(".geul-code-block-language-popover");
  await expectInsideViewport(page, popover);
});

// outer toolbar는 position: fixed로 블록 우상단(topRight anchor, dy=0)에
// 뜬다 — 코드 컨테이너의 padding-top이 toolbar 높이보다 작으면 toolbar가
// 첫 줄 텍스트를 덮는다(사용자 스크린샷, Notion 대비 여백 부재 지적).
// pre의 padding-top이 toolbar 전체 높이(버튼 1.75rem + 컨테이너 상하
// padding 0.25rem*2)를 커버하는지 실측으로 고정한다.
test("outer toolbar는 코드 첫 줄 텍스트와 세로로 겹치지 않는다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const codeBlock = await insertCodeBlock(page, editable);
  await codeBlock.click();
  await page.keyboard.type('const hello: String = "world";');

  const toolbar = page.locator(".geul-code-block-toolbar");
  await expect(toolbar).toBeVisible();
  const code = codeBlock.locator("code");

  await expect
    .poll(async () => {
      const toolbarBox = await toolbar.boundingBox();
      const firstLineTop = await code.evaluate((element) => {
        const rect = element.getClientRects()[0];
        return rect === undefined ? null : rect.top;
      });
      if (toolbarBox === null || firstLineTop === null) return null;
      return toolbarBox.y + toolbarBox.height <= firstLineTop;
    })
    .toBe(true);
});

// caption(.geul-code-block-caption)은 자기 블록의 wrapper rect.top에
// translateY(-100%)로 앵커링돼 그 블록 "바깥 위"에 gap 없이 붙는다
// (code-block-captions.tsx 문서 주석) — 즉 두 번째 codeBlock에 caption을
// 달면 caption은 첫 번째 codeBlock과 두 번째 codeBlock 사이 margin 안에
// 렌더된다. 그 margin이 caption 높이보다 작으면 caption이 첫 번째
// codeBlock과 맞닿거나 겹쳐 "두 블록 사이에 여백이 없다"로 보인다(사용자
// 스크린샷 지적). caption은 position: absolute라 문서 흐름에 자기 공간을
// 확보하지 않으므로, [data-geul-code-block]의 margin-top 자체를 caption
// 높이보다 크게 잡아야 한다.
test("caption이 있는 CodeBlock과 앞 CodeBlock 사이에 실제 여백이 보인다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const firstBlockOnly = await insertCodeBlock(page, editable);
  await firstBlockOnly.click();
  await page.keyboard.type("test");
  // codeBlock 안 캐럿 끝에서 Enter 두 번(codeBlockExit-extension.ts
  // "double 개행 종료")이 새 문단으로 빠져나가는 유일한 키보드 경로다.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/code");
  await page.getByRole("option", { name: /Code/ }).click();
  // codeBlock이 둘로 늘어나 insertCodeBlock이 반환한 unscoped locator(0개
  // 인자 pre[data-geul-code-block])는 더는 단일 요소로 좁혀지지 않는다 —
  // 여기서부터 순서 기반 nth()로 다시 잡는다.
  const firstBlock = editable.locator("pre[data-geul-code-block]").nth(0);
  const secondBlock = editable.locator("pre[data-geul-code-block]").nth(1);
  await expect(secondBlock).toBeVisible();
  await secondBlock.click();
  await page.keyboard.type("test");

  await page.getByRole("button", { name: "Edit caption" }).click();
  const captionInput = page.getByRole("textbox", {
    name: "Code block caption",
  });
  await captionInput.fill("caption");
  await captionInput.press("Enter");

  const caption = page.locator(".geul-code-block-caption");
  await expect(caption).toBeVisible();
  await expect(caption).toHaveText("caption");

  await expect
    .poll(async () => {
      const firstBox = await firstBlock.boundingBox();
      const captionBox = await caption.boundingBox();
      if (firstBox === null || captionBox === null) return null;
      return captionBox.y - (firstBox.y + firstBox.height);
    })
    .toBeGreaterThanOrEqual(8);
});

// CodeBlockExitExtension의 Shift-Enter(사용자 요청 20260915) — core
// 유닛(code-block-exit-extension.test.ts)이 PM 문서 계약을 고정하고, 여기서는
// 실제 브라우저 keydown→분할→caret 이동이 눈에 보이는 DOM으로 이어지는지만
// 확인한다.
test("Shift+Enter는 캐럿 위치에서 CodeBlock을 분할해 다음 블록으로 탈출한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const codeBlock = await insertCodeBlock(page, editable);
  await codeBlock.click();
  await page.keyboard.type("const a = 1;");
  await page.keyboard.press("Enter");
  await page.keyboard.type("const b = 2;");
  await page.keyboard.press("Home");

  await page.keyboard.press("Shift+Enter");

  // 캐럿 앞부분만 codeBlock에 남는다 — 개행 문자까지 그대로 유지한다.
  const code = codeBlock.locator("code");
  await expect
    .poll(() => code.evaluate((element) => element.textContent))
    .toBe("const a = 1;\n");
  await expect(editable.locator("pre[data-geul-code-block]")).toHaveCount(1);

  // 캐럿 뒷부분은 더 이상 codeBlock이 아닌 새 문단으로 옮겨간다.
  const nextBlock = editable.locator("p", { hasText: "const b = 2;" });
  await expect(nextBlock).toBeVisible();
  await expect(nextBlock).toHaveText("const b = 2;");

  // 캐럿이 그 문단으로 이동했다 — 이어서 입력하면 codeBlock이 아니라 그
  // 문단에 반영된다.
  await page.keyboard.type("X");
  await expect(nextBlock).toHaveText("Xconst b = 2;");
});

// 코드리뷰 결함 2 회귀(code-block 쪽) — `.geul-code-block-toolbar`(outer
// 컨테이너)는 `transform: translateX(-100%)`로 자기 폭만큼 왼쪽으로 밀려
// 렌더된다(topRight anchor, media-toolbar.tsx e2e "outer 컨테이너 폭이
// 늘어나면 more-menu가 트리거의 새 위치로 재정렬된다"와 동일 메커니즘).
// `⋯` 트리거는 이 컨테이너의 자식이라, 컨테이너 폭이 늘어나면 컨테이너의
// 화면상 좌측 끝만 더 밀려나 트리거 자신이 화면에서 이동한다 — 트리거의
// 리사이즈가 아니라 형제 노드 삽입이 원인이다. 실제 코드에서는 더보기
// 메뉴를 연 채로 runCommand가 실패하면(메뉴를 안 닫는 의도된 동작)
// `actionError` span이 이 컨테이너 안, 트리거 뒤에 추가돼 폭이 늘어난다.
// 이 테스트는 그 span과 완전히 같은 DOM
// (`<span class="geul-code-block-toolbar__error">`)을 직접 주입해 같은
// 조건(컨테이너 폭 변화)을 결정론적으로 만든다. media-toolbar.tsx와
// code-block-language-combobox.tsx가 공유하는 useAnchoredSubmenu가 outer
// 컨테이너 ResizeObserver로 트리거 rect를 다시 읽어 more-menu를
// 재정렬한다.
test("outer 컨테이너 폭이 늘어나면 code-block more-menu가 트리거의 새 위치로 재정렬된다(코드리뷰 결함 2)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const codeBlock = await insertCodeBlock(page, editable);
  await codeBlock.click();

  const trigger = page.getByRole("button", {
    name: "More code block options",
  });
  await trigger.click();
  const menu = page.locator(".geul-code-block-toolbar__more-menu");
  await expect(menu).toBeVisible();

  const triggerBefore = await trigger.boundingBox();
  const menuBefore = await menu.boundingBox();
  if (triggerBefore === null || menuBefore === null) {
    throw new Error("trigger/menu boundingBox missing");
  }
  // topRight anchor라 열린 직후엔 메뉴 우측 끝이 트리거 우측 끝과
  // 일치한다 — 아래 "재정렬" 검증의 전제(둘이 애초에 정렬돼 있었다)를
  // 먼저 확인한다.
  expect(
    Math.abs(
      menuBefore.x + menuBefore.width - (triggerBefore.x + triggerBefore.width),
    ),
  ).toBeLessThanOrEqual(1);

  await page.evaluate(() => {
    const container = document.querySelector(".geul-code-block-toolbar");
    if (container === null) throw new Error("outer container missing");
    const span = document.createElement("span");
    span.className = "geul-code-block-toolbar__error";
    span.setAttribute("role", "alert");
    span.textContent =
      "폭을 크게 늘리기 위한 매우 긴 에러 메시지 텍스트 자리 표시자 문자열입니다";
    container.appendChild(span);
  });

  // 전제 조건 — 주입한 span이 실제로 트리거를 화면상 옮겼는지 먼저
  // 확인한다(이게 안 움직이면 아래 재정렬 검증 자체가 무의미하다).
  await expect
    .poll(async () => {
      const box = await trigger.boundingBox();
      return box === null ? null : box.x;
    })
    .not.toBe(triggerBefore.x);

  // 수정 검증 — more-menu가 트리거의 새 위치를 따라간다(우측 끝 좌표 실측).
  await expect
    .poll(async () => {
      const triggerAfter = await trigger.boundingBox();
      const menuAfter = await menu.boundingBox();
      if (triggerAfter === null || menuAfter === null) return null;
      return Math.abs(
        menuAfter.x + menuAfter.width - (triggerAfter.x + triggerAfter.width),
      );
    })
    .toBeLessThanOrEqual(1);
});
