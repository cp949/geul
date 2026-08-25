/**
 * `scripts/check-escompat.mjs` 게이트 자신의 계약을 진다(G-WKS-004,
 * cp949/geul#122 리뷰 발견 1).
 *
 * 게이트의 PIT-0027 축(검사 대상 0건 실패)과 목록 import 축
 * (`tests/workspace-roots.test.ts`)은 이미 지는 주체가 있다. 여기서 지는
 * 것은 남은 두 축이다.
 *
 * 1. **대상 파생이 조용히 좁아지지 않는가** — `escompatDistDirectories()`가
 *    `packages/*`의 패키지 전량을 내는지, 테스트 쪽 독립 열거와 대조한다.
 *    독립 열거는 의도된 이중화다(`scripts/workspace-roots.mjs`의 "리터럴
 *    목록과 테스트 쪽 독립 파서는 의도된 이중화다"와 같은 패턴) — 구현을
 *    다시 호출해 대조하면 동어반복이라 filter가 좁아져도 지지 않는다.
 * 2. **검출력이 죽지 않는가** — 게이트와 같은 ESLint 구성으로 위반 seed를
 *    lint해 변수 receiver의 Chrome 75 미지원 API 호출이 실제로 검출되는지
 *    고정한다. es-x의 prototype 규칙은 aggressive 설정이 없으면 변수
 *    receiver를 통과시키므로(실측), 이 단언이 aggressive 제거·규칙 해제
 *    변이를 RED로 만든다.
 */

import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  createEscompatESLint,
  escompatDistDirectories,
} from "../scripts/check-escompat.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

describe("check:escompat 게이트의 검사 범위", () => {
  it("packages/* 패키지 전량의 dist를 대상으로 파생한다", () => {
    // 독립 열거 — 구현(workspacePackageDirectories 경유)을 되뇌지 않는다.
    const packagesRoot = join(repositoryRoot, "packages");
    const expected = readdirSync(packagesRoot)
      .filter((name) => existsSync(join(packagesRoot, name, "package.json")))
      .map((name) => join("packages", name, "dist"))
      .sort();

    // 열거가 통째로 죽으면 빈 목록 대조가 공허하게 통과한다.
    expect(expected.length).toBeGreaterThan(0);

    const derived = escompatDistDirectories(repositoryRoot).map((directory) =>
      relative(repositoryRoot, directory),
    );

    expect(derived).toEqual(expected);
  });
});

describe("check:escompat 게이트의 검출력", () => {
  it("변수 receiver의 Chrome 75 미지원 API 호출을 검출한다", async () => {
    const eslint = createEscompatESLint();
    // 원래 버그 패턴(@tiptap/core dispatchTransaction의
    // transactions.findLast)과 같은 변수 receiver 형태의 seed다.
    const [result] = await eslint.lintText(
      "export function probe(a) { return a.findLast((x) => x) ?? a.at(0); }\n",
      {
        filePath: join(
          repositoryRoot,
          "packages",
          "model",
          "dist",
          "__escompat-seed__.js",
        ),
      },
    );

    const ruleIds = (result?.messages ?? []).map((message) => message.ruleId);
    expect(ruleIds).toContain("es-x/no-array-prototype-findlast-findlastindex");
    expect(ruleIds).toContain("es-x/no-array-prototype-at");
  });

  it("Chrome 75가 지원하는 코드는 통과시킨다", async () => {
    const eslint = createEscompatESLint();
    // ES2019 이하 + 해제 목록의 대표(globalThis, Chrome 71)만 쓴 seed다.
    const [result] = await eslint.lintText(
      "export const ok = [[1], [2]].flat().includes(1) && globalThis;\n",
      {
        filePath: join(
          repositoryRoot,
          "packages",
          "model",
          "dist",
          "__escompat-clean-seed__.js",
        ),
      },
    );

    expect(result?.messages ?? []).toEqual([]);
  });
});
