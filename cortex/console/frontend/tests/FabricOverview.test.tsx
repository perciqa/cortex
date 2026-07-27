import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { FabricOverview } from "../src/views/FabricOverview";

describe("FabricOverview", () => {
  it("renders with the new bento interface", () => {
    const { container } = render(
      <FabricOverview
        articles={[]}
        activities={[]}
        byNode={{}}
        connected={true}
        attackCounts={{}}
        onNavigate={() => {}}
      />
    );
    expect(container.querySelector('[class*="MuiCard"]')).toBeTruthy();
  });
});
