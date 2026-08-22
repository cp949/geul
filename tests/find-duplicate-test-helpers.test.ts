/**
 * 테스트 헬퍼 중복 탐지기(`scripts/find-duplicate-test-helpers.mjs`)의 계약.
 *
 * PIT-0022의 검증 명령 1번은 이름 기반 grep이라 사각지대 세 개를 갖는다
 * (대상 glob이 react 전용 · `^` 앵커 · 이름이 다르면 못 잡음, Issue #92).
 * 이 탐지기는 그 자리를 대신하므로, 스스로가 놓치거나 잘못 잡으면 "중복이
 * 없다"는 잘못된 증거를 만든다. 여기서는 무엇을 헬퍼로 세는지, 어디까지
 * 정규화하는지, 어떤 것을 상수로 보고 버리는지를 고정한다.
 *
 * 대상 목록 감시(`describe("기본 대상 디렉터리")`)는 한 갈래를 더 진다 —
 * 후보 수집이 cwd에 걸리면 잘못된 cwd에서 후보가 0건이 되고 "목록 밖 없음"이
 * 공허하게 참이 된다. 그래서 수집 자체를 관측하고, cwd를 바꾼 자식 프로세스
 * 두 벌을 대조한다.
 *
 * `describe("collectTestDirectoryCandidates()가 workspaceChildDirectories()에
 * 위임한다")`는 DELTA-03이 합친 세 번째 술어 사본을 다시 진다 — 심링크 패키지
 * 아래의 `test`가 후보에 들고, 정렬 계약이 유지되고, 그 위임이 소스 수준에서
 * 실제로 지켜지는지를 fixture와 소스 스캔으로 확인한다.
 */
import { execFile } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

import {
  collectHelperDeclarations,
  collectTestDirectoryCandidates,
  DEFAULT_TARGET_DIRECTORIES,
  findUnlistedTestDirectories,
  groupDuplicates,
} from "../scripts/find-duplicate-test-helpers.mjs";

const execFileAsync = promisify(execFile);

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

// 자식에게는 파일 경로가 아니라 URL을 넘긴다. `import`가 URL을 cwd로 해석하지
// 않으므로 두 자식 사이에서 달라지는 것이 cwd 하나뿐임이 보장된다.
const detectorModuleUrl = new URL(
  "../scripts/find-duplicate-test-helpers.mjs",
  import.meta.url,
).href;

// 자식이 실행할 프로그램. 후보 수집과 차집합을 함께 찍는다 — 차집합만 보면
// "전부 목록에 있다"와 "후보를 하나도 못 모았다"가 똑같이 빈 배열이다.
const detectorProbeSource = [
  "const detector = await import(process.env.DETECTOR_MODULE_URL);",
  "process.stdout.write(",
  "  JSON.stringify({",
  "    candidates: detector.collectTestDirectoryCandidates(),",
  "    unlisted: detector.findUnlistedTestDirectories(),",
  "  }),",
  ");",
].join("\n");

/**
 * 인라인 fixture 소스에서 헬퍼 선언을 수집한다.
 * 경로는 보고용이라 기본값을 두고, 확장자가 의미를 갖는 경우에만 넘긴다.
 */
const collect = (source: string, path = "fixture/sample.test.ts") =>
  collectHelperDeclarations(source, path);

/**
 * 수집된 선언의 이름만 뽑는다. "무엇을 헬퍼로 셌는가"를 단언할 때 쓴다.
 */
const namesOf = (source: string) => collect(source).map((entry) => entry.name);

/**
 * 두 선언의 본문 해시가 같은지 본다. 이름과 위치가 아니라 본문으로만
 * 판정하는지를 확인하는 단언에 쓴다.
 */
const sameHash = (source: string) => {
  const declarations = collect(source);
  expect(declarations).toHaveLength(2);
  return declarations[0]?.hash === declarations[1]?.hash;
};

/**
 * 주어진 cwd에서 탐지기를 자식 프로세스로 import해 후보 수집과 목록 밖 결과를
 * 받는다. 저장소 루트 실행도 굳이 자식으로 띄운다 — 한쪽만 in-process로 하면
 * 두 결과가 cwd와 실행 방식 둘 다 다른 값이 되어 cwd 의존을 단독으로 짚지
 * 못한다. `process.chdir`는 쓰지 않는다: 프로세스 전역이라 같은 워커의 다른
 * 테스트를 오염시킨다.
 */
const detectorReportFrom = async (cwd: string) => {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--input-type=module", "-e", detectorProbeSource],
    { cwd, env: { ...process.env, DETECTOR_MODULE_URL: detectorModuleUrl } },
  );

  return JSON.parse(stdout) as { candidates: string[]; unlisted: string[] };
};

describe("헬퍼 선언 수집", () => {
  it("모듈 최상위 const 선언을 헬퍼로 수집한다", () => {
    const source = [
      "const mountThing = () => {",
      "  const view = render();",
      "  return view;",
      "};",
    ].join("\n");

    expect(namesOf(source)).toEqual(["mountThing"]);
  });

  it("export const 선언도 헬퍼로 수집한다", () => {
    const source = [
      "export const mountThing = () => {",
      "  const view = render();",
      "  return view;",
      "};",
    ].join("\n");

    expect(namesOf(source)).toEqual(["mountThing"]);
  });

  it("선언이 시작하는 줄 번호를 1부터 센다", () => {
    const source = [
      "import { render } from 'x';",
      "",
      "const mountThing = () => {",
      "  const view = render();",
      "  return view;",
      "};",
    ].join("\n");

    expect(collect(source)[0]?.line).toBe(3);
  });

  it("it 콜백 안의 지역 선언은 헬퍼로 세지 않는다", () => {
    const source = [
      "it('무언가를 한다', () => {",
      "  const editor = createEditor({",
      "    id: 'block-1',",
      "    onChange: () => undefined,",
      "  });",
      "  expect(editor).toBeDefined();",
      "});",
    ].join("\n");

    expect(namesOf(source)).toEqual([]);
  });

  it("it.each 2단 호출의 콜백 안 선언도 헬퍼로 세지 않는다", () => {
    const source = [
      "it.each([1, 2])('무언가를 한다 %s', (value) => {",
      "  const editor = createEditor({",
      "    id: value,",
      "    onChange: () => undefined,",
      "  });",
      "  expect(editor).toBeDefined();",
      "});",
    ].join("\n");

    expect(namesOf(source)).toEqual([]);
  });

  it("test.describe 같은 그룹 블록 안의 선언은 헬퍼로 센다", () => {
    const source = [
      'test.describe("표 편집", () => {',
      "  const mountThing = () => {",
      "    const view = render();",
      "    return view;",
      "  };",
      "});",
    ].join("\n");

    expect(namesOf(source)).toEqual(["mountThing"]);
  });

  it("다른 헬퍼 본문 안에 중첩된 지역 선언은 헬퍼로 세지 않는다", () => {
    const source = [
      "const mountThing = () => {",
      "  const inserted = compute({",
      "    rows: 2,",
      "    columns: 3,",
      "  });",
      "  return inserted;",
      "};",
    ].join("\n");

    expect(namesOf(source)).toEqual(["mountThing"]);
  });

  it("function 선언 본문 안의 지역 선언은 헬퍼로 세지 않는다", () => {
    const source = [
      "function resolvePackageRoot(base: string) {",
      "  const manifest = JSON.parse(",
      "    readFileSync(base, 'utf8'),",
      "  );",
      "  return manifest;",
      "}",
    ].join("\n");

    expect(namesOf(source)).toEqual([]);
  });

  it("class 메서드 본문 안의 지역 선언은 헬퍼로 세지 않는다", () => {
    const source = [
      "class Probe {",
      "  render() {",
      "    const view = mount({",
      "      id: 'block-1',",
      "    });",
      "    return view;",
      "  }",
      "}",
    ].join("\n");

    expect(namesOf(source)).toEqual([]);
  });

  it("beforeEach 훅 콜백 안의 지역 선언은 헬퍼로 세지 않는다", () => {
    const source = [
      "beforeEach(() => {",
      "  const container = document.createElement(",
      "    'div',",
      "  );",
      "  document.body.append(container);",
      "});",
    ].join("\n");

    expect(namesOf(source)).toEqual([]);
  });

  it("class를 프로퍼티 이름으로 쓴 객체는 중첩 스코프로 보지 않는다", () => {
    const source = [
      "const linkAttributes = buildAttributes({",
      "  class: null,",
      "});",
      "",
      'describe("링크", () => {',
      "  const openMenu = () => {",
      "    clickHandle();",
      "    waitForMenu();",
      "  };",
      "});",
    ].join("\n");

    expect(namesOf(source)).toEqual(["linkAttributes", "openMenu"]);
  });

  it("return 뒤 정규식 리터럴이 괄호를 담아도 다음 선언을 잃지 않는다", () => {
    const source = [
      "const hasBrace = (source: string) => {",
      "  return /[{]/.test(source);",
      "};",
      "",
      "const openMenu = () => {",
      "  clickHandle();",
      "  waitForMenu();",
      "};",
    ].join("\n");

    expect(namesOf(source)).toEqual(["hasBrace", "openMenu"]);
  });

  it("본문이 템플릿 리터럴로 시작하는 선언도 헬퍼로 수집한다", () => {
    const source = [
      "const tableHtml = `",
      "  <table>",
      "    <tr><td>a</td></tr>",
      "  </table>",
      "`;",
    ].join("\n");

    expect(namesOf(source)).toEqual(["tableHtml"]);
  });

  it("정규화 본문이 한 줄이면 규칙이 아니라 상수로 보고 버린다", () => {
    const source = [
      "const dragHandleLabel = '블록 메뉴 열기';",
      "const rowHandleLabel = '행 핸들을 연다';",
    ].join("\n");

    expect(namesOf(source)).toEqual([]);
  });
});

describe("본문 정규화", () => {
  it("들여쓰기와 주석만 다른 사본은 같은 해시를 받는다", () => {
    const source = [
      "const first = () => {",
      "  // 캐럿을 옮긴다.",
      "  focusEditor();",
      "  moveCaret();",
      "};",
      "",
      "const second = () => {",
      "      focusEditor();",
      "      moveCaret();",
      "};",
    ].join("\n");

    expect(sameHash(source)).toBe(true);
  });

  it("파라미터명만 다른 사본은 같은 해시를 받는다", () => {
    const source = [
      "const placeCaretA = (editor, cellId) => {",
      "  editor.commands.focus();",
      "  editor.commands.setCell(cellId);",
      "};",
      "",
      "const placeCaretB = (tiptap, cellId) => {",
      "  tiptap.commands.focus();",
      "  tiptap.commands.setCell(cellId);",
      "};",
    ].join("\n");

    expect(sameHash(source)).toBe(true);
  });

  it("파라미터 타입 표기만 다른 사본은 같은 해시를 받는다", () => {
    const source = [
      "const withProvider = (",
      "  controller: ReturnType<typeof fakeController>,",
      "  children: React.ReactNode,",
      ") => (",
      "  <Provider editor={controller}>{children}</Provider>",
      ");",
      "",
      "const externalProvider = (",
      "  controller: ReturnType<typeof fakeController>,",
      "  children: ReactNode,",
      ") => (",
      "  <Provider editor={controller}>{children}</Provider>",
      ");",
    ].join("\n");

    expect(sameHash(source)).toBe(true);
  });

  it("화살표 본문이 다음 줄에서 시작하면 파라미터 목록이 아니라 본문까지 해시한다", () => {
    const source = [
      "const renderBlockMenu = (options?: { blockIds?: readonly string[] }) =>",
      "  mountBlockEditor({",
      "    ...options,",
      "    children: <BlockSideMenu />,",
      "  });",
      "",
      "const renderSlashMenu = (options?: { blockIds?: readonly string[] }) =>",
      "  mountBlockEditor({",
      "    ...options,",
      "    children: <SlashMenu />,",
      "  });",
    ].join("\n");

    expect(sameHash(source)).toBe(false);
  });

  it("BMP 밖 문자가 앞에 있어도 뒤 선언의 본문을 어긋나지 않게 자른다", () => {
    const source = [
      "const first = () => {",
      '  toast("완료 🎉");',
      "  close();",
      "};",
      "",
      "const second = () => {",
      '  toast("완료 🎉");',
      "  close();",
      "};",
    ].join("\n");

    expect(sameHash(source)).toBe(true);
  });

  it("$가 든 파라미터명만 다른 사본도 같은 해시를 받는다", () => {
    const source = [
      "const focusA = ($el, times) => {",
      "  $el.focus();",
      "  return times + 1;",
      "};",
      "",
      "const focusB = (element, times) => {",
      "  element.focus();",
      "  return times + 1;",
      "};",
    ].join("\n");

    expect(sameHash(source)).toBe(true);
  });

  it("본문 첫 문자열만 다른 선언은 다른 해시를 받는다", () => {
    const source = [
      'const first = "왼쪽" +',
      "  join(rows);",
      "",
      'const second = "오른쪽" +',
      "  join(rows);",
    ].join("\n");

    expect(sameHash(source)).toBe(false);
  });

  it("여러 줄 템플릿 리터럴 fixture는 본문 전체로 사본을 가른다", () => {
    const withRow = [
      "const tableHtml = `",
      "  <table>",
      "    <tr><td>a</td></tr>",
      "  </table>",
      "`;",
    ].join("\n");
    const withoutRow = [
      "const tableHtml = `",
      "  <table>",
      "  </table>",
      "`;",
    ].join("\n");

    const [same] = collect(withRow, "fixture/b.test.ts");
    const [differing] = collect(withoutRow, "fixture/c.test.ts");

    expect(collect(withRow)[0]?.hash).toBe(same?.hash);
    expect(collect(withRow)[0]?.hash).not.toBe(differing?.hash);
  });

  it("본문이 다르면 다른 해시를 받는다", () => {
    const source = [
      "const first = () => {",
      "  focusEditor();",
      "  moveCaret();",
      "};",
      "",
      "const second = () => {",
      "  focusEditor();",
      "  blurEditor();",
      "};",
    ].join("\n");

    expect(sameHash(source)).toBe(false);
  });
});

describe("중복 그룹", () => {
  it("2벌 이상인 해시만 그룹으로 낸다", () => {
    const shared = ["  focusEditor();", "  moveCaret();"];
    const declarations = [
      ...collect(
        ["const first = () => {", ...shared, "};"].join("\n"),
        "fixture/a.test.ts",
      ),
      ...collect(
        ["const second = () => {", ...shared, "};"].join("\n"),
        "fixture/b.test.ts",
      ),
      ...collect(
        [
          "const lonely = () => {",
          "  focusEditor();",
          "  blurEditor();",
          "};",
        ].join("\n"),
        "fixture/c.test.ts",
      ),
    ];

    const groups = groupDuplicates(declarations);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.declarations.map((entry) => entry.path)).toEqual([
      "fixture/a.test.ts",
      "fixture/b.test.ts",
    ]);
  });

  it("사본이 많은 그룹을 먼저 낸다", () => {
    const three = ["  focusEditor();", "  moveCaret();"];
    const two = ["  focusEditor();", "  blurEditor();"];
    const declarations = [
      ...collect(
        ["const a = () => {", ...three, "};"].join("\n"),
        "fixture/a.test.ts",
      ),
      ...collect(
        ["const b = () => {", ...three, "};"].join("\n"),
        "fixture/b.test.ts",
      ),
      ...collect(
        ["const c = () => {", ...three, "};"].join("\n"),
        "fixture/c.test.ts",
      ),
      ...collect(
        ["const d = () => {", ...two, "};"].join("\n"),
        "fixture/d.test.ts",
      ),
      ...collect(
        ["const e = () => {", ...two, "};"].join("\n"),
        "fixture/e.test.ts",
      ),
    ];

    expect(
      groupDuplicates(declarations).map((group) => group.declarations.length),
    ).toEqual([3, 2]);
  });
});

/**
 * 여기부터는 탐지기가 **지금 보지 못하는 범위**를 기록한다. 이 동작이 옳다는
 * 뜻이 아니다 — 스크립트 헤더의 "알려진 한계"가 적은 것을 실행 가능한 형태로
 * 옮겨, 헤더의 주장과 실제가 조용히 어긋나는 것을 막는다.
 *
 * 사각지대의 실제 비용은 Issue #84가 실증했다 — 이름 없는 인라인 사본 여섯이
 * 탐지기와 이름 기반 grep과 본문 해시를 전부 통과했다. 어느 파일에서 무엇이
 * 그랬는지와 그런 형태를 무엇으로 잡는지는 스크립트 헤더의 "알려진 한계"가
 * 단독 소유한다.
 *
 * 나중에 탐지 범위를 넓히면 아래 테스트가 진다. 그때 고칠 것은 테스트가 아니라
 * 헤더의 "알려진 한계" 목록이고, 실패 자체가 그 넓힘이 의도적이었음을 드러낸다.
 */
describe("알려진 사각지대: const 선언이 아닌 사본", () => {
  /** 같은 본문을 형태만 바꿔 넣기 위한 공통 본문. 두 줄이라 상수로 버려지지 않는다. */
  const sharedBody = ["  focusEditor();", "  moveCaret();"];

  /** 같은 소스를 두 파일에 두고 중복 그룹 수를 센다. */
  const groupsAcrossTwoFiles = (source: string) =>
    groupDuplicates([
      ...collect(source, "fixture/a.test.tsx"),
      ...collect(source, "fixture/b.test.tsx"),
    ]).length;

  it("이름 없는 인라인 사본은 같은 본문이 두 파일에 있어도 중복 그룹이 0이다", () => {
    const source = [
      "render(",
      "  <EditorProvider editor={controller as unknown as EditorController}>",
      "    <BlockSideMenu />",
      "  </EditorProvider>,",
      ");",
    ].join("\n");

    expect(namesOf(source)).toEqual([]);
    expect(groupsAcrossTwoFiles(source)).toBe(0);
  });

  it("같은 본문을 const로 선언하면 같은 조건에서 중복 그룹이 1이다", () => {
    const source = ["const openMenu = () => {", ...sharedBody, "};"].join("\n");

    expect(namesOf(source)).toEqual(["openMenu"]);
    expect(groupsAcrossTwoFiles(source)).toBe(1);
  });

  it("최상위 function 선언은 헬퍼로 세지 않는다", () => {
    const source = ["function openMenu() {", ...sharedBody, "}"].join("\n");

    expect(namesOf(source)).toEqual([]);
    expect(groupsAcrossTwoFiles(source)).toBe(0);
  });

  it("function 선언은 본문 안의 const까지 함께 잃는다", () => {
    const source = [
      "function mountThing() {",
      "  const view = render({",
      "    id: 'block-1',",
      "  });",
      "  return view;",
      "}",
    ].join("\n");

    expect(namesOf(source)).toEqual([]);
  });

  it("최상위 let 선언은 헬퍼로 세지 않는다", () => {
    const source = ["let openMenu = () => {", ...sharedBody, "};"].join("\n");

    expect(namesOf(source)).toEqual([]);
    expect(groupsAcrossTwoFiles(source)).toBe(0);
  });

  it("최상위 var 선언은 헬퍼로 세지 않는다", () => {
    const source = ["var openMenu = () => {", ...sharedBody, "};"].join("\n");

    expect(namesOf(source)).toEqual([]);
    expect(groupsAcrossTwoFiles(source)).toBe(0);
  });
});

describe("기본 대상 디렉터리", () => {
  it("react와 core뿐 아니라 model·io·e2e·tests도 대상에 넣는다", () => {
    expect(DEFAULT_TARGET_DIRECTORIES).toEqual([
      "packages/model/test",
      "packages/io/test",
      "packages/core/test",
      "packages/react/test",
      "e2e",
      "tests",
    ]);
  });

  it("저장소의 모든 테스트 디렉터리가 기본 대상에 들어 있다", () => {
    expect(findUnlistedTestDirectories()).toEqual([]);
  });

  it("후보 수집이 e2e·tests와 workspace 아래 test 디렉터리를 저장소 상대 경로로 정렬해 모은다", () => {
    const candidates = collectTestDirectoryCandidates();

    expect(candidates).toContain("e2e");
    expect(candidates).toContain("tests");
    expect(
      candidates.filter((candidate) => candidate.endsWith("/test")),
    ).not.toEqual([]);
    expect(candidates.filter((candidate) => isAbsolute(candidate))).toEqual([]);

    // 정렬을 계약으로 고정한다. 정렬 단언만 두면 수집 순서가 우연히 정렬돼 있을
    // 때 공허하게 참이 되므로, 정렬이 없을 때 실제로 갈리는 자리를 먼저 단언한다
    // — 수집은 `e2e`·`tests`를 먼저 담고 workspace 아래를 뒤에 담으므로, 정렬이
    // 없으면 `tests`가 `packages/*/test`보다 앞에 온다.
    const firstPackageCandidate = candidates.findIndex((candidate) =>
      candidate.startsWith("packages/"),
    );

    expect(firstPackageCandidate).toBeGreaterThan(-1);
    expect(candidates.indexOf("tests")).toBeGreaterThan(firstPackageCandidate);
    expect(candidates).toEqual([...candidates].sort());
  });

  it("후보 수집 결과가 기본 대상 디렉터리를 빠짐없이 포함한다", () => {
    expect(collectTestDirectoryCandidates()).toEqual(
      expect.arrayContaining([...DEFAULT_TARGET_DIRECTORIES]),
    );
  });

  it("저장소 밖 cwd에서 실행해도 저장소 루트에서 실행한 것과 같은 결과를 낸다", async () => {
    const [fromRoot, fromOutside] = await Promise.all([
      detectorReportFrom(repositoryRoot),
      detectorReportFrom(tmpdir()),
    ]);

    expect(
      fromRoot.candidates.filter((candidate) => candidate.endsWith("/test")),
    ).not.toEqual([]);
    expect(fromOutside.candidates).toEqual(fromRoot.candidates);
    expect(fromOutside.unlisted).toEqual(fromRoot.unlisted);
  });
});

/**
 * DELTA-03: `collectTestDirectoryCandidates()`가 자식 열거를 자기 루프로 다시
 * 구현하지 않고 `workspaceChildDirectories()`(`scripts/workspace-roots.mjs`)에
 * 위임하는지를 진다. 옛 술어(`entry.isDirectory()` 단독 판정)로는 심링크
 * 패키지 아래의 `test`가 후보에서 조용히 빠지고, `findUnlistedTestDirectories()`가
 * "목록 밖 없음"을 잘못 보고한다(`PIT-0022`).
 *
 * fixture의 workspace 루트 이름은 `apps`/`packages` 고정이다 —
 * `collectTestDirectoryCandidates(repoRoot)`가 `workspaceChildDirectories(repoRoot)`를
 * 기본 glob(`WORKSPACE_PACKAGE_GLOBS`)으로 호출하므로, glob을 fixture에서
 * 따로 주입할 방법이 없다.
 */
describe("collectTestDirectoryCandidates()가 workspaceChildDirectories()에 위임한다", () => {
  // 각 `it` 사이의 fixture 누수를 막는다.
  let tmpRoot: string | undefined;

  afterEach(() => {
    if (tmpRoot === undefined) return;
    rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = undefined;
  });

  it("심링크로 둔 패키지 아래의 test 디렉터리를 후보로 낸다", () => {
    const localTmpRoot = mkdtempSync(
      join(tmpdir(), "geul-test-helper-candidates-"),
    );
    tmpRoot = localTmpRoot;
    const repoRoot = join(localTmpRoot, "repo");
    const externalDir = join(localTmpRoot, "external");

    // packages/real/test — package.json 없는 일반 디렉터리 아래의 test.
    // `workspacePackageDirectories()`를 썼다면(둘 다 package.json이 없으므로)
    // 이 항목도 함께 빠진다 — 아래 심링크 항목과 같은 단언으로 그 변이도
    // 잡는다.
    mkdirSync(join(repoRoot, "packages", "real", "test"), { recursive: true });

    // 심링크 대상. repoRoot 바깥에 둬 "심링크를 안 따라가면 아예 안 보인다"는
    // 조건을 실제로 만든다.
    mkdirSync(join(externalDir, "linked-pkg", "test"), { recursive: true });

    // packages/linked — 디렉터리를 가리키는 심링크. 로컬 readdirSync 루프
    // (`entry.isDirectory()` 단독 판정)를 되살리면 이 항목이 조용히 빠진다.
    symlinkSync(
      "../../external/linked-pkg",
      join(repoRoot, "packages", "linked"),
      "dir",
    );

    const candidates = collectTestDirectoryCandidates(repoRoot);

    expect(candidates).toContain("packages/linked/test");
    expect(candidates).toContain("packages/real/test");
    // `e2e`·`tests`는 존재 여부와 무관하게 무조건 포함되는 기존 계약이다 —
    // fixture에 실제로 없어도 후보에 남는다.
    expect(candidates).toContain("e2e");
    expect(candidates).toContain("tests");
  });

  it("워크스페이스 나열·파일시스템 순서와 무관하게 정렬해 돌려준다", () => {
    const localTmpRoot = mkdtempSync(join(tmpdir(), "geul-test-helper-sort-"));
    tmpRoot = localTmpRoot;
    const repoRoot = join(localTmpRoot, "repo");

    // `apps/zzz/test`는 알파벳 순으로 "e2e"보다 앞서고, `packages/aaa/test`는
    // "tests"보다 앞선다. 수집은 초기 `["e2e", "tests"]` 뒤에 workspace 결과를
    // 이어 붙이므로, 정렬 없이 이어 붙이면 최종 순서가
    // `["e2e", "tests", "apps/zzz/test", "packages/aaa/test"]`가 되어 알파벳
    // 순이 아니게 된다.
    mkdirSync(join(repoRoot, "apps", "zzz", "test"), { recursive: true });
    mkdirSync(join(repoRoot, "packages", "aaa", "test"), { recursive: true });

    // 변이: `collectTestDirectoryCandidates()`의 `.sort()`를 지우면 이 등식이
    // 어긋난다(위 순서 그대로 나온다).
    expect(collectTestDirectoryCandidates(repoRoot)).toEqual([
      "apps/zzz/test",
      "e2e",
      "packages/aaa/test",
      "tests",
    ]);
  });
});

/**
 * `scripts/find-duplicate-test-helpers.mjs`에서 `export const <name> = (...) =>
 * { ... };` 형태로 선언된 최상위 화살표 함수 하나의 본문(중괄호 안쪽)을 뽑는다.
 * 여는 중괄호 다음부터 괄호 깊이를 세어 짝이 맞는 닫는 중괄호를 찾는다.
 *
 * 판정 범위를 이 함수 하나로 좁히는 이유는 오탐이다. 같은 파일의
 * `collectSourcePaths()`가 `.tsx?` 소스 파일을 재귀로 훑으려고 `readdirSync`와
 * `entry.isDirectory()`를 **합법적으로** 쓴다 — 그 자리는 이 DELTA의 범위
 * 밖이다(중복 탐지 알고리즘 자체). 파일 전체에서 그 토큰을 찾으면 이 합법적인
 * 자리가 오탐으로 걸린다. `tests/workspace-roots.test.ts`가 배열 리터럴
 * 범위로 판정 범위를 좁힌 것(`arrayLiteralSpan`)과 같은 이유의 같은 형태다.
 */
const extractArrowFunctionBody = (source: string, functionName: string) => {
  const declaration = new RegExp(
    `export const ${functionName} = \\([^)]*\\) => \\{`,
  );
  const match = declaration.exec(source);

  expect(match).not.toBeNull();
  if (match === null) throw new Error("unreachable");

  const bodyStart = match.index + match[0].length;
  let depth = 1;
  let cursor = bodyStart;

  while (cursor < source.length && depth > 0) {
    if (source[cursor] === "{") depth += 1;
    else if (source[cursor] === "}") depth -= 1;
    cursor += 1;
  }

  return source.slice(bodyStart, cursor - 1);
};

/**
 * 완료 조건 3의 트랙-2 변이를 진다 — 옛 술어(`entry.isDirectory()` 단독
 * 판정)가 아니라 심링크까지 추종하는 **새로 올바르게 구현한** 로컬 열거
 * 루프를 `collectTestDirectoryCandidates()` 안에 심어도, 행위 기반 완료
 * 조건(1·2·4·5)은 전부 통과한다 — 그 루프가 기능적으로 `workspaceChildDirectories()`와
 * 동등하기 때문이다. 소스 스캔만 그 변이를 잡는다.
 */
describe("collectTestDirectoryCandidates()가 자체 열거 루프를 갖지 않는다", () => {
  it("함수 본문에 readdirSync·isDirectory 패턴이 없고 workspaceChildDirectories()를 부른다", () => {
    const source = readFileSync(
      new URL("../scripts/find-duplicate-test-helpers.mjs", import.meta.url),
      "utf8",
    );
    const body = extractArrowFunctionBody(
      source,
      "collectTestDirectoryCandidates",
    );

    expect(body).not.toMatch(/readdirSync/);
    expect(body).not.toMatch(/\.isDirectory\(/);
    expect(body).toMatch(/workspaceChildDirectories\(/);

    // 위 두 부정 단언은 함수 본문의 텍스트만 본다 — import를 지우고 같은
    // 이름의 지역 함수를 새로 선언해도 속아 넘어간다. import 구문 자체도
    // 확인한다.
    expect(source).toMatch(
      /^\s*import\s*\{\s*workspaceChildDirectories\s*\}\s*from\s*["']\.\/workspace-roots\.mjs["']/m,
    );
  });
});
