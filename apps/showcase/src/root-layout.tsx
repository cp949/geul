import { NavLink, Outlet } from "react-router";

import styles from "./root-layout.module.css";
import type { ExampleRoute, ExampleRouteGroup } from "./routes.js";

const GROUP_ORDER: readonly ExampleRouteGroup[] = [
  "Basics",
  "Toolbars & Menus",
  "Media & Extras",
  "Composite",
];

type RootLayoutRoute = Pick<ExampleRoute, "path" | "label" | "group">;

export type RootLayoutProps = {
  routes: readonly RootLayoutRoute[];
};

export const RootLayout = ({ routes }: RootLayoutProps) => (
  <div className={styles.shell}>
    <nav aria-label="예제 목록" className={styles.sidebar}>
      <p className={styles.brand}>Geul Showcase</p>
      {GROUP_ORDER.map((group) => {
        const groupRoutes = routes.filter((route) => route.group === group);
        if (groupRoutes.length === 0) return null;
        return (
          <div className={styles.group} key={group}>
            <h2 className={styles.groupTitle}>{group}</h2>
            <ul className={styles.groupList}>
              {groupRoutes.map((route) => (
                <li key={route.path}>
                  <NavLink
                    className={({ isActive }) =>
                      isActive ? styles.linkActive : styles.link
                    }
                    to={`/examples/${route.path}`}
                  >
                    {route.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
    <main className={styles.content}>
      <Outlet />
    </main>
  </div>
);
