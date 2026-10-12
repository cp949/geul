// 로컬 프리뷰(ADR 0015, Issue #168 roadmap `_works/roadmap/RD-001.md`) —
// 업로드 콜백(uploadFile) 미등록 상태에서 삽입된 미디어를 편집 세션 동안
// 화면에 보여줄 PM 전용 attrs를 만든다(media-block-extension.ts의
// localPreviewUrl/localPreviewFile, RD-001 DELTA-01). Tiptap 값 import가 없는
// leaf 파일이다(media-upload.ts와 같은 자리) — paste/drop(DELTA-02·
// DELTA-03)과 파일선택 패널·프로그래매틱 삽입(DELTA-04)이 이 헬퍼를
// 공유한다.
//
// Issue #389부터 PM 노드의 로컬 프리뷰 attrs 판정·스캔도 이 파일이 소유한다.
// - hasLocalPreview: 미디어 타입 + localPreviewUrl 문자열(blockId 검사 없음).
// - readLocalPreview: 위 + blockId가 비어 있지 않음. `{blockId, attrs}` 또는 null.
// - listLocalPreviews: 서브트리 스캔(doc 순서 배열).
// - indexLocalPreviewsByUrl: 스캔 결과에서 URL 키 맵을 파생한다.
// 값 import는 @cp949/geul-model의 isMediaBlockType뿐이고 Tiptap·ProseMirror
// import는 타입도 없다. editor-controller-types.ts(공개 선언)가 이 파일의
// LocalPreviewAttrs를 import해 선언 파일이 공개 진입점에서 닿으므로 PM Node
// 타입을 시그니처에 노출하지 않는다(public-types.test.ts). 판정·스캔은
// PM Node가 만족하는 최소 구조 타입 LocalPreviewScanNode를 받는다.
//
// Blob URL은 호출마다 새로 발급한다(재사용·캐시하지 않음) — 미디어
// 블록마다 독립된 revoke 생애주기를 가져야 하고, 실제 `URL.revokeObjectURL`
// 호출과 그 타이밍은 RD-002(react)가 이 attrs를 소비해 담당한다.
import { isMediaBlockType } from "@cp949/geul-model";

export type LocalPreviewAttrs = {
  localPreviewUrl: string;
  localPreviewFile: File;
};

export const createLocalPreviewAttrs = (file: File): LocalPreviewAttrs => ({
  localPreviewUrl: URL.createObjectURL(file),
  localPreviewFile: file,
});

// 스캔 대상 노드의 최소 구조. PM Node가 그대로 만족한다.
export type LocalPreviewScanNode = {
  readonly type: { readonly name: string };
  readonly attrs: Readonly<Record<string, unknown>>;
  descendants(f: (node: LocalPreviewScanNode) => boolean | void): void;
};

// 노드 하나의 로컬 프리뷰 스캔 결과. blockId는 그 노드의 id다.
export type LocalPreviewEntry = {
  blockId: string;
  attrs: LocalPreviewAttrs;
};

// 판정이 읽는 노드 부분. 스캔(descendants)이 필요 없는 호출부는 이것만 만족하면 된다.
type LocalPreviewJudgedNode = Pick<LocalPreviewScanNode, "type" | "attrs">;

// 미디어 노드가 로컬 프리뷰를 가졌는지 본다. blockId는 보지 않는다.
export const hasLocalPreview = (node: LocalPreviewJudgedNode): boolean =>
  isMediaBlockType(node.type.name) &&
  typeof node.attrs.localPreviewUrl === "string";

// 로컬 프리뷰를 가졌고 blockId가 비어 있지 않은 노드를 읽는다. 아니면 null.
export const readLocalPreview = (
  node: LocalPreviewJudgedNode,
): LocalPreviewEntry | null => {
  if (!hasLocalPreview(node)) return null;
  const blockId: unknown = node.attrs.blockId;
  if (typeof blockId !== "string" || blockId.length === 0) return null;
  return {
    blockId,
    attrs: {
      localPreviewUrl: node.attrs.localPreviewUrl as string,
      localPreviewFile: node.attrs.localPreviewFile as File,
    },
  };
};

// root 자신과 모든 후손에서 로컬 프리뷰를 노드마다 한 항목씩 모은다.
// 순서는 doc 순서다(root 먼저, 후손은 descendants 순서).
// Node.descendants는 root를 방문하지 않아 root를 따로 읽는다.
export const listLocalPreviews = (
  root: LocalPreviewScanNode,
): LocalPreviewEntry[] => {
  const entries: LocalPreviewEntry[] = [];
  const visit = (node: LocalPreviewScanNode): void => {
    const entry = readLocalPreview(node);
    if (entry !== null) entries.push(entry);
  };
  visit(root);
  root.descendants((node) => {
    visit(node);
    return true;
  });
  return entries;
};

// 스캔 결과를 URL 키로 모은다(Issue #383). 같은 URL이 여럿이면 먼저 만난
// 항목을 유지한다.
export const indexLocalPreviewsByUrl = (
  entries: readonly LocalPreviewEntry[],
): Map<string, LocalPreviewEntry> => {
  const byUrl = new Map<string, LocalPreviewEntry>();
  for (const entry of entries) {
    if (!byUrl.has(entry.attrs.localPreviewUrl)) {
      byUrl.set(entry.attrs.localPreviewUrl, entry);
    }
  }
  return byUrl;
};
