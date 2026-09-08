import { Highlight, themes } from "prism-react-renderer";

import styles from "./source-panel.module.css";

export type SourcePanelProps = { source: string };

export const SourcePanel = ({ source }: SourcePanelProps) => (
  <Highlight code={source.trim()} language="tsx" theme={themes.github}>
    {({ className, style, tokens, getLineProps, getTokenProps }) => (
      <pre className={`${className} ${styles.pre}`} style={style}>
        {tokens.map((line, lineIndex) => (
          <div key={lineIndex} {...getLineProps({ line })}>
            {line.map((token, tokenIndex) => (
              <span key={tokenIndex} {...getTokenProps({ token })} />
            ))}
          </div>
        ))}
      </pre>
    )}
  </Highlight>
);
