import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn — utilitário de classes (usado em todo lugar)", () => {
  it("concatena classes truthy", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("ignora falsy", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("mescla tailwind conflitantes — última vence", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
  });

  it("aceita objetos condicionais", () => {
    expect(cn("a", { b: true, c: false })).toBe("a b");
  });
});
