/**
 * `DEFAULT_DICTIONARY`가 `@cp949/geul-react`의 공개 표면에서 값으로
 * export되는지 검증한다. react 어댑터만 쓰는 소비자(apps/showcase 등)가
 * `editor-controller-types.ts`(spec §8, EXT-009)가 문서화한 override
 * 패턴 — "DEFAULT_DICTIONARY를 스프레드해 필요한 key만 override" — 을
 * 실제로 쓰려면 이 값 자체를 react 패키지 공개 표면에서 바로 얻어야
 * 한다. `@cp949/geul-core`를 직접 import하게 만들면 ADR-0002가 정한
 * "react 어댑터 공개 표면"이 소비자에게 무의미해진다.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_DICTIONARY } from "../src/index.js";

describe("DEFAULT_DICTIONARY 공개 export", () => {
  it("slashMenu.table 기본 라벨을 포함한 전체 dictionary 객체를 값으로 export한다", () => {
    expect(DEFAULT_DICTIONARY.slashMenu.table.label).toBe("Table");
  });
});
