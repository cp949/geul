/**
 * 테스트 헬퍼 중복 탐지기(`scripts/find-duplicate-test-helpers.mjs`)의 계약.
 *
 * PIT-0022의 검증 명령 1번은 이름 기반 grep이라 사각지대 세 개를 갖는다
 * (대상 glob이 react 전용 · `^` 앵커 · 이름이 다르면 못 잡음, Issue #92).
 * 이 탐지기는 그 자리를 대신하므로, 스스로가 놓치거나 잘못 잡으면 "중복이
 * 없다"는 잘못된 증거를 만든다. 여기서는 무엇을 헬퍼로 세는지, 어디까지
 * 정규화하는지, 어떤 것을 상수로 보고 버리는지를 고정한다.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  collectHelperDeclarations,
  DEFAULT_TARGET_DIRECTORIES,
  findUnlistedTestDirectories,
  groupDuplicates,
  WORKSPACE_ROOTS,
} from "../scripts/find-duplicate-test-helpers.mjs";

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
 * `pnpm-workspace.yaml`의 `packages:` 블록에서 workspace 루트 이름을 뽑는다.
 * 탐지기는 이 루트 아래를 훑어 "대상 목록에 없는 테스트 디렉터리"를 보고하는데,
 * 그 루트 목록이 스크립트 안에 리터럴로 박혀 있다. 새 루트가 workspace에
 * 추가되면 탐지기가 조용히 그 아래를 보지 못하므로 여기서 어긋남을 잡는다.
 */
const manifestWorkspaceRoots = () => {
  const manifest = readFileSync("pnpm-workspace.yaml", "utf8");
  const block = /^packages:\n((?:[ \t]+-[ \t]+.*\n)+)/m.exec(manifest)?.[1];

  expect(block).toBeDefined();
  return [...(block ?? "").matchAll(/-[ \t]+["']?([^"'\s]+)["']?/g)].map(
    (match) => (match[1] ?? "").replace(/\/\*+$/, ""),
  );
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

  it("훑는 workspace 루트가 pnpm-workspace.yaml의 목록과 같다", () => {
    expect([...WORKSPACE_ROOTS].sort()).toEqual(
      manifestWorkspaceRoots().sort(),
    );
  });
});
