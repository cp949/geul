/**
 * `scripts/verify.mjs`의 실패 목록 파서 계약을 진다.
 *
 * `pnpm verify:failed`는 이 목록만 다시 돈다.
 * 파서가 실패를 놓치면 그 테스트는 재실행에서 빠진다. 고치지 않은 실패가 통과로 보고된다.
 * 리포트 모양은 vitest 5.0.0·Playwright 1.63.0 json 리포터 실측에서 가져왔다.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  collectPlaywrightFailures,
  collectVitestFailures,
} from "../scripts/verify.mjs";

const workspaceRoot = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
);

describe("collectVitestFailures", () => {
  it("실패한 파일만 저장소 상대 경로로 돌려준다", () => {
    const report = {
      testResults: [
        { name: resolve(workspaceRoot, "tests/a.test.ts"), status: "passed" },
        {
          name: resolve(workspaceRoot, "packages/io/test/b.test.ts"),
          status: "failed",
        },
      ],
    };
    expect(collectVitestFailures(report)).toEqual([
      "packages/io/test/b.test.ts",
    ]);
  });

  it("리포트가 없거나 모양이 다르면 빈 목록을 돌려준다", () => {
    expect(collectVitestFailures(undefined)).toEqual([]);
    expect(collectVitestFailures({})).toEqual([]);
  });
});

describe("collectPlaywrightFailures", () => {
  it("중첩 describe 안의 실패를 e2e 기준 file:line으로 모은다", () => {
    const report = {
      suites: [
        {
          file: "a.spec.ts",
          specs: [
            { file: "a.spec.ts", line: 3, tests: [{ status: "expected" }] },
          ],
          suites: [
            {
              file: "a.spec.ts",
              specs: [
                {
                  file: "a.spec.ts",
                  line: 9,
                  tests: [{ status: "unexpected" }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(collectPlaywrightFailures(report)).toEqual(["e2e/a.spec.ts:9"]);
  });

  it("재시도로 통과한 flaky와 skipped는 실패로 세지 않는다", () => {
    const report = {
      suites: [
        {
          specs: [
            { file: "b.spec.ts", line: 1, tests: [{ status: "flaky" }] },
            { file: "b.spec.ts", line: 2, tests: [{ status: "skipped" }] },
          ],
        },
      ],
    };
    expect(collectPlaywrightFailures(report)).toEqual([]);
  });

  it("두 project에서 함께 실패한 같은 테스트는 한 번만 담는다", () => {
    const report = {
      suites: [
        {
          specs: [
            {
              file: "c.spec.ts",
              line: 5,
              tests: [{ status: "unexpected" }, { status: "unexpected" }],
            },
          ],
        },
      ],
    };
    expect(collectPlaywrightFailures(report)).toEqual(["e2e/c.spec.ts:5"]);
  });
});
