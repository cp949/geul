/**
 * 배포 산출물(dist) ES 호환성 게이트(cp949/geul#122, ADR-0009).
 *
 * packages/{core,io,model,react}/dist의 JS 전량을 공식 browser floor
 * Chrome 75(ADR-0008) 기준으로 검사한다. 1순위 도구였던 check-es-compat은
 * npm에서 deprecated이고 EOL인 eslint@8에 고정돼 있으며 ESM 산출물을
 * 지원하지 않아(업스트림 issue #69), 계획서의 폴백대로 eslint +
 * eslint-plugin-es-x 직접 구성을 쓴다.
 *
 * "Chrome >= 75" 기준의 인코딩: es-x의 restrict-to-es2019 프리셋(Chrome
 * 73+가 ES2019 전량을 지원하므로 floor의 안전 하한)을 기본으로 깔고,
 * ES2020+ 분류라서 프리셋이 막지만 Chrome 75 이하에서 이미 지원되는
 * 기능의 규칙만 개별 해제한다. 소스 문법은 esbuild --target=chrome75가
 * 이미 downlevel하므로 이 게이트가 실제로 잡는 것은 런타임 API 사용이다
 * (예: Array.prototype.findLast — Chrome 97+).
 *
 * PIT-0027: 검사 대상이 0건이면 게이트가 조용히 무력화되므로, 패키지별로
 * dist의 JS 파일이 1건도 없으면 실패한다. dist는 빌드 산출물이라 `pnpm
 * build` 뒤에 실행해야 한다(verify:packages가 build 뒤에 배선한다).
 */

import { readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import process from "node:process";

import { ESLint } from "eslint";
import esX from "eslint-plugin-es-x";

import { workspacePackageDirectories } from "./workspace-roots.mjs";

const workspaceRoot = resolve(import.meta.dirname, "..");

/**
 * 검사 대상은 배포 라이브러리(`packages/*`)의 dist 전량이다. 목록은
 * `workspace-roots.mjs`의 열거에서 파생한다 — 패키지 목록의 단독 소유
 * 계약(`tests/workspace-roots.test.ts`)이라 로컬 리터럴 사본을 두지
 * 않는다. `apps/*`·`fixtures/*`의 dist는 디펜던시까지 번들된 앱
 * 산출물이라 대상이 아니다 — 디펜던시의 런타임 API는 사용처 core-js
 * 책임이고(ADR-0009) 이 게이트의 대상은 자기 소스뿐이다.
 */
const packagesRoot = join(workspaceRoot, "packages");
const distDirectories = workspacePackageDirectories(workspaceRoot)
  .filter((directory) => directory.startsWith(packagesRoot + sep))
  .map((directory) => join(directory, "dist"));

/**
 * ES2020+ 분류라 restrict-to-es2019가 막지만 Chrome 75 이하가 이미
 * 지원하는 기능 — floor 기준으로는 허용이 맞아 규칙을 해제한다.
 * 값은 MDN browser-compat-data의 최초 지원 Chrome 버전이다.
 *
 * @type {import("eslint").Linter.RulesRecord}
 */
const allowedBelowFloorRules = {
  "es-x/no-bigint": "off", // Chrome 67
  "es-x/no-dynamic-import": "off", // Chrome 63
  "es-x/no-export-ns-from": "off", // Chrome 72
  "es-x/no-global-this": "off", // Chrome 71
  "es-x/no-import-meta": "off", // Chrome 64
  "es-x/no-numeric-separators": "off", // Chrome 75
  "es-x/no-string-prototype-matchall": "off", // Chrome 73
  "es-x/no-symbol-matchall": "off", // Chrome 73
};

/**
 * dist 아래의 배포 JS 파일(.js/.mjs/.cjs)을 재귀 열거한다.
 * 디렉터리가 없으면(미빌드) 0건으로 취급해 호출부의 PIT-0027 검사가
 * 실패하게 둔다.
 *
 * @param {string} directory
 * @returns {string[]}
 */
function listDistJsFiles(directory) {
  /** @type {string[]} */
  let entries;
  try {
    entries = readdirSync(directory, { recursive: true, encoding: "utf8" });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => /\.(?:js|mjs|cjs)$/.test(entry))
    .map((entry) => join(directory, entry))
    .sort();
}

/** @type {string[]} */
const targetFiles = [];
let missingDist = false;
for (const directory of distDirectories) {
  const files = listDistJsFiles(directory);
  const label = relative(workspaceRoot, directory);
  if (files.length === 0) {
    // PIT-0027 — 대상 0건은 통과가 아니라 게이트 무력화다.
    console.error(`[check:escompat] ${label}: 검사할 JS가 0건이다 — 실패`);
    missingDist = true;
    continue;
  }
  console.log(`[check:escompat] ${label}: ${files.length}개 파일`);
  targetFiles.push(...files);
}
if (missingDist || targetFiles.length === 0) {
  console.error(
    "[check:escompat] dist 산출물이 비어 있다. `pnpm build` 뒤에 실행한다.",
  );
  process.exit(1);
}

/**
 * aggressive 모드는 receiver를 보지 않아 이름이 겹치는 규칙이 false
 * positive를 낸다 — ES2025 Iterator helper(map/filter/some/reduce…)는
 * 배열 메서드와, ES2025 Set 메서드(union…)는 zod `z.union` 같은 도메인
 * 메서드와 겹친다(실측: dist 전량에서 오탐 169건 전부 이 두 규칙군).
 * 자기 소스의 실제 ES2025 API 사용은 tsc `lib: ["ES2022"]`
 * (tsconfig.base.json)가 빌드에서 이미 거부하므로 이 두 군을 게이트에서
 * 해제해도 잃는 것이 없다.
 */
const collisionPronePattern = /^es-x\/no-(?:iterator|set)-prototype-/;
/** @type {import("eslint").Linter.RulesRecord} */
const collisionRuleOverrides = Object.fromEntries(
  Object.keys(esX.configs["flat/restrict-to-es2019"].rules ?? {})
    .filter((ruleId) => collisionPronePattern.test(ruleId))
    .map((ruleId) => [ruleId, /** @type {const} */ ("off")]),
);

const eslint = new ESLint({
  cwd: workspaceRoot,
  // 저장소의 다른 eslint 설정을 찾지 않고 아래 baseConfig만 쓴다.
  overrideConfigFile: true,
  // dist 안의 eslint-disable 주석(업스트림 번들 잔재 포함)이 게이트를
  // 뚫지 못하게 인라인 설정을 무시한다.
  allowInlineConfig: false,
  baseConfig: [
    esX.configs["flat/restrict-to-es2019"],
    {
      languageOptions: { ecmaVersion: "latest", sourceType: "module" },
      // es-x의 prototype 메서드 규칙은 기본 모드에서 receiver 타입을
      // 정적으로 알 때만 보고한다 — 배열 리터럴 `[].findLast()`는 잡지만
      // 변수 receiver `transactions.findLast()`(원래 버그 패턴)는
      // 통과시킨다(실측). dist JS엔 타입 정보가 없으므로 aggressive로
      // 모든 member call을 보고하게 한다.
      settings: { "es-x": { aggressive: true } },
      rules: { ...collisionRuleOverrides, ...allowedBelowFloorRules },
    },
  ],
});

const results = await eslint.lintFiles(targetFiles);
const errorCount = results.reduce(
  (sum, result) => sum + result.errorCount + result.warningCount,
  0,
);
if (errorCount > 0) {
  const formatter = await eslint.loadFormatter("stylish");
  console.error(await formatter.format(results));
  console.error(
    `[check:escompat] Chrome 75 미지원 사용 ${errorCount}건 — 실패`,
  );
  process.exit(1);
}
console.log(
  `[check:escompat] ${targetFiles.length}개 파일 Chrome >= 75 기준 통과`,
);
