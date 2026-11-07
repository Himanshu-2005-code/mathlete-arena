import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { usernameFromGoogle } from "./auth";
import { openDb } from "./db";
import type { GoogleProfile } from "./google";

// A stand-in for Google: credentials "good:<sub>:<name>" verify, anything else fails.
const fakeGoogle = async (credential: string): Promise<GoogleProfile | null> => {
  const [ok, sub, name] = credential.split(":");
  return ok === "good" && sub ? { sub, name, email: `${name}@example.com` } : null;
};

function setup(clientId = "test-client.apps.googleusercontent.com") {
  return createApp(openDb(":memory:"), { googleClientId: clientId, verifyGoogle: fakeGoogle });
}

const cred = (sub: string, name = "Himanshu") => `good:${sub.padEnd(24, "-")}:${name}`;

describe("Google sign-in", () => {
  it("reports the client ID, and turns off cleanly without one", async () => {
    expect((await request(setup()).get("/api/config")).body).toEqual({
      googleClientId: "test-client.apps.googleusercontent.com",
    });
    const off = setup("");
    expect((await request(off).get("/api/config")).body).toEqual({ googleClientId: null });
    expect((await request(off).post("/api/auth/google").send({ credential: cred("1") })).status).toBe(404);
  });

  it("creates a player on first sign-in and signs the same player in after", async () => {
    const app = setup();
    const first = await request(app).post("/api/auth/google").send({ credential: cred("g-1") });
    expect(first.status).toBe(201);
    expect(first.body.user).toMatchObject({ username: "himanshu", rating: 1000, hasPassword: false });
    const again = await request(app).post("/api/auth/google").send({ credential: cred("g-1") });
    expect(again.status).toBe(200);
    expect(again.body.user.id).toBe(first.body.user.id);
    expect((await request(app).get("/api/me").set({ Authorization: `Bearer ${again.body.token}` })).status).toBe(200);
  });

  it("rejects bad credentials and never lets a password log in to a Google-only account", async () => {
    const app = setup();
    expect((await request(app).post("/api/auth/google").send({ credential: "bad".padEnd(30, "x") })).status).toBe(401);
    await request(app).post("/api/auth/google").send({ credential: cred("g-2") });
    const login = await request(app).post("/api/auth/login").send({ username: "himanshu", password: "!google-only" });
    expect(login.status).toBe(401);
  });

  it("picks a free username when the name is taken", async () => {
    const app = setup();
    await request(app).post("/api/auth/register").send({ username: "himanshu", password: "secret123" });
    const res = await request(app).post("/api/auth/google").send({ credential: cred("g-3") });
    expect(res.body.user.username).toBe("himanshu2");
  });

  it("lets a Google player set a password, and delete by typing their username", async () => {
    const app = setup();
    const { token, user } = (await request(app).post("/api/auth/google").send({ credential: cred("g-4") })).body;
    const auth = { Authorization: `Bearer ${token}` };
    expect((await request(app).post("/api/auth/password").set(auth).send({ next: "newpass99" })).status).toBe(200);
    const login = await request(app).post("/api/auth/login").send({ username: user.username, password: "newpass99" });
    expect(login.status).toBe(200);
    expect(login.body.user.hasPassword).toBe(true);

    const other = (await request(app).post("/api/auth/google").send({ credential: cred("g-5", "Asha") })).body;
    const a2 = { Authorization: `Bearer ${other.token}` };
    expect((await request(app).post("/api/auth/delete").set(a2).send({ password: "wrong" })).status).toBe(403);
    expect((await request(app).post("/api/auth/delete").set(a2).send({ password: "ASHA" })).status).toBe(200);
  });
});

describe("usernameFromGoogle", () => {
  const none = () => false;
  it("makes a valid username from a name or email", () => {
    expect(usernameFromGoogle({ name: "Himanshu" }, none)).toBe("himanshu");
    expect(usernameFromGoogle({ name: "Dr. A. P. J. Kalam" }, none)).toBe("dr_a_p_j_kalam");
    expect(usernameFromGoogle({ name: "Jo" }, none)).toBe("player_jo");
    expect(usernameFromGoogle({ email: "x.y@gmail.com" }, none)).toBe("x_y");
    expect(usernameFromGoogle({ name: "Chess Bot" }, none)).not.toMatch(/_bot$/);
    expect(usernameFromGoogle({ name: "A very long name for a person here" }, none).length).toBeLessThanOrEqual(20);
  });
});
