/**
 * 검증 게이트 실행기.
 *
 * 모드:
 * - `full`: 전 단계와 chromium·mobile e2e 전량. push 직전 게이트다. CI도 이 모드를 쓴다.
 * - `quick`: e2e 전량을 뺀다. 인자로 준 e2e spec만 돈다. qq 단계-4 병합 게이트다.
 * - `failed`: 직전 `full`/`quick` 실행에서 실패하거나 건너뛴 단계만 다시 돈다.
 *
 * 실패해도 멈추지 않는다. 끝까지 돈 뒤 단계별 결과를 한 번에 보고한다.
 * `&&` 체인은 첫 실패에서 멈춰 다음 실패를 가린다. 그래서 고칠 때마다 전량을 다시 돌았다.
 *
 * `failed` 모드의 재실행 범위:
 * - unit test·e2e: 실패한 파일·테스트만 돈다.
 * - unit test: 기준 커밋 이후 바뀐 파일과 관련된 테스트를 더한다(`vitest --changed`).
 * - lint·format: 실패했으면 전량, 아니면 바뀐 파일만 검사한다.
 * - build·escompat·typecheck·boundaries·licenses: 싸므로 항상 다시 돈다.
 *
 * 실패 목록을 못 읽으면 그 단계를 전량으로 다시 돈다.
 * 빈 목록으로 재실행하면 아무것도 안 돌고 통과하는 거짓 통과가 된다.
 *
 * 상태와 로그는 `_tmp/verify/`에 둔다.
 * `test-results/`는 Playwright가 실행마다 비우므로 쓰지 않는다.
 */

import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(import.meta.dirname, "..");
const outDir = resolve(workspaceRoot, "_tmp/verify");
const statePath = resolve(outDir, "state.json");
const vitestJsonPath = resolve(outDir, "vitest.json");
const vitestChangedJsonPath = resolve(outDir, "vitest-changed.json");
const e2eJsonPath = resolve(outDir, "e2e.json");

const E2E_PROJECTS = ["--project=chromium", "--project=mobile"];
const LINT_EXTENSIONS = /\.(js|jsx|mjs|cjs|ts|tsx|mts|cts)$/;
const FORMAT_EXTENSIONS =
  /\.(js|jsx|mjs|cjs|ts|tsx|mts|cts|json|jsonc|css|scss)$/;

/** @typedef {"pass" | "fail" | "skip" | "omit"} StepStatus */
/**
 * @typedef {object} StepResult
 * @property {StepStatus} status
 * @property {number} seconds
 * @property {string | undefined} [note]
 */
/**
 * @typedef {object} VerifyState
 * @property {"full" | "quick"} mode
 * @property {string} base 실행 시작 시점 HEAD. `failed` 모드의 변경 기준이다.
 * @property {string[]} e2eSpecs `quick` 모드에서 받은 spec 인자
 * @property {Record<string, StepResult>} steps
 * @property {string[]} vitestFailures 실패한 unit test 파일(저장소 상대 경로)
 * @property {string[]} e2eFailures 실패한 e2e 테스트(`file:line`)
 */

const STEP_ORDER = [
  "lint",
  "format:check",
  "build",
  "check:escompat",
  "typecheck",
  "test",
  "check:boundaries",
  "check:licenses",
  "test:e2e",
];

/**
 * vitest json 리포트에서 실패한 테스트 파일을 뽑는다.
 *
 * @param {unknown} report
 * @returns {string[]}
 */
export function collectVitestFailures(report) {
  const results =
    /** @type {{ testResults?: { name: string, status: string }[] } | undefined} */ (
      report
    )?.testResults;
  if (!Array.isArray(results)) return [];
  return results
    .filter((result) => result.status === "failed")
    .map((result) => relative(workspaceRoot, result.name));
}

/**
 * Playwright json 리포트에서 실패한 테스트를 `file:line`으로 뽑는다.
 *
 * 재시도 뒤 통과한 flaky 테스트는 `expected`가 아니라 `flaky`다. 실패로 세지 않는다.
 *
 * @param {unknown} report
 * @returns {string[]}
 */
export function collectPlaywrightFailures(report) {
  /** @type {Set<string>} */
  const failures = new Set();
  /** @param {any} suite */
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      const failed = (spec.tests ?? []).some(
        /** @param {any} test */
        (test) => test.status === "unexpected",
      );
      if (failed) failures.add(`e2e/${spec.file}:${spec.line}`);
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of /** @type {any} */ (report)?.suites ?? []) visit(suite);
  return [...failures];
}

/** @param {string} path */
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

/** @param {string[]} args */
function git(args) {
  const result = spawnSync("git", args, {
    cwd: workspaceRoot,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

/**
 * 기준 커밋 이후 바뀐 파일. 커밋한 것, 커밋 안 한 것, 새 파일을 모두 포함한다.
 * 지운 파일은 검사할 수 없으므로 뺀다.
 *
 * @param {string} base
 */
function changedFilesSince(base) {
  const tracked = git(["diff", "--name-only", base]).split("\n");
  const untracked = git(["ls-files", "--others", "--exclude-standard"]).split(
    "\n",
  );
  return [...new Set([...tracked, ...untracked])].filter(
    (file) => file !== "" && existsSync(resolve(workspaceRoot, file)),
  );
}

/**
 * 명령 여러 개를 차례로 돌린다. 하나라도 실패하면 실패다.
 * 출력은 단계 로그 파일에 모은다. CI에서는 그대로 흘려보낸다.
 *
 * @param {string} name
 * @param {string[][]} commands pnpm 인자 목록
 * @param {Record<string, string>} [env]
 * @returns {StepResult}
 */
function runStep(name, commands, env = {}) {
  const logPath = resolve(outDir, `${name.replace(":", "-")}.log`);
  const started = Date.now();
  process.stdout.write(`▶ ${name} … `);
  const fd = openSync(logPath, "w");
  let ok = true;
  for (const args of commands) {
    writeFileSync(fd, `$ pnpm ${args.join(" ")}\n`);
    const result = spawnSync("pnpm", args, {
      cwd: workspaceRoot,
      env: { ...process.env, ...env },
      stdio: process.env.CI ? "inherit" : ["ignore", fd, fd],
    });
    if (result.status !== 0) ok = false;
  }
  closeSync(fd);
  const seconds = Math.round((Date.now() - started) / 1000);
  process.stdout.write(`${ok ? "통과" : "실패"} ${seconds}s\n`);
  if (!ok && !process.env.CI) {
    const tail = readFileSync(logPath, "utf8").trimEnd().split("\n").slice(-30);
    process.stdout.write(`${tail.map((line) => `  │ ${line}`).join("\n")}\n`);
  }
  return {
    status: ok ? "pass" : "fail",
    seconds,
    note: ok ? undefined : relative(workspaceRoot, logPath),
  };
}

/** @param {string} path */
function vitestJsonArgs(path) {
  return ["--reporter=default", "--reporter=json", `--outputFile.json=${path}`];
}

/**
 * 리포트 파일에서 실패를 모은다. 지난 실행의 낡은 리포트를 읽지 않도록 돌기 전에 지운다.
 *
 * @param {string[]} paths
 */
function clearReports(paths) {
  for (const path of paths) rmSync(path, { force: true });
}
const e2eJsonEnv = { PLAYWRIGHT_JSON_OUTPUT_NAME: e2eJsonPath };
const e2eReporterArg = `--reporter=${process.env.CI ? "github" : "list"},json`;

/** @param {string[]} specs */
function e2eCommand(specs) {
  return [
    "exec",
    "playwright",
    "test",
    ...E2E_PROJECTS,
    e2eReporterArg,
    ...specs,
  ];
}

/**
 * @param {"full" | "quick"} mode
 * @param {string[]} e2eSpecs
 * @returns {VerifyState}
 */
function runInitial(mode, e2eSpecs) {
  /** @type {VerifyState} */
  const state = {
    mode,
    base: git(["rev-parse", "HEAD"]),
    e2eSpecs,
    steps: {},
    vitestFailures: [],
    e2eFailures: [],
  };
  const { steps } = state;
  steps.lint = runStep("lint", [["run", "lint"]]);
  steps["format:check"] = runStep("format:check", [["run", "format:check"]]);
  steps.build = runStep("build", [["run", "build"]]);
  steps["check:escompat"] =
    steps.build.status === "pass"
      ? runStep("check:escompat", [["run", "check:escompat"]])
      : { status: "skip", seconds: 0, note: "build 실패" };
  steps.typecheck = runStep("typecheck", [["run", "typecheck"]]);
  clearReports([vitestJsonPath]);
  steps.test = runStep("test", [
    ["exec", "vitest", "run", ...vitestJsonArgs(vitestJsonPath)],
  ]);
  if (steps.test.status === "fail") {
    state.vitestFailures = collectVitestFailures(readJson(vitestJsonPath));
  }
  steps["check:boundaries"] = runStep("check:boundaries", [
    ["run", "check:boundaries"],
  ]);
  steps["check:licenses"] = runStep("check:licenses", [
    ["run", "check:licenses"],
  ]);

  if (mode === "quick" && e2eSpecs.length === 0) {
    steps["test:e2e"] = { status: "omit", seconds: 0, note: "spec 인자 없음" };
  } else if (steps.build.status !== "pass") {
    steps["test:e2e"] = { status: "skip", seconds: 0, note: "build 실패" };
  } else {
    clearReports([e2eJsonPath]);
    steps["test:e2e"] = runStep("test:e2e", [e2eCommand(e2eSpecs)], e2eJsonEnv);
    if (steps["test:e2e"].status === "fail") {
      state.e2eFailures = collectPlaywrightFailures(readJson(e2eJsonPath));
    }
  }
  return state;
}

/**
 * @param {VerifyState} state
 * @returns {VerifyState}
 */
function runFailed(state) {
  const { steps } = state;
  const notPassed = (/** @type {string} */ name) =>
    steps[name]?.status === "fail" || steps[name]?.status === "skip";
  const changed = changedFilesSince(state.base);

  for (const [name, pattern, fullScript, tool] of /** @type {const} */ ([
    ["lint", LINT_EXTENSIONS, "lint", ["exec", "eslint", "--no-warn-ignored"]],
    [
      "format:check",
      FORMAT_EXTENSIONS,
      "format:check",
      ["exec", "prettier", "--check", "--ignore-unknown"],
    ],
  ])) {
    const files = changed.filter((file) => pattern.test(file));
    if (notPassed(name)) {
      steps[name] = runStep(name, [["run", fullScript]]);
    } else if (files.length > 0) {
      steps[name] = runStep(name, [[...tool, ...files]]);
    }
  }

  steps.build = runStep("build", [["run", "build"]]);
  steps["check:escompat"] =
    steps.build.status === "pass"
      ? runStep("check:escompat", [["run", "check:escompat"]])
      : { status: "skip", seconds: 0, note: "build 실패" };
  steps.typecheck = runStep("typecheck", [["run", "typecheck"]]);

  /** @type {string[][]} */
  const testCommands = [];
  if (notPassed("test")) {
    // 실패 목록이 비면 크래시 같은 파일 밖 실패다. 전량을 돈다.
    // 지운 파일은 뺀다. 남은 게 없으면 아래 --changed 실행에 맡긴다.
    const remaining = state.vitestFailures.filter((file) =>
      existsSync(resolve(workspaceRoot, file)),
    );
    if (state.vitestFailures.length === 0) {
      testCommands.push([
        "exec",
        "vitest",
        "run",
        ...vitestJsonArgs(vitestJsonPath),
      ]);
    } else if (remaining.length > 0) {
      testCommands.push([
        "exec",
        "vitest",
        "run",
        ...vitestJsonArgs(vitestJsonPath),
        ...remaining,
      ]);
    }
  }
  if (changed.length > 0) {
    testCommands.push([
      "exec",
      "vitest",
      "run",
      `--changed=${state.base}`,
      "--passWithNoTests",
      ...vitestJsonArgs(vitestChangedJsonPath),
    ]);
  }
  if (testCommands.length > 0) {
    clearReports([vitestJsonPath, vitestChangedJsonPath]);
    steps.test = runStep("test", testCommands);
    state.vitestFailures =
      steps.test.status === "fail"
        ? [
            ...new Set([
              ...collectVitestFailures(readJson(vitestJsonPath)),
              ...collectVitestFailures(readJson(vitestChangedJsonPath)),
            ]),
          ]
        : [];
  }

  steps["check:boundaries"] = runStep("check:boundaries", [
    ["run", "check:boundaries"],
  ]);
  steps["check:licenses"] = runStep("check:licenses", [
    ["run", "check:licenses"],
  ]);

  if (notPassed("test:e2e")) {
    if (steps.build.status !== "pass") {
      steps["test:e2e"] = { status: "skip", seconds: 0, note: "build 실패" };
    } else {
      const specs =
        state.e2eFailures.length > 0 ? state.e2eFailures : state.e2eSpecs;
      clearReports([e2eJsonPath]);
      steps["test:e2e"] = runStep("test:e2e", [e2eCommand(specs)], e2eJsonEnv);
      state.e2eFailures =
        steps["test:e2e"].status === "fail"
          ? collectPlaywrightFailures(readJson(e2eJsonPath))
          : [];
    }
  }
  return state;
}

const STATUS_LABEL = {
  pass: "통과",
  fail: "실패",
  skip: "건너뜀",
  omit: "생략",
};

/**
 * @param {VerifyState} state
 * @param {string} ranMode
 */
function report(state, ranMode) {
  const lines = [`\n검증 결과 (${ranMode}, 기준 모드 ${state.mode})`];
  for (const name of STEP_ORDER) {
    const step = state.steps[name];
    if (step === undefined) continue;
    const label = STATUS_LABEL[step.status].padEnd(4, " ");
    const time =
      step.status === "pass" || step.status === "fail"
        ? `${step.seconds}s`
        : "";
    lines.push(
      `  ${label} ${name.padEnd(18)} ${time.padStart(5)}  ${step.note ?? ""}`,
    );
  }
  if (state.vitestFailures.length > 0) {
    lines.push("unit 실패 파일:", ...state.vitestFailures.map((f) => `  ${f}`));
  }
  if (state.e2eFailures.length > 0) {
    lines.push("e2e 실패 테스트:", ...state.e2eFailures.map((f) => `  ${f}`));
  }
  const failed = Object.values(state.steps).some(
    (step) => step.status === "fail" || step.status === "skip",
  );
  lines.push(failed ? "다시 실행: pnpm verify:failed" : "전 단계 통과");
  process.stdout.write(`${lines.join("\n")}\n`);
  return failed ? 1 : 0;
}

function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const args = rest.filter((arg) => arg !== "--");
  mkdirSync(outDir, { recursive: true });

  if (mode === "full" || mode === "quick") {
    if (mode === "full" && args.length > 0) {
      process.stderr.write("full 모드는 spec 인자를 받지 않는다.\n");
      return 2;
    }
    const state = runInitial(mode, args);
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
    return report(state, mode);
  }
  if (mode === "failed") {
    /** @type {VerifyState | undefined} */
    const previous = readJson(statePath);
    if (previous === undefined) {
      process.stderr.write(
        "직전 실행 기록이 없다. pnpm verify 또는 pnpm verify:quick을 먼저 실행한다.\n",
      );
      return 2;
    }
    const state = runFailed(previous);
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
    return report(state, mode);
  }
  process.stderr.write(
    "사용법: node scripts/verify.mjs <full|quick|failed> [e2e spec…]\n",
  );
  return 2;
}

// 직접 실행일 때만 게이트를 돈다. 테스트는 파서만 import한다.
if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  process.exitCode = main();
}
