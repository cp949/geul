/**
 * 100×100(10,000셀) 표의 로드·붙여넣기·선택·undo 성능을 브라우저
 * wall-clock으로 기록한다. spec 13 "10,000셀 fixture의 로드, 선택,
 * 붙여넣기와 undo" 기준선 측정용이다(Issue #3 슬라이스 13 선행 조건,
 * Issue #33).
 *
 * 측정 경계(Issue #33 완료 기준):
 * - 타이밍은 전부 `page.evaluate()` 안에서 `performance.now()`로 잰다.
 *   트리거(이벤트 dispatch)와 완료 감지(DOM 폴링)를 같은 evaluate 호출
 *   안에 둬 Playwright IPC 왕복·actionability 재시도 폴링이 측정 구간에
 *   섞이지 않게 한다.
 * - 포함: 이벤트가 에디터에 도달한 뒤 트랜잭션 적용, ProseMirror view
 *   업데이트, React 리렌더가 목표 DOM 상태(텍스트/클래스)에 반영되기까지
 *   `requestAnimationFrame` 폴링으로 확인되는 시점까지의 실제 작업 시간.
 * - 제외: fixture 준비(TSV 문자열 생성, textarea 채우기), 페이지
 *   내비게이션 자체, Playwright 쪽 IPC/폴링 오버헤드.
 * - 각 지표는 5회 반복해 표본과 중앙값을 함께 기록한다(단발 측정은
 *   노이즈에 취약해 회귀 게이트 기준으로 쓸 수 없다 — Issue #33).
 * - 하드 임계값 게이트(중앙값 20% 회귀 판정)는 슬라이스 13 범위다. 이
 *   시나리오는 기준선 기록용이라 통과 여부는 표가 만들어졌는지만 본다.
 */
import { expect, type Page, test } from "@playwright/test";

import { openDemo } from "./support/demo.js";

const SAMPLE_COUNT = 5;

/** rows×columns 크기의 TSV 텍스트를 만든다. 셀 값은 "row-column" 형태다. */
const buildTsv = (rows: number, columns: number): string =>
  Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => `${row}-${column}`).join(
      "\t",
    ),
  ).join("\n");

/** 표본의 중앙값을 계산한다(짝수 개면 가운데 두 값의 평균). */
const median = (samples: readonly number[]): number => {
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
    : (sorted[mid] as number);
};

const formatSamples = (samples: readonly number[]): string =>
  samples.map((sample) => sample.toFixed(1)).join(", ");

/**
 * TSV를 클립보드 붙여넣기로 dispatch하고, 마지막 셀 렌더까지 걸린 ms를 잰다.
 *
 * ClipboardEvent 생성자의 clipboardData 옵션 대신 평범한 Event에
 * defineProperty로 clipboardData를 얹는다 — Firefox는 스크립트가 생성한
 * ClipboardEvent의 clipboardData 초기값을 반영하지 않는다(G-TST-001).
 */
const measurePasteMs = (page: Page, tsv: string): Promise<number> =>
  page.evaluate(async (text) => {
    const target = document.querySelector('[contenteditable="true"]');
    if (target === null) throw new Error("Editable not found");
    const data = new DataTransfer();
    data.setData("text/plain", text);

    const start = performance.now();
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: data,
      configurable: true,
    });
    target.dispatchEvent(event);
    await new Promise<void>((resolve) => {
      const check = () => {
        const cells = document.querySelectorAll("table td");
        const last = cells[cells.length - 1];
        if (last?.textContent?.includes("99-99")) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
    return performance.now() - start;
  }, tsv);

/**
 * 첫 셀→마지막 셀로 드래그 선택(mousedown→mousemove→mouseup)을 dispatch하고,
 * 마지막 셀에 `.selectedCell` 데코레이션이 붙기까지 걸린 ms를 잰다. 실제 앱의
 * 표 범위 선택 인터랙션(`table-cell-selection.spec.ts`)과 같은 제스처다.
 */
const measureSelectMs = (page: Page): Promise<number> =>
  page.evaluate(async () => {
    const cells = Array.from(document.querySelectorAll("table td"));
    const first = cells[0];
    const last = cells[cells.length - 1];
    if (first === undefined || last === undefined) {
      throw new Error("Table cells not found");
    }

    // 10,000셀 표는 뷰포트보다 훨씬 커서 마지막 셀이 화면 밖에 있을 수
    // 있다 — scrollIntoView 없이 좌표를 계산하면 히트테스트가 실패해
    // tableEditing이 드래그를 추적하지 못한다.
    const dispatchMouse = (type: string, target: Element) => {
      target.scrollIntoView({ block: "center", inline: "center" });
      const box = target.getBoundingClientRect();
      target.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: box.x + box.width / 2,
          clientY: box.y + box.height / 2,
        }),
      );
    };

    const start = performance.now();
    dispatchMouse("mousedown", first);
    dispatchMouse("mousemove", last);
    dispatchMouse("mouseup", last);
    await new Promise<void>((resolve) => {
      const check = () => {
        if (last.classList.contains("selectedCell")) resolve();
        else requestAnimationFrame(check);
      };
      check();
    });
    return performance.now() - start;
  });

/** Ctrl/Cmd+Z를 dispatch하고, 표가 DOM에서 사라지기까지 걸린 ms를 잰다. */
const measureUndoMs = (page: Page): Promise<number> =>
  page.evaluate(async () => {
    const target = document.querySelector('[contenteditable="true"]');
    if (target === null) throw new Error("Editable not found");
    const isMac = navigator.platform.toLowerCase().includes("mac");

    const start = performance.now();
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        code: "KeyZ",
        ctrlKey: !isMac,
        metaKey: isMac,
        bubbles: true,
        cancelable: true,
      }),
    );
    await new Promise<void>((resolve) => {
      const check = () => {
        if (document.querySelector("table") === null) resolve();
        else requestAnimationFrame(check);
      };
      check();
    });
    return performance.now() - start;
  });

test("10,000셀 표 로드 성능을 기록한다", async ({ page }) => {
  test.setTimeout(120_000);

  // fixture 확보: TSV를 한 번 붙여넣고 Save JSON으로 model 문서를 캡처한다.
  const { editable } = await openDemo(page);
  await editable.click();
  await measurePasteMs(page, buildTsv(100, 100));
  await page.getByRole("button", { name: "Save JSON" }).click();
  const fixtureJson = await page.getByLabel("Document source").inputValue();

  const loadSamples: number[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    await openDemo(page);
    // Playwright의 locator.fill()은 수 MB급 textarea 값에 대해 비정상적으로
    // 느리다(actionability 재확인이 매 순간 값을 다시 읽는 것으로 보임).
    // 측정 대상도 아니므로 네이티브 value 세터로 직접 채워 넣는다.
    await page.evaluate((value) => {
      const el = document.querySelector("textarea");
      if (el === null) throw new Error("Document source textarea not found");
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      if (setter === undefined) throw new Error("value setter not found");
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, fixtureJson);

    const loadMs = await page.evaluate(async () => {
      const loadButton = Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent === "Load JSON",
      );
      if (loadButton === undefined) {
        throw new Error("Load JSON button not found");
      }

      const start = performance.now();
      loadButton.click();
      await new Promise<void>((resolve) => {
        const check = () => {
          const cells = document.querySelectorAll("table td");
          const last = cells[cells.length - 1];
          if (last?.textContent?.includes("99-99")) {
            resolve();
          } else {
            requestAnimationFrame(check);
          }
        };
        check();
      });
      return performance.now() - start;
    });
    loadSamples.push(loadMs);
  }

  const loadMedian = median(loadSamples);
  console.log(
    `[perf] load samples=[${formatSamples(loadSamples)}]ms median=${loadMedian.toFixed(1)}ms`,
  );
  expect(loadMedian).toBeGreaterThan(0);
});

test("10,000셀 표 붙여넣기·선택·undo 성능을 기록한다", async ({ page }) => {
  test.setTimeout(120_000);

  const { editable } = await openDemo(page);
  await editable.click();
  const tsv = buildTsv(100, 100);

  const pasteSamples: number[] = [];
  const selectSamples: number[] = [];
  const undoSamples: number[] = [];

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    pasteSamples.push(await measurePasteMs(page, tsv));
    selectSamples.push(await measureSelectMs(page));
    undoSamples.push(await measureUndoMs(page));
    await expect(page.locator("table")).toHaveCount(0);
  }

  const pasteMedian = median(pasteSamples);
  const selectMedian = median(selectSamples);
  const undoMedian = median(undoSamples);
  console.log(
    `[perf] paste samples=[${formatSamples(pasteSamples)}]ms median=${pasteMedian.toFixed(1)}ms`,
  );
  console.log(
    `[perf] select samples=[${formatSamples(selectSamples)}]ms median=${selectMedian.toFixed(1)}ms`,
  );
  console.log(
    `[perf] undo samples=[${formatSamples(undoSamples)}]ms median=${undoMedian.toFixed(1)}ms`,
  );

  expect(pasteMedian).toBeGreaterThan(0);
});
