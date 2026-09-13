import type { Document } from "@cp949/geul-model";
import {
  EditorContent,
  EditorProvider,
  StaticToolbar,
} from "@cp949/geul-react";
import { useState } from "react";

import styles from "./example.module.css";

// 스크롤이 실제로 일어나도록 충분히 긴 문서를 채운다 — "상단 고정"을
// 실제로 시연하려면 스크롤 중에도 툴바가 그대로 보여야 한다(RD-001 완료
// 조건 6). 문단 수는 .scrollArea의 max-height(220px)를 넉넉히 넘긴다.
const PARAGRAPH_COUNT = 20;

const StaticToolbarExample = () => {
  const [initialDocument] = useState<Document>(() => ({
    formatVersion: 1,
    revision: 0,
    blocks: Array.from({ length: PARAGRAPH_COUNT }, (_, index) => ({
      id: `showcase-static-toolbar-block-${index + 1}`,
      type: "paragraph" as const,
      content: [
        {
          text: `문단 ${index + 1}. 아래로 스크롤해도 위 툴바는 그대로 보인다.`,
        },
      ],
    })),
  }));

  return (
    <EditorProvider initialDocument={initialDocument}>
      {/* StaticToolbar 자체는 위치 CSS가 없다 — stickyToolbar가 이 예제의
          scrollArea를 앵커로 삼아 상단에 고정한다. */}
      <div className={styles.scrollArea}>
        <StaticToolbar className={styles.stickyToolbar} />
        <div className={styles.content}>
          <EditorContent />
        </div>
      </div>
    </EditorProvider>
  );
};

export default StaticToolbarExample;
