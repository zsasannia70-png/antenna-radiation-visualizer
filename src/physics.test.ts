/**
 * Unit tests for the electromagnetic physics engine (physics.ts).
 *
 * These cover the core numerical behaviour of the simulation: wavelength/wave-
 * number relationships, geometry generation for every array type, array-factor
 * correctness and its edge cases (single element, normalization, no NaN across a
 * full angular sweep), and the centroid helper. They run without any emulator or
 * network — the engine is pure — via:  npm run test:unit
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_CONFIG,
  calculatePhysics,
  getAntennaPositions,
  getArrayFactor,
  getCentroid,
  type ConfigurationState,
} from "./physics";

// Build a valid config by overriding only the fields a test cares about.
const cfg = (overrides: Partial<ConfigurationState>): ConfigurationState => ({
  ...DEFAULT_CONFIG,
  ...overrides,
});

describe("calculatePhysics", () => {
  it("derives wavelength from frequency (lambda = c / f)", () => {
    const { lambda } = calculatePhysics(cfg({ freq: 145 }));
    // 145 MHz -> ~2.0675 m
    expect(lambda).toBeCloseTo(299792458 / (145 * 1e6), 6);
    expect(lambda).toBeCloseTo(2.0675, 3);
  });

  it("relates wave number k to wavelength (k = 2*pi / lambda)", () => {
    const { lambda, k } = calculatePhysics(cfg({ freq: 300 }));
    expect(k).toBeCloseTo((2 * Math.PI) / lambda, 9);
  });

  it("scales wavelength inversely with frequency", () => {
    const low = calculatePhysics(cfg({ freq: 100 })).lambda;
    const high = calculatePhysics(cfg({ freq: 1000 })).lambda;
    expect(low).toBeCloseTo(high * 10, 6);
  });
});

describe("getAntennaPositions — geometry generation", () => {
  const lambda = 1; // unit wavelength keeps spacing math simple

  it("places a single element at the origin in single mode", () => {
    const pos = getAntennaPositions(cfg({ activeTab: "single" }), lambda);
    expect(pos).toHaveLength(1);
    expect(pos[0].x).toBe(0);
    expect(pos[0].z).toBe(0);
  });

  it("generates N elements for a linear array, centered on the origin", () => {
    const N = 6;
    const pos = getAntennaPositions(
      cfg({ activeTab: "2d", geometry: "linear", elements: N, spacing: 0.5 }),
      lambda,
    );
    expect(pos).toHaveLength(N);
    // Symmetric linear array -> centroid at the origin.
    const [cx, cy, cz] = getCentroid(pos);
    expect(cx).toBeCloseTo(0, 9);
    expect(cy).toBeCloseTo(0, 9);
    expect(cz).toBeCloseTo(0, 9);
    // Adjacent spacing equals d = spacing * lambda.
    const sorted = pos.map((p) => p.z).sort((a, b) => a - b);
    expect(sorted[1] - sorted[0]).toBeCloseTo(0.5, 9);
  });

  it("places circular-array elements equidistant from the centre", () => {
    const N = 8;
    const pos = getAntennaPositions(
      cfg({ activeTab: "2d", geometry: "circular", elements: N, spacing: 0.5 }),
      lambda,
    );
    expect(pos).toHaveLength(N);
    const radii = pos.map((p) => Math.hypot(p.x, p.z));
    const r0 = radii[0];
    for (const r of radii) expect(r).toBeCloseTo(r0, 9);
    // radius follows the implementation's ring formula: (N*d) / (2*pi)
    expect(r0).toBeCloseTo((N * 0.5) / (2 * Math.PI), 9);
  });

  it("rounds triangular arrays to a multiple of 3 elements", () => {
    const pos = getAntennaPositions(
      cfg({ activeTab: "2d", geometry: "triangular", elements: 7, spacing: 0.5 }),
      lambda,
    );
    expect(pos.length % 3).toBe(0);
    expect(pos.length).toBeGreaterThanOrEqual(3);
  });

  it("rounds square arrays to a multiple of 4 elements", () => {
    const pos = getAntennaPositions(
      cfg({ activeTab: "2d", geometry: "square", elements: 6, spacing: 0.5 }),
      lambda,
    );
    expect(pos.length % 4).toBe(0);
    expect(pos.length).toBeGreaterThanOrEqual(4);
  });

  it("stacks layers for a 3D array (elements x stacks)", () => {
    const N = 4;
    const stacks = 3;
    const pos = getAntennaPositions(
      cfg({ activeTab: "3d", geometry: "linear", elements: N, stacks }),
      lambda,
    );
    expect(pos).toHaveLength(N * stacks);
  });

  it("returns the user's manual elements verbatim in manual mode", () => {
    const manual = cfg({
      activeTab: "manual",
      manualElements: [
        { id: "a", type: "Dipole", position: [1, 2, 3] },
        { id: "b", type: "Dipole", position: [-1, 0, 4] },
      ] as any,
    });
    const pos = getAntennaPositions(manual, lambda);
    expect(pos).toHaveLength(2);
    expect(pos[0]).toMatchObject({ x: 1, y: 2, z: 3 });
    expect(pos[1]).toMatchObject({ x: -1, y: 0, z: 4 });
  });
});

describe("getArrayFactor — correctness and edge cases", () => {
  const { k, lambda } = calculatePhysics(cfg({ freq: 145 }));

  it("returns unity for a single element (nothing to combine)", () => {
    const single = cfg({ activeTab: "single", elements: 1 });
    expect(getArrayFactor(single, 0.7, 0.3, k, lambda)).toBe(1);
  });

  it("reaches its normalized maximum of 1 in the broadside direction", () => {
    // Linear array along z, no phase shift -> at theta=0 every element is in
    // phase, so the normalized array factor equals 1 (its maximum).
    const arr = cfg({
      activeTab: "2d",
      geometry: "linear",
      elements: 6,
      spacing: 0.5,
      phaseShift: 0,
    });
    expect(getArrayFactor(arr, 0, 0, k, lambda)).toBeCloseTo(1, 6);
  });

  it("stays within [0, 1] for every direction (normalized)", () => {
    const arr = cfg({
      activeTab: "2d",
      geometry: "linear",
      elements: 8,
      spacing: 0.5,
    });
    for (let t = 0; t <= Math.PI; t += Math.PI / 18) {
      for (let p = 0; p < 2 * Math.PI; p += Math.PI / 6) {
        const af = getArrayFactor(arr, t, p, k, lambda);
        expect(af).toBeGreaterThanOrEqual(-1e-9);
        expect(af).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("never produces NaN or Infinity across a full angular sweep (singularity-safe)", () => {
    const geometries = ["linear", "circular", "square", "triangular"] as const;
    for (const geometry of geometries) {
      const arr = cfg({ activeTab: "2d", geometry, elements: 9, spacing: 0.5 });
      for (let t = 0; t <= Math.PI; t += Math.PI / 24) {
        for (let p = 0; p < 2 * Math.PI; p += Math.PI / 12) {
          const af = getArrayFactor(arr, t, p, k, lambda);
          expect(Number.isFinite(af)).toBe(true);
        }
      }
    }
  });

  it("shifts the beam when a progressive phase shift is applied", () => {
    const base = cfg({ activeTab: "2d", geometry: "linear", elements: 6, spacing: 0.5, phaseShift: 0 });
    const shifted = cfg({ ...base, phaseShift: 90 });
    // With a phase shift, the broadside (theta=0) value is no longer the max.
    const afBase = getArrayFactor(base, 0, 0, k, lambda);
    const afShifted = getArrayFactor(shifted, 0, 0, k, lambda);
    expect(afShifted).toBeLessThan(afBase);
  });
});

describe("getCentroid", () => {
  it("returns the origin for an empty set", () => {
    expect(getCentroid([])).toEqual([0, 0, 0]);
  });

  it("averages coordinates correctly", () => {
    const pts = [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 4, z: 6 },
      { x: 4, y: 8, z: 12 },
    ];
    expect(getCentroid(pts)).toEqual([2, 4, 6]);
  });
});
