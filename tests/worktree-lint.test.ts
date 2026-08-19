/**
 * biome.json의 `.worktrees` 무시 패턴이 git worktree 격리 작업에서도
 * 올바르게 동작하는지 확인하는 테스트.
 * 워크트리 자신의 내부에서 실행한 lint가 자기 파일을 정상적으로 검사하는지,
 * 그리고 메인 저장소에서 실행한 lint가 여전히 워크트리 하위를 제외하는지
 * 두 방향을 함께 다룬다.
 */
import { execFile } from "node:child_process";
import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const biomeBin = fileURLToPath(
  new URL("../node_modules/.bin/biome", import.meta.url),
);
const fixturePath = fileURLToPath(
  new URL(
    `../.worktrees/worktree-lint-fixture-${process.pid}/`,
    import.meta.url,
  ),
);

/**
 * 지정한 cwd에서 `biome check .`를 실행하고 exit code와 표준출력·표준에러를
 * 합쳐서 돌려준다. biome은 검사 대상이 0개이거나 설정 오류가 있으면
 * 0이 아닌 exit code로 종료하므로, 이를 예외가 아니라 정상적인 결과값으로 다룬다.
 */
const runBiomeCheck = async (cwd: string) => {
  try {
    const { stdout, stderr } = await execFileAsync(biomeBin, ["check", "."], {
      cwd,
    });
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

describe("워크트리 안에서 실행하는 biome lint", () => {
  beforeAll(async () => {
    await execFileAsync(
      "git",
      ["worktree", "add", "--detach", fixturePath, "HEAD"],
      { cwd: repoRoot },
    );
    // git worktree는 커밋된 상태만 체크아웃하므로, 아직 커밋하지 않은
    // biome.json 수정도 곧바로 검증할 수 있도록 현재 작업 트리의
    // biome.json을 픽스처 워크트리에 덮어써 동기화한다.
    await copyFile(
      join(repoRoot, "biome.json"),
      join(fixturePath, "biome.json"),
    );
  }, 30_000);

  afterAll(async () => {
    await execFileAsync("git", ["worktree", "remove", "--force", fixturePath], {
      cwd: repoRoot,
    });
  }, 30_000);

  it("워크트리 자신의 루트에서 실행하면 워크트리 파일을 정상적으로 검사한다", async () => {
    const result = await runBiomeCheck(fixturePath);

    expect(result.output).not.toContain("No files were processed");
    expect(result.exitCode).toBe(0);
  }, 10_000);

  it("메인 저장소 루트에서 실행하면 워크트리 하위를 계속 제외한다", async () => {
    const result = await runBiomeCheck(repoRoot);

    expect(result.output).not.toContain("nested root configuration");
    expect(result.exitCode).toBe(0);
  }, 10_000);
});
