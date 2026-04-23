import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock supabase client to avoid real network calls.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

// Silence haptic/audio feedback.
vi.mock("@/hooks/use-feedback", () => ({
  useFeedback: () => ({ playFeedback: () => {} }),
}));

import { usePalmCart } from "@/hooks/use-palm-cart";

const product = (id: string, price = 10) => ({
  id,
  name: `Prod ${id}`,
  price,
  category: "espetos",
  active: true,
  created_at: "",
});

describe("usePalmCart", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts empty", () => {
    const { result } = renderHook(() => usePalmCart());
    expect(result.current.cart).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.itemCount).toBe(0);
  });

  it("adds item and computes total", () => {
    const { result } = renderHook(() => usePalmCart());
    act(() => result.current.addToCart(product("a", 18)));
    expect(result.current.cart.length).toBe(1);
    expect(result.current.cart[0].quantity).toBe(1);
    expect(result.current.total).toBe(18);
    expect(result.current.itemCount).toBe(1);
  });

  it("groups same product+waiter increments quantity", () => {
    const { result } = renderHook(() => usePalmCart());
    act(() => result.current.addToCart(product("a", 18), "Joao"));
    act(() => result.current.addToCart(product("a", 18), "Joao"));
    expect(result.current.cart.length).toBe(1);
    expect(result.current.cart[0].quantity).toBe(2);
    expect(result.current.total).toBe(36);
  });

  it("different waiters create separate lines", () => {
    const { result } = renderHook(() => usePalmCart());
    act(() => result.current.addToCart(product("a", 18), "Joao"));
    act(() => result.current.addToCart(product("a", 18), "Maria"));
    expect(result.current.cart.length).toBe(2);
    expect(result.current.itemCount).toBe(2);
  });

  it("updateQuantity removes item when reaching zero", () => {
    const { result } = renderHook(() => usePalmCart());
    act(() => result.current.addToCart(product("a", 18)));
    act(() => result.current.updateQuantity("a", -1));
    expect(result.current.cart.length).toBe(0);
  });

  it("removeItem clears item completely", () => {
    const { result } = renderHook(() => usePalmCart());
    act(() => result.current.addToCart(product("a", 18)));
    act(() => result.current.addToCart(product("a", 18)));
    act(() => result.current.removeItem("a"));
    expect(result.current.cart.length).toBe(0);
  });

  it("updateNote sets the item note", () => {
    const { result } = renderHook(() => usePalmCart());
    act(() => result.current.addToCart(product("a", 18)));
    act(() => result.current.updateNote("a", "sem cebola"));
    expect(result.current.cart[0].note).toBe("sem cebola");
  });

  it("reset clears everything", () => {
    const { result } = renderHook(() => usePalmCart());
    act(() => result.current.setTableName("3"));
    act(() => result.current.addToCart(product("a", 18)));
    act(() => result.current.reset());
    expect(result.current.cart).toEqual([]);
    expect(result.current.tableName).toBe("");
    expect(result.current.total).toBe(0);
  });
});
