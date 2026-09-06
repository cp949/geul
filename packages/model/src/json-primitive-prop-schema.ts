import { z } from "zod";

// CustomBlock(EXT-001)/CustomTextMark(EXT-003)/커스텀 inline 원소(EXT-002)의
// props가 공통으로 쓰는 JSON 원시값 shape이다. block-schema.ts,
// text-mark-schema.ts, inline-content-schema.ts 셋 다 참조하므로 어느 한쪽
// 소유로 두지 않고 별도 leaf 파일로 둔다.
export const jsonPrimitivePropSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
