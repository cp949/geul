// spec §8(EXT-009), RD-001-DELTA-01 — core/react 전역 하드코딩 영어 문구를
// 키로 추출하는 최상위 계약이다. BlockNote의 key 구조·문구는 그대로
// 가져오지 않는다(spec §8.2, geul UI 컴포넌트 구성이 달라 1:1 매핑이
// 성립하지 않는다) — geul 자체 문구 목록을 기준으로 새로 설계한다.
//
// `placeholder`는 이 DELTA가 채우는 첫 네임스페이스다(core 하드코딩 지점이
// placeholder-extension.ts 하나뿐이라 실측됨, spec §8.1). react 쪽 문구
// (block-type-options.ts/slash-menu.tsx/toolbar aria-label 등, RD-002)는
// 이 타입에 네임스페이스를 추가하는 방식으로 확장한다 — 기존 필드를
// 바꾸지 않는 한 하위 호환 확장이다.
export type Dictionary = {
  placeholder: {
    paragraph: string;
    // "{level}" 토큰을 실제 heading 레벨(1~6) 숫자로 치환해 쓴다
    // (placeholder-extension.ts). 함수 타입 대신 토큰 문자열을 쓰는 이유는
    // Dictionary 전체를 순수 데이터로 유지해 locale 파일(en/ko, RD-003)이
    // 평범한 객체 literal로 남게 하기 위해서다.
    heading: string;
    quote: string;
    codeBlock: string;
    listItem: string;
  };
};

// CreateEditorOptions.dictionary가 없을 때 쓰는 기본값(en)이자, override
// 작성자가 스프레드해 필요한 key만 바꾸는 기준값이다(자동 딥 병합 없음,
// 소비자가 직접 병합 — spec §8.1, "단순함 우선").
export const DEFAULT_DICTIONARY: Dictionary = {
  placeholder: {
    paragraph: "Enter text or type '/' for commands",
    heading: "Heading {level}",
    quote: "Quote",
    codeBlock: "Code",
    listItem: "List item",
  },
};
