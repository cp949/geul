/**
 * 게이트 세 갈래가 공유하는 workspace 루트 목록(`scripts/workspace-roots.mjs`)의
 * 계약.
 *
 * 그 모듈의 `WORKSPACE_ROOTS`는 리터럴이라 `pnpm-workspace.yaml`과 자동으로
 * 맞춰지지 않는다. 둘이 어긋나면 `check:boundaries`·`check:licenses`·
 * `scan:test-helpers` 세 갈래의 검사 범위가 조용히 트리보다 좁아진다 — 새 루트
 * 아래의 패키지는 경계 위반도, 미승인 라이선스도, 대상 목록에 없는 테스트
 * 디렉터리도 보고되지 않는다. 게이트가 통과하지만 아무것도 보지 않는 형태다.
 *
 * 여기서 두 목록을 대조하고, 그 목록으로 실제 열거되는 패키지 디렉터리 집합까지
 * 고정한다. 두 단언 모두 `pnpm-workspace.yaml`을 이 파일이 직접 파싱해 기대값을
 * 만든다 — 구현이 쓰는 리터럴과 출발점이 달라야 어긋남이 드러난다.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  WORKSPACE_ROOTS,
  workspacePackageDirectories,
} from "../scripts/workspace-roots.mjs";

// 저장소 루트를 cwd가 아니라 이 파일 위치로 잡는다. 저장소의 다른 테스트가
// 전부 `import.meta.url` 기준이고, cwd 상대면 잘못된 cwd에서 ENOENT로 진다.
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * `pnpm-workspace.yaml`의 `packages:` 블록에서 workspace 루트 이름을 뽑는다.
 * `scripts/workspace-roots.mjs`는 이 목록을 리터럴로 들고 있어, 새 루트가
 * workspace에 추가돼도 스스로는 알지 못한다. 여기서 어긋남을 잡는다.
 */
const manifestWorkspaceRoots = () => {
  const manifest = readFileSync(
    new URL("../pnpm-workspace.yaml", import.meta.url),
    "utf8",
  );
  const block = /^packages:\n((?:[ \t]+-[ \t]+.*\n)+)/m.exec(manifest)?.[1];

  expect(block).toBeDefined();
  return [...(block ?? "").matchAll(/-[ \t]+["']?([^"'\s]+)["']?/g)].map(
    (match) => (match[1] ?? "").replace(/\/\*+$/, ""),
  );
};

/**
 * `pnpm-workspace.yaml`이 선언한 루트 아래를 직접 훑어 `package.json`을 가진
 * 자식 디렉터리의 절대 경로를 모은다.
 *
 * `workspacePackageDirectories()`와 결과가 같아야 하지만 동어반복이 아니다 —
 * 이쪽은 매니페스트 파싱에서, 저쪽은 모듈의 리터럴 목록에서 출발한다. 리터럴이
 * 트리보다 좁아지면 저쪽 결과만 줄어들어 단언이 갈린다.
 */
const manifestPackageDirectories = () => {
  const directories = [];
  for (const root of manifestWorkspaceRoots()) {
    const rootPath = join(repositoryRoot, root);
    if (!existsSync(rootPath)) continue;
    for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
      const directory = join(rootPath, entry.name);
      if (entry.isDirectory() && existsSync(join(directory, "package.json"))) {
        directories.push(directory);
      }
    }
  }
  return directories.sort();
};

describe("workspace 루트 목록", () => {
  it("pnpm-workspace.yaml의 목록과 같다", () => {
    expect([...WORKSPACE_ROOTS].sort()).toEqual(
      manifestWorkspaceRoots().sort(),
    );
  });

  it("루트 아래 package.json을 가진 디렉터리를 절대 경로로 전부 열거한다", () => {
    const expected = manifestPackageDirectories();

    // 빈 집합끼리의 비교는 열거가 통째로 죽어도 통과한다. 가드가 없으면 이
    // 단언은 공허하게 참이 된다.
    expect(expected.length).toBeGreaterThan(0);
    expect([...workspacePackageDirectories(repositoryRoot)].sort()).toEqual(
      expected,
    );
  });
});
