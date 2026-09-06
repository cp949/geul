// importMarkdown 전반이 공유하는 leaf 유틸리티를 모은다: mdast 노드
// 형태(MarkdownNode/MarkdownRoot), 참조 식별자 정규화(normalizeIdentifier),
// document-import 전용 에러 타입(MarkdownDocumentInvalidError), id
// 발급(createDefaultIdFactory) — 다른 신규 파일이 순환 없이 기대는
// 최하단 의존이다.
import type { IdFactory } from "@cp949/geul-model";

export type MarkdownNode = {
  type: string;
  value?: string;
  lang?: string | null;
  meta?: string | null;
  depth?: number;
  url?: string;
  alt?: string;
  identifier?: string;
  align?: Array<"left" | "right" | "center" | null>;
  ordered?: boolean;
  start?: number | null;
  checked?: boolean | null;
  position?: {
    start: { offset?: number };
    end: { offset?: number };
  };
  children?: MarkdownNode[];
};

export type MarkdownRoot = MarkdownNode & {
  type: "root";
  children: MarkdownNode[];
};

export const normalizeIdentifier = (identifier: string): string =>
  identifier.trim().replace(/\s+/g, " ").toLowerCase();

export class MarkdownDocumentInvalidError extends Error {}

export const createDefaultIdFactory = (): IdFactory => {
  let sequence = 0;
  return () => {
    sequence += 1;
    return `markdown-${sequence}`;
  };
};
