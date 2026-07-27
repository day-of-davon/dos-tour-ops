import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// --- Mock Supabase ---------------------------------------------------------
// The portal never touches .from(...) chains (it only calls auth.* and
// .rpc(...)), so the mock is a thin, controllable rpc router instead of the
// chainable proxy the internal-app smoke test uses.
const TEST_USER = { id: "portal-user", email: "venue@example.com" };

let sessionValue = null;
const rpcImpl = vi.fn();

vi.mock("../../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: sessionValue } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithOtp: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
    },
    rpc: (...args) => rpcImpl(...args),
  },
}));

import PortalAuthGate from "../PortalAuthGate";
import PortalApp from "../PortalApp";

describe("advance portal smoke", () => {
  it("shows the magic-link sign-in form with no session", async () => {
    sessionValue = null;
    render(<PortalAuthGate><div>should not render</div></PortalAuthGate>);
    await waitFor(() => expect(screen.getByText("Show Portal")).toBeTruthy());
    expect(screen.getByPlaceholderText("you@venue.com")).toBeTruthy();
    expect(screen.getByText("Send sign-in link")).toBeTruthy();
    expect(screen.queryByText("should not render")).toBeNull();
  });

  it("renders we_provide items read-only and they_provide items editable", async () => {
    sessionValue = { user: TEST_USER };
    rpcImpl.mockImplementation((fn) => {
      if (fn === "portal_list_my_grants") {
        return Promise.resolve({ data: [{ show_key: "2026-08-15", client_id: "bbn", venue_label: "Test Venue, Test City", expires_at: null }], error: null });
      }
      if (fn === "portal_get_advance") {
        return Promise.resolve({ data: { items: { at1: { status: "pending" }, vn1: { status: "pending" } }, customItems: [], itemOverrides: {} }, error: null });
      }
      if (fn === "portal_update_advance_item") {
        return Promise.resolve({ data: { status: "in_progress", confirmedBy: null, confirmedAt: null }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    render(<PortalAuthGate><PortalApp /></PortalAuthGate>);

    // at1 (dept: artist_team, dir: we_provide) — plain read-only status pill,
    // no button in its row.
    const at1Text = await screen.findByText(/Rider submitted/);
    const at1Row = at1Text.closest("div[style]")?.parentElement;
    expect(at1Row?.querySelector("button")).toBeNull();

    // vn1 (dept: venue, dir: they_provide) — editable StatusBtn.
    const vn1Text = await screen.findByText(/Venue tech pack sent/);
    const vn1Row = vn1Text.closest("div[style]")?.parentElement;
    const cycleBtn = vn1Row?.querySelector("button");
    expect(cycleBtn).toBeTruthy();

    fireEvent.click(cycleBtn);
    await waitFor(() =>
      expect(rpcImpl).toHaveBeenCalledWith(
        "portal_update_advance_item",
        expect.objectContaining({ p_item_id: "vn1", p_status: "in_progress" })
      )
    );
  });
});
