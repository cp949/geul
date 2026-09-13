import type { ReactNode } from "react";

import styles from "./example-page.module.css";
import { SourcePanel } from "./source-panel.js";

export type ExamplePageProps = {
  title: string;
  description: string;
  source: string;
  children: ReactNode;
  /** 데모가 50/50 split보다 넓은 폭을 필요로 하는 예제에서만 켠다(예:
   * static-toolbar — 아이콘 버튼이 많아 좁은 폭에서 줄바꿈된다). 기본은
   * false — 나머지 예제의 레이아웃은 그대로 유지한다. */
  wide?: boolean;
};

export const ExamplePage = ({
  title,
  description,
  source,
  children,
  wide = false,
}: ExamplePageProps) => (
  <article className={styles.page}>
    <header className={styles.header}>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
    <div
      className={wide ? `${styles.panes} ${styles.panesWide}` : styles.panes}
    >
      <section aria-label="라이브 데모" className={styles.demoPane}>
        {children}
      </section>
      <section aria-label="소스코드" className={styles.sourcePane}>
        <SourcePanel source={source} />
      </section>
    </div>
  </article>
);
