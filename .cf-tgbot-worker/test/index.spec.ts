import { describe, expect, it } from "vitest";

import worker from "../src/index";

describe("telegram bot worker", () => {
  it("exports a fetch handler", () => {
    expect(worker).toBeDefined();
    expect(typeof worker.fetch).toBe("function");
  });
});
