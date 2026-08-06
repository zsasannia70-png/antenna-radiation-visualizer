/**
 * Firestore Security Rules test suite.
 *
 * Verifies the twelve "Dirty Dozen" payloads described in security_spec.md
 * against firestore.rules, plus positive-path checks (a legitimate owner
 * can create / read / update / delete their own project).
 *
 * Run with the Firestore emulator:  npm run test:rules
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { beforeAll, afterAll, beforeEach, describe, it } from "vitest";

let testEnv: RulesTestEnvironment;

const ALICE = "alice_uid";
const BOB = "bob_uid";

// Alice and Bob are signed in AND email-verified (the rules require both).
const aliceDb = () =>
  testEnv.authenticatedContext(ALICE, { email_verified: true }).firestore();
const bobDb = () =>
  testEnv.authenticatedContext(BOB, { email_verified: true }).firestore();
const anonDb = () => testEnv.unauthenticatedContext().firestore();

// A well-formed project document owned by `ownerId`.
const validProject = (ownerId: string) => ({
  ownerId,
  name: "My Dipole Array",
  configuration: { type: "dipole", freq: 2.4 },
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

// Seed a project owned by Bob, bypassing the rules (setup only).
async function seedBobProject(id = "bob_proj") {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "projects", id), {
      ownerId: BOB,
      name: "Bob's Project",
      configuration: {},
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  });
}

// Seed a valid project owned by Alice (via the real rules), for update/delete tests.
async function seedAliceProject(id = "alice_proj") {
  await setDoc(doc(aliceDb(), "projects", id), validProject(ALICE));
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "ai-antenna-lab-test-2026",
    firestore: {
      rules: readFileSync(resolve(__dirname, "firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe("Positive paths — a legitimate owner", () => {
  it("can create a valid project", async () => {
    await assertSucceeds(
      setDoc(doc(aliceDb(), "projects", "alice_proj"), validProject(ALICE)),
    );
  });

  it("can read their own project", async () => {
    await seedAliceProject();
    await assertSucceeds(getDoc(doc(aliceDb(), "projects", "alice_proj")));
  });

  it("can update allowed fields on their own project", async () => {
    await seedAliceProject();
    await assertSucceeds(
      updateDoc(doc(aliceDb(), "projects", "alice_proj"), {
        name: "Renamed Array",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("can delete their own project", async () => {
    await seedAliceProject();
    await assertSucceeds(deleteDoc(doc(aliceDb(), "projects", "alice_proj")));
  });
});

describe("The Dirty Dozen — every payload must be rejected", () => {
  it("#1 denies creation when not logged in", async () => {
    await assertFails(
      setDoc(doc(anonDb(), "projects", "p1"), validProject(ALICE)),
    );
  });

  it("#2 denies a spoofed ownerId on creation", async () => {
    // Alice tries to create a project owned by Bob.
    await assertFails(
      setDoc(doc(aliceDb(), "projects", "p2"), validProject(BOB)),
    );
  });

  it("#3 denies creation with missing required fields", async () => {
    const { name, ...withoutName } = validProject(ALICE);
    await assertFails(
      setDoc(doc(aliceDb(), "projects", "p3"), withoutName),
    );
  });

  it("#4 denies extraneous keys on creation", async () => {
    await assertFails(
      setDoc(doc(aliceDb(), "projects", "p4"), {
        ...validProject(ALICE),
        isAdmin: true, // ghost field
      }),
    );
  });

  it("#5 denies an invalid / oversized target ID", async () => {
    const massiveId = "x".repeat(200); // exceeds the 128-char limit
    await assertFails(
      setDoc(doc(aliceDb(), "projects", massiveId), validProject(ALICE)),
    );
  });

  it("#6 denies a non-object configuration", async () => {
    await assertFails(
      setDoc(doc(aliceDb(), "projects", "p6"), {
        ...validProject(ALICE),
        configuration: "not-a-map",
      }),
    );
  });

  it("#7 denies a name longer than 100 characters", async () => {
    await assertFails(
      setDoc(doc(aliceDb(), "projects", "p7"), {
        ...validProject(ALICE),
        name: "a".repeat(101),
      }),
    );
  });

  it("#8 denies reading another user's project", async () => {
    await seedBobProject();
    await assertFails(getDoc(doc(aliceDb(), "projects", "bob_proj")));
  });

  it("#9 denies updating another user's project", async () => {
    await seedBobProject();
    await assertFails(
      updateDoc(doc(aliceDb(), "projects", "bob_proj"), {
        name: "Hacked",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("#10 denies changing ownerId on update", async () => {
    await seedAliceProject();
    await assertFails(
      updateDoc(doc(aliceDb(), "projects", "alice_proj"), {
        ownerId: BOB,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("#11 denies a client-supplied timestamp instead of request.time", async () => {
    await assertFails(
      setDoc(doc(aliceDb(), "projects", "p11"), {
        ...validProject(ALICE),
        createdAt: Timestamp.fromDate(new Date("2020-01-01")),
        updatedAt: Timestamp.fromDate(new Date("2020-01-01")),
      }),
    );
  });

  it("#12 denies modifying createdAt on update", async () => {
    await seedAliceProject();
    await assertFails(
      updateDoc(doc(aliceDb(), "projects", "alice_proj"), {
        createdAt: Timestamp.fromDate(new Date("2020-01-01")),
        updatedAt: serverTimestamp(),
      }),
    );
  });
});

describe("Bonus — identity hardening", () => {
  it("denies a signed-in user whose email is NOT verified", async () => {
    const unverified = testEnv
      .authenticatedContext("unverified_uid", { email_verified: false })
      .firestore();
    await assertFails(
      setDoc(
        doc(unverified, "projects", "pv"),
        validProject("unverified_uid"),
      ),
    );
  });
});
