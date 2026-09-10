// 로컬 프리뷰(ADR 0015, Issue #168 roadmap `_works/roadmap/RD-001.md`) —
// 업로드 콜백(uploadFile) 미등록 상태에서 삽입된 미디어를 편집 세션 동안
// 화면에 보여줄 PM 전용 attrs를 만든다(media-block-extension.ts의
// localPreviewUrl/localPreviewFile, RD-001 DELTA-01). Tiptap import가 없는
// leaf 파일이다(media-upload.ts와 같은 자리) — paste/drop(DELTA-02)과
// 파일선택 패널·프로그래매틱 삽입(DELTA-03)이 이 헬퍼를 공유한다.
//
// Blob URL은 호출마다 새로 발급한다(재사용·캐시하지 않음) — 미디어
// 블록마다 독립된 revoke 생애주기를 가져야 하고, 실제 `URL.revokeObjectURL`
// 호출과 그 타이밍은 RD-002(react)가 이 attrs를 소비해 담당한다.
export type LocalPreviewAttrs = {
  localPreviewUrl: string;
  localPreviewFile: File;
};

export const createLocalPreviewAttrs = (file: File): LocalPreviewAttrs => ({
  localPreviewUrl: URL.createObjectURL(file),
  localPreviewFile: file,
});
