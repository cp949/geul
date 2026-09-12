/**
 * `KO_DICTIONARY`(RD-003-DELTA-01)를 검증한다. `Dictionary` 타입이 모든
 * 필드를 필수로 요구하므로 컴파일 자체가 "번역 완성"(누락 key 없음)의
 * 증거다 — 이 테스트는 "번역됐는지"(en 문구를 실수로 그대로 남기지
 * 않았는지)를 확인한다.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_DICTIONARY, KO_DICTIONARY } from "../src/index.js";
import type { Dictionary } from "../src/index.js";

/**
 * en(`DEFAULT_DICTIONARY`)과 ko(`KO_DICTIONARY`)를 leaf 문자열까지 재귀
 * 순회하며 값이 완전히 같은 경로를 모은다. `{kind}`/`{level}` 같은 토큰
 * 문자열은 en/ko가 부분적으로 겹칠 수 있어(예: 둘 다 "URL"을 포함) 값
 * 전체가 정확히 같은 경우만 "번역 누락 의심"으로 본다.
 */
const findIdenticalLeaves = (
  en: unknown,
  ko: unknown,
  path: string,
  found: string[],
): void => {
  if (typeof en === "string") {
    if (en === ko) found.push(path);
    return;
  }
  if (typeof en !== "object" || en === null) return;
  for (const key of Object.keys(en)) {
    findIdenticalLeaves(
      (en as Record<string, unknown>)[key],
      (ko as Record<string, unknown>)[key],
      path === "" ? key : `${path}.${key}`,
      found,
    );
  }
};

describe("KO_DICTIONARY", () => {
  it("Dictionary 타입을 만족한다(컴파일 자체가 증거 — 런타임에서는 형태만 재확인)", () => {
    const dictionary: Dictionary = KO_DICTIONARY;
    expect(typeof dictionary.placeholder.paragraph).toBe("string");
  });

  it("en 기본값과 완전히 같은 leaf 문자열이 없다(의도된 예외 없음 — 번역 누락 가드)", () => {
    const identical: string[] = [];
    findIdenticalLeaves(DEFAULT_DICTIONARY, KO_DICTIONARY, "", identical);

    expect(identical).toEqual([]);
  });

  it("대표 네임스페이스 값이 실제로 한국어다(스팟체크)", () => {
    expect(KO_DICTIONARY.editor.ariaLabel).toBe("편집기");
    expect(KO_DICTIONARY.blockType.paragraph.label).toBe("본문");
    expect(KO_DICTIONARY.menu.delete).toBe("삭제");
    expect(KO_DICTIONARY.color.names.blue).toBe("파랑");
    expect(KO_DICTIONARY.error.actionFailed).toBe("작업에 실패했습니다");
  });

  it("{level}/{kind} 토큰을 그대로 보존한다(치환 관용구는 소비처가 담당)", () => {
    expect(KO_DICTIONARY.placeholder.heading).toContain("{level}");
    expect(KO_DICTIONARY.toolbar.media.nameInputAriaLabel).toContain("{kind}");
    expect(KO_DICTIONARY.toolbar.media.captionInputAriaLabel).toContain(
      "{kind}",
    );
    expect(KO_DICTIONARY.toolbar.media.replaceFileInputAriaLabel).toContain(
      "{kind}",
    );
    expect(KO_DICTIONARY.toolbar.filePanel.urlInputAriaLabel).toContain(
      "{kind}",
    );
    expect(KO_DICTIONARY.toolbar.filePanel.fileInputAriaLabel).toContain(
      "{kind}",
    );
    // 2026-09-12(Notion parity) 추가분.
    expect(KO_DICTIONARY.placeholder.media).toContain("{kind}");
    expect(KO_DICTIONARY.toolbar.filePanel.save).toContain("{kind}");
    expect(KO_DICTIONARY.toolbar.filePanel.embedCaption).toContain("{kind}");
  });
});
