import { beforeEach, describe, expect, it, vi } from "vitest";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("backend URL setting (L5)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubEnv("VITE_API_URL", "https://built-in.example.com");
  });

  it("an empty box falls back to the build's URL instead of hiding it forever", async () => {
    const api = await import("./api");
    api.setApiUrl("https://other.example.com/");
    expect(api.resolveApiUrl()).toBe("https://other.example.com");
    api.setApiUrl("");
    expect(api.resolveApiUrl()).toBe("https://built-in.example.com");
  });

  it('"demo" forces the offline demo', async () => {
    const api = await import("./api");
    api.setApiUrl("demo");
    expect(api.resolveApiUrl()).toBe("");
  });

  it("sends the access token on AI requests", async () => {
    const api = await import("./api");
    api.setAccessToken("s3cret");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ answer: "ok" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await api.liveClient("https://x").ask("q?", { text: "t" });
    expect(fetchMock.mock.calls[0][1].headers["X-Access-Token"]).toBe("s3cret");
  });
});
