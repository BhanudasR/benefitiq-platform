import React from "react";
import { NavLink } from "react-router-dom";
import type { SubTab } from "../nav/tabs";

/** Demo-parity sub-tab bar. Renders the child modules of a parent tab (Renewal
 *  Intelligence, Wellness Intelligence) as an underlined tab strip that preserves
 *  the approved portal's sub-navigation and user journey. */
export function SubTabNav({ tabs }: { tabs: SubTab[] }) {
  return (
    <nav aria-label="Sub-navigation" data-testid="subtab-nav"
      className="flex flex-wrap gap-1 border-b border-line mb-5 overflow-x-auto">
      {tabs.map((t) => (
        <NavLink key={t.id} to={t.path} end={t.end} data-testid={`subnav-${t.id}`}
          className={({ isActive }) =>
            `px-3 py-2 text-sm whitespace-nowrap -mb-px border-b-2 ${isActive
              ? "border-brand text-brand font-medium"
              : "border-transparent text-ink/70 hover:text-ink hover:border-line"}`}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
