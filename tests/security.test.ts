import { describe, expect, it } from "vitest";
import { tenantQuery } from "../src/shared/utils/tenant-query.js";

describe("tenant scoping", () => {
  it("always includes tenantId in scoped queries", () => {
    expect(tenantQuery("tenant-1", { status: "DRAFT" })).toEqual({
      tenantId: "tenant-1",
      status: "DRAFT",
    });
  });
});
