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
 *
 * Issue #240 분해 측정(아래 "probe" 시나리오):
 * - 선택·undo 구간의 `getBoundingClientRect` 호출 수와 `TableHandles`
 *   렌더 커밋 수를 센다. 수치는 단언하지 않고 로그만 남긴다.
 * - 렌더 횟수는 React DevTools 전역 hook(`onCommitFiberRoot`)으로 센다.
 *   제품 코드를 건드리지 않는다. hook이 꽂힌 react-dom은 커밋마다 hook을
 *   부르므로, probe를 켠 측정의 ms는 위 시나리오의 ms와 직접 비교하지
 *   않는다.
 * - 병합 표 fixture는 TSV 붙여넣기로 만든 문서 JSON을 변형해 Load JSON으로
 *   넣는다. TSV 붙여넣기는 병합을 만들지 못한다.
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
    // probe가 켜져 있으면 측정 도구 자신의 rect 판독이 호출 수에 섞이지
    // 않도록 원본 함수를 쓴다(probe 없으면 prototype 그대로다).
    const probe = (
      window as unknown as {
        __geulPerf?: { nativeRect: () => DOMRect; mark: (l: string) => void };
      }
    ).__geulPerf;
    const nativeRect = probe?.nativeRect;
    const dispatchMouse = (type: string, target: Element) => {
      target.scrollIntoView({ block: "center", inline: "center" });
      const box = nativeRect
        ? nativeRect.call(target)
        : target.getBoundingClientRect();
      probe?.mark(`${type} 직전`);
      target.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: box.x + box.width / 2,
          clientY: box.y + box.height / 2,
        }),
      );
      probe?.mark(`${type} 직후`);
    };

    const start = performance.now();
    probe?.mark("측정 시작");
    dispatchMouse("mousedown", first);
    dispatchMouse("mousemove", last);
    dispatchMouse("mouseup", last);
    await new Promise<void>((resolve) => {
      const check = () => {
        if (last.classList.contains("selectedCell")) {
          probe?.mark("완료 감지");
          resolve();
        } else requestAnimationFrame(check);
      };
      check();
    });
    // 완료 감지 뒤 이 await 연속은 마이크로태스크 큐 맨 뒤다. 그 사이에 React의
    // 동기 flush가 먼저 돌아 커밋 비용이 반환값에 들어온다. "반환" 표식이
    // 반환값에 실제로 들어간 작업의 끝이다.
    probe?.mark("반환");
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

// ---------------------------------------------------------------------------
// Issue #240 probe 시나리오
// ---------------------------------------------------------------------------

type ProbeTimelineEntry = {
  at: number;
  label: string;
  rect: number;
};

/** 페이지 안 probe 상태(`window.__geulPerf`). `installProbe`가 만든다. */
type Probe = {
  active: boolean;
  /** `Element.getBoundingClientRect` 호출 수. */
  rect: number;
  /** `Element.getClientRects`와 `Range.getClientRects` 호출 수. */
  clientRects: number;
  /** `Range.getBoundingClientRect` 호출 수. */
  rangeRect: number;
  /** React 루트 커밋 수. */
  commits: number;
  /** `TableHandles` 함수 컴포넌트가 렌더 작업을 한 커밋 수. */
  tableHandlesCommits: number;
  nativeRect: () => DOMRect;
  /** 타임라인에 표식을 남긴다. 측정 함수가 완료 감지 시점을 찍는다. */
  mark: (label: string) => void;
  timeline: ProbeTimelineEntry[];
};

type ProbeSnapshot = Pick<
  Probe,
  "rect" | "clientRects" | "rangeRect" | "commits" | "tableHandlesCommits"
> & { timeline: ProbeTimelineEntry[] };

/**
 * 페이지 로드 전에 꽂는 probe. `page.addInitScript`가 함수 본문을 문자열로
 * 직렬화하므로 바깥 식별자를 참조하지 않는다.
 *
 * - rect 계열 호출 수를 센다. `active`일 때만 센다.
 * - React DevTools 전역 hook을 흉내 내 `onCommitFiberRoot`로 커밋을 센다.
 *   커밋 뒤 fiber 트리에서 `TableHandles`를 찾아 `PerformedWork`(flags & 1)
 *   여부로 "이번 커밋에서 렌더했는가"를 판정한다. 부모만 렌더되고 memo
 *   bailout된 커밋은 세지 않는다.
 * - 타임라인에 입력 이벤트와 커밋을 시각과 함께 쌓는다. 렌더 한 번이 어느
 *   이벤트 뒤에 생기는지 분해하는 용도다.
 */
const installProbe = (): void => {
  const nativeRect = Element.prototype.getBoundingClientRect;
  const nativeClientRects = Element.prototype.getClientRects;
  const nativeRangeRect = Range.prototype.getBoundingClientRect;
  const nativeRangeClientRects = Range.prototype.getClientRects;

  const probe: Probe = {
    active: false,
    rect: 0,
    clientRects: 0,
    rangeRect: 0,
    commits: 0,
    tableHandlesCommits: 0,
    nativeRect,
    mark: () => {},
    timeline: [],
  };
  (window as unknown as { __geulPerf: Probe }).__geulPerf = probe;

  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (probe.active) probe.rect++;
    return nativeRect.call(this);
  };
  Element.prototype.getClientRects = function (this: Element) {
    if (probe.active) probe.clientRects++;
    return nativeClientRects.call(this);
  };
  Range.prototype.getBoundingClientRect = function (this: Range) {
    if (probe.active) probe.rangeRect++;
    return nativeRangeRect.call(this);
  };
  Range.prototype.getClientRects = function (this: Range) {
    if (probe.active) probe.clientRects++;
    return nativeRangeClientRects.call(this);
  };

  const mark = (label: string) => {
    if (!probe.active || probe.timeline.length >= 200) return;
    probe.timeline.push({
      at: performance.now(),
      label,
      rect: probe.rect,
    });
  };
  probe.mark = mark;
  for (const type of [
    "mousedown",
    "mousemove",
    "mouseup",
    "pointerdown",
    "pointermove",
    "pointerup",
    "keydown",
    "selectionchange",
    "scroll",
  ]) {
    document.addEventListener(type, () => mark(type), true);
  }

  type FiberLike = {
    type: unknown;
    flags: number;
    child: FiberLike | null;
    sibling: FiberLike | null;
  };
  const PERFORMED_WORK = 1;
  /**
   * 이번 커밋에서 렌더 작업을 한 함수 컴포넌트 이름을 모은다. 부모만 렌더되고
   * memo bailout된 컴포넌트는 `PerformedWork`가 서지 않아 빠진다. 같은
   * 이름이 여럿이면 한 번만 적는다.
   */
  const renderedComponents = (root: FiberLike): string[] => {
    const names = new Set<string>();
    const stack: FiberLike[] = [root];
    while (stack.length > 0) {
      const fiber = stack.pop() as FiberLike;
      if (
        typeof fiber.type === "function" &&
        (fiber.flags & PERFORMED_WORK) !== 0
      ) {
        const name = (fiber.type as { name?: string }).name;
        if (name) names.add(name);
      }
      if (fiber.sibling !== null) stack.push(fiber.sibling);
      if (fiber.child !== null) stack.push(fiber.child);
    }
    return [...names];
  };

  let rendererCount = 0;
  (
    window as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown }
  ).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    isDisabled: false,
    renderers: new Map(),
    inject: () => ++rendererCount,
    checkDCE: () => {},
    onScheduleFiberRoot: () => {},
    onCommitFiberUnmount: () => {},
    onPostCommitFiberRoot: () => {},
    onCommitFiberRoot: (_id: number, root: { current: FiberLike }) => {
      if (!probe.active) return;
      probe.commits++;
      const names = renderedComponents(root.current);
      if (names.includes("TableHandles")) probe.tableHandlesCommits++;
      mark(`commit:${names.join(",")}`);
    },
  };
};

const startProbe = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const probe = (window as unknown as { __geulPerf: Probe }).__geulPerf;
    probe.rect = 0;
    probe.clientRects = 0;
    probe.rangeRect = 0;
    probe.commits = 0;
    probe.tableHandlesCommits = 0;
    probe.timeline = [];
    probe.active = true;
  });

/**
 * 프레임 두 개와 50ms를 더 기다려 뒤늦은 렌더·레이아웃 보정까지 담은 뒤
 * 카운터를 읽고 probe를 끈다.
 */
const stopProbe = (page: Page): Promise<ProbeSnapshot> =>
  page.evaluate(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const probe = (window as unknown as { __geulPerf: Probe }).__geulPerf;
    probe.active = false;
    return {
      rect: probe.rect,
      clientRects: probe.clientRects,
      rangeRect: probe.rangeRect,
      commits: probe.commits,
      tableHandlesCommits: probe.tableHandlesCommits,
      timeline: probe.timeline,
    };
  });

type TableDocument = {
  blocks: Array<{
    type: string;
    columns?: Array<{ id: string }>;
    rows?: Array<{
      cells: Array<{
        columnId: string;
        rowSpan: number;
        columnSpan: number;
      }>;
    }>;
  }>;
};

type MergeFixture = {
  name: string;
  /** 병합 셀(rowSpan 또는 columnSpan이 1보다 큰 셀) 수. */
  mergeCount: number;
  /** 병합 셀 좌상단 좌표. 각 셀은 2×2를 덮는다. */
  anchors: ReadonlyArray<readonly [row: number, column: number]>;
};

const NO_MERGE: MergeFixture = {
  name: "병합 없음",
  mergeCount: 0,
  anchors: [],
};

/** 가운데 한 곳만 2×2 병합한다. 이슈 완료 기준의 "병합 셀 1개" 표다. */
const SINGLE_MERGE: MergeFixture = {
  name: "병합 1개",
  mergeCount: 1,
  anchors: [[50, 50]],
};

/**
 * 6칸 간격으로 2×2 병합을 깐다. 100×100에서 289개가 1,156셀(약 11.6%)을
 * 덮는다. 첫 셀과 마지막 셀은 병합에 들지 않아 선택 측정의 양끝이 같다.
 */
const TEN_PERCENT_MERGE: MergeFixture = (() => {
  const anchors: Array<readonly [number, number]> = [];
  for (let row = 1; row + 1 < 99; row += 6) {
    for (let column = 1; column + 1 < 99; column += 6) {
      anchors.push([row, column]);
    }
  }
  return { name: "병합 약 10%", mergeCount: anchors.length, anchors };
})();

/**
 * 붙여넣기로 만든 100×100 표의 문서 JSON에 2×2 병합을 적용한다. 병합 셀은
 * span을 올리고, 덮이는 셀은 행의 `cells`에서 뺀다(model 격자 불변식).
 */
const applyMerges = (json: string, fixture: MergeFixture): string => {
  if (fixture.anchors.length === 0) return json;
  const doc = JSON.parse(json) as TableDocument;
  const table = doc.blocks.find((block) => block.type === "table");
  if (table?.columns === undefined || table.rows === undefined) {
    throw new Error("Table block not found in fixture JSON");
  }
  const columns = table.columns;
  const rows = table.rows;
  const covered = new Set<string>();
  for (const [row, column] of fixture.anchors) {
    const anchorColumnId = (columns[column] as { id: string }).id;
    const anchor = (rows[row] as (typeof rows)[number]).cells.find(
      (cell) => cell.columnId === anchorColumnId,
    );
    if (anchor === undefined)
      throw new Error(`Anchor ${row},${column} missing`);
    anchor.rowSpan = 2;
    anchor.columnSpan = 2;
    covered.add(`${row},${column + 1}`);
    covered.add(`${row + 1},${column}`);
    covered.add(`${row + 1},${column + 1}`);
  }
  const columnIndexById = new Map(columns.map((col, index) => [col.id, index]));
  rows.forEach((row, rowIndex) => {
    row.cells = row.cells.filter(
      (cell) =>
        !covered.has(`${rowIndex},${columnIndexById.get(cell.columnId)}`),
    );
  });
  return JSON.stringify(doc);
};

/**
 * 첫 셀을 실제 클릭해 셀 선택을 접고 캐럿을 첫 셀에 둔다. 측정 구간 밖이다.
 *
 * 전체 셀 선택 뒤 첫 셀을 클릭하면 간헐적으로 그 셀 하나가 CellSelection으로
 * 남는다(병합 없는 fixture에서 두 번째 반복에 재현됐다). 클릭을 다시 하면
 * 접히므로 접힐 때까지 클릭을 반복한다.
 */
const collapseToFirstCell = async (page: Page): Promise<void> => {
  await expect(async () => {
    await page.locator("table td").first().click();
    await expect(page.locator("table td.selectedCell")).toHaveCount(0, {
      timeout: 500,
    });
  }).toPass({ timeout: 10_000 });
};

/**
 * Ctrl/Cmd+Z를 dispatch하고, 첫 셀 텍스트가 "0-0"으로 돌아오기까지 걸린 ms를
 * 잰다. 병합 fixture는 문서 로드로 들어와 표 전체를 되돌릴 수 없으므로 표가
 * 남는 단일 편집("x" 입력)의 undo를 잰다. 입력은 호출부가 구간 밖에서 한다.
 */
const measureUndoOnly = (page: Page): Promise<number> =>
  page.evaluate(async () => {
    const target = document.querySelector('[contenteditable="true"]');
    const first = document.querySelector("table td");
    if (target === null || first === null)
      throw new Error("Editable not found");
    const isMac = navigator.platform.toLowerCase().includes("mac");

    const probe = (window as unknown as { __geulPerf?: Probe }).__geulPerf;
    const start = performance.now();
    probe?.mark("측정 시작");
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
    probe?.mark("keydown 직후");
    await new Promise<void>((resolve) => {
      const check = () => {
        if (first.textContent === "0-0") {
          probe?.mark("완료 감지");
          resolve();
        } else requestAnimationFrame(check);
      };
      check();
    });
    probe?.mark("반환");
    return performance.now() - start;
  });

const formatTimeline = (snapshot: ProbeSnapshot): string => {
  const origin = snapshot.timeline[0]?.at ?? 0;
  return snapshot.timeline
    .map(
      (entry) =>
        `${entry.label}@${(entry.at - origin).toFixed(1)}ms(rect=${entry.rect})`,
    )
    .join(" → ");
};

/**
 * "반환" 표식까지가 측정 함수 반환값에 들어간 작업이다. 그 안에서 센 rect
 * 호출과 커밋만 따로 집계한다. 나머지는 구간 밖 후속 작업이다.
 */
const formatWindowCounts = (snapshot: ProbeSnapshot): string => {
  const end = snapshot.timeline.findIndex((entry) => entry.label === "반환");
  if (end < 0) return "구간 내 집계 불가(반환 표식 없음)";
  const commits = snapshot.timeline
    .slice(0, end + 1)
    .filter((entry) => entry.label.startsWith("commit"));
  const handles = commits.filter((entry) =>
    entry.label.slice("commit:".length).split(",").includes("TableHandles"),
  );
  return `구간 내 rect=${(snapshot.timeline[end] as ProbeTimelineEntry).rect} commits=${commits.length} tableHandlesCommits=${handles.length}`;
};

const formatCounts = (snapshot: ProbeSnapshot): string =>
  `rect=${snapshot.rect} clientRects=${snapshot.clientRects} rangeRect=${snapshot.rangeRect} commits=${snapshot.commits} tableHandlesCommits=${snapshot.tableHandlesCommits}`;

/**
 * 붙여넣기 흐름(기존 선택·undo 시나리오와 같은 사전 조건)에 probe를 붙인다.
 * 이슈 완료 기준 "선택 ≤ control × 2"의 ms는 이 흐름(과 probe 없는 기존
 * 시나리오)에서만 control과 비교한다. 아래 병합 fixture 시나리오는 문서
 * 로드 + 첫 셀 클릭이라 사전 조건이 달라, 같은 코드의 선택 ms가 이 흐름과
 * 크게 어긋난다(control 기준 약 14ms 대 46ms, Issue #240 RD-001 실측).
 * 그 시나리오의 ms는 같은 시나리오 안에서 control과 dev끼리만 비교한다.
 */
test("10,000셀 표 붙여넣기 흐름의 선택·undo rect 호출 수와 TableHandles 렌더 횟수를 기록한다", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.addInitScript(installProbe);

  const { editable } = await openDemo(page);
  await editable.click();
  const tsv = buildTsv(100, 100);

  const selectSamples: number[] = [];
  const undoSamples: number[] = [];
  const selectCounts: ProbeSnapshot[] = [];
  const undoCounts: ProbeSnapshot[] = [];

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    await measurePasteMs(page, tsv);
    await startProbe(page);
    selectSamples.push(await measureSelectMs(page));
    selectCounts.push(await stopProbe(page));
    await startProbe(page);
    undoSamples.push(await measureUndoMs(page));
    undoCounts.push(await stopProbe(page));
    await expect(page.locator("table")).toHaveCount(0);
  }

  const label = "붙여넣기 흐름";
  console.log(
    `[perf] ${label} select(probe 켬) samples=[${formatSamples(selectSamples)}]ms median=${median(selectSamples).toFixed(1)}ms`,
  );
  console.log(
    `[perf] ${label} undo(probe 켬, 표 제거) samples=[${formatSamples(undoSamples)}]ms median=${median(undoSamples).toFixed(1)}ms`,
  );
  selectCounts.forEach((snapshot, i) =>
    console.log(
      `[perf] ${label} select run=${i + 1} ${formatWindowCounts(snapshot)} | 후속 포함 ${formatCounts(snapshot)}`,
    ),
  );
  // 기존 undo 측정 함수는 "반환" 표식이 없어 구간 내 집계를 못 한다. 후속
  // 포함 합계만 남긴다.
  undoCounts.forEach((snapshot, i) =>
    console.log(`[perf] ${label} undo run=${i + 1} ${formatCounts(snapshot)}`),
  );
  for (const run of [0, SAMPLE_COUNT - 1]) {
    console.log(
      `[perf] ${label} select timeline(run=${run + 1}) ${formatTimeline(selectCounts[run] as ProbeSnapshot)}`,
    );
  }

  expect(selectCounts.length).toBe(SAMPLE_COUNT);
});

for (const fixture of [NO_MERGE, SINGLE_MERGE, TEN_PERCENT_MERGE]) {
  test(`10,000셀 표(${fixture.name}) 선택·undo의 rect 호출 수와 TableHandles 렌더 횟수를 기록한다`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.addInitScript(installProbe);

    // fixture 확보: 붙여넣기로 만든 표를 Save JSON으로 캡처하고 병합을 얹는다.
    const { editable } = await openDemo(page);
    await editable.click();
    await measurePasteMs(page, buildTsv(100, 100));
    await page.getByRole("button", { name: "Save JSON" }).click();
    const pastedJson = await page.getByLabel("Document source").inputValue();
    const fixtureJson = applyMerges(pastedJson, fixture);

    await openDemo(page);
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
    await page.getByRole("button", { name: "Load JSON" }).click();
    await expect(page.locator("table td").last()).toContainText("99-99");
    const expectedCells = 10_000 - 3 * fixture.mergeCount;
    await expect(page.locator("table td")).toHaveCount(expectedCells);

    const selectSamples: number[] = [];
    const undoSamples: number[] = [];
    const selectCounts: ProbeSnapshot[] = [];
    const undoCounts: ProbeSnapshot[] = [];

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      await collapseToFirstCell(page);
      await startProbe(page);
      selectSamples.push(await measureSelectMs(page));
      selectCounts.push(await stopProbe(page));

      // 편집(구간 밖)을 한 뒤 undo 구간만 센다. 입력 단계의 probe는 끈다.
      await collapseToFirstCell(page);
      await page.keyboard.type("x");
      await expect(page.locator("table td").first()).toContainText("x");
      await startProbe(page);
      undoSamples.push(await measureUndoOnly(page));
      undoCounts.push(await stopProbe(page));
    }

    const label = `${fixture.name} 병합셀=${fixture.mergeCount}`;
    console.log(
      `[perf] ${label} select(probe 켬) samples=[${formatSamples(selectSamples)}]ms median=${median(selectSamples).toFixed(1)}ms`,
    );
    console.log(
      `[perf] ${label} undo(probe 켬, 셀 편집) samples=[${formatSamples(undoSamples)}]ms median=${median(undoSamples).toFixed(1)}ms`,
    );
    selectCounts.forEach((snapshot, i) =>
      console.log(
        `[perf] ${label} select run=${i + 1} ${formatWindowCounts(snapshot)} | 후속 포함 ${formatCounts(snapshot)}`,
      ),
    );
    undoCounts.forEach((snapshot, i) =>
      console.log(
        `[perf] ${label} undo run=${i + 1} ${formatWindowCounts(snapshot)} | 후속 포함 ${formatCounts(snapshot)}`,
      ),
    );
    for (const run of [0, SAMPLE_COUNT - 1]) {
      console.log(
        `[perf] ${label} select timeline(run=${run + 1}) ${formatTimeline(selectCounts[run] as ProbeSnapshot)}`,
      );
      console.log(
        `[perf] ${label} undo timeline(run=${run + 1}) ${formatTimeline(undoCounts[run] as ProbeSnapshot)}`,
      );
    }

    expect(selectCounts.length).toBe(SAMPLE_COUNT);
  });
}
