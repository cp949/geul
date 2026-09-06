import type { HeadingBlock } from "@cp949/geul-model";

// spec §4.1 — heading level 1-6. 모델 HeadingBlock.level 범위를 그대로 파생해
// 두 곳에 리터럴을 복제하지 않는다. 공개 export가 아닌 module-local 별칭이다.
// (패키지 내부 selection-query-helpers.ts가 blockTypeSourceFromNode/
// blockTypeDescriptorFromNode를 통해 재사용하므로 파일 간에는 export하되,
// index.ts는 이 타입을 재수출하지 않는다 — "공개"는 core 패키지 공개
// 표면(index.ts) 기준이다.)
export type HeadingLevel = HeadingBlock["level"];

export type SetBlockTypeDescriptor =
  | { type: "paragraph" }
  // isToggleable은 numberedListItem.startNumber와 같은 캐리포워드 패턴이다
  // (RD-004 DELTA-02) — 생략하면 heading→heading 재호출일 때만 현재 값을
  // 캐리포워드하고, 명시하면 그 값을 쓴다. boolean이 on/off를 다
  // 표현하므로 startNumber류의 명시적 해제용 `| null`이 필요 없다.
  | { type: "heading"; level: HeadingLevel; isToggleable?: boolean }
  | { type: "quote" }
  | { type: "codeBlock"; language?: string }
  | { type: "bulletListItem" }
  | { type: "numberedListItem"; startNumber?: number | null }
  | { type: "checkListItem" }
  | { type: "toggleListItem" };

export type BlockTypeDescriptor =
  | { type: "paragraph" }
  // isToggleable은 SetBlockTypeDescriptor.heading(DELTA-02, 명령 입력)과
  // 대칭인 조회 방향 필드다(RD-004 DELTA-04) — 있으면 현재 heading이 토글
  // 제목이라는 뜻이고, 없으면(undefined) 일반 heading이다. numberedListItem
  // startNumber와 같은 옵셔널 pass-through 패턴(생략 가능한 캐리포워드
  // 대상이 아니라 "있는 그대로 보고").
  | { type: "heading"; level: HeadingLevel; isToggleable?: boolean }
  | { type: "quote" }
  | { type: "codeBlock"; language?: string }
  | { type: "bulletListItem" }
  | { type: "numberedListItem"; startNumber?: number }
  | { type: "checkListItem" }
  | { type: "toggleListItem" };

// react/block-side-menu.tsx의 findBlockTypeDescriptor가 저장 Block에서
// 재구현하던 것과 같은 leaf 매핑이다(아키텍처 리뷰 6차 후보 L3). 입력은
// 진짜 model Block이 아니다 — PM node(selection-query-helpers.ts의
// blockTypeDescriptorFromNode)와
// 저장 Block 양쪽 모두 이 판별 유니온으로 구조적으로 좁혀지므로(각 호출자가
// 자기 표현에서 이 유니온만 조립), Block 전체를 여기로 들여오거나
// PM→Block 변환을 새로 만들 필요가 없다. table·divider는
// BlockTypeDescriptor가 다루지 않는 종류라 null로 떨어진다 — 두 호출자
// 모두 원래 코드에서 이미 이렇게 동작했다(react는 명시 null 분기, core는
// default 분기).
//
// react/block-side-menu.tsx의 findBlockTypeDescriptor가 저장 Block을 좁히지
// 않고 그대로 넘기므로, model의 Block 유니온이 늘 때마다 이 유니온도 같은
// 멤버를 갖춰야 한다 — 아니면 그 호출부가 컴파일 실패한다. checkListItem은
// RD-001 DELTA-06부터, toggleListItem은 RD-004 DELTA-04부터
// BlockTypeDescriptor에 포함돼 이 null 분기에서 빠졌다. file/image/video/
// audio는 RD-002 DELTA-01(R3 슬라이스1)부터 반대로 divider/table과 같은
// null 자리에 추가됐다 — spec §2.2가 이미 "media Turn into 제외"를
// 확정했다(새 제품 결정 아님, 실측 tsc로 이 결합을 확인한 뒤 반영).
export type BlockTypeSource =
  | { type: "paragraph" }
  | { type: "heading"; level: HeadingLevel; isToggleable?: boolean }
  | { type: "quote" }
  | { type: "codeBlock"; language?: string }
  | { type: "bulletListItem" }
  | { type: "numberedListItem"; startNumber?: number }
  | { type: "checkListItem" }
  | { type: "toggleListItem" }
  | { type: "divider" }
  | { type: "table" }
  | { type: "file" }
  | { type: "image" }
  | { type: "video" }
  | { type: "audio" };

export const blockTypeDescriptorFromBlock = (
  source: BlockTypeSource,
): BlockTypeDescriptor | null =>
  source.type === "divider" ||
  source.type === "table" ||
  source.type === "file" ||
  source.type === "image" ||
  source.type === "video" ||
  source.type === "audio"
    ? null
    : source;
