/**
 * Issue #38 슬라이스 3(heading 4-6·quote·divider) 중 실제 브라우저에서만
 * 증명 가능한 두 시나리오만 여기 남긴다(ADR-0007). 그 외 — 슬래시 메뉴
 * 항목 클릭이 올바른 명령을 호출하는지, 옵션 목록 구성 — 는 이미
 * `packages/react/test/slash-menu.test.tsx`(jsdom)와 core 테스트가
 * 소유한다. 두 테스트 모두 core 소유 단언(undo 단계 수·trailing·모델
 * 상태·`getDocument()`)이나 io 소유 단언(문자열 왕복)은 하지 않는다 —
 * DOM·computed style만 본다.
 *
 * 09a-C1(실제 레이아웃): divider(`hr`)의 hit area는 `_editor.scss`의
 * `padding-block` 규칙으로 시각적 두께(1px)보다 훨씬 넓다. side-menu가
 * 실제로 그 넓은 hover 영역에서 뜨는지는 실제 렌더 레이아웃에서만
 * 증명할 수 있다 — jsdom은 레이아웃을 계산하지 않는다. 겨냥 좌표를 고정
 * 오프셋으로 직접 계산하는 이유는 첫 테스트 안 주석 참고.
 *
 * 09a-C2(CSS 계산 스타일): h4-h6 폰트 크기가 실제로 단조 감소하는지,
 * blockquote·hr에 콘텐츠 스타일이 실제로 적용되는지는
 * `getComputedStyle`로만 증명 가능하다 — scss 규칙이 존재한다는 사실만으로는
 * 캐스케이드·특이성 충돌이 없다는 것을 보장하지 않는다.
 */
import { expect, test, type Locator } from "@playwright/test";

import { openDemo } from "./support/demo.js";

test("divider 위에 포인터를 올리면 side-menu 핸들이 나타나고 Delete로 hr이 사라진다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);

  await editable.click();
  await page.keyboard.type("before divider");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/divider");
  await expect(page.getByRole("option", { name: /Divider/ })).toBeVisible();
  await page.keyboard.press("Enter");

  const hr = editable.locator("hr");
  await expect(hr).toHaveCount(1);

  // Locator.hover()는 요소의 "현재" 바운딩 박스 중심을 매번 다시 계산해
  // 겨냥한다 — hr이 아무리 얇아져도(예: padding-block 없이 1px) 그
  // 중심은 항상 그 얇은 박스 안에 있으므로 hit area 축소를 검증하지
  // 못한다(실측 확인: padding-block을 지워도 hover()는 계속 통과했다).
  // 대신 hr 박스의 상단 경계(box.y)를 고정 기준점으로 삼는다 —
  // padding-block은 border-box 안쪽에서 아래로만 늘어나므로 box.y는
  // padding-block 값과 무관하게 고정된다(실측 확인: padding-block
  // 유무·hr 규칙 전체 삭제 모두 box.y 불변). 시각적 border-top 선(1px)
  // 보다 한참 아래, padding-block(0.75rem=12px) 영역 안쪽인 +8px 지점을
  // 직접 겨냥한다 — padding-block이 없으면 이 좌표는 hr의 축소된 박스
  // (1~2px) 밖으로 벗어나 다른 요소(ProseMirror 컨테이너)를 때린다.
  const box = await hr.boundingBox();
  if (box === null) throw new Error("hr bounding box was not available");
  await page.mouse.move(box.x + box.width / 2, box.y + 8);

  const handle = page.getByRole("button", { name: "Drag to reorder" });
  await expect(handle).toBeVisible();
  await handle.click();

  await page.getByRole("menuitem", { name: "Delete" }).click();

  await expect(hr).toHaveCount(0);
});

test("h4-h6 폰트 크기가 단조 감소하고 blockquote·hr에 콘텐츠 스타일이 계산 스타일로 적용된다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const source = page.getByLabel("Document source");

  await source.fill(
    JSON.stringify({
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "h3-1", type: "heading", level: 3, content: [{ text: "h3" }] },
        { id: "h4-1", type: "heading", level: 4, content: [{ text: "h4" }] },
        { id: "h5-1", type: "heading", level: 5, content: [{ text: "h5" }] },
        { id: "h6-1", type: "heading", level: 6, content: [{ text: "h6" }] },
        { id: "q-1", type: "quote", content: [{ text: "quote" }] },
        { id: "d-1", type: "divider" },
        { id: "tail", type: "paragraph", content: [{ text: "tail" }] },
      ],
    }),
  );
  await page.getByRole("button", { name: "Load JSON" }).click();

  await expect(editable.locator("h3")).toHaveCount(1);
  await expect(editable.locator("h4")).toHaveCount(1);
  await expect(editable.locator("h5")).toHaveCount(1);
  await expect(editable.locator("h6")).toHaveCount(1);
  await expect(editable.locator("blockquote")).toHaveCount(1);
  await expect(editable.locator("hr")).toHaveCount(1);

  // 브라우저 기본 루트 폰트 크기(px 환산)에 의존하지 않도록 px 값을
  // 하드코딩하지 않고, 실제 렌더된 폰트 크기끼리 상대 비교만 한다.
  const fontSizeOf = (locator: Locator): Promise<number> =>
    locator.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const [h3Size, h4Size, h5Size, h6Size] = await Promise.all([
    fontSizeOf(editable.locator("h3")),
    fontSizeOf(editable.locator("h4")),
    fontSizeOf(editable.locator("h5")),
    fontSizeOf(editable.locator("h6")),
  ]);
  expect(h3Size).toBeGreaterThan(h4Size);
  expect(h4Size).toBeGreaterThan(h5Size);
  expect(h5Size).toBeGreaterThan(h6Size);

  // border-left-width·border-top-width는 _editor.scss에 리터럴 px로
  // 적혀 있어(3px, 1px) 브라우저·색상 렌더링 차이 없이 안전하게 비교할 수
  // 있다 — UA 기본값(둘 다 border-style: none → 계산 너비 0px)과
  // 뚜렷이 다르므로 스타일이 실제로 적용됐는지 판별한다.
  await expect(editable.locator("blockquote")).toHaveCSS(
    "border-left-width",
    "3px",
  );
  await expect(editable.locator("hr")).toHaveCSS("border-top-width", "1px");
});
