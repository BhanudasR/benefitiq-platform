import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { Shell } from "../components/Shell";
import { TABS } from "../nav/tabs";
import { renderWithProviders } from "./util";

describe("navigation shell", () => {
  it("renders all 22 tabs in the sidebar", () => {
    renderWithProviders(<Shell />);
    expect(TABS).toHaveLength(22);
    for (const t of TABS) {
      expect(screen.getByTestId(`nav-${t.id}`)).toBeInTheDocument();
    }
  });
  it("all 22 tabs have unique routes", () => {
    const paths = new Set(TABS.map((t) => t.path));
    expect(paths.size).toBe(22);
  });
});
