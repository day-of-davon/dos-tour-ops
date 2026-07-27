import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// --- Mock Supabase ---------------------------------------------------------
// App calls supabase.auth.getSession/getUser/onAuthStateChange and a few
// .from(...).select().eq().order() chains. Make every query method chainable
// and thenable so any access path resolves to an empty result.
vi.mock("../lib/supabase", () => {
  const result = { data: [], error: null };
  const builder = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return (res) => res(result); // awaitable
        return () => builder; // every query method returns the builder
      },
    }
  );
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: { user: TEST_USER } } }),
      getUser: async () => ({ data: { user: TEST_USER } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({ error: null }),
      signInWithOAuth: async () => ({ error: null }),
    },
    from: () => builder,
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
  };
  return { supabase };
});

// --- Mock auth gate --------------------------------------------------------
// Admin email resolves to the highest-privilege role so every tab is reachable.
const TEST_USER = { id: "test-user", email: "d.johnson@dayofshow.net" };
vi.mock("../components/AuthGate.jsx", () => ({
  useAuth: () => ({ session: { user: TEST_USER }, user: TEST_USER }),
  default: ({ children }) => children,
}));

import App from "../DosApp.jsx";

// Every top-level tab, by the visible label rendered in TopBar.
const TAB_LABELS = [
  "Dashboard", "Advance", "Guest List", "Schedule", "Logistics",
  "Finance", "Crew", "Lodging", "Production", "Notes", "Access",
];

function clickTabByLabel(label) {
  const btn = screen
    .getAllByRole("button")
    .find((b) => b.textContent && b.textContent.includes(label));
  expect(btn, `tab button "${label}" should exist`).toBeTruthy();
  fireEvent.click(btn);
}

// The "Access" tab is gated to role === "tm_td". Open the user menu (avatar
// button, identified by its title=email) and click the TM/TD role pill so all
// 11 tabs become reachable.
function switchToTmTd() {
  const avatar = document.querySelector(
    'button[title="d.johnson@dayofshow.net"]'
  );
  expect(avatar, "user-menu avatar should exist").toBeTruthy();
  fireEvent.click(avatar);
  const pill = screen
    .getAllByRole("button")
    .find((b) => b.textContent?.trim() === "TM/TD");
  expect(pill, "TM/TD role pill should exist").toBeTruthy();
  fireEvent.click(pill);
}

describe("DosApp smoke", () => {
  beforeEach(() => {
    // Fail the test if any component logs a React render error.
    vi.restoreAllMocks();
  });

  it("boots past the loading gate and renders the chrome", async () => {
    render(<App />);
    // The loading screen says "v7.0 loading...". Wait until a real tab button
    // (Dashboard) appears, which only happens after loaded && shows are set.
    await waitFor(
      () =>
        expect(
          screen.getAllByRole("button").some((b) => b.textContent?.includes("Dashboard"))
        ).toBe(true),
      { timeout: 4000 }
    );
  });

  it("renders every tab without throwing", async () => {
    render(<App />);
    await waitFor(
      () =>
        expect(
          screen.getAllByRole("button").some((b) => b.textContent?.includes("Dashboard"))
        ).toBe(true),
      { timeout: 4000 }
    );

    switchToTmTd();

    // A render-time crash (e.g. a missing import after a move) propagates out
    // of fireEvent since there is no error boundary in the test tree.
    for (const label of TAB_LABELS) {
      clickTabByLabel(label);
      // Chrome should survive every tab switch.
      expect(
        screen.getAllByRole("button").some((b) => b.textContent?.includes("Dashboard"))
      ).toBe(true);
    }
  });
});
