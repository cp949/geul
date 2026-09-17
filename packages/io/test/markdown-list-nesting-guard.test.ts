/**
 * markdown list 중첩 파싱의 초선형 시간 폭발 방어(Issue #206)를 검증한다.
 * remark-gfm의 list 파싱은 중첩 단수에 초선형(대략 3차)으로 느려져
 * (depth 500부터 체감 지연, depth 1000은 30초 내 미종료) 사용자 제출
 * markdown을 동기로 처리하는 경로에서 DoS 벡터가 된다. 손상이
 * parseProcessor.parse() 호출 *내부*에서 이미 일어나 기존
 * capMarkdownTreeDepth(post-parse 트리 캡, markdown-depth-cap.test.ts)로는
 * 막을 수 없다 — 파서를 호출하기 *전에* 원본 텍스트를 사전 스캔해
 * 구조적으로 거절하는 새 가드(import-markdown-list-nesting-guard.ts)가
 * 필요하다.
 *
 * 세 층으로 검증한다.
 * 1. 가드 함수(scanMarkdownListNesting/markdownListNestingTooDeep) 자체를
 *    importMarkdown과 분리해 단위 테스트한다 — 임계값 경계, list 마커가
 *    없는 일반 들여쓰기 텍스트·코드펜스 오탐 방지, sibling/dedent 패턴.
 * 2. 가드의 작업량이 입력 길이에 선형임을 결정적 계측(스캔한 줄 수,
 *    들여쓰기 문자 수, 스택 push/pop 횟수)으로 확인한다(G-TST-004) —
 *    wall-clock 단언은 쓰지 않는다(PIT-0034).
 * 3. importMarkdown 통합에서, 임계값 초과 입력이 실제로
 *    parseProcessor.parse() 내부(mdast-util-from-markdown 호출)에
 *    도달하지 않고 조기 반환됨을 spy로 결정적으로 확인한다.
 *
 * unified()를 모듈째 감싸 프로세서의 parse 메서드 호출 횟수를 센다.
 * import-markdown.ts의 parseProcessor는 모듈 최초 로드 시 `unified()`를
 * 한 번 호출해 만든 싱글턴이라, 이 mock이 그 생성 호출을 가로채 반환하는
 * 프로세서 인스턴스에 parse를 감싸 두면 이후 모든 importMarkdown() 호출이
 * 같은 인스턴스의 parse를 거친다 — remark-parse 내부 구현(plugin이
 * self.parser를 등록하는 시점 자체는 이 최초 생성 1회뿐이라 spy 대상이
 * 될 수 없다)에 결합하지 않고, unified가 실제로 호출을 위임하는 지점
 * (Processor.prototype.parse, unified 소스 확인됨)만 감싸 더 얕게 결합한다.
 */
import { describe, expect, it, vi } from "vitest";

let parseInvocationCount = 0;

vi.mock("unified", async (importOriginal) => {
  const actual = await importOriginal<typeof import("unified")>();
  const wrapped = (
    ...args: Parameters<typeof actual.unified>
  ): ReturnType<typeof actual.unified> => {
    const processor = actual.unified(...args);
    const originalParse = processor.parse.bind(processor);
    processor.parse = ((...parseArgs: Parameters<typeof originalParse>) => {
      parseInvocationCount += 1;
      return originalParse(...parseArgs);
      // Processor.parse는 오버로드가 있는 메서드라 감싼 함수의 추론
      // 타입이 정확히 일치하지 않는다 — 런타임 동작(위임)만 중요하므로
      // 이 한 지점만 원본 시그니처로 되돌린다.
    }) as typeof processor.parse;
    return processor;
  };
  return { ...actual, unified: wrapped };
});

import { importMarkdown } from "../src/index.js";
import {
  MAX_MARKDOWN_LIST_NESTING_DEPTH,
  markdownListNestingTooDeep,
  scanMarkdownListNesting,
} from "../src/markdown/import-markdown-list-nesting-guard.js";

/**
 * 각 항목이 바로 앞 항목의 유일한 자식인 GFM 글머리 목록 소스를 만든다
 * (markdown-depth-support.ts의 buildNestedListMarkdown과 동일한 모양 —
 * index번째 줄을 2*index칸 들여써 levels단 중첩을 만든다). 이 파일은
 * 그 헬퍼를 import하지 않고 로컬로 다시 정의한다 — markdown-depth-cap.test.ts
 * 가 own-traversal·post-parse 캡을 검증하는 것과 달리 이 파일은 파싱
 * *전* 텍스트 스캔만 검증해 관심사가 달라, 공유 fixture에 결합하지
 * 않는다.
 */
const buildNestedListMarkdown = (levels: number): string =>
  Array.from(
    { length: levels },
    (_, index) => `${"  ".repeat(index)}- item-${index + 1}`,
  ).join("\n");

describe("scanMarkdownListNesting 단위 판정", () => {
  it("list 마커가 전혀 없으면 들여쓰기가 아무리 깊어도 depth 0이다", () => {
    const deeplyIndentedNonList = Array.from(
      { length: 500 },
      (_, index) => `${" ".repeat(index * 2)}plain paragraph continuation`,
    ).join("\n");

    expect(scanMarkdownListNesting(deeplyIndentedNonList).maxDepth).toBe(0);
  });

  it("코드펜스 내부의 list 마커처럼 보이는 줄은 세지 않는다", () => {
    const fencedLookalike = [
      "```",
      ...Array.from(
        { length: 500 },
        (_, index) => `${"  ".repeat(index)}- fake-item-${index + 1}`,
      ),
      "```",
    ].join("\n");

    expect(scanMarkdownListNesting(fencedLookalike).maxDepth).toBe(0);
  });

  it("펜스 밖 진짜 list와 펜스 안 lookalike가 섞이면 진짜 list만 센다", () => {
    const mixed = [
      "- outer-1",
      "  - outer-2",
      "```",
      "  - inside-fence-1",
      "    - inside-fence-2",
      "      - inside-fence-3",
      "```",
      "- outer-3",
    ].join("\n");

    expect(scanMarkdownListNesting(mixed).maxDepth).toBe(2);
  });

  // 하드닝 회귀(구현 중 자체 발견) — FENCE_MARKER_PATTERN이 들여쓰기와
  // 무관하게(`\s*`) 매치하던 첫 구현은, 컨테이너와 정렬되지 않은(list
  // 항목도 아니고 최상위도 아닌) 임의 들여쓰기의 백틱 줄까지 "펜스 시작"
  // 으로 잘못 인정해 그 뒤 EOF까지 전체를 스캔에서 제외해버렸다 —
  // CommonMark는 이런 정렬 안 된 백틱 줄을 펜스로 열지 않으므로 실제
  // 파서는 그 뒤를 여전히 list로 해석해 초선형 비용을 그대로 받는다.
  // 즉 오탐(과도 거절)이 아니라 미탐(가드 우회)이라 완료 조건이 감수한
  // 트레이드오프 범위 밖이다. openFenceIsAligned(indent<=3 또는 현재
  // 컨테이너 들여쓰기+3 이내)로 막았다 — 정렬 안 된 백틱 줄은 펜스로
  // 인정하지 않고 흘려보낸다.
  it("컨테이너와 정렬되지 않은 백틱 줄은 펜스로 인정하지 않고, 그 뒤 진짜 깊은 list를 계속 스캔한다", () => {
    const unalignedDecoyFence = [
      "- shallow",
      `${" ".repeat(40)}\`\`\``, // list 컨테이너(들여쓰기 0)와도, 최상위(<=3)와도 정렬되지 않음
      ...Array.from(
        { length: MAX_MARKDOWN_LIST_NESTING_DEPTH + 1 },
        (_, index) => `${"  ".repeat(index)}- deep-${index + 1}`,
      ),
    ].join("\n");

    const scan = scanMarkdownListNesting(unalignedDecoyFence);

    expect(scan.maxDepth).toBe(MAX_MARKDOWN_LIST_NESTING_DEPTH + 1);
    expect(markdownListNestingTooDeep(unalignedDecoyFence)).toBe(true);
  });

  it("같은 들여쓰기의 형제 항목은 깊이를 늘리지 않는다", () => {
    const siblings = ["- a", "- b", "- c"].join("\n");

    expect(scanMarkdownListNesting(siblings).maxDepth).toBe(1);
  });

  it("빈 줄로 항목이 나뉘어도(loose list) 형제 깊이를 유지한다", () => {
    const looseSiblings = ["- a", "", "- b", "", "- c"].join("\n");

    expect(scanMarkdownListNesting(looseSiblings).maxDepth).toBe(1);
  });

  it("깊어졌다가 얕아지고 다시 깊어지는(sawtooth) 패턴의 최대 깊이를 정확히 잰다", () => {
    const sawtooth = [
      "- a",
      "  - b",
      "    - c",
      "- d",
      "  - e",
      "- f",
      "  - g",
      "    - h",
      "      - i",
    ].join("\n");
    // 최대 깊이는 세 번째 sawtooth 봉우리(f-g-h-i)의 4단이다.

    expect(scanMarkdownListNesting(sawtooth).maxDepth).toBe(4);
  });

  it("ordered/unordered 마커가 섞여도 들여쓰기 폭으로 깊이를 판정한다", () => {
    const mixedMarkers = ["1. a", "   - b", "     * c"].join("\n");

    expect(scanMarkdownListNesting(mixedMarkers).maxDepth).toBe(3);
  });

  it(`list 중첩 정확히 MAX_MARKDOWN_LIST_NESTING_DEPTH(${MAX_MARKDOWN_LIST_NESTING_DEPTH})는 depth ${MAX_MARKDOWN_LIST_NESTING_DEPTH}로 측정되고 임계값을 넘지 않는다`, () => {
    const source = buildNestedListMarkdown(MAX_MARKDOWN_LIST_NESTING_DEPTH);

    expect(scanMarkdownListNesting(source).maxDepth).toBe(
      MAX_MARKDOWN_LIST_NESTING_DEPTH,
    );
    expect(markdownListNestingTooDeep(source)).toBe(false);
  });

  it(`list 중첩 MAX_MARKDOWN_LIST_NESTING_DEPTH+1(${MAX_MARKDOWN_LIST_NESTING_DEPTH + 1})은 임계값을 넘는다`, () => {
    const source = buildNestedListMarkdown(MAX_MARKDOWN_LIST_NESTING_DEPTH + 1);

    expect(scanMarkdownListNesting(source).maxDepth).toBe(
      MAX_MARKDOWN_LIST_NESTING_DEPTH + 1,
    );
    expect(markdownListNestingTooDeep(source)).toBe(true);
  });
});

/**
 * 한 줄 안에서 list 마커가 곧바로 이어지는 연쇄(`- - - x`)의 깊이 가산을
 * 검증한다(Issue #207). 기존 구현은 그 줄이 위치한 들여쓰기 스택 깊이만
 * 세고 같은 줄의 마커 연쇄 개수는 전혀 세지 않아, 압축 없이 임의로 길게
 * 만들 수 있는 `"- ".repeat(N) + "x"` 입력이 N과 무관하게 항상 depth 1로
 * 측정됐다(미탐 — Issue #206이 막으려던 초선형 파싱 비용이 그대로
 * 재발한다). 이 describe는 "한 줄 순수 연쇄"와 "다중 줄 중첩 + 마지막
 * 한 줄만의 연쇄" 형태만 검증한다 — 여러 줄이 각각 들여쓰기 증가와
 * 자체 연쇄를 반복하는 입력의 depth 누적은 아래
 * "반복 합성(들여쓰기 증가 + 각 줄 자체 연쇄) depth 누적" describe가
 * 별도로 검증한다(단계-3 결함 탐지 리뷰, IMPL-REVIEW-01 F1). 두 축의
 * 정확한 결합 방식(부모 프레임 depth + 그 줄의 연쇄 개수)은
 * scanMarkdownListNesting 함수 docstring 참고.
 */
describe("한 줄 마커 연쇄(chain) depth 가산 — Issue #207", () => {
  it("들여쓰기 없이 한 줄에 마커가 N개 연쇄되면(`- - ... x`) maxDepth가 정확히 N이다", () => {
    for (const chainLength of [1, 2, 7, 50]) {
      const source = `${"- ".repeat(chainLength)}x`;

      expect(scanMarkdownListNesting(source).maxDepth).toBe(chainLength);
    }
  });

  it("다중 줄 들여쓰기 중첩(깊이 M)에 마지막 줄 마커 연쇄(K개)가 더해지면 maxDepth가 M+K-1이다", () => {
    const linesToDepth = 5; // M
    const chainLength = 4; // K
    const nestedLines = Array.from(
      { length: linesToDepth - 1 },
      (_, index) => `${"  ".repeat(index)}- item-${index + 1}`,
    );
    const lastLine = `${"  ".repeat(linesToDepth - 1)}${"- ".repeat(chainLength)}x`;
    const source = [...nestedLines, lastLine].join("\n");

    expect(scanMarkdownListNesting(source).maxDepth).toBe(
      linesToDepth + chainLength - 1,
    );
  });

  it(`한 줄 마커 연쇄만으로 정확히 MAX_MARKDOWN_LIST_NESTING_DEPTH(${MAX_MARKDOWN_LIST_NESTING_DEPTH})에 도달하면 임계값을 넘지 않는다 — 기존 상수를 그대로 재사용한다(새 임계값 상수 없음)`, () => {
    const source = `${"- ".repeat(MAX_MARKDOWN_LIST_NESTING_DEPTH)}x`;

    expect(scanMarkdownListNesting(source).maxDepth).toBe(
      MAX_MARKDOWN_LIST_NESTING_DEPTH,
    );
    expect(markdownListNestingTooDeep(source)).toBe(false);
  });

  it(`한 줄 마커 연쇄가 MAX_MARKDOWN_LIST_NESTING_DEPTH+1(${MAX_MARKDOWN_LIST_NESTING_DEPTH + 1})이면 임계값을 넘는다`, () => {
    const source = `${"- ".repeat(MAX_MARKDOWN_LIST_NESTING_DEPTH + 1)}x`;

    expect(scanMarkdownListNesting(source).maxDepth).toBe(
      MAX_MARKDOWN_LIST_NESTING_DEPTH + 1,
    );
    expect(markdownListNestingTooDeep(source)).toBe(true);
  });

  // wall-clock이 아닌 결정적 계측으로 검증한다(G-TST-004/PIT-0034) — 연쇄
  // 스캔이 만드는 작업량을 새 계측 축(chainCharsVisited)의 증가율로
  // 확인한다. 시간 상한 assertion은 쓰지 않는다.
  it("chainCharsVisited는 연쇄 길이를 10배 늘리면 약 10배로 늘어나는 결정적 계측이다(G-TST-004)", () => {
    const small = `${"- ".repeat(2_000)}x`;
    const large = `${"- ".repeat(20_000)}x`;

    const smallScan = scanMarkdownListNesting(small);
    const largeScan = scanMarkdownListNesting(large);

    expect(smallScan.maxDepth).toBe(2_000);
    expect(largeScan.maxDepth).toBe(20_000);

    const ratio = largeScan.chainCharsVisited / smallScan.chainCharsVisited;
    expect(ratio).toBeGreaterThan(8);
    expect(ratio).toBeLessThan(12);
  });
});

/**
 * 단계-3 결함 탐지 리뷰(2026-09-17, IMPL-REVIEW-01 F1 — BLOCKER)가 찾은
 * 반복 합성(들여쓰기 증가 + 각 줄 자체 마커 연쇄) 미탐을 검증한다.
 *
 * 위 "한 줄 마커 연쇄 depth 가산" describe의 수정(스택 위치 + 그 줄의
 * 연쇄 개수 - 1)은 "다중 줄 중첩 + 마지막 한 줄만의 연쇄" 형태만 맞게
 * 셌다. 여러 줄이 각각 (들여쓰기 증가 + 자체 연쇄)를 반복하면 실제
 * CommonMark 중첩 깊이는 각 줄의 연쇄 개수의 합(곱셈적으로 커짐 —
 * 블록 수 × 블록당 연쇄 길이)인데, 옛 계산은 "스택에 쌓인 프레임 수(줄
 * 수만큼만 +1씩 증가) + 마지막 줄 연쇄 - 1"만 봐서 덧셈적으로만
 * 커졌다 — 이전 줄의 연쇄가 다음 줄의 들여쓰기 폭을 만들어도 그 폭
 * 자체가 몇 단을 표현하는지 스택에 전혀 반영되지 않았기 때문이다.
 *
 * 실제 remark-gfm 파서로 대조 확인(리뷰 subagent, 2026-09-17): 각 블록의
 * 들여쓰기가 이전 블록의 연쇄가 만든 컬럼에 정확히 맞춰지면(각 블록 i의
 * 들여쓰기 = 2 * C * i, marker+공백 폭 2를 가정) 실제 중첩 깊이는
 * B*C(블록 수 × 블록당 연쇄 길이)와 정확히 일치한다 — B=2,C=3→6,
 * B=3,C=3→9을 mdast list 노드 깊이로 직접 확인했다.
 *
 * 수정: 스택 프레임마다 폭(width)뿐 아니라 그 프레임에서 도달한 누적
 * depth를 함께 저장한다 — 새 프레임의 depth = 부모 프레임의 depth(스택이
 * 비었으면 0, 형제면 그 아래 프레임의 depth) + 그 줄의 연쇄 개수. 이러면
 * 이전 줄의 연쇄가 만든 깊이가 다음 줄의 "부모 depth"로 그대로 전달된다.
 */
const buildChainedNestingAttack = (blockCount: number, chainPerBlock: number) =>
  Array.from(
    { length: blockCount },
    (_, blockIndex) =>
      `${" ".repeat(2 * chainPerBlock * blockIndex)}${"- ".repeat(chainPerBlock)}y`,
  ).join("\n");

describe("반복 합성(들여쓰기 증가 + 각 줄 자체 연쇄) depth 누적 — 단계-3 결함 탐지(IMPL-REVIEW-01 F1)", () => {
  it("B=3,C=3(블록 3개, 블록당 연쇄 3개) — maxDepth가 B*C=9다(실제 mdast 중첩 깊이와 일치, 리뷰에서 실제 파서로 대조 확인)", () => {
    const source = buildChainedNestingAttack(3, 3);

    expect(scanMarkdownListNesting(source).maxDepth).toBe(9);
  });

  it("B=2,C=250 — 옛 계산은 251(=B+C-1)로 과소측정해 임계값 300 미만으로 통과시켰다. 실제 깊이는 B*C=500이라 임계값을 넘어야 한다", () => {
    const source = buildChainedNestingAttack(2, 250);

    expect(scanMarkdownListNesting(source).maxDepth).toBe(500);
    expect(markdownListNestingTooDeep(source)).toBe(true);
  });

  it(`경계 — 블록별 연쇄가 누적돼 정확히 MAX_MARKDOWN_LIST_NESTING_DEPTH(${MAX_MARKDOWN_LIST_NESTING_DEPTH})에 도달하면 임계값을 넘지 않고, 1을 더 넘으면 넘는다`, () => {
    const atThreshold = buildChainedNestingAttack(
      2,
      MAX_MARKDOWN_LIST_NESTING_DEPTH / 2,
    );
    const overThreshold = [
      buildChainedNestingAttack(1, MAX_MARKDOWN_LIST_NESTING_DEPTH / 2),
      `${" ".repeat(MAX_MARKDOWN_LIST_NESTING_DEPTH)}${"- ".repeat(MAX_MARKDOWN_LIST_NESTING_DEPTH / 2 + 1)}y`,
    ].join("\n");

    expect(scanMarkdownListNesting(atThreshold).maxDepth).toBe(
      MAX_MARKDOWN_LIST_NESTING_DEPTH,
    );
    expect(markdownListNestingTooDeep(atThreshold)).toBe(false);

    expect(scanMarkdownListNesting(overThreshold).maxDepth).toBe(
      MAX_MARKDOWN_LIST_NESTING_DEPTH + 1,
    );
    expect(markdownListNestingTooDeep(overThreshold)).toBe(true);
  });

  it("형제 항목(같은 들여쓰기 폭의 반복 줄)은 depth를 누적하지 않고 매번 같은 부모 기준으로 재계산한다 — 형제 여러 개가 depth를 잘못 합산하지 않는다", () => {
    const parent = "- - - y"; // depth 3
    const siblings = Array.from(
      { length: 20 },
      () => `${" ".repeat(6)}- z`, // parent와 같은 컬럼(6)의 형제, 각자 chainCount=1
    ).join("\n");
    const source = `${parent}\n${siblings}`;

    // 형제가 20개 반복돼도 각 형제의 depth는 parent(3) + 1 = 4로 고정이지,
    // 형제 수만큼 늘어나지 않는다.
    expect(scanMarkdownListNesting(source).maxDepth).toBe(4);
  });
});

/**
 * 가드 자신의 작업량이 입력 길이에 선형인지를 결정적으로 잰다
 * (G-TST-004) — wall-clock 대신 scanMarkdownListNesting이 반환하는 계측
 * 값(스캔한 줄 수, 들여쓰기 문자 수, 스택 push/pop 횟수)의 증가율을
 * 비교한다. 두 계측 축을 쓴다.
 *
 * 1. indentCharsVisited: 줄마다 그 줄의 들여쓰기만 훑는지, 매 줄마다
 *    전체 소스를 다시 훑는(quadratic) 회귀가 없는지를 본다.
 * 2. stackOps: 병적인 dedent 패턴(오르고 내리기를 반복하는 sawtooth)에서도
 *    push/pop 총합이 줄 수에 선형인지를 본다 — pop 루프가 "스택 맨 위부터
 *    조건에 맞을 때까지"가 아니라 "매번 스택 전체를 처음부터 다시 스캔"
 *    하는 형태로 회귀하면 이 축이 깨진다.
 */
describe("scanMarkdownListNesting 작업량은 입력 길이에 선형이다(G-TST-004)", () => {
  it("단조 증가 list(형제 없이 계속 깊어짐)에서 크기를 10배 늘리면 스캔 작업량도 약 10배로 늘어난다", () => {
    const small = buildNestedListMarkdown(1_000);
    const large = buildNestedListMarkdown(10_000);

    const smallScan = scanMarkdownListNesting(small);
    const largeScan = scanMarkdownListNesting(large);

    expect(smallScan.linesScanned).toBe(1_000);
    expect(largeScan.linesScanned).toBe(10_000);

    // indentCharsVisited는 "2*index칸 들여쓰기"의 총합이라 정확히
    // n*(n-1)(들여쓰기 폭 합)이지만, 여기서는 회귀를 잡는 데 필요한
    // "선형(줄 수의 상수 배 이내)"만 확인한다 — 완전제곱(quadratic)
    // 회귀라면 이 비율이 크기와 함께 폭증한다.
    const smallRatio = smallScan.indentCharsVisited / smallScan.linesScanned;
    const largeRatio = largeScan.indentCharsVisited / largeScan.linesScanned;
    // 들여쓰기 폭이 줄마다 2씩 늘어나므로 평균 들여쓰기는 줄 수에 비례한다
    // (선형 함수의 평균 자체가 스캔 크기에 비례하는 경우) — 그래서 비율
    // 자체가 아니라 "크기가 10배일 때 평균도 약 10배"인지를 비교해 선형성을
    // 확인한다(제곱이면 100배가 돼야 한다).
    expect(largeRatio / smallRatio).toBeGreaterThan(8);
    expect(largeRatio / smallRatio).toBeLessThan(12);

    // stackOps는 순수 증가 패턴이라 줄마다 push 1회, 총합이 줄 수와
    // 정확히 같다(상수 배 1) — pop이 전혀 없다.
    expect(smallScan.stackOps).toBe(1_000);
    expect(largeScan.stackOps).toBe(10_000);
  });

  it("sawtooth(깊이 N까지 올라갔다 0으로 내려가기를 반복)에서도 push+pop 총합은 줄 수의 상수 배를 넘지 않는다", () => {
    const buildSawtooth = (peaks: number, peakDepth: number): string => {
      const lines: string[] = [];
      for (let peak = 0; peak < peaks; peak += 1) {
        for (let depth = 0; depth < peakDepth; depth += 1) {
          lines.push(`${"  ".repeat(depth)}- p${peak}-d${depth}`);
        }
      }
      return lines.join("\n");
    };

    // 봉우리 개수는 고정하고 봉우리 깊이(peakDepth)를 10배 늘린다 —
    // 봉우리 개수만 늘리고 깊이를 고정하면(예: 50개×20단 vs 500개×20단)
    // "pop마다 스택 전체를 처음부터 재구성"하는 회귀의 줄당 비용이 여전히
    // 상수(20에 묶임)라 비율 검사로 못 잡는다(실제로 이 mutation-test
    // 검증 중 이 실수를 했다가 놓쳤다 — 되돌리기 전에 fixture를 고쳤다).
    // 깊이 자체를 늘려야 그 회귀의 봉우리당 비용(peakDepth^2에 비례)이
    // 드러난다.
    const small = buildSawtooth(10, 100); // 1,000줄
    const large = buildSawtooth(10, 1_000); // 10,000줄

    const smallScan = scanMarkdownListNesting(small);
    const largeScan = scanMarkdownListNesting(large);

    expect(smallScan.linesScanned).toBe(1_000);
    expect(largeScan.linesScanned).toBe(10_000);

    // 각 봉우리는 peakDepth단까지 push peakDepth회, 그다음 봉우리 시작
    // 전 dedent에서 pop 최대 peakDepth-1회 — 봉우리당 push+pop 총합이
    // 최대 약 2*peakDepth로 봉우리 "길이"(=peakDepth줄)에 선형이라,
    // 줄당 비용은 peakDepth와 무관하게 상수다. quadratic 회귀(예: pop마다
    // 스택 전체를 재구성해 봉우리당 비용이 peakDepth^2로 커지는 경우)라면
    // peakDepth가 10배일 때 줄당 비용도 10배가 돼 이 비율이 폭증한다.
    const smallOpsPerLine = smallScan.stackOps / smallScan.linesScanned;
    const largeOpsPerLine = largeScan.stackOps / largeScan.linesScanned;
    expect(largeOpsPerLine).toBeLessThanOrEqual(smallOpsPerLine * 1.5);
    expect(largeOpsPerLine).toBeGreaterThanOrEqual(smallOpsPerLine * 0.67);
  });
});

describe("importMarkdown 통합 — 초과 시 파서를 호출하지 않고 결정적으로 거절한다", () => {
  it(`list 중첩 MAX_MARKDOWN_LIST_NESTING_DEPTH+1(${MAX_MARKDOWN_LIST_NESTING_DEPTH + 1})은 parseProcessor.parse()를 호출하지 않고 MARKDOWN_LIST_NESTING_TOO_DEEP을 반환한다`, () => {
    parseInvocationCount = 0;

    const result = importMarkdown(
      buildNestedListMarkdown(MAX_MARKDOWN_LIST_NESTING_DEPTH + 1),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "MARKDOWN_LIST_NESTING_TOO_DEEP" },
    });
    expect(parseInvocationCount).toBe(0);
  });

  // depth 5000은 실제로 파싱됐다면(Issue #206 곡선 연장) 수십 초~수분이
  // 걸릴 입력이다 — 사전 스캔이 실제로 파서를 건너뛴다는 것을
  // parseInvocationCount:0으로 결정적으로 보여주는 동시에, 이 테스트
  // 자체가 wall-clock에 의존하지 않고도(실행이 즉시 끝난다) 그 사실을
  // 증명한다.
  it("list 중첩 5000단처럼 훨씬 깊은 입력도 파서를 호출하지 않고 즉시 거절한다", () => {
    parseInvocationCount = 0;

    const result = importMarkdown(buildNestedListMarkdown(5_000));

    expect(result).toMatchObject({
      ok: false,
      error: { code: "MARKDOWN_LIST_NESTING_TOO_DEEP" },
    });
    expect(parseInvocationCount).toBe(0);
  });

  it(`list 중첩 정확히 MAX_MARKDOWN_LIST_NESTING_DEPTH(${MAX_MARKDOWN_LIST_NESTING_DEPTH})는 무회귀로 파서를 호출해 정상 파싱된다`, () => {
    parseInvocationCount = 0;

    const result = importMarkdown(
      buildNestedListMarkdown(MAX_MARKDOWN_LIST_NESTING_DEPTH),
    );

    expect(result.ok).toBe(true);
    expect(parseInvocationCount).toBe(1);
  });

  it("list가 전혀 없는 일반 문서는 무회귀로 파서를 호출해 정상 파싱된다", () => {
    parseInvocationCount = 0;

    const result = importMarkdown(
      "# Heading\n\nA paragraph with **bold** and _italic_ text.\n\n> A blockquote.",
    );

    expect(result.ok).toBe(true);
    expect(parseInvocationCount).toBe(1);
  });

  it("얕은 list 중첩(2단)을 가진 문서는 무회귀로 파서를 호출해 정상 파싱된다", () => {
    parseInvocationCount = 0;

    const result = importMarkdown(["- a", "  - b", "- c", "  - d"].join("\n"));

    expect(result.ok).toBe(true);
    expect(parseInvocationCount).toBe(1);
  });

  // 계획서 "범위 밖" — 한 줄 마커 연쇄 shape의 실제 파싱 wall-clock은
  // 실측하지 않기로 확정했다. 그래서 이 테스트는 정확히 threshold인
  // 연쇄가 "정상 파싱된다"는 실측성 주장은 하지 않고, threshold 초과
  // 연쇄가 사전 가드에서 걸려 parseProcessor.parse()에 아예 도달하지
  // 않는다(=실제 파싱 비용을 지불하지 않는다)는 결정적 사실만 검증한다.
  it(`한 줄 마커 연쇄가 MAX_MARKDOWN_LIST_NESTING_DEPTH+1(${MAX_MARKDOWN_LIST_NESTING_DEPTH + 1})이면 parseProcessor.parse()를 호출하지 않고 MARKDOWN_LIST_NESTING_TOO_DEEP을 반환한다(Issue #207)`, () => {
    parseInvocationCount = 0;

    const result = importMarkdown(
      `${"- ".repeat(MAX_MARKDOWN_LIST_NESTING_DEPTH + 1)}x`,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "MARKDOWN_LIST_NESTING_TOO_DEEP" },
    });
    expect(parseInvocationCount).toBe(0);
  });
});

/**
 * 읽기 전용 결함 탐지 리뷰(2026-09-17, qq-workflow 단계-3)가 재현 스크립트로
 * 확정한 4개 결함(BLOCKER 2, MAJOR 2)의 회귀 테스트. 전부 같은 패턴이다 —
 * 가드가 특정 markdown shape에서 실제로는 깊은 list인데 깊이를 낮게(또는
 * 0으로) 잘못 측정해 importMarkdown이 그대로 파서를 호출하고, Issue #206이
 * 막으려던 초선형 CPU 소모가 그대로 재발한다(미탐 — 완료 조건이 감수하기로
 * 한 "정상 문서 드문 오탐"과 반대 방향이라 감수 대상이 아니다).
 */
describe("결함 회귀 — 미탐 4건(2026-09-17 결함 탐지 리뷰)", () => {
  it("결함 1(BLOCKER) — tab으로 들여쓴 list 중첩도 폭 기준으로 정확히 세고, 초과 시 파서를 호출하지 않는다", () => {
    // indentWidthOf가 width(tab을 4칸으로 확장한 컬럼 폭)와
    // charsVisited(실제 문자 수)를 따로 반환하는데, 가드가 문자열을 자를 때
    // width를 문자 인덱스로 쓰면(`line.slice(width)`) tab 1개(charsVisited=1,
    // width=4)마다 실제보다 4배 앞선 위치를 잘라 list 마커 매치가 스킵된다.
    // 각 레벨을 tab 1개씩 늘려 들여쓴 list는 폭 기준(4칸씩)으로는 여전히
    // 단조 증가라 깊이가 그대로 세어져야 한다.
    const tabIndentedNestedList = Array.from(
      { length: MAX_MARKDOWN_LIST_NESTING_DEPTH + 1 },
      (_, index) => `${"\t".repeat(index)}- item-${index + 1}`,
    ).join("\n");

    const scan = scanMarkdownListNesting(tabIndentedNestedList);
    expect(scan.maxDepth).toBe(MAX_MARKDOWN_LIST_NESTING_DEPTH + 1);
    expect(markdownListNestingTooDeep(tabIndentedNestedList)).toBe(true);

    parseInvocationCount = 0;
    const result = importMarkdown(tabIndentedNestedList);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "MARKDOWN_LIST_NESTING_TOO_DEEP" },
    });
    expect(parseInvocationCount).toBe(0);
  });

  it("결함 2(BLOCKER) — 현재 list 컨테이너와 정렬된(컨테이너+3 이내) 닫히지 않는 백틱 줄로 문서 나머지를 가릴 수 없다", () => {
    // indentStack 최상단(가드 자신의 근사 판정 결과, 신뢰 불가능한 근거)에
    // +3 여유를 주던 관용 분기가 있으면, 얕은 list 한 줄로 컨테이너를 만든
    // 뒤 같은 들여쓰기의 백틱 줄을 "정렬된 펜스 시작"으로 오인시켜 닫는
    // 펜스 없이 EOF까지 전량을 스캔에서 숨길 수 있다. 실제
    // remark/micromark는 indent 6인 백틱 줄을 top-level 기준(<=3)을 넘겨
    // 펜스로 열지 않으므로, 그 뒤 top-level list는 완전히 별개로 파싱되며
    // 초선형 비용을 그대로 받는다 — 가드도 같은 결론(펜스 아님, 계속
    // 스캔)에 도달해야 한다.
    const fakeFenceHidesDeepList = [
      `${" ".repeat(6)}- a`,
      `${" ".repeat(6)}\`\`\``,
      ...Array.from(
        { length: MAX_MARKDOWN_LIST_NESTING_DEPTH + 1 },
        (_, index) => `${"  ".repeat(index)}- deep-${index + 1}`,
      ),
    ].join("\n");

    const scan = scanMarkdownListNesting(fakeFenceHidesDeepList);
    expect(scan.maxDepth).toBe(MAX_MARKDOWN_LIST_NESTING_DEPTH + 1);
    expect(markdownListNestingTooDeep(fakeFenceHidesDeepList)).toBe(true);

    parseInvocationCount = 0;
    const result = importMarkdown(fakeFenceHidesDeepList);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "MARKDOWN_LIST_NESTING_TOO_DEEP" },
    });
    expect(parseInvocationCount).toBe(0);
  });

  it("결함 3(MAJOR) — CR(\\r) 단독 개행으로만 나뉜 list도 줄 단위로 나눠 깊이를 정확히 센다", () => {
    // CommonMark/micromark는 줄바꿈으로 LF, CRLF, 단독 CR을 모두 인정하는데
    // source.split("\n")만 쓰면 CR 전용 문서는 통째로 한 줄로 뭉쳐진다.
    const crOnlyNestedList = Array.from(
      { length: MAX_MARKDOWN_LIST_NESTING_DEPTH + 1 },
      (_, index) => `${"  ".repeat(index)}- item-${index + 1}`,
    ).join("\r");

    const scan = scanMarkdownListNesting(crOnlyNestedList);
    expect(scan.linesScanned).toBe(MAX_MARKDOWN_LIST_NESTING_DEPTH + 1);
    expect(scan.maxDepth).toBe(MAX_MARKDOWN_LIST_NESTING_DEPTH + 1);
    expect(markdownListNestingTooDeep(crOnlyNestedList)).toBe(true);

    parseInvocationCount = 0;
    const result = importMarkdown(crOnlyNestedList);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "MARKDOWN_LIST_NESTING_TOO_DEEP" },
    });
    expect(parseInvocationCount).toBe(0);
  });

  it("결함 4(MAJOR) — blockquote 접두(`> `)로 시작하는 줄도 접두를 투명하게 벗겨내고 그 뒤 list 중첩 깊이를 정확히 센다", () => {
    // 줄이 `> `로 시작하면 LIST_MARKER_PATTERN/FENCE_MARKER_PATTERN 둘 다
    // 줄 시작(^) 기준이라 매치하지 않아 통째로 스킵됐다. 매 줄에 상수
    // 접두사(`> `)만 붙고 그 뒤로 실제 list 들여쓰기가 깊어지는 진짜 list
    // 중첩은, blockquote *중첩*(Issue #135 own-cap 범위, 별개 문제)이 아니라
    // list 중첩이 만드는 같은 초선형 비용을 접두사로 가릴 뿐이다.
    const blockquotePrefixedNestedList = Array.from(
      { length: MAX_MARKDOWN_LIST_NESTING_DEPTH + 1 },
      (_, index) => `> ${"  ".repeat(index)}- item-${index + 1}`,
    ).join("\n");

    const scan = scanMarkdownListNesting(blockquotePrefixedNestedList);
    expect(scan.maxDepth).toBe(MAX_MARKDOWN_LIST_NESTING_DEPTH + 1);
    // 벗겨낸 blockquote marker 문자 수(줄마다 "> " 2자)도 계측 축에
    // 포함되는지 확인한다 — 계측이 전체 스캔량을 과소 보고하면 안 된다.
    expect(scan.indentCharsVisited).toBeGreaterThanOrEqual(
      2 * (MAX_MARKDOWN_LIST_NESTING_DEPTH + 1),
    );
    expect(markdownListNestingTooDeep(blockquotePrefixedNestedList)).toBe(true);

    parseInvocationCount = 0;
    const result = importMarkdown(blockquotePrefixedNestedList);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "MARKDOWN_LIST_NESTING_TOO_DEEP" },
    });
    expect(parseInvocationCount).toBe(0);
  });
});
