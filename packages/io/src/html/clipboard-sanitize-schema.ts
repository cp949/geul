// 클립보드 표 붙여넣기(clipboard-table-parser.ts) 전용 sanitize schema다.
// 표 옆 블록을 importHtml 변환기로 읽으므로 import schema를 바탕으로 한다
// (Issue #356 RD-005). 결과 의미는 이 schema를 거친 트리에서만 만든다
// (ADR-0003, G-CNV-002). 공유 schema 객체는 바꾸지 않고 얕게 복사한다.
//
// import schema와 다른 점은 둘이다.
// - table[role]: 레이아웃 표 판정(role=presentation/none)에 쓴다. 문서 모델에
//   없는 속성이라 import schema에는 없다. 빠지면 Gmail 서명 같은 레이아웃 표가
//   통째로 데이터 표로 붙는다.
// - title strip: 글자째 지운다(clipboardStrippedTagNames). 빠지면 스프레드시트
//   표 앞에 시트 이름 문단이 붙는다.
// ol[start]는 import schema에 이미 있다.
import type { Schema } from "hast-util-sanitize";

import { htmlImportSanitizeSchema } from "./import-html-sanitize-schema.js";
import { clipboardStrippedTagNames } from "./sanitize-schema.js";

const importAttributes: Record<string, string[]> =
  htmlImportSanitizeSchema.attributes;

export const clipboardSanitizeSchema: Schema = {
  ...htmlImportSanitizeSchema,
  attributes: {
    ...importAttributes,
    table: [...(importAttributes.table ?? []), "role"],
  },
  strip: clipboardStrippedTagNames,
};
