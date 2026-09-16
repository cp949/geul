// list 중첩이 과도한 markdown을 parseProcessor.parse() 호출 *전에* 원본
// 텍스트에서 사전 스캔해 구조적으로 거절하기 위한 근사 판정기(Issue #206).
//
// remark-gfm(micromark 코어 list 파싱)은 list 중첩 단수에 초선형(대략
// 3차)으로 느려진다 — depth 500부터 체감 지연(2.7초), depth 600: 4.6초,
// depth 700: 7.2초, depth 800: 10.4초, depth 1000은 30초 내 미종료로 CPU를
// 소진한다(Issue #206 실측). RangeError(스택 오버플로)가 아니라 파서 내부
// 알고리즘 저하라 import-markdown-tree-depth.ts의 capMarkdownTreeDepth
// (post-parse 트리 캡)로는 막을 수 없다 — 손상이 parseProcessor.parse() 호출
// 자체 안에서 이미 일어나 그 호출이 끝난 뒤에야 실행되는 post-parse 방어에
// 도달하지 못한다. 그래서 이 가드는 파서를 호출하기 전에, 파서를 아예
// 거치지 않고 원본 텍스트만 스캔해 판정한다.
//
// CommonMark list item은 `-`/`*`/`+`(unordered) 또는 숫자(1~9자)+`.`/`)`
// (ordered) 마커 뒤 들여쓰기로 중첩을 표현한다. 정교한 CommonMark 파서를
// 재구현하지 않고, "list 마커로 시작하는 줄의 들여쓰기 폭이 이전에 본
// 마커 줄들보다 얼마나 깊어지는지"를 중첩 레벨의 근사치로 쓰는 실용적
// 휴리스틱이다. 과탐지(list처럼 보이지만 실제로는 아닌 입력을 깊다고
// 오판하는 것)는 허용한다 — 병목 자체가 병적 입력 케이스라 정상 문서가
// 드물게 거절되는 비용이 파싱 전 텍스트 레벨에서 CommonMark list 중첩
// 규칙(marker 폭, loose/tight, 컨테이너 혼합)을 정확히 재현하는 구현
// 복잡도보다 낫다(qq-workflow 계획 "## 결정" 참고). 다만 list 마커가 전혀
// 없는 일반 들여쓰기 텍스트나 코드펜스 내부까지 새 nesting level로 잘못
// 세면 안 된다 — 그건 무회귀 계약을 깨는 오탐이다.
//
// 명시적 반복문만 쓴다(재귀 없음) — import-markdown-tree-depth.ts의
// capMarkdownTreeDepth와 같은 이유다. 텍스트 한 줄씩 훑는 구조라 재귀
// 자체가 애초에 없지만, 헬퍼도 재귀를 쓰면 안 된다는 원칙을 그대로 지킨다.
// 전체 스캔은 소스 문자열을 한 번만 순회한다(각 줄의 들여쓰기 폭 계산과
// 중첩 스택 push/pop 모두 상환(amortized) O(n)) — 가드 자신이 새로운
// 비선형 비용을 만들면 가드의 목적과 상충한다.

/**
 * list 마커 뒤에 공백이 오거나 줄이 그대로 끝나야 한다 — marker 뒤에 다른
 * 문자가 바로 붙는 경우(`-foo`, 버전 문자열 `1.2.3`의 `1.` 등)는 list
 * 마커가 아니다. `---`처럼 marker 뒤에 또 다른 marker 문자가 오는 thematic
 * break류도 이 조건으로 자연히 제외된다.
 */
const LIST_MARKER_PATTERN = /^(?:[-*+]|\d{1,9}[.)])(?:\s|$)/;

/**
 * 들여쓰기를 뗀 나머지 문자열의 시작이 코드펜스 마커(백틱 또는 물결 3개
 * 이상)인지만 본다 — 들여쓰기 폭 자체는 아래 openFenceIsAligned가 별도로
 * 판정한다(펜스를 "열 수 있는" 들여쓰기인지 구분해야 하기 때문 — 이
 * 패턴만으로는 판단하지 않는다).
 */
const FENCE_MARKER_PATTERN = /^(`{3,}|~{3,})/;

/**
 * 이미 펜스 안(inFence)이 아닌 상태에서 새 펜스를 "여는" 것으로 인정할
 * 들여쓰기 조건. CommonMark는 펜스가 그 컨테이너(문서 최상위 또는 list
 * item 내부) 기준 3칸 이내로 들여써져야 연다고 규정한다 — 무조건
 * `\s*`(들여쓰기 무관)로 펜스를 인정하면, 실제로는 CommonMark가 펜스로
 * 열지 않을(그래서 이후 줄들을 여전히 일반 흐름으로, 즉 list 마커로
 * 해석할) 임의 들여쓰기의 백틱 줄을 가드가 "펜스 시작"으로 잘못 믿고
 * 그 뒤 EOF까지(또는 우연히 일치하는 닫힘 전까지) 전부 스캔에서 제외해
 * 버릴 수 있다 — 진짜로 깊은 list 중첩을 그 "가짜 펜스" 뒤에 숨겨 가드를
 * 우회하는 경로가 된다(오탐이 아니라 미탐 — 완료 조건이 감수하기로 한
 * "정상 문서 드문 거절"과 반대 방향이라 감수 대상이 아니다).
 *
 * 이전 구현은 "최상위(≤3) 또는 현재 스택 최상단 list 컨테이너의 들여쓰기
 * +3 이내"로 정렬을 인정했다. 그런데 그 "컨테이너" 근거(indentStack
 * 최상단)는 가드 자신이 만든 근사치일 뿐이다 — 가드가 list 마커처럼
 * 보이는 임의의 들여쓰기 줄을 오탐으로 push했을 수도 있는, 신뢰할 수 없는
 * 값이다. 그래서 얕은 list 한 줄로 컨테이너(예: indent 6)를 만든 뒤 같은
 * 들여쓰기의 백틱 줄을 "컨테이너+3 이내"로 통과시키면, 닫는 펜스 없이
 * EOF까지 문서 전체(그 안의 진짜 깊은 top-level list 포함)를 스캔에서
 * 가릴 수 있었다(결함 탐지 리뷰 2026-09-17, 결함 2 — BLOCKER). 실제
 * remark/micromark는 이런 경우 펜스를 열지 않는다 — indent 6은 top-level
 * 기준 3을 넘어 그냥 들여쓰기 코드블록이 되고, 그 뒤 list는 top-level에서
 * 완전히 별개로 파싱돼 초선형 비용을 그대로 받는다.
 *
 * 그래서 컨테이너 관용 분기를 없애고 최상위(들여쓰기 ≤3)만 펜스 시작으로
 * 인정한다. 닫히지 않는 top-level 펜스는 실제 파서도 그 뒤 전체를 코드로
 * 처리해 list를 파싱하지 않으므로, 이 완화된 규칙도 "닫히지 않으면 EOF
 * 까지 코드"라는 CommonMark 동작과 정확히 대응한다. list 안에 진짜로
 * 들여써진 코드펜스(indent>3, 정상 문서)는 이 규칙으로는 펜스로 인정되지
 * 않아 그 내부 텍스트가 일반 텍스트로 스캔되는 부작용이 있을 수 있지만,
 * 이는 "정상 문서 드문 오탐"(감수하기로 한 방향)일 뿐 미탐이 아니다.
 */
const openFenceIsAligned = (indent: number): boolean => indent <= 3;

/** 탭을 4칸 tab-stop으로 확장해 들여쓰기 폭을 잰다(CommonMark 관례 근사). */
const TAB_WIDTH = 4;

/**
 * 줄 시작의 공백/탭만 훑어 들여쓰기 폭과 훑은 문자 수를 함께 반환한다.
 * 한 줄 안에서만 동작하는 단일 for 루프라 총 비용은 그 줄의 길이에
 * 비례한다(G-TST-004 계측 축 — scanMarkdownListNesting의 indentCharsVisited).
 */
const indentWidthOf = (
  line: string,
): { width: number; charsVisited: number } => {
  let width = 0;
  let index = 0;
  for (; index < line.length; index += 1) {
    const code = line.charCodeAt(index);
    if (code === 32) {
      width += 1;
      continue;
    }
    if (code === 9) {
      width += TAB_WIDTH - (width % TAB_WIDTH);
      continue;
    }
    break;
  }
  return { width, charsVisited: index };
};

/**
 * 줄 시작의 blockquote marker(`[ \t]{0,3}>[ \t]?`, 중첩 시 반복)를 문자
 * 단위로 벗겨내 나머지 문자열과 벗겨낸 문자 수를 함께 반환한다. `> ` 접두가
 * 있으면 그 뒤에 오는 list 마커가 줄 시작(^) 기준 정규식에 전혀 매치하지
 * 않아 통째로 스킵되던 결함(결함 탐지 리뷰 2026-09-17, 결함 4 — MAJOR)의
 * 수정이다 — blockquote *중첩*(Issue #135 own-cap 범위, 별개 문제)이 아니라
 * list 중첩이 만드는 같은 초선형 비용이 매 줄 앞 상수 접두사로 마커 탐지를
 * 피해가는 경우라, 접두사를 투명하게 벗겨내고 그 나머지에 대해서만 들여쓰기·
 * fence·list marker 판정을 한다. blockquote marker 자체는 중첩 깊이에
 * 포함하지 않는다.
 *
 * indentWidthOf와 같은 실수(폭/문자수 혼동)를 반복하지 않도록 반환값을
 * 항상 문자 수(offset)로 추적한다 — 반복마다 `line.slice(...)`로 새
 * substring을 만들지 않고 같은 문자열에 대해 index만 전진시킨 뒤 마지막에
 * 한 번만 slice한다(반복마다 slice하면 반복 횟수에 비례해 substring 복사
 * 비용이 누적돼 새 비선형 비용이 생긴다). 반복 횟수는 그 줄의 `>` 개수에
 * 자연히 유계이고 각 반복은 O(1)(최대 3칸 공백 + `>` + 공백 1개만 본다)
 * 이라 전체 비용은 줄 길이에 선형이다(G-TST-004).
 */
const BLOCKQUOTE_MAX_LEADING_SPACES = 3;

const stripBlockquoteMarkers = (
  line: string,
): { rest: string; charsVisited: number } => {
  let offset = 0;
  for (;;) {
    let index = offset;
    let spaces = 0;
    while (spaces < BLOCKQUOTE_MAX_LEADING_SPACES && index < line.length) {
      const code = line.charCodeAt(index);
      if (code !== 32 && code !== 9) break;
      index += 1;
      spaces += 1;
    }
    if (index >= line.length || line.charCodeAt(index) !== 62 /* '>' */) {
      break;
    }
    index += 1;
    if (index < line.length) {
      const code = line.charCodeAt(index);
      if (code === 32 || code === 9) index += 1;
    }
    offset = index;
  }
  return { rest: line.slice(offset), charsVisited: offset };
};

export type MarkdownListNestingScan = {
  /** 감지된 list 항목의 최대 중첩 깊이 근사치(최상위 항목이 깊이 1). */
  maxDepth: number;
  /** 스캔한 총 줄 수 — G-TST-004 결정적 작업량 계측 축 1. */
  linesScanned: number;
  /** blockquote marker 제거 + 들여쓰기 폭 계산을 위해 방문한 총 문자 수 —
   * 계측 축 2(줄마다 그 줄의 길이만큼만 방문했는지, 전체 소스를 매줄
   * 다시 훑지 않는지를 본다). */
  indentCharsVisited: number;
  /** 중첩 깊이 스택에 대한 push+pop 총 횟수 — 계측 축 3. 병적인 dedent
   * 패턴(깊이 N까지 올라갔다가 0으로 내려가기를 반복)에서도 각 원소가
   * 최대 한 번만 push/pop되므로 상환 비용이 linesScanned에 선형 비례하는지
   * 를 본다(순수 증가 패턴은 줄마다 push 1회, sawtooth는 줄마다 pop 여러
   * 번이지만 전체 pop 횟수 총합은 전체 push 총합을 넘지 않는다). */
  stackOps: number;
};

/**
 * 원본 markdown 텍스트를 줄 단위로 한 번 훑어 list 항목의 중첩 깊이를
 * 근사 판정한다. 줄바꿈은 LF/CRLF/CR 단독을 모두 한 줄 경계로 인정한다
 * (CommonMark/micromark와 동일 — CR 단독 개행 문서를 한 줄로 뭉쳐 깊이를
 * 과소 측정하던 결함의 수정, 결함 탐지 리뷰 2026-09-17 결함 3 — MAJOR).
 * 각 줄 시작의 blockquote marker(`> ` 등)는 먼저 투명하게 벗겨내고, 그
 * 나머지에 대해서만 들여쓰기·fence·list marker를 판정한다(결함 4 — MAJOR,
 * blockquote marker 자체는 중첩 깊이에 포함하지 않는다).
 *
 * 들여쓰기 폭을 스택으로 추적한다 — 마커 줄의 들여쓰기가 스택 맨 위보다
 * 깊으면 한 단 내려간 것으로 보고 push, 얕으면 그 폭 이하가 될 때까지
 * pop, 같으면 형제 항목으로 보고 유지한다. 코드펜스 내부와 list 마커가
 * 없는 줄(blockquote marker를 벗겨낸 뒤에도 마커가 없는 일반 들여쓰기
 * 텍스트 등)은 스택에 영향을 주지 않는다 — 그래서 list 마커가 전혀 없는
 * 문서는 항상 maxDepth 0을 반환한다.
 */
export const scanMarkdownListNesting = (
  source: string,
): MarkdownListNestingScan => {
  const indentStack: number[] = [];
  let maxDepth = 0;
  let linesScanned = 0;
  let indentCharsVisited = 0;
  let stackOps = 0;
  let inFence = false;
  let fenceChar = "";

  for (const line of source.split(/\r\n|\r|\n/)) {
    linesScanned += 1;

    const { rest: afterBlockquote, charsVisited: blockquoteCharsVisited } =
      stripBlockquoteMarkers(line);
    indentCharsVisited += blockquoteCharsVisited;

    const { width: indent, charsVisited } = indentWidthOf(afterBlockquote);
    indentCharsVisited += charsVisited;
    const rest = afterBlockquote.slice(charsVisited);

    const fenceMatch = FENCE_MARKER_PATTERN.exec(rest);
    if (fenceMatch !== null) {
      const marker = fenceMatch[1]?.charAt(0) ?? "";
      if (!inFence && openFenceIsAligned(indent)) {
        inFence = true;
        fenceChar = marker;
        continue;
      }
      if (inFence && marker === fenceChar) {
        inFence = false;
        continue;
      }
      // 정렬되지 않은 백틱/물결 줄은 펜스로 인정하지 않고 아래로
      // 흘려보낸다 — list 마커가 아니므로 다음 조건에서 자연히
      // 스킵된다(list 마커도 아니고 오탐도 아니다).
    }
    if (inFence) continue;

    if (rest.length === 0 || !LIST_MARKER_PATTERN.test(rest)) continue;

    for (
      let top = indentStack[indentStack.length - 1];
      top !== undefined && indent < top;
      top = indentStack[indentStack.length - 1]
    ) {
      indentStack.pop();
      stackOps += 1;
    }
    const top = indentStack[indentStack.length - 1];
    if (top === undefined || indent > top) {
      indentStack.push(indent);
      stackOps += 1;
    }

    if (indentStack.length > maxDepth) maxDepth = indentStack.length;
  }

  return { maxDepth, linesScanned, indentCharsVisited, stackOps };
};

/**
 * 임계값 선택 근거(2026-09-17 실측, 이 리포지토리 환경, packages/io에서
 * `unified().use(remarkParse).use(remarkGfm)` parseProcessor.parse()만
 * 단독 실행해 list 중첩 depth별 wall-clock을 측정):
 *
 *   depth 128: 92.6ms    depth 350: 923.9ms
 *   depth 200: 232.4ms   depth 400: 1303.4ms
 *   depth 256: 375.8ms   depth 450: 1864.3ms
 *   depth 300: 602.6ms   depth 500: 2635.1ms   depth 600: 4343.7ms
 *
 * 이 환경 실측이 [#206] 실측(depth 500부터 2.7초로 체감 지연 시작, depth
 * 600: 4.6초)과 거의 정확히 일치한다(2635.1ms≈2.7s, 4343.7ms≈4.6s) — 같은
 * 초선형(약 3차) 곡선이 이 환경에서도 그대로 재현된다.
 *
 * 계획서가 우선 후보로 제시한 128/200/256(post-parse 트리 캡
 * MAX_MARKDOWN_TREE_DEPTH와 자릿수를 맞춘 값들)은 전부 300보다 낮다.
 * 하지만 packages/io/test/markdown-depth-cap.test.ts의 "list 중첩 300단...
 * 크래시 없이 성공하고 DEEP_TREE_FLATTENED를 경고한다"(Issue #135 §9)가
 * 이미 list 중첩 300단을 "파싱 시간이 짧다"는 전제로 ok:true 회귀
 * 테스트로 고정해 두고 있다 — 128/200/256 중 어느 것을 쓰든 이 사전
 * 가드가 300단 입력을 파싱 전에 거절해 그 기존 회귀를 깨뜨린다. 완료
 * 조건(§3)의 "임계값 이하의 list 중첩(기존 회귀 스위트 전체 포함)은
 * 무회귀로 그대로 파싱된다"를 지키려면 임계값이 300 이상이어야 한다.
 *
 * 그래서 새 매직넘버를 만들지 않고, 코드베이스에 이미 "안전하다"고 고정된
 * 경계값 300을 그대로 재사용한다 — 301단부터 거절한다. 300은 depth 500
 * (체감 지연 시작)보다 40% 낮고, 실측 곡선이 3차에 가까우므로 시간
 * 여유는 그보다 훨씬 크다(300: 0.6~1.3초 vs 500: 2.6~2.7초, 600:
 * 4.3~4.6초, 1000: 30초 내 미종료).
 */
export const MAX_MARKDOWN_LIST_NESTING_DEPTH = 300;

/**
 * markdown 소스의 list 중첩 근사 깊이가 MAX_MARKDOWN_LIST_NESTING_DEPTH를
 * 넘는지만 판정한다. import-markdown.ts가 parseProcessor.parse() 호출
 * 앞에서 이 함수 하나만 부른다(G-CNV-001 — 검증 로직을 진입점 한 곳에
 * 중앙화).
 */
export const markdownListNestingTooDeep = (source: string): boolean =>
  scanMarkdownListNesting(source).maxDepth > MAX_MARKDOWN_LIST_NESTING_DEPTH;
