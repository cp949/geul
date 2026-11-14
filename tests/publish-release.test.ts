/**
 * `scripts/publish-release.mjs`의 배포 전 판정 계약을 고정한다.
 *
 * 태그와 버전이 어긋난 채 배포되면 npm에서 되돌릴 수 없다. 판정이 어긋남을 놓치면
 * 잘못된 버전이 공개되고, 반대로 이미 배포된 버전을 놓치면 재실행이 npm 오류로 멈춘다.
 * 네트워크와 npm 호출은 이 테스트 범위 밖이다. 순수 판정 함수만 다룬다.
 */

import { describe, expect, it } from "vitest";

import {
  RELEASE_PACKAGE_DIRECTORIES,
  findVersionMismatches,
  isVersionPublished,
} from "../scripts/publish-release.mjs";

const lockstep = (version: string) =>
  ["model", "io", "core", "react"].map((name) => ({
    name: `@cp949/geul-${name}`,
    version,
  }));

describe("findVersionMismatches", () => {
  it("태그와 4개 패키지 버전이 모두 같으면 빈 목록을 돌려준다", () => {
    expect(findVersionMismatches("v0.4.0", lockstep("0.4.0"))).toEqual([]);
  });

  it("태그가 패키지 버전과 다르면 패키지마다 사유를 돌려준다", () => {
    const problems = findVersionMismatches("v0.4.0", lockstep("0.3.0"));
    expect(problems).toHaveLength(4);
    expect(problems[0]).toContain("@cp949/geul-model");
  });

  it("패키지 버전이 서로 다르면 lockstep 위반으로 알린다", () => {
    const manifests = lockstep("0.4.0");
    manifests[2] = { name: "@cp949/geul-core", version: "0.3.0" };
    const problems = findVersionMismatches("v0.4.0", manifests);
    expect(problems.some((problem) => problem.includes("lockstep"))).toBe(true);
  });

  it("v로 시작하지 않거나 prerelease가 붙은 태그를 거부한다", () => {
    expect(findVersionMismatches("0.4.0", lockstep("0.4.0"))).not.toEqual([]);
    expect(
      findVersionMismatches("v0.4.0-beta.1", lockstep("0.4.0-beta.1")),
    ).not.toEqual([]);
  });
});

describe("isVersionPublished", () => {
  it("배열 응답에서 해당 버전이 있으면 true", () => {
    expect(isVersionPublished(["0.2.0", "0.3.0"], "0.3.0")).toBe(true);
  });

  it("배열 응답에 해당 버전이 없으면 false", () => {
    expect(isVersionPublished(["0.2.0", "0.3.0"], "0.4.0")).toBe(false);
  });

  it("버전이 하나뿐이면 npm이 문자열로 돌려주므로 문자열도 비교한다", () => {
    expect(isVersionPublished("0.1.0", "0.1.0")).toBe(true);
    expect(isVersionPublished("0.1.0", "0.2.0")).toBe(false);
  });

  it("배포 이력이 없으면 false", () => {
    expect(isVersionPublished([], "0.1.0")).toBe(false);
  });
});

describe("RELEASE_PACKAGE_DIRECTORIES", () => {
  it("내부 의존 순서(model, io, core, react)로 배포한다", () => {
    expect(RELEASE_PACKAGE_DIRECTORIES).toEqual([
      "packages/model",
      "packages/io",
      "packages/core",
      "packages/react",
    ]);
  });
});
