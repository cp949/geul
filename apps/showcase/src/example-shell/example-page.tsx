import type { ReactNode } from "react";

import styles from "./example-page.module.css";
import { SourcePanel } from "./source-panel.js";

export type ExamplePageProps = {
  title: string;
  description: string;
  source: string;
  children: ReactNode;
};

export const ExamplePage = ({
  title,
  description,
  source,
  children,
}: ExamplePageProps) => (
  <article className={styles.page}>
    <header className={styles.header}>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
    <div className={styles.panes}>
      <section aria-label="라이브 데모" className={styles.demoPane}>
        {children}
      </section>
      <section aria-label="소스코드" className={styles.sourcePane}>
        <SourcePanel source={source} />
      </section>
    </div>
  </article>
);
