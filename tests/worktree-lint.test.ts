/**
 * eslint.config.js의 `.worktrees` 무시 패턴이 git worktree 격리 작업에서도
 * 올바르게 동작하는지 확인하는 테스트(구 biome.json 대상 테스트를 도구
 * 교체에 맞춰 옮김).
 * 워크트리 자신의 내부에서 실행한 lint가 자기 파일을 정상적으로 검사하는지,
 * 그리고 메인 저장소에서 실행한 lint가 여전히 워크트리 하위를 제외하는지
 * 두 방향을 함께 다룬다.
 */
import { execFile } from "node:child_process";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const eslintBin = fileURLToPath(
  new URL("../node_modules/.bin/eslint", import.meta.url),
);
const fixturePath = fileURLToPath(
  new URL(
    `../.worktrees/worktree-lint-fixture-${process.pid}/`,
    import.meta.url,
  ),
);

/**
 * 지정한 cwd에서 `eslint .`를 실행하고 exit code와 표준출력·표준에러를
 * 합쳐서 돌려준다. eslint는 lint 위반이 있으면 exit code 1로, 설정 오류나
 * 대상 0건 같은 구조적 실패는 exit code 2로 종료하므로, 이를 예외가 아니라
 * 정상적인 결과값으로 다룬다.
 */
const runEslintCheck = async (cwd: string) => {
  try {
    const { stdout, stderr } = await execFileAsync(eslintBin, ["."], { cwd });
    return { exitCode: 0, output: `${stdout}${stderr}` };
  } catch (error) {
    const commandError = error as {
      code: number;
      stdout: string;
      stderr: string;
    };
    return {
      exitCode: commandError.code,
      output: `${commandError.stdout}${commandError.stderr}`,
    };
  }
};

describe("워크트리 안에서 실행하는 eslint lint", () => {
  beforeAll(async () => {
    await execFileAsync(
      "git",
      ["worktree", "add", "--detach", fixturePath, "HEAD"],
      { cwd: repoRoot },
    );
    // git worktree는 커밋된 상태(HEAD)만 체크아웃한다. 아직 커밋하지 않은
    // 변경도 곧바로 검증할 수 있도록, 현재 작업 트리와 HEAD의 차이를
    // 그대로 픽스처 워크트리에 덮어써 동기화한다.
    const { stdout } = await execFileAsync(
      "git",
      ["status", "--porcelain=v1", "--no-renames", "-z"],
      { cwd: repoRoot },
    );
    const entries = stdout.split("\0").filter((entry) => entry.length > 0);
    for (const entry of entries) {
      const status = entry.slice(0, 2);
      const relativePath = entry.slice(3);
      const source = join(repoRoot, relativePath);
      const destination = join(fixturePath, relativePath);
      if (status.includes("D")) {
        await rm(destination, { force: true });
        continue;
      }
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(source, destination);
    }
  }, 30_000);

  afterAll(async () => {
    await execFileAsync("git", ["worktree", "remove", "--force", fixturePath], {
      cwd: repoRoot,
    });
  }, 30_000);

  it("워크트리 자신의 루트에서 실행하면 워크트리 파일을 정상적으로 검사한다", async () => {
    const result = await runEslintCheck(fixturePath);

    expect(result.output).not.toContain("No files matching the pattern");
    expect(result.exitCode).toBe(0);
  }, 10_000);

  it("메인 저장소 루트에서 실행하면 워크트리 하위를 계속 제외한다", async () => {
    const result = await runEslintCheck(repoRoot);

    expect(result.output).not.toContain(".worktrees");
    expect(result.exitCode).toBe(0);
  }, 10_000);
});
