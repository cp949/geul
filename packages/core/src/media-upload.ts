// Upload 콜백 계약(spec §4.1, §4.2). Tiptap import가 전혀 없는 leaf 파일이다
// (`media-block-kind.ts`와 같은 자리) — `production-editor-session.ts`와
// `editor-controller.ts` 양쪽이 순환 의존 없이 이 타입을 가져온다.
//
// AGENTS.md "외부 입력 실패는 예상 가능한 예외 대신 구조화된 Result<T,E>로
// 반환한다" 불변식을 따른다 — BlockNote의 `Promise<string>`(실패는 reject)
// 보다 명시적이다. `progress` 인자는 두지 않는다(spec §2.2, 업로드 진행률
// UI는 R3 제외 범위).

export type UploadResult =
  | { status: "success"; url: string; name?: string }
  // code는 소비자 정의 열린 문자열이다 — geul이 닫힌 union을 강제하지 않는다.
  | { status: "error"; code: string; message: string }
  | { status: "cancelled" };

export type UploadFile = (
  file: File,
  signal: AbortSignal,
) => Promise<UploadResult>;

// 업로드 중 상태는 session 전용(모델 스키마 밖)이다(spec §4.2). 성공·취소는
// 흔적을 남기지 않고 상태가 사라진다(null) — 이 유니온엔 success/cancelled
// 케이스가 없다. 실패만 code·message로 남아 UI가 에러·retry를 표시한다.
export type MediaUploadState =
  "uploading" | { status: "error"; code: string; message: string };
