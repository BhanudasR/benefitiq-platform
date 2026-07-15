import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RestrictedBanner, CaveatBanner } from "../components/ui/primitives";

describe("governance UX", () => {
  it("restricted → advisory-blocked banner", () => {
    render(<RestrictedBanner blocked />);
    expect(screen.getByTestId("restricted-banner")).toHaveTextContent(/Advisory interpretation is blocked/i);
  });
  it("conditional → caveats shown", () => {
    render(<CaveatBanner caveats={["Conditional dataset — figures carry a data-quality caveat."]} />);
    expect(screen.getByTestId("caveat-banner")).toHaveTextContent(/data-quality caveat/i);
  });
  it("no banners when clean", () => {
    const { container } = render(<><RestrictedBanner blocked={false} /><CaveatBanner caveats={[]} /></>);
    expect(container).toBeEmptyDOMElement();
  });
});
