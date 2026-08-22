/**
 * 테스트 파일 사이에 복제된 헬퍼를 본문 기준으로 찾는다(`PIT-0022`).
 *
 * 이름이 아니라 정규화한 **본문 해시**로 비교한다. `PIT-0022`의 원래 검증
 * 명령은 `grep -rhoP '^(export )?const \K\w+' ... | uniq -d`였고 사각지대가
 * 셋이었다(Issue #92) — 대상 glob이 react 전용, `^` 앵커가 들여쓴 정의를
 * 통과시킴, 이름이 다르면 같은 본문도 못 잡음. 이 스크립트가 셋을 메운다.
 *
 * ## 무엇을 헬퍼로 세는가
 *
 * 다른 선언의 본문, `it()`/`test()` 콜백, `function`·`class` 본문과 설정 훅
 * (`beforeEach` 계열) 콜백 **밖**에 있는 `const` 선언만 헬퍼다. 그 안쪽의
 * `const`는 지역 변수이고, 파일이 달라도 같은 모양이 흔해 신호가 아니다.
 *
 * ## 오탐 기준
 *
 * 정규화한 본문이 **2줄 이상**인 선언만 비교한다. `PIT-0022`가 막으려는
 * 대상은 비자명한 규칙을 인코딩한 헬퍼이고, 한 줄 리터럴 상수
 * (`const rowHandleLabel = "행 핸들 열기";`)는 규칙을 담지 않는다. 문자 수
 * 임계값은 쓰지 않는다 — 같은 부류의 상수가 문자열 길이만으로 갈린다.
 *
 * 이 스크립트는 게이트가 아니라 진단 도구다. 중복을 찾아도 exit 0이다.
 * 잡힌 그룹은 사람이 "본문이 같은가, 규칙이 같은가"로 다시 판정한다.
 *
 * ## 알려진 한계
 *
 * - **구조분해 파라미터**(`({ tiptap })`)는 위치 토큰으로 치환하지 못한다.
 *   파라미터명이 다른 사본을 그 형태에서는 여전히 놓친다.
 * - **파라미터명 치환이 이름 단위**라 같은 이름의 프로퍼티나 문자열 내용까지
 *   바뀐다. `(editor) => ctx.editor`와 `(node) => ctx.node`가 같은 해시를
 *   받는다. 서로 다른 헬퍼가 붙는 오탐 방향이다.
 * - **반환 규약이 다르면 못 잡는다.** 순회 본문이 같아도 한쪽이 `null`을
 *   돌려주고 다른 쪽이 throw하면 본문이 달라진다. Issue #87의
 *   `cellBoundaryPosition`이 그 형태였고, 헬퍼가 인코딩한 지식을 직접
 *   grep해야(`grep -rn 'attrs.cellId ===' ...`) 잡혔다.
 * - **`const` 선언이 아닌 사본은 구조적으로 보이지 않는다.** 셀 대상이 `const`
 *   선언뿐이라 같은 본문을 네 형태로 넣으면 `const`만 1건이고 (1) 이름 없는
 *   인라인, (2) 최상위 `function` 선언, (3) 최상위 `let`·`var` 선언은 전부
 *   0건이다(실측). `function`은 이중으로 사라진다 — 선언 자체를 세지 않는 데다
 *   본문이 중첩 스코프로 제외돼 그 안의 `const`까지 함께 빠진다.
 *   `packages/io/test/micromark-table-patch-integrity.test.ts`가 최상위
 *   `function` 헬퍼 2개를 갖는데 이 파일의 집계는 **0건**이다(실측).
 *   Issue #84에서는 `table-cell-format-menu.test.tsx`의 provider 조립 6곳이
 *   이름 없는 인라인이었고, 이름 기반 grep과 본문 해시가 **둘 다** 통과시켰다.
 *   규칙에 고유한 토큰이 있으면 그 토큰을 직접 grep해야 잡힌다(그 경우
 *   `grep -rn 'as unknown as EditorController' packages/react/test/`).
 * - **구조분해 선언**(`const [a, b] = ...`)은 수집하지 않는다.
 * - **선언의 끝을 depth 0의 `;`로 판정한다.** biome이 세미콜론을 강제하는
 *   것에 기댄다. `pnpm lint`가 통과하는 트리에서만 결과가 유효하다.
 * - 템플릿 리터럴 `${...}` 안의 중첩 백틱은 처리하지 않는다.
 * - **중첩 스코프 목록이 리터럴이다.** `function`·`class`·설정 훅만 제외하고,
 *   그 밖의 콜백(`test.step(...)`, `page.evaluate(...)`을 모듈 최상위에서
 *   쓰는 형태) 안의 지역 선언은 여전히 헬퍼로 센다.
 * - **정규식 판정이 앞 토큰 휴리스틱이다.** 연산자와 키워드 뒤의 `/`만
 *   정규식으로 본다. `if (x) /re/.test(y)`처럼 `)` 뒤에 정규식이 오는 형태는
 *   나눗셈으로 읽는다.
 *
 * ## 대상 목록을 좁히지 않기
 *
 * `DEFAULT_TARGET_DIRECTORIES`는 리터럴 목록이다. 대신 실행할 때마다 목록
 * 밖의 테스트 디렉터리가 생겼는지 보고한다 — 대체된 grep이 죽은 이유가
 * "대상 glob이 react 전용이었다"였고, 목록을 손으로 관리하면 같은 방식으로
 * 다시 죽는다.
 *
 * 그 보고가 훑는 범위(`WORKSPACE_ROOTS`) 또한 리터럴이므로, `pnpm-workspace.yaml`과
 * 어긋나지 않는지를 회귀 테스트가 대조한다. 감시 장치의 감시 범위가 조용히
 * 좁아지면 감시 장치가 없는 것과 같다.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/**
 * @typedef {object} HelperDeclaration
 * @property {string} path 보고용 파일 경로
 * @property {number} line 선언이 시작하는 1-기반 줄 번호
 * @property {string} name 선언 이름
 * @property {string} hash 정규화한 본문의 sha1 앞 10자
 */

/**
 * @typedef {object} DuplicateGroup
 * @property {string} hash
 * @property {HelperDeclaration[]} declarations
 */

export const DEFAULT_TARGET_DIRECTORIES = [
  "packages/model/test",
  "packages/io/test",
  "packages/core/test",
  "packages/react/test",
  "e2e",
  "tests",
];

/**
 * `pnpm-workspace.yaml`의 `packages:` 목록과 같아야 한다. 여기가 어긋나면
 * 새 workspace 루트 아래의 테스트 디렉터리를 "목록에 없음"으로도 보고하지
 * 못해, 대상 목록이 조용히 트리보다 좁아진다.
 * `tests/find-duplicate-test-helpers.test.ts`가 두 목록을 대조한다.
 */
export const WORKSPACE_ROOTS = ["packages", "apps", "fixtures"];

const MINIMUM_NORMALIZED_LINES = 2;
// sha1 앞 10자 = 40비트. 선언 수가 수백 규모라 우연 충돌 확률이 1e-8 아래다.
// 짧게 잘라 출력 한 줄에 해시·사본 수·이름이 함께 들어가게 한다.
const HASH_LENGTH = 10;
const OPENING_BRACKETS = "([{";
const CLOSING_BRACKETS = ")]}";
const IGNORED_DIRECTORY_NAMES = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".turbo",
  ".vite",
]);

/**
 * 뒤에 오는 `/`가 나눗셈일 수 없는 키워드다. `return /[{]/.test(x)`를
 * 나눗셈으로 보면 정규식 안의 `[`와 `{`가 괄호 깊이에 섞여 선언의 끝을
 * 못 찾고, 그 파일의 **뒤따르는 헬퍼가 통째로 사라진다**.
 */
const REGULAR_EXPRESSION_KEYWORDS = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "case",
  "do",
  "else",
  "yield",
  "await",
]);

/**
 * `index`의 `/`가 나눗셈이 아니라 정규식 리터럴을 여는지 앞 토큰으로 가른다.
 * 완전한 판정은 파서가 필요하지만, 테스트 코드에서 나오는 형태
 * (`(`, `,`, `=`와 위 키워드 뒤의 정규식)는 이것으로 충분하다.
 */
const opensRegularExpression = (source, index) => {
  let cursor = index - 1;
  while (cursor >= 0 && /\s/.test(source[cursor] ?? "")) cursor -= 1;
  if (cursor < 0) return true;

  const character = source[cursor] ?? "";
  if ("(,=:[!&|?{};+-*%~^<>".includes(character)) return true;
  if (!/[\w$]/.test(character)) return false;

  let start = cursor;
  while (start >= 0 && /[\w$]/.test(source[start] ?? "")) start -= 1;
  return REGULAR_EXPRESSION_KEYWORDS.has(source.slice(start + 1, cursor + 1));
};

/**
 * `index`가 문자열·템플릿·정규식·주석을 연다면 그 리터럴이 끝난 다음
 * 위치와 종류를 돌려준다. 여는 자리가 아니면 `undefined`다.
 */
const readLiteral = (source, index) => {
  const character = source[index];
  const next = source[index + 1];

  if (character === "/" && next === "/") {
    const lineEnd = source.indexOf("\n", index);
    return { end: lineEnd === -1 ? source.length : lineEnd, comment: true };
  }
  if (character === "/" && next === "*") {
    const blockEnd = source.indexOf("*/", index + 2);
    return {
      end: blockEnd === -1 ? source.length : blockEnd + 2,
      comment: true,
    };
  }
  if (character === '"' || character === "'" || character === "`") {
    let cursor = index + 1;
    while (cursor < source.length) {
      if (source[cursor] === "\\") {
        cursor += 2;
        continue;
      }
      if (source[cursor] === character)
        return { end: cursor + 1, comment: false };
      cursor += 1;
    }
    return { end: source.length, comment: false };
  }
  if (character === "/" && opensRegularExpression(source, index)) {
    let cursor = index + 1;
    let insideClass = false;
    while (cursor < source.length) {
      const current = source[cursor];
      if (current === "\\") {
        cursor += 2;
        continue;
      }
      if (current === "\n") return undefined;
      if (current === "[") insideClass = true;
      else if (current === "]") insideClass = false;
      else if (current === "/" && !insideClass)
        return { end: cursor + 1, comment: false };
      cursor += 1;
    }
    return undefined;
  }
  return undefined;
};

/**
 * 리터럴 내용을 같은 길이의 공백으로 덮은 사본 둘을 만든다. 개행은 남겨
 * 원본과 길이·줄 번호가 어긋나지 않게 한다.
 *
 * - `masked`: 주석과 문자열을 모두 덮는다. 선언·호출을 찾는 정규식과 괄호
 *   깊이 계산이 주석·문자열 안의 코드 모양 텍스트에 걸리지 않게 한다.
 * - `withoutComments`: 주석만 덮는다. 문자열 내용은 헬퍼를 구별하는 신호라
 *   해시 대상에 남긴다.
 */
const maskLiterals = (source) => {
  // 코드 포인트가 아니라 UTF-16 코드 단위로 쪼갠다. `[...source]`는 BMP 밖
  // 문자를 한 칸으로 세어 이후 모든 인덱스가 `source.length` 기준과 어긋난다.
  const masked = source.split("");
  const withoutComments = source.split("");
  let index = 0;

  while (index < source.length) {
    const literal = readLiteral(source, index);
    if (literal === undefined) {
      index += 1;
      continue;
    }
    for (let cursor = index; cursor < literal.end; cursor += 1) {
      if (source[cursor] === "\n") continue;
      masked[cursor] = " ";
      if (literal.comment) withoutComments[cursor] = " ";
    }
    index = literal.end;
  }

  return { masked: masked.join(""), withoutComments: withoutComments.join("") };
};

/**
 * 리터럴이 덮인 소스에서 괄호 균형을 지키며 선언이나 호출이 끝나는 위치를
 * 찾는다. depth 0의 `;`이 끝이고, 열지 않은 닫는 괄호를 만나면 그 자리가
 * 끝이다(호출 인자 목록을 훑을 때의 형태다).
 *
 * 개행으로는 끊지 않는다. `=>` 다음 줄에서 본문이 시작하는 형태가 흔한데
 * 개행에서 끊으면 파라미터 목록만 남아 서로 다른 헬퍼가 같은 본문으로
 * 보인다 — Issue #92에서 `renderBlockMenu`·`renderRealBlocks`·
 * `renderRealTable` 오탐 3건이 이 형태였다.
 */
const findEnd = (masked, start) => {
  let index = start;
  let depth = 0;

  while (index < masked.length) {
    const character = masked[index] ?? "";
    if (OPENING_BRACKETS.includes(character)) depth += 1;
    else if (CLOSING_BRACKETS.includes(character)) {
      depth -= 1;
      if (depth < 0) return index;
    } else if (character === ";" && depth === 0) return index;
    index += 1;
  }

  return masked.length;
};

/**
 * `start`의 여는 괄호에 짝이 맞는 닫는 괄호 위치를 찾는다. `findEnd`와 달리
 * depth 0의 `;`로 끊지 않는다 — 블록 본문 안의 문장 세미콜론이 블록의 끝이
 * 아니기 때문이다.
 */
const findBlockEnd = (masked, start) => {
  let depth = 0;

  for (let index = start; index < masked.length; index += 1) {
    const character = masked[index] ?? "";
    if (OPENING_BRACKETS.includes(character)) depth += 1;
    else if (CLOSING_BRACKETS.includes(character)) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return masked.length;
};

/**
 * `start` 뒤에서 블록을 여는 `{`를 찾는다. 파라미터 목록이나 타입 인자 안의
 * `{`(`function f(a = { x: 1 }) {`)를 블록으로 오인하지 않도록 괄호 깊이가
 * 0인 자리만 받는다. 본문 없이 `;`로 끝나면 `undefined`다.
 */
const findBlockStart = (masked, start) => {
  let depth = 0;

  for (let index = start; index < masked.length; index += 1) {
    const character = masked[index] ?? "";
    if (character === "{" && depth === 0) return index;
    if (character === ";" && depth === 0) return undefined;
    if ("([".includes(character)) depth += 1;
    else if (")]".includes(character)) depth -= 1;
    else if (character === "}" && depth === 0) return undefined;
  }

  return undefined;
};

/**
 * `function`·`class` 토큰이 선언 자리인지 뒤 토큰으로 가른다. 이 검사가 없으면
 * `{ class: null }` 같은 **프로퍼티 이름**이 선언으로 읽히고, 뒤에서 아무
 * `{`나 블록 시작으로 잡아 그 안의 헬퍼를 통째로 제외 범위에 넣는다 —
 * `editor-controller-links.test.ts:174`가 실제로 그 형태다.
 *
 * 선언 자리에서 뒤에 올 수 있는 것은 이름, 익명 클래스·함수의 `{`·`(`,
 * 제너레이터의 `*`뿐이다. `:`나 `,`가 오면 프로퍼티 이름이다.
 */
const startsDeclaration = (masked, start) => {
  let cursor = start;
  while (cursor < masked.length && /\s/.test(masked[cursor] ?? "")) cursor += 1;
  return /[A-Za-z_$({*]/.test(masked[cursor] ?? "");
};

/** 지역 변수만 담는 콜백이다. 이 안의 `const`는 헬퍼가 아니라 테스트 준비다. */
const HOOK_NAMES = ["beforeEach", "afterEach", "beforeAll", "afterAll"];

/**
 * 헬퍼가 살 수 없는 중첩 스코프의 범위를 모은다. `function` 선언과 `class`
 * 본문, 그리고 설정 훅 콜백이다. 셋 다 그 안의 `const`가 **지역 변수**인데,
 * 제외하지 않으면 파일이 다른 두 지역 변수가 같은 본문이라는 이유로 중복
 * 그룹이 된다 — Issue #92에서 고친 "다른 헬퍼 본문 안의 지역 선언"과 같은
 * 결함이고, 감싸는 것이 `const`가 아닐 때 그대로 남아 있었다.
 */
const collectNestedScopeRanges = (masked) => {
  const ranges = [];
  const blockPattern = /\b(?:function|class)\b/g;
  let block = blockPattern.exec(masked);

  while (block !== null) {
    const blockStart = startsDeclaration(masked, blockPattern.lastIndex)
      ? findBlockStart(masked, blockPattern.lastIndex)
      : undefined;
    if (blockStart !== undefined) {
      ranges.push([block.index, findBlockEnd(masked, blockStart)]);
    }
    block = blockPattern.exec(masked);
  }

  const hookPattern = new RegExp(`\\b(?:${HOOK_NAMES.join("|")})\\s*\\(`, "g");
  let hook = hookPattern.exec(masked);

  while (hook !== null) {
    ranges.push([hook.index, findEnd(masked, hookPattern.lastIndex)]);
    hook = hookPattern.exec(masked);
  }

  return ranges;
};

/**
 * 선언 이름 뒤에서 대입 `=`의 위치를 찾는다. 타입 주석 안의 `=>`와 비교
 * 연산자를 대입으로 오인하지 않는다. `<`와 `>`는 깊이로 세지 않는다 —
 * `=>`의 `>`와 제네릭 닫는 괄호를 구분할 수 없고, 세지 않아도 타입 주석
 * 안의 `=`가 전부 `=>`뿐이라 결과가 같다.
 */
const findAssignment = (masked, start) => {
  let index = start;
  let depth = 0;

  while (index < masked.length) {
    const character = masked[index] ?? "";
    if (OPENING_BRACKETS.includes(character)) depth += 1;
    else if (CLOSING_BRACKETS.includes(character)) depth -= 1;
    else if (character === ";" && depth === 0) return undefined;
    else if (character === "=" && depth === 0) {
      const previous = masked[index - 1] ?? "";
      const next = masked[index + 1] ?? "";
      if (next !== "=" && next !== ">" && !"=!<>".includes(previous))
        return index;
    }
    index += 1;
  }

  return undefined;
};

/**
 * 케이스 하나를 여는 호출로 인정하는 수식자다. `.\w+` 전부를 받으면
 * `test.describe`(Playwright의 그룹 블록)와 `test.setTimeout`(설정 호출)까지
 * 케이스로 세어, 그 블록 안의 **헬퍼**가 통째로 제외 범위에 들어간다.
 * 그룹 블록 안의 선언은 지역 변수가 아니라 헬퍼다.
 */
const TEST_MODIFIERS = [
  "each",
  "for",
  "only",
  "skip",
  "skipIf",
  "runIf",
  "todo",
  "fails",
  "concurrent",
  "sequential",
  "extend",
];

/**
 * `it()`/`test()` 콜백이 차지하는 범위를 모은다. `it.each([...])( ... )`는
 * 두 번의 호출로 쪼개지므로 첫 인자 목록을 자른 뒤 이어지는 호출 그룹까지
 * 소비한다 — 소비하지 않으면 콜백 본문이 제외 범위 밖으로 나가 테스트
 * 지역 변수가 헬퍼로 잡힌다(Issue #87에서 실제로 오탐 1건이 나왔다).
 */
const collectTestCallbackRanges = (masked) => {
  const ranges = [];
  const pattern = new RegExp(
    `\\b(?:it|test)(?:\\.(?:${TEST_MODIFIERS.join("|")}))*\\s*\\(`,
    "g",
  );
  let match = pattern.exec(masked);

  while (match !== null) {
    let end = findEnd(masked, pattern.lastIndex);
    let cursor = end + 1;
    while (cursor < masked.length && /\s/.test(masked[cursor] ?? ""))
      cursor += 1;
    if (masked[cursor] === "(") end = findEnd(masked, cursor + 1);
    ranges.push([match.index, end]);
    match = pattern.exec(masked);
  }

  return ranges;
};

/** 식별자를 정규식 리터럴 안에 안전하게 넣는다. */
const escapeForPattern = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 화살표 함수의 파라미터 목록을 위치 토큰으로 바꾼 본문을 돌려준다.
 * `(editor: Editor, cellId: string)`과 `(tiptap: Editor, cellId: string)`이
 * 같은 해시를 받게 하는 정규화다 — Issue #87에서 파라미터명만
 * `editor` → `tiptap`으로 다른 사본을 본문 해시가 놓쳤다.
 *
 * 타입 주석도 함께 지운다. `React.ReactNode`와 `ReactNode`처럼 표기만 다른
 * 사본이 갈리지 않게 한다.
 */
const normalizeParameters = (body, maskedBody) => {
  const prefix = /^async\s+/.exec(maskedBody)?.[0] ?? "";
  if (maskedBody[prefix.length] !== "(") return body;

  const listStart = prefix.length;
  const listEnd = findEnd(maskedBody, listStart + 1);
  if (maskedBody[listEnd] !== ")") return body;

  const bindings = [];
  let depth = 0;
  let segmentStart = listStart + 1;

  /** 파라미터 한 칸에서 타입 주석과 기본값을 걷어내고 바인딩 이름만 남긴다. */
  const pushBinding = (segment) => {
    const name = segment.trim().replace(/^\.\.\./, "");
    let cut = name.length;
    let innerDepth = 0;
    for (let cursor = 0; cursor < name.length; cursor += 1) {
      const character = name[cursor] ?? "";
      if (OPENING_BRACKETS.includes(character)) innerDepth += 1;
      else if (CLOSING_BRACKETS.includes(character)) innerDepth -= 1;
      else if (innerDepth === 0 && (character === ":" || character === "=")) {
        cut = cursor;
        break;
      }
    }
    bindings.push(name.slice(0, cut).trim().replace(/\?$/, ""));
  };

  for (let cursor = listStart + 1; cursor < listEnd; cursor += 1) {
    const character = maskedBody[cursor] ?? "";
    if (OPENING_BRACKETS.includes(character)) depth += 1;
    else if (CLOSING_BRACKETS.includes(character)) depth -= 1;
    else if (character === "," && depth === 0) {
      pushBinding(body.slice(segmentStart, cursor));
      segmentStart = cursor + 1;
    }
  }
  if (body.slice(segmentStart, listEnd).trim().length > 0) {
    pushBinding(body.slice(segmentStart, listEnd));
  }

  const renamable = bindings.filter((name) => /^[A-Za-z_$][\w$]*$/.test(name));
  const placeholders = bindings.map((name) =>
    renamable.includes(name) ? `$p${renamable.indexOf(name)}` : name,
  );
  const rewritten = `${prefix}(${placeholders.join(", ")})${body.slice(listEnd + 1)}`;

  if (renamable.length === 0) return rewritten;

  // 식별자를 정규식에 그대로 넣지 않는다. `$`는 메타문자라 `$el` 같은 이름이
  // 조용히 "입력 끝"으로 컴파일되고, 그 파라미터만 치환되지 않아 사본이
  // 갈린다. 경계도 `\b`가 아니라 `$`를 단어에 포함하는 전후방 탐색으로
  // 본다 — `\b`는 `$el` 앞에서 성립하지 않고, 치환 결과인 `$p0` 안의 `p0`을
  // 다시 잡는다.
  const pattern = new RegExp(
    `(?<![\\w$])(?:${renamable.map(escapeForPattern).join("|")})(?![\\w$])`,
    "g",
  );
  return rewritten.replace(pattern, (name) => `$p${renamable.indexOf(name)}`);
};

/**
 * 해시 대상 본문을 만든다. 주석을 걷어내고 줄마다 여백을 지운 뒤 빈 줄을
 * 버린다. 같은 헬퍼가 파일마다 다른 들여쓰기로 복제돼도 같은 값이 된다.
 */
const normalizeBody = (maskedBody, withoutCommentsBody) => {
  const parameterNormalized = normalizeParameters(
    withoutCommentsBody,
    maskedBody,
  );
  return parameterNormalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
};

/**
 * 소스 하나에서 헬퍼 선언을 수집한다. `path`는 보고용이고 판정에 쓰지
 * 않는다.
 *
 * @param {string} source
 * @param {string} path
 * @returns {HelperDeclaration[]}
 */
export const collectHelperDeclarations = (source, path) => {
  const { masked, withoutComments } = maskLiterals(source);
  const testRanges = collectTestCallbackRanges(masked);
  const nestedScopeRanges = collectNestedScopeRanges(masked);
  const declarationRanges = [];
  const declarations = [];
  const pattern = /^[ \t]*(?:export[ \t]+)?const[ \t]+([A-Za-z_$][\w$]*)\b/gm;
  let match = pattern.exec(masked);

  while (match !== null) {
    const start = match.index;
    const insideTest = testRanges.some(
      ([from, to]) => start > from && start < to,
    );
    const insideHelper = declarationRanges.some(
      ([from, to]) => start > from && start < to,
    );
    const insideNestedScope = nestedScopeRanges.some(
      ([from, to]) => start > from && start < to,
    );
    const assignment = findAssignment(masked, pattern.lastIndex);

    if (
      assignment !== undefined &&
      !insideTest &&
      !insideHelper &&
      !insideNestedScope
    ) {
      // 여백 건너뛰기는 `masked`가 아니라 `withoutComments`로 한다. `masked`는
      // 문자열·템플릿을 같은 길이의 **공백**으로 덮으므로, 본문이 리터럴로
      // 시작하는 선언(`const tableHtml = \`...\`;`)에서 그 리터럴을 통째로
      // 건너뛰고 빈 본문을 해시하게 된다. 여러 줄 fixture가 통째로 안 보이고,
      // 앞 문자열만 다른 선언이 같은 해시로 붙는다.
      let bodyStart = assignment + 1;
      while (
        bodyStart < masked.length &&
        /\s/.test(withoutComments[bodyStart] ?? "")
      ) {
        bodyStart += 1;
      }
      const bodyEnd = findEnd(masked, bodyStart);
      declarationRanges.push([start, bodyEnd]);

      const normalized = normalizeBody(
        masked.slice(bodyStart, bodyEnd),
        withoutComments.slice(bodyStart, bodyEnd),
      );

      if (normalized.split("\n").length >= MINIMUM_NORMALIZED_LINES) {
        declarations.push({
          path,
          line: source.slice(0, start).split("\n").length,
          name: match[1] ?? "",
          hash: createHash("sha1")
            .update(normalized)
            .digest("hex")
            .slice(0, HASH_LENGTH),
        });
      }
    }

    match = pattern.exec(masked);
  }

  return declarations;
};

/**
 * 같은 본문 해시를 가진 선언을 묶는다. 사본이 하나뿐인 해시는 버리고,
 * 사본이 많은 그룹을 먼저 낸다.
 *
 * @param {readonly HelperDeclaration[]} declarations
 * @returns {DuplicateGroup[]}
 */
export const groupDuplicates = (declarations) => {
  /** @type {Map<string, HelperDeclaration[]>} */
  const byHash = new Map();
  for (const declaration of declarations) {
    const bucket = byHash.get(declaration.hash);
    if (bucket === undefined) byHash.set(declaration.hash, [declaration]);
    else bucket.push(declaration);
  }

  return [...byHash]
    .filter(([, bucket]) => bucket.length >= 2)
    .map(([hash, bucket]) => ({ hash, declarations: bucket }))
    .sort(
      (left, right) => right.declarations.length - left.declarations.length,
    );
};

/**
 * 디렉터리를 재귀로 훑어 `.ts`·`.tsx` 파일 경로를 모은다. 생성물 디렉터리는
 * 건너뛴다.
 *
 * @param {string} directory
 * @returns {string[]}
 */
export const collectSourcePaths = (directory) => {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return IGNORED_DIRECTORY_NAMES.has(entry.name)
        ? []
        : collectSourcePaths(entryPath);
    }
    return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
};

/**
 * 대상 디렉터리 전체를 훑어 헬퍼 선언을 모은다.
 *
 * @param {readonly string[]} directories
 * @returns {HelperDeclaration[]}
 */
export const scanDirectories = (directories) =>
  directories.flatMap((directory) =>
    collectSourcePaths(directory)
      .sort()
      .flatMap((path) =>
        collectHelperDeclarations(readFileSync(path, "utf8"), path),
      ),
  );

/**
 * 목록에 없는 테스트 디렉터리를 찾는다. workspace 디렉터리 아래의 `test`와
 * 저장소 루트의 `e2e`·`tests`가 후보다. 빈 배열이 아니면 대상 목록이 실제
 * 트리보다 좁아진 것이다.
 *
 * @returns {string[]}
 */
export const findUnlistedTestDirectories = () => {
  const candidates = ["e2e", "tests"];
  for (const workspace of WORKSPACE_ROOTS) {
    if (!existsSync(workspace)) continue;
    for (const entry of readdirSync(workspace, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = join(workspace, entry.name, "test");
      if (existsSync(candidate)) candidates.push(candidate);
    }
  }
  return candidates.filter(
    (candidate) => !DEFAULT_TARGET_DIRECTORIES.includes(candidate),
  );
};

/**
 * CLI 진입점. 인자를 주면 그 디렉터리만, 주지 않으면 기본 대상을 훑는다.
 * 중복을 찾아도 실패로 끝내지 않는다 — 게이트가 아니라 진단 도구다.
 */
const main = (argv) => {
  const directories = argv.length > 0 ? argv : DEFAULT_TARGET_DIRECTORIES;
  const missing = directories.filter((directory) => !existsSync(directory));
  for (const directory of missing) {
    console.log(`대상 없음: ${directory}`);
  }

  for (const unlisted of findUnlistedTestDirectories()) {
    console.log(
      `대상 목록에 없음: ${unlisted} — DEFAULT_TARGET_DIRECTORIES에 추가한다`,
    );
  }

  const declarations = scanDirectories(directories);
  const groups = groupDuplicates(declarations);

  for (const group of groups) {
    const names = [...new Set(group.declarations.map((entry) => entry.name))];
    console.log(
      `[${group.hash}] ${group.declarations.length}벌 — ${names.join(", ")}`,
    );
    for (const entry of group.declarations) {
      console.log(`    ${entry.path}:${entry.line}`);
    }
  }

  console.log(
    `중복 그룹 ${groups.length}개 / 헬퍼 선언 ${declarations.length}개`,
  );
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
