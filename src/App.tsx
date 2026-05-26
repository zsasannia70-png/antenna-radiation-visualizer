/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Radar } from "react-chartjs-2";
import {
  Radio,
  Activity,
  Ruler,
  Info,
  Box,
  Maximize2,
  Waves,
  Settings2,
  Sparkles,
  ChevronRight,
  Cpu,
  Database,
  Layers,
  Zap,
  LayoutGrid,
  Circle,
  Hexagon,
  Moon,
  Sun,
  X,
  Send,
  Loader2,
  Minimize2,
  Terminal,
  FunctionSquare,
  Sigma,
} from "lucide-react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  PerspectiveCamera,
  Grid,
  Environment,
  Float,
  Text,
  ContactShadows,
  useHelper,
  TransformControls,
} from "@react-three/drei";
import * as THREE from "three";
import { motion, AnimatePresence } from "motion/react";
import "katex/dist/katex.min.css";
import { throttle } from "lodash";
import { BlockMath, InlineMath } from "react-katex";
import { GoogleGenAI, Type } from "@google/genai";
import { auth, db } from "./firebase";
import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  doc,
  getDocFromServer,
  deleteDoc,
} from "firebase/firestore";
import toast, { Toaster } from "react-hot-toast";
import {
  LogIn,
  LogOut,
  Save,
  FolderOpen,
  Trash2,
  FilePlus,
} from "lucide-react";

// Register Chart.js components
ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
);

const antennaCategories = [
  { group: "Manual Start", types: ["-"] },
  {
    group: "Dipole & Monopole",
    types: [
      "Dipole (Half-Wave/Folded/Hertz)",
      "Short Dipole",
      "Monopole (Whip/Rubber Ducky/Ground Plane/Marconi)",
      "J-Pole",
    ],
  },
  {
    group: "Directional & High Gain",
    types: [
      "Yagi-Uda",
      "Log-Periodic",
      "Parabolic Dish (Cassegrain/Gregorian)",
      "Horn (Pyramidal/Conical)",
    ],
  },
  {
    group: "Loop & Helical",
    types: ["Helical (Helix)", "Spiral", "Small Loop (NFC)", "Large Loop"],
  },
  {
    group: "Aperture & Patch",
    types: ["Patch (IFA/PIFA)", "Slot", "Dielectric Resonator"],
  },
  {
    group: "Broadband & Specialty",
    types: [
      "Biconical (Discone/Bow-tie/Fractal)",
      "Turnstile (Batwing)",
      "V-Antenna (Rhombic/Beverage)",
      "Plasma Antenna",
    ],
  },
  {
    group: "Arrays & Advanced",
    types: [
      "Phased Array (AESA/PESA)",
      "MIMO Array",
      "Leaky Feeder",
      "Ferrite Rod",
    ],
  },
];

// --- Types & Constants ---

type AntennaType = string;
type ArrayGeometry = "linear" | "square" | "circular" | "triangular";
type ConfigTab = "single" | "2d" | "3d" | "manual";

export interface ManualElement {
  id: string;
  type: AntennaType;
  position: [number, number, number];
}

interface ConfigurationState {
  antName: string;
  type: AntennaType;
  freq: number; // MHz
  length: number; // meters
  elements: number;
  spacing: number; // lambda
  geometry: ArrayGeometry;
  phaseShift: number; // degrees
  stacks: number;
  stackSpacing: number; // lambda
  helixRadius: number;
  helixPitch: number;
  helixTurns: number;
  arrayGain: number;
  is3D: boolean;
  theme: "dark" | "light";
  activeTab: ConfigTab;
  isSimulating: boolean;
  showResult: boolean;
  showFormula: boolean;
  manualElements: ManualElement[];
}

const DEFAULT_CONFIG: ConfigurationState = {
  antName: "Manual Array",
  type: "-",
  freq: 145,
  length: 1.03,
  elements: 1,
  spacing: 0.5,
  geometry: "linear",
  phaseShift: 0,
  stacks: 1,
  stackSpacing: 0.5,
  helixRadius: 0.1,
  helixPitch: 0.05,
  helixTurns: 5,
  arrayGain: 1,
  is3D: true,
  theme: "dark",
  activeTab: "manual",
  isSimulating: false,
  showResult: false,
  showFormula: true,
  manualElements: [],
};

// --- Physics Engine ---

const calculatePhysics = (config: ConfigurationState) => {
  const c = 299792458;
  const lambda = c / (config.freq * 1e6);
  const k = (2 * Math.PI) / lambda;
  const kL = k * config.length;
  const kL_2 = kL / 2;

  return { lambda, k, kL, kL_2 };
};

const getAntennaPositions = (config: ConfigurationState, lambda: number) => {
  if (config.activeTab === "manual") {
    return config.manualElements.map((el) => ({
      id: el.id,
      x: el.position[0],
      y: el.position[1],
      z: el.position[2],
      color: "#a855f7",
      type: el.type,
    }));
  }

  const list: any[] = [];
  const N = config.elements;
  const d = config.spacing * lambda;
  const layers = config.activeTab === "3d" ? config.stacks : 1;
  const dS = config.stackSpacing * lambda;
  const stackColors = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#a855f7",
    "#06b6d4",
  ];

  const getLayerElements = () => {
    const layer = [];
    if (config.activeTab === "single" || N === 1) {
      layer.push({ x: 0, z: 0 });
    } else if (config.geometry === "linear") {
      for (let i = 0; i < N; i++) {
        layer.push({ x: 0, z: (i - (N - 1) / 2) * d });
      }
    } else if (config.geometry === "square") {
      const N_eff = Math.max(4, Math.round(N / 4) * 4);
      const elementsPerSide = N_eff / 4;
      const L = d * elementsPerSide;

      const v1 = { x: -L / 2, z: -L / 2 };
      const v2 = { x: L / 2, z: -L / 2 };
      const v3 = { x: L / 2, z: L / 2 };
      const v4 = { x: -L / 2, z: L / 2 };

      const addElementsOnSide = (start: any, end: any) => {
        for (let i = 0; i < elementsPerSide; i++) {
          const t = i / elementsPerSide;
          layer.push({
            x: start.x + t * (end.x - start.x),
            z: start.z + t * (end.z - start.z),
          });
        }
      };

      addElementsOnSide(v1, v2);
      addElementsOnSide(v2, v3);
      addElementsOnSide(v3, v4);
      addElementsOnSide(v4, v1);
    } else if (config.geometry === "circular") {
      const radius = (N * d) / (2 * Math.PI);
      for (let i = 0; i < N; i++) {
        const angle = (i / N) * Math.PI * 2;
        layer.push({
          x: Math.cos(angle) * radius,
          z: Math.sin(angle) * radius,
        });
      }
    } else if (config.geometry === "triangular") {
      const N_eff = Math.max(3, Math.round(N / 3) * 3);
      const sideElements = N_eff / 3;
      const L = d * sideElements;
      const h = (Math.sqrt(3) / 2) * L;

      const v1 = { x: 0, z: -(2 / 3) * h };
      const v2 = { x: -L / 2, z: (1 / 3) * h };
      const v3 = { x: L / 2, z: (1 / 3) * h };

      const addElementsOnSide = (start: any, end: any, count: number) => {
        for (let i = 0; i < count; i++) {
          const t = i / count;
          layer.push({
            x: start.x + t * (end.x - start.x),
            z: start.z + t * (end.z - start.z),
          });
        }
      };

      addElementsOnSide(v1, v2, sideElements);
      addElementsOnSide(v2, v3, sideElements);
      addElementsOnSide(v3, v1, sideElements);

      while (layer.length > N_eff) layer.pop();
    }
    return layer;
  };

  const baseLayer = getLayerElements();
  for (let s = 0; s < layers; s++) {
    const y = (s - (layers - 1) / 2) * dS;
    const stackColor = stackColors[s % stackColors.length];
    baseLayer.forEach((p, i) => {
      list.push({
        id: `auto-${s}-${i}`,
        x: p.x,
        y,
        z: p.z,
        color: stackColor,
        type: config.type,
      });
    });
  }
  return list;
};

const getElementField = (
  type: string,
  theta: number,
  kL_2: number,
  kL: number,
) => {
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);
  const absSin = Math.abs(sinT);
  const lowerType = type.toLowerCase();

  if (lowerType.includes("dipole")) {
    return absSin < 0.001
      ? 0
      : Math.abs((Math.cos(kL_2 * cosT) - Math.cos(kL_2)) / sinT);
  } else if (lowerType.includes("monopole") || lowerType.includes("j-pole")) {
    if (theta > Math.PI / 2 + 0.01) return 0;
    return absSin < 0.001
      ? 0
      : Math.abs((Math.cos(kL * cosT) - Math.cos(kL)) / sinT);
  } else if (lowerType.includes("loop") || lowerType.includes("spiral")) {
    return absSin;
  } else if (
    lowerType.includes("directional") ||
    lowerType.includes("yagi") ||
    lowerType.includes("log") ||
    lowerType.includes("dish") ||
    lowerType.includes("horn")
  ) {
    const power = lowerType.includes("dish")
      ? 32
      : lowerType.includes("horn")
        ? 16
        : 8;
    return Math.pow(Math.max(0, Math.cos(theta / 2)), power);
  } else if (
    lowerType.includes("aperture") ||
    lowerType.includes("patch") ||
    lowerType.includes("slot")
  ) {
    if (theta > Math.PI / 2) return 0;
    return Math.pow(Math.cos(theta), 2);
  } else if (lowerType.includes("helix") || lowerType.includes("helical")) {
    // Axial mode: beam along the helix axis (Y in this model)
    return Math.pow(Math.max(0, Math.cos(theta)), 4);
  } else if (
    lowerType.includes("broadband") ||
    lowerType.includes("biconical") ||
    lowerType.includes("discone")
  ) {
    return (absSin + absSin * Math.abs(cosT)) / 1.5;
  }

  return 1;
};

const calculateGain = (config: ConfigurationState, lambda: number) => {
  if (!config.type || config.type === "-") return "0.00";

  const lowerType = config.type.toLowerCase();
  let baseGain = 0; // dBi

  if (lowerType.includes("dipole")) baseGain = 2.15;
  else if (lowerType.includes("monopole")) baseGain = 5.15;
  else if (lowerType.includes("patch")) baseGain = 8.0;
  else if (lowerType.includes("horn")) {
    const aperture = config.length;
    baseGain = 10 * Math.log10(7.5 * Math.pow(aperture / lambda, 2) + 1);
  } else if (lowerType.includes("dish") || lowerType.includes("parabolic")) {
    const diam = config.length;
    baseGain =
      10 * Math.log10(0.6 * Math.pow((Math.PI * diam) / lambda, 2) + 1);
  } else if (lowerType.includes("yagi")) baseGain = 12.0;
  else if (lowerType.includes("helix")) {
    const C = 2 * Math.PI * config.helixRadius;
    const N = config.helixTurns;
    const S = config.helixPitch;
    baseGain =
      10 * Math.log10((15 * N * S * Math.pow(C, 2)) / Math.pow(lambda, 3) + 1);
  } else if (lowerType.includes("loop")) {
    const isSmall = lowerType.includes("small");
    baseGain = isSmall ? 1.76 : 3.0;
  } else baseGain = 1.0;

  // Add array gain context
  let arrayGain = 0;
  if (config.activeTab === "manual") {
    arrayGain = 10 * Math.log10(Math.max(1, config.manualElements.length));
  } else if (config.activeTab !== "single") {
    arrayGain =
      10 *
      Math.log10(
        Math.max(
          1,
          config.elements * (config.activeTab === "3d" ? config.stacks : 1),
        ),
      );
  }

  return (baseGain + arrayGain).toFixed(2);
};

const getAntennaFormula = (config: ConfigurationState) => {
  if (config.activeTab === "manual") {
    return "AF(\\theta, \\phi) = \\sum_{n=1}^{N} A_n e^{j[k \\vec{r}_n \\cdot \\hat{r} + \\beta_n]}";
  }
  const type = config.type;
  const lowerType = type.toLowerCase();
  if (lowerType.includes("dipole"))
    return "E(\\theta) = \\left| \\frac{\\cos(kL_2 \\cos \\theta) - \\cos(kL_2)}{\\sin \\theta} \\right|";
  if (lowerType.includes("monopole"))
    return "E(\\theta) = \\left| \\frac{\\cos(kL \\cos \\theta) - \\cos(kL)}{\\sin \\theta} \\right|, \\theta \\le \\pi/2";
  if (lowerType.includes("loop")) return "E(\\theta) = |\\sin \\theta|";
  if (lowerType.includes("patch"))
    return "E(\\theta) = \\cos^2 \\theta, \\theta \\le \\pi/2";
  if (lowerType.includes("helix"))
    return "E(\\theta) = \\cos^n \\theta \\text{ (Axial Mode)}";
  if (lowerType.includes("directional"))
    return "E(\\theta) = \\cos^n(\\theta/2)";
  return "E(\\theta) = 1 \\text{ (Isotropic)}";
};

const getGeneralizedFormula = (config: ConfigurationState) => {
  const { lambda, k, kL, kL_2 } = calculatePhysics(config);

  // 1. Get live element pattern E(theta)
  const type = config.type;
  if (!type || type === "-") return "E(\\theta) = 0 \\text{ (No Antenna Selected)}";

  const lowerType = type.toLowerCase();
  let e0Str = "";
  if (lowerType.includes("dipole")) {
    e0Str = `\\left| \\frac{\\cos(${kL_2.toFixed(2)} \\cos \\theta) - \\cos(${kL_2.toFixed(2)})}{\\sin \\theta} \\right|`;
  } else if (lowerType.includes("monopole") || lowerType.includes("j-pole")) {
    e0Str = `\\left| \\frac{\\cos(${kL.toFixed(2)} \\cos \\theta) - \\cos(${kL.toFixed(2)})}{\\sin \\theta} \\right|, \\theta \\le \\pi/2`;
  } else if (lowerType.includes("loop") || lowerType.includes("spiral")) {
    e0Str = "|\\sin \\theta|";
  } else if (lowerType.includes("patch")) {
    e0Str = "\\cos^2 \\theta, \\theta \\le \\pi/2";
  } else if (lowerType.includes("helix") || lowerType.includes("helical")) {
    e0Str = "\\cos^n \\theta \\text{ (Axial Mode)}";
  } else if (lowerType.includes("directional") || lowerType.includes("yagi") || lowerType.includes("log") || lowerType.includes("dish") || lowerType.includes("horn")) {
    e0Str = "\\cos^n(\\theta/2)";
  } else {
    e0Str = "1 \\text{ (Isotropic)}";
  }

  // If Single Antenna tab is active, total field is just E(theta)
  if (config.activeTab === "single") {
    return `E_{\\text{total}}(\\theta, \\phi) = E(\\theta) = ${e0Str}`;
  }

  // 2. Get array positions and phase shifts in real-time
  const elements = getAntennaPositions(config, lambda);
  if (elements.length === 0) {
    return `E_{\\text{total}}(\\theta, \\phi) = E(\\theta) \\cdot AF(\\theta, \\phi) \\\\ \\\\ E(\\theta) = ${e0Str} \\\\ \\\\ AF(\\theta, \\phi) = 0`;
  }

  const betaDeg = config.phaseShift;
  const betaRad = (betaDeg * Math.PI) / 180;

  // Create terms for AF
  let afTerms: string[] = [];
  const maxTermsToShow = 4;

  for (let i = 0; i < Math.min(elements.length, maxTermsToShow); i++) {
    const el = elements[i];
    // Wave vector dot product components: k * x, k * y, k * z
    const cx = k * el.x;
    const cy = k * el.y;
    const cz = k * el.z;

    // Phase shift term: i * beta
    const elBeta = config.activeTab === "manual" ? 0 : i * betaRad;

    // Format phase components nicely
    let phaseParts = [];
    if (Math.abs(cx) > 0.01) {
      phaseParts.push(`${cx >= 0 ? "" : "-"}${Math.abs(cx).toFixed(2)}\\sin\\theta\\cos\\phi`);
    }
    if (Math.abs(cy) > 0.01) {
      phaseParts.push(`${cy >= 0 ? "" : "-"}${Math.abs(cy).toFixed(2)}\\cos\\theta`);
    }
    if (Math.abs(cz) > 0.01) {
      phaseParts.push(`${cz >= 0 ? "" : "-"}${Math.abs(cz).toFixed(2)}\\sin\\theta\\sin\\phi`);
    }

    if (Math.abs(elBeta) > 0.01) {
      phaseParts.push(`${elBeta >= 0 ? "+" : "-"}${Math.abs(elBeta).toFixed(2)}`);
    }

    let phaseStr = phaseParts.join(" + ").replace(/\+ -/g, "- ").replace(/ \+ \+/g, " + ");
    if (phaseStr.startsWith("+ ")) {
      phaseStr = phaseStr.substring(2);
    }
    if (!phaseStr) phaseStr = "0";

    afTerms.push(`e^{j (${phaseStr})}`);
  }

  let afSummationStr = "";
  if (elements.length <= maxTermsToShow) {
    afSummationStr = afTerms.join(" + ");
  } else {
    // Show first 3 and the last one
    const lastEl = elements[elements.length - 1];
    const cx = k * lastEl.x;
    const cy = k * lastEl.y;
    const cz = k * lastEl.z;
    const elBeta = (elements.length - 1) * betaRad;

    let phaseParts = [];
    if (Math.abs(cx) > 0.01) {
      phaseParts.push(`${cx >= 0 ? "" : "-"}${Math.abs(cx).toFixed(2)}\\sin\\theta\\cos\\phi`);
    }
    if (Math.abs(cy) > 0.01) {
      phaseParts.push(`${cy >= 0 ? "" : "-"}${Math.abs(cy).toFixed(2)}\\cos\\theta`);
    }
    if (Math.abs(cz) > 0.01) {
      phaseParts.push(`${cz >= 0 ? "" : "-"}${Math.abs(cz).toFixed(2)}\\sin\\theta\\sin\\phi`);
    }
    if (Math.abs(elBeta) > 0.01) {
      phaseParts.push(`${elBeta >= 0 ? "+" : "-"}${Math.abs(elBeta).toFixed(2)}`);
    }
    let phaseStr = phaseParts.join(" + ").replace(/\+ -/g, "- ").replace(/ \+ \+/g, " + ");
    if (phaseStr.startsWith("+ ")) {
      phaseStr = phaseStr.substring(2);
    }
    if (!phaseStr) phaseStr = "0";

    afSummationStr = `${afTerms.slice(0, 3).join(" + ")} + \\dots + e^{j (${phaseStr})}`;
  }

  const divider = `\\frac{1}{${elements.length}}`;
  const afStr = `AF(\\theta, \\phi) = ${divider} \\left[ ${afSummationStr} \\right]`;

  return `E_{\\text{total}}(\\theta, \\phi) = E(\\theta) \\cdot AF(\\theta, \\phi) \\\\ \\\\ \\text{where: } E(\\theta) = ${e0Str} \\\\ \\\\ \\text{and: } ${afStr}`;
};

const getArrayFactor = (
  config: ConfigurationState,
  theta: number,
  phi: number,
  k: number,
  lambda: number,
) => {
  const elements = getAntennaPositions(config, lambda);
  if (
    elements.length === 0 ||
    (config.activeTab === "single" && elements.length === 1)
  )
    return 1;

  const beta = (config.phaseShift * Math.PI) / 180;
  let sumReal = 0;
  let sumImag = 0;

  // Calculate spatial Array Factor dynamically derived entirely from
  // precise X, Y, Z physical placement based on true coordinates in the 3D space
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];

    // Spherical dot product: r_n \cdot \hat{r} using true absolute coordinates
    const dot =
      el.x * Math.sin(theta) * Math.cos(phi) +
      el.y * Math.cos(theta) +
      el.z * Math.sin(theta) * Math.sin(phi);

    const phase = k * dot + i * beta;
    sumReal += Math.cos(phase);
    sumImag += Math.sin(phase);
  }

  return Math.sqrt(sumReal ** 2 + sumImag ** 2) / elements.length;
};

// --- Components ---

const getCentroid = (elements: any[]) => {
  let cx = 0,
    cy = 0,
    cz = 0;
  if (!elements || elements.length === 0)
    return [0, 0, 0] as [number, number, number];
  elements.forEach((p) => {
    cx += p.x;
    cy += p.y;
    cz += p.z;
  });
  cx /= elements.length;
  cy /= elements.length;
  cz /= elements.length;
  return [cx, cy, cz] as [number, number, number];
};

const RadiationPattern3D = ({ config }: { config: ConfigurationState }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { lambda, kL_2, kL, k } = useMemo(
    () => calculatePhysics(config),
    [config.freq, config.length],
  );

  const centroid = useMemo(() => {
    const elements = getAntennaPositions(config, lambda);
    return getCentroid(elements);
  }, [config, lambda]);

  const segments = 64;
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const vertices = new Float32Array((segments + 1) * (segments + 1) * 3);
    const colors = new Float32Array((segments + 1) * (segments + 1) * 3);
    const indices = [];

    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < segments; j++) {
        const a = i * (segments + 1) + j;
        const b = (i + 1) * (segments + 1) + j;
        const c = (i + 1) * (segments + 1) + (j + 1);
        const d = i * (segments + 1) + (j + 1);
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    const elements = getAntennaPositions(config, lambda);
    // Initial pattern calculation to find max for normalization
    let maxTotal = 0;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI;
      const elField = getElementField(config.type, theta, kL_2, kL);
      for (let j = 0; j <= segments; j++) {
        const phi = (j / segments) * 2 * Math.PI;
        const af = getArrayFactor(config, theta, phi, k, lambda);
        const mag = elField * af;
        if (mag > maxTotal) maxTotal = mag;
      }
    }
    if (maxTotal === 0) maxTotal = 1;

    let vPtr = 0;
    let cPtr = 0;
    const scaleFactor =
      Math.max(
        3,
        config.elements * config.spacing,
        config.stacks * config.stackSpacing,
      ) * 1.5;

    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI;
      const elField = getElementField(config.type, theta, kL_2, kL);

      for (let j = 0; j <= segments; j++) {
        const phi = (j / segments) * 2 * Math.PI;
        const af = getArrayFactor(config, theta, phi, k, lambda);
        const r = (elField * af) / maxTotal;

        // 1. Define the Antenna Location
        const x0 = centroid[0];
        const y0 = centroid[1];
        const z0 = centroid[2];

        // 3. Convert to Cartesian (Local)
        const X_local = r * scaleFactor * Math.sin(theta) * Math.cos(phi);
        const Y_local = r * scaleFactor * Math.cos(theta); // Y is up in Three.js
        const Z_local = r * scaleFactor * Math.sin(theta) * Math.sin(phi);

        // 4. Use pure local mathematically-centered pattern (Translate the GROUP instead)
        vertices[vPtr++] = X_local;
        vertices[vPtr++] = Y_local;
        vertices[vPtr++] = Z_local;

        // Heatmap color
        const h = r;
        colors[cPtr++] = h < 0.5 ? 0 : h < 0.75 ? (h - 0.5) * 4 : 1; // R
        colors[cPtr++] = h < 0.25 ? h * 4 : h < 0.75 ? 1 : 1 - (h - 0.75) * 4; // G
        colors[cPtr++] = h < 0.25 ? 1 : h < 0.5 ? 1 - (h - 0.25) * 4 : 0; // B
      }
    }

    geo.setIndex(indices);
    geo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [config, lambda, kL_2, kL, k, centroid]);

  if (!config.showResult) return null;

  console.log("Current Centroid State:", centroid);

  return (
    <>
      <mesh position={centroid}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshBasicMaterial color="red" />
      </mesh>
      {/* Instead of modifying vertices, translate the whole group physically based on element centroid */}
      <group position={centroid}>
        <mesh geometry={geometry}>
          <meshStandardMaterial
            vertexColors
            side={THREE.DoubleSide}
            transparent
            opacity={0.5}
            roughness={0.2}
            metalness={0.1}
          />
        </mesh>
        <mesh geometry={geometry}>
          <meshBasicMaterial
            color={config.theme === "dark" ? "#ffffff" : "#000000"}
            wireframe
            transparent
            opacity={0.05}
          />
        </mesh>
      </group>
    </>
  );
};

const ZoomCylinder = ({ args, position, rotation, metalColor }: any) => {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (meshRef.current) {
      const dist = state.camera.position.length();
      const s = Math.max(1, dist * 0.04);
      meshRef.current.scale.set(s, 1, s);
    }
  });
  return (
    <mesh ref={meshRef} position={position} rotation={rotation}>
      <cylinderGeometry args={args} />
      <meshStandardMaterial color={metalColor} metalness={1} roughness={0.1} />
    </mesh>
  );
};

const SpiralGeometry = ({
  length,
  metalColor,
}: {
  length: number;
  metalColor: string;
}) => {
  const curve = useMemo(() => {
    const points = [];
    const turns = 4;
    const a = 0.01;
    const b = length / 2 / (turns * Math.PI * 2);
    for (let i = 0; i <= 200; i++) {
      const theta = (i / 200) * Math.PI * 2 * turns;
      const r = a + b * theta;
      points.push(
        new THREE.Vector3(r * Math.cos(theta), r * Math.sin(theta), 0),
      );
    }
    return new THREE.CatmullRomCurve3(points);
  }, [length]);

  const [tScale, setTScale] = useState(1);
  useFrame((state) => {
    const dist = state.camera.position.length();
    const s = Math.round(Math.max(1, dist * 0.04) * 5) / 5;
    if (s !== tScale) setTScale(s);
  });

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <tubeGeometry args={[curve, 200, 0.015 * tScale, 8, false]} />
        <meshStandardMaterial
          color={metalColor}
          metalness={0.9}
          roughness={0.1}
        />
      </mesh>
    </group>
  );
};

const HelixGeometry = ({
  radius,
  pitch,
  turns,
  metalColor,
}: {
  radius: number;
  pitch: number;
  turns: number;
  metalColor: string;
}) => {
  const curve = useMemo(() => {
    const points = [];
    const segments = 256;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = t * Math.PI * 2 * turns;
      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);
      const y = t * pitch * turns - (pitch * turns) / 2;
      points.push(new THREE.Vector3(x, y, z));
    }
    return new THREE.CatmullRomCurve3(points);
  }, [radius, pitch, turns]);

  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 256, 0.015, 12, false]} />
        <meshStandardMaterial
          color={metalColor}
          metalness={0.9}
          roughness={0.1}
        />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.005, 0.005, pitch * turns, 12]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.4} />
      </mesh>
    </group>
  );
};

const LoopGeometry = ({
  length,
  type,
  metalColor,
}: {
  length: number;
  type: string;
  metalColor: string;
}) => {
  const isSmall = type.includes("small");
  // Small loop: radius is a fraction of physical length or wavelength. Let's use 0.05 * length.
  // Large loop: radius is calculated so circumference roughly equals length. R = length / (2 * PI)
  const R = isSmall ? length * 0.05 : length / (2 * Math.PI);

  // Consistently thin wire thickness for both loops to focus on radius difference
  const r = 0.005;

  const [tScale, setTScale] = useState(1);
  useFrame((state) => {
    const dist = state.camera.position.length();
    const s = Math.round(Math.max(1, dist * 0.04) * 5) / 5;
    if (s !== tScale) setTScale(s);
  });

  if (isSmall) {
    return (
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[R, Math.max(0.005, r * tScale), 16, 64]} />
        <meshStandardMaterial
          color={metalColor}
          metalness={1}
          roughness={0.1}
        />
      </mesh>
    );
  } else {
    return (
      <group rotation={[Math.PI / 2, 0, 0]}>
        <mesh>
          <torusGeometry
            args={[R, Math.max(0.005, r * tScale), 16, 64, Math.PI * 1.9]}
          />
          <meshStandardMaterial
            color={metalColor}
            metalness={1}
            roughness={0.1}
          />
        </mesh>
        <mesh position={[R * Math.cos(0), R * Math.sin(0), 0]}>
          <sphereGeometry args={[Math.max(0.005, r * tScale) * 1.5, 16, 16]} />
          <meshStandardMaterial color="#cbd5e1" metalness={1} />
        </mesh>
        <mesh
          position={[
            R * Math.cos(Math.PI * 1.9),
            R * Math.sin(Math.PI * 1.9),
            0,
          ]}
        >
          <sphereGeometry args={[Math.max(0.005, r * tScale) * 1.5, 16, 16]} />
          <meshStandardMaterial color="#cbd5e1" metalness={1} />
        </mesh>
      </group>
    );
  }
};

const FoldedDipoleGeometry = ({
  length,
  metalColor,
}: {
  length: number;
  metalColor: string;
}) => {
  const curve = useMemo(() => {
    const points = [];
    const w = 0.05 * length;
    const l2 = length / 2 - w;
    points.push(new THREE.Vector3(w, -l2, 0));
    points.push(new THREE.Vector3(w, l2, 0));
    for (let i = 1; i <= 10; i++) {
      const a = (i / 10) * Math.PI;
      points.push(new THREE.Vector3(Math.cos(a) * w, l2 + Math.sin(a) * w, 0));
    }
    points.push(new THREE.Vector3(-w, l2, 0));
    points.push(new THREE.Vector3(-w, -l2, 0));
    for (let i = 1; i <= 10; i++) {
      const a = Math.PI + (i / 10) * Math.PI;
      points.push(new THREE.Vector3(Math.cos(a) * w, -l2 + Math.sin(a) * w, 0));
    }
    return new THREE.CatmullRomCurve3(points, true);
  }, [length]);

  return (
    <mesh>
      <tubeGeometry args={[curve, 64, 0.015, 8, true]} />
      <meshStandardMaterial
        color={metalColor}
        metalness={0.9}
        roughness={0.1}
      />
    </mesh>
  );
};

const SlotGeometry = ({
  length,
  metalColor,
}: {
  length: number;
  metalColor: string;
}) => {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    const w = length;
    const h = length;
    s.moveTo(-w / 2, -h / 2);
    s.lineTo(w / 2, -h / 2);
    s.lineTo(w / 2, h / 2);
    s.lineTo(-w / 2, h / 2);
    s.lineTo(-w / 2, -h / 2);

    const hole = new THREE.Path();
    const hw = length * 0.5;
    const hh = length * 0.05;
    hole.moveTo(-hw / 2, -hh / 2);
    hole.lineTo(hw / 2, -hh / 2);
    hole.lineTo(hw / 2, hh / 2);
    hole.lineTo(-hw / 2, hh / 2);
    hole.lineTo(-hw / 2, -hh / 2);
    s.holes.push(hole);
    return s;
  }, [length]);

  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh>
        <extrudeGeometry args={[shape, { depth: 0.02, bevelEnabled: false }]} />
        <meshStandardMaterial
          color={metalColor}
          metalness={0.9}
          roughness={0.2}
        />
      </mesh>
    </group>
  );
};

const VivaldiGeometry = ({
  length,
  metalColor,
}: {
  length: number;
  metalColor: string;
}) => {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    const w = length * 0.8;
    const h = length;

    // Outer board
    s.moveTo(-w / 2, -h / 2);
    s.lineTo(w / 2, -h / 2);
    s.lineTo(w / 2, h / 2);
    s.lineTo(-w / 2, h / 2);
    s.lineTo(-w / 2, -h / 2);

    // Exponential hole
    const hole = new THREE.Path();
    hole.moveTo(0, -h / 2);
    // Left flare up
    for (let i = 0; i <= 20; i++) {
      const y = -h / 2 + (i / 20) * h;
      const x = -0.01 - Math.pow(Math.E, 3 * (y / h)) * (w / 2.5);
      if (i === 0) hole.moveTo(x, y);
      else hole.lineTo(x, y);
    }
    // Right flare down
    for (let i = 20; i >= 0; i--) {
      const y = -h / 2 + (i / 20) * h;
      const x = 0.01 + Math.pow(Math.E, 3 * (y / h)) * (w / 2.5);
      hole.lineTo(x, y);
    }
    hole.lineTo(0, -h / 2);
    s.holes.push(hole);
    return s;
  }, [length]);

  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      {/* Substrate */}
      <mesh position={[0, 0, -0.01]}>
        <boxGeometry args={[length * 0.8, length, 0.01]} />
        <meshStandardMaterial color="#020617" roughness={0.8} />
      </mesh>
      {/* Copper layer */}
      <mesh>
        <extrudeGeometry
          args={[shape, { depth: 0.005, bevelEnabled: false }]}
        />
        <meshStandardMaterial
          color={metalColor}
          metalness={1}
          roughness={0.2}
        />
      </mesh>
    </group>
  );
};

const AntennaModel = ({
  config,
  color,
}: {
  config: ConfigurationState;
  color: string;
}) => {
  const type = config.type;
  if (!type || type === "-") return null;

  const length = config.length;
  const lowerType = type.toLowerCase();

  // Base contrast metal
  const mColor = "#d4af37"; // Polished Gold

  if (lowerType.includes("spiral")) {
    return <SpiralGeometry length={length} metalColor={mColor} />;
  }

  if (lowerType.includes("helix") || lowerType.includes("helical")) {
    return (
      <HelixGeometry
        radius={config.helixRadius}
        pitch={config.helixPitch}
        turns={config.helixTurns}
        metalColor={mColor}
      />
    );
  }
  if (lowerType.includes("folded")) {
    return <FoldedDipoleGeometry length={length} metalColor={mColor} />;
  }

  if (lowerType.includes("horn")) {
    const isConical = lowerType.includes("conical");
    return (
      <group rotation={[0, 0, 0]}>
        <mesh position={[0, length / 4, 0]}>
          <cylinderGeometry
            args={[
              length / 2,
              length / 8,
              length / 2,
              isConical ? 32 : 4,
              1,
              true,
            ]}
          />
          <meshStandardMaterial
            color={mColor}
            metalness={0.9}
            roughness={0.1}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* Waveguide feed box */}
        <mesh position={[0, -0.05, 0]}>
          <boxGeometry args={[length / 4, 0.1, length / 4]} />
          <meshStandardMaterial
            color="#334155"
            metalness={0.7}
            roughness={0.4}
          />
        </mesh>
      </group>
    );
  }

  if (lowerType.includes("dish") || lowerType.includes("parabolic")) {
    return (
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {/* The Dish */}
        <mesh>
          <sphereGeometry
            args={[length / 1.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.5]}
          />
          <meshStandardMaterial
            color="#e5e7eb"
            metalness={0.8}
            roughness={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* Feed Arm */}
        <mesh position={[0, length / 2, 0]}>
          <cylinderGeometry args={[0.005, 0.005, length]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.8} />
        </mesh>
        {/* Tiny feed horn at focus */}
        <mesh position={[0, length / 2, 0]} rotation={[Math.PI, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.01, 0.1, 4]} />
          <meshStandardMaterial color={mColor} metalness={1} roughness={0.1} />
        </mesh>
      </group>
    );
  }

  if (lowerType.includes("log-periodic")) {
    const numElements = 8;
    const elements = [];
    for (let i = 0; i < numElements; i++) {
      const d = (i / numElements) * length;
      const eLen = length * 0.8 * Math.pow(0.8, i);
      elements.push(
        <mesh
          key={i}
          position={[0, d - length / 2, 0]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.0075, 0.0075, eLen]} />
          <meshStandardMaterial color={mColor} metalness={1} roughness={0.1} />
        </mesh>,
      );
    }
    return (
      <group>
        {/* Boom */}
        <mesh>
          <cylinderGeometry args={[0.012, 0.012, length]} />
          <meshStandardMaterial
            color="#94a3b8"
            metalness={0.8}
            roughness={0.3}
          />
        </mesh>
        {elements}
      </group>
    );
  }

  if (lowerType.includes("yagi")) {
    return (
      <group>
        {/* Boom */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.012, 0.012, length]} />
          <meshStandardMaterial
            color="#94a3b8"
            metalness={0.8}
            roughness={0.3}
          />
        </mesh>
        {/* Elements: Reflector, Driven, Directors */}
        {[-0.45, -0.2, 0.05, 0.25, 0.45].map((offset, i) => (
          <group
            key={i}
            position={[0, 0, offset * length]}
            rotation={[0, 0, Math.PI / 2]}
          >
            {i === 1 ? (
              // Driven element - Folded approximation or single thick
              <mesh>
                <cylinderGeometry args={[0.015, 0.015, length * 0.52]} />
                <meshStandardMaterial
                  color={mColor}
                  metalness={1}
                  roughness={0.1}
                />
              </mesh>
            ) : (
              <mesh>
                <cylinderGeometry
                  args={[0.0075, 0.0075, length * (0.55 - i * 0.05)]}
                />
                <meshStandardMaterial
                  color={mColor}
                  metalness={1}
                  roughness={0.1}
                />
              </mesh>
            )}
          </group>
        ))}
      </group>
    );
  }

  if (lowerType.includes("loop")) {
    return (
      <LoopGeometry length={length} type={lowerType} metalColor={mColor} />
    );
  }

  if (lowerType.includes("dra") || lowerType.includes("dielectric")) {
    return (
      <group>
        <mesh position={[0, -0.01, 0]}>
          <boxGeometry args={[length * 1.5, 0.02, length * 1.5]} />
          <meshStandardMaterial
            color="#94a3b8"
            metalness={0.8}
            roughness={0.2}
          />
        </mesh>
        <mesh position={[0, length / 4, 0]}>
          <cylinderGeometry args={[length / 4, length / 4, length / 2, 32]} />
          <meshStandardMaterial
            color="#f8fafc"
            roughness={0.9}
            metalness={0.0}
            opacity={0.9}
            transparent
          />
        </mesh>
      </group>
    );
  }

  if (lowerType.includes("plasma")) {
    return (
      <group position={[0, length / 2, 0]}>
        {/* Glowing Gas Column */}
        <mesh>
          <cylinderGeometry args={[0.02, 0.02, length * 0.95, 16]} />
          <meshStandardMaterial
            color="#00ffff"
            emissive="#00ffff"
            emissiveIntensity={3}
            toneMapped={false}
          />
        </mesh>
        {/* Glass Tube */}
        <mesh>
          <cylinderGeometry args={[0.025, 0.025, length, 16]} />
          <meshPhysicalMaterial
            color="#ffffff"
            transmission={0.9}
            opacity={1}
            roughness={0.0}
            ior={1.5}
            transparent
          />
        </mesh>
        {/* Base */}
        <mesh position={[0, -length / 2, 0]}>
          <cylinderGeometry args={[0.03, 0.03, length * 0.1, 16]} />
          <meshStandardMaterial color="#334155" metalness={0.8} />
        </mesh>
      </group>
    );
  }

  if (lowerType.includes("turnstile")) {
    return (
      <group rotation={[0, 0, 0]}>
        <ZoomCylinder
          args={[0.015, 0.015, length, 16]}
          position={[0, 0, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          metalColor={mColor}
        />
        <ZoomCylinder
          args={[0.015, 0.015, length, 16]}
          position={[0, 0, 0]}
          rotation={[Math.PI / 2, 0, Math.PI / 2]}
          metalColor={mColor}
        />
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.025, 16, 16]} />
          <meshStandardMaterial
            color="#cbd5e1"
            metalness={0.9}
            roughness={0.1}
          />
        </mesh>
      </group>
    );
  }

  if (lowerType.includes("v-antenna") || lowerType.match(/\bv\b/i)) {
    const angle = Math.PI / 4;
    return (
      <group position={[0, length / 4, 0]}>
        <ZoomCylinder
          args={[0.015, 0.015, length / 2, 16]}
          position={[
            (-Math.sin(angle / 2) * length) / 4,
            (Math.cos(angle / 2) * length) / 4 - length / 4,
            0,
          ]}
          rotation={[0, 0, angle / 2]}
          metalColor={mColor}
        />
        <ZoomCylinder
          args={[0.015, 0.015, length / 2, 16]}
          position={[
            (Math.sin(angle / 2) * length) / 4,
            (Math.cos(angle / 2) * length) / 4 - length / 4,
            0,
          ]}
          rotation={[0, 0, -angle / 2]}
          metalColor={mColor}
        />
      </group>
    );
  }

  if (lowerType.includes("patch")) {
    return (
      <group>
        {/* Dielectric */}
        <mesh position={[0, -0.015, 0]}>
          <boxGeometry args={[length / 1.5, 0.03, length / 1.5]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
        {/* Metal Patch */}
        <mesh position={[0, 0.015, 0]}>
          <boxGeometry args={[length / 2, 0.005, length / 2]} />
          <meshStandardMaterial color={mColor} metalness={1} roughness={0.1} />
        </mesh>
      </group>
    );
  }

  if (lowerType.includes("slot"))
    return <SlotGeometry length={length} metalColor={mColor} />;
  if (lowerType.includes("vivaldi"))
    return <VivaldiGeometry length={length} metalColor={mColor} />;

  if (lowerType.includes("corner")) {
    return (
      <group>
        {/* Reflector planes at 90 deg */}
        <mesh
          position={[length / 4, 0, -length / 4]}
          rotation={[0, Math.PI / 4, 0]}
        >
          <boxGeometry args={[length, length, 0.01]} />
          <meshStandardMaterial
            color="#94a3b8"
            metalness={0.6}
            roughness={0.4}
          />
        </mesh>
        <mesh
          position={[-length / 4, 0, -length / 4]}
          rotation={[0, -Math.PI / 4, 0]}
        >
          <boxGeometry args={[length, length, 0.01]} />
          <meshStandardMaterial
            color="#94a3b8"
            metalness={0.6}
            roughness={0.4}
          />
        </mesh>
        {/* Dipole at corner */}
        <mesh position={[0, 0, length / 4]}>
          <cylinderGeometry args={[0.01, 0.01, length / 2]} />
          <meshStandardMaterial color={mColor} metalness={1} roughness={0.1} />
        </mesh>
      </group>
    );
  }

  if (lowerType.includes("lens")) {
    return (
      <group>
        {/* Shaped Dielectric Lens */}
        <mesh position={[0, length / 3, 0]}>
          <sphereGeometry
            args={[length / 3, 32, 32, 0, Math.PI * 2, 0, Math.PI / 1.5]}
          />
          <meshPhysicalMaterial
            color="#38bdf8"
            transmission={0.9}
            opacity={1}
            roughness={0}
            ior={1.5}
          />
        </mesh>
        {/* Feed Horn */}
        <mesh position={[0, -length / 4, 0]}>
          <cylinderGeometry args={[length / 4, length / 12, length / 2, 32]} />
          <meshStandardMaterial color={mColor} metalness={1} roughness={0.1} />
        </mesh>
      </group>
    );
  }

  if (lowerType.includes("biconical")) {
    return (
      <group>
        <mesh position={[0, length / 4 + 0.005, 0]} rotation={[0, 0, 0]}>
          <coneGeometry args={[length / 4, length / 2, 32]} />
          <meshStandardMaterial color={mColor} metalness={1} roughness={0.1} />
        </mesh>
        <mesh position={[0, -length / 4 - 0.005, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[length / 4, length / 2, 32]} />
          <meshStandardMaterial color={mColor} metalness={1} roughness={0.1} />
        </mesh>
      </group>
    );
  }

  if (lowerType.includes("dipole")) {
    return (
      <group position={[0, length / 4, 0]}>
        {/* Top Half */}
        <ZoomCylinder
          args={[0.01, 0.01, length / 2 - 0.02, 16]}
          position={[0, 0.01, 0]}
          rotation={[0, 0, 0]}
          metalColor={mColor}
        />
        {/* Bottom Half */}
        <ZoomCylinder
          args={[0.01, 0.01, length / 2 - 0.02, 16]}
          position={[0, -length / 2 - 0.01, 0]}
          rotation={[0, 0, 0]}
          metalColor={mColor}
        />
        {/* Feed Gap Marker */}
        <mesh position={[0, -length / 4, 0]}>
          <cylinderGeometry args={[0.005, 0.005, 0.02, 8]} />
          <meshStandardMaterial color="#cbd5e1" />
        </mesh>
      </group>
    );
  }

  // Fallback / Monopole
  const height = lowerType.includes("monopole") ? length / 2 : length;
  const yPos = lowerType.includes("monopole") ? height / 2 : 0;
  return (
    <group position={[0, yPos, 0]}>
      <ZoomCylinder
        args={[0.01, 0.01, height, 16]}
        position={[0, 0, 0]}
        rotation={[0, 0, 0]}
        metalColor={mColor}
      />
      {/* Tiny Ground plane hint for monopole */}
      {lowerType.includes("monopole") && (
        <mesh position={[0, -height / 2, 0]}>
          <cylinderGeometry args={[height, height, 0.005, 32]} />
          <meshStandardMaterial
            color="#cbd5e1"
            metalness={0.6}
            roughness={0.5}
          />
        </mesh>
      )}
    </group>
  );
};

interface AntennaElements3DProps {
  config: ConfigurationState;
  onPositionChange?: (
    id: string,
    pos: [number, number, number],
    isDragEnd?: boolean,
  ) => void;
  selectedElementId?: string | null;
  onSelectElement?: (id: string | null) => void;
  setOrbitEnabled?: (v: boolean) => void;
}

interface DraggableAntennaProps {
  antenna: any;
  config: ConfigurationState;
  isSelected: boolean;
  onSelectElement?: (id: string | null) => void;
  onPositionChange?: (
    id: string,
    pos: [number, number, number],
    isDragEnd?: boolean,
  ) => void;
  setOrbitEnabled?: (v: boolean) => void;
}

const DraggableAntenna = ({
  antenna,
  config,
  isSelected,
  onSelectElement,
  onPositionChange,
  setOrbitEnabled,
}: DraggableAntennaProps) => {
  const meshRef = useRef<THREE.Group>(null as any);
  const updateRef = useRef(onPositionChange);
  updateRef.current = onPositionChange;

  // Uncontrolled Mesh: We only set the mesh position on external changes (e.g. initial mount)
  // We do NOT set it if we are the ones who dragged it (to prevent React re-renders from reverting it).
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.position.set(antenna.x, antenna.y, antenna.z);
    }
  }, [antenna.x, antenna.y, antenna.z]); // Update matrix when React's truth changes

  return (
    <TransformControls
      mode="translate"
      showX={isSelected}
      showY={isSelected}
      showZ={isSelected}
      enabled={isSelected}
      onMouseDown={() => {
        if (setOrbitEnabled) setOrbitEnabled(false);
      }}
      onMouseUp={(e) => {
        if (setOrbitEnabled) setOrbitEnabled(true);
        if (updateRef.current && meshRef.current) {
          const { x, y, z } = meshRef.current.position;
          updateRef.current(antenna.id, [x, y, z], true);
        }
      }}
    >
      <group
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelectElement?.(antenna.id);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onSelectElement?.(antenna.id);
        }}
      >
        <AntennaModel
          config={{ ...config, type: antenna.type }}
          color={isSelected ? "#3b82f6" : antenna.color}
        />
        <pointLight
          intensity={isSelected ? 0.3 : 0.1}
          color={isSelected ? "#3b82f6" : antenna.color}
        />
      </group>
    </TransformControls>
  );
};

const AntennaElements3D = ({
  config,
  onPositionChange,
  selectedElementId,
  onSelectElement,
  setOrbitEnabled,
}: AntennaElements3DProps) => {
  const { lambda } = useMemo(() => calculatePhysics(config), [config.freq]);
  const stackColors = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#a855f7",
    "#06b6d4",
  ];

  const elements = useMemo(() => {
    if (config.activeTab === "manual") {
      return config.manualElements.map((el, idx) => ({
        id: el.id,
        x: el.position[0],
        y: el.position[1],
        z: el.position[2],
        color: stackColors[idx % stackColors.length],
        type: el.type,
      }));
    }

    const list: any[] = [];
    const N = config.elements;
    const d = config.spacing * lambda;
    const layers = config.activeTab === "3d" ? config.stacks : 1;
    const dS = config.stackSpacing * lambda;

    const getLayerElements = () => {
      const layer = [];
      if (config.activeTab === "single" || N === 1) {
        layer.push({ x: 0, z: 0 });
      } else if (config.geometry === "linear") {
        for (let i = 0; i < N; i++) {
          layer.push({ x: 0, z: (i - (N - 1) / 2) * d });
        }
      } else if (config.geometry === "square") {
        const N_eff = Math.max(4, Math.round(N / 4) * 4);
        const elementsPerSide = N_eff / 4;
        const L = d * elementsPerSide;

        const v1 = { x: -L / 2, z: -L / 2 };
        const v2 = { x: L / 2, z: -L / 2 };
        const v3 = { x: L / 2, z: L / 2 };
        const v4 = { x: -L / 2, z: L / 2 };

        const addElementsOnSide = (start: any, end: any) => {
          for (let i = 0; i < elementsPerSide; i++) {
            const t = i / elementsPerSide;
            layer.push({
              x: start.x + t * (end.x - start.x),
              z: start.z + t * (end.z - start.z),
            });
          }
        };

        addElementsOnSide(v1, v2);
        addElementsOnSide(v2, v3);
        addElementsOnSide(v3, v4);
        addElementsOnSide(v4, v1);
      } else if (config.geometry === "circular") {
        const radius = (N * d) / (2 * Math.PI);
        for (let i = 0; i < N; i++) {
          const angle = (i / N) * Math.PI * 2;
          layer.push({
            x: Math.cos(angle) * radius,
            z: Math.sin(angle) * radius,
          });
        }
      } else if (config.geometry === "triangular") {
        const N_eff = Math.max(3, Math.round(N / 3) * 3);
        const sideElements = N_eff / 3;
        const L = config.spacing * lambda * sideElements;
        const h = (Math.sqrt(3) / 2) * L;

        // Equilateral triangle vertices (XZ plane)
        const v1 = { x: 0, z: -(2 / 3) * h };
        const v2 = { x: -L / 2, z: (1 / 3) * h };
        const v3 = { x: L / 2, z: (1 / 3) * h };

        const addElementsOnSide = (start: any, end: any, count: number) => {
          for (let i = 0; i < count; i++) {
            const t = i / count;
            layer.push({
              x: start.x + t * (end.x - start.x),
              z: start.z + t * (end.z - start.z),
            });
          }
        };

        addElementsOnSide(v1, v2, sideElements);
        addElementsOnSide(v2, v3, sideElements);
        addElementsOnSide(v3, v1, sideElements);

        // No padding since we forced N to N_eff in presentation
        while (layer.length > N_eff) layer.pop();
      }
      return layer;
    };

    const baseLayer = getLayerElements();
    for (let s = 0; s < layers; s++) {
      const y = (s - (layers - 1) / 2) * dS;
      const stackColor = stackColors[s % stackColors.length];
      baseLayer.forEach((p) => {
        list.push({ x: p.x, y, z: p.z, color: stackColor });
      });
    }
    return list;
  }, [config, lambda]);

  return (
    <group>
      {elements.map((pos: any, idx: number) => {
        if (config.activeTab === "manual") {
          const isSelected = selectedElementId === pos.id;
          return (
            <DraggableAntenna
              key={pos.id}
              antenna={pos}
              config={config}
              isSelected={isSelected}
              onSelectElement={onSelectElement}
              onPositionChange={onPositionChange}
              setOrbitEnabled={setOrbitEnabled}
            />
          );
        }

        return (
          <group key={idx} position={[pos.x, pos.y, pos.z]}>
            <AntennaModel config={config} color={pos.color} />
            <pointLight intensity={0.1} color={pos.color} />
          </group>
        );
      })}
    </group>
  );
};

// --- AI Service ---

const AI_PROMPT = `You are the Expert Antenna Professor and Laboratory Mentor. 
You assist users in the Professional Antenna Radiation Laboratory. 
You can explain physics, suggest optimizations, and perform configuration changes.
Your tone is academic, authoritative, yet encouraging.

GUARDRAILS:
1. Only discuss antenna theory, electromagnetics, and simulation parameters.
2. Refuse to write generic code or discuss unrelated politics/pop culture.
3. If asked for derivations, provide the final formula and explain the physical meaning.
4. Always output your reasoning inside <thought> tags before responding.

You have access to a function 'updateConfig' which takes a JSON object of ConfigurationState fields.
When updating 'type', use one of the strings from the available antenna categories.`;

const aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// --- Main App ---

export default function App() {
  const [sessionStarted] = useState(Date.now());
  const [config, setConfig] = useState<ConfigurationState>(DEFAULT_CONFIG);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<
    { role: "user" | "ai"; text: string; thought?: string }[]
  >([
    {
      role: "ai",
      text: "Welcome to the Professional Antenna Laboratory. I am your engineering consultant. How can I assist with your radiation model today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    null,
  );
  const [orbitEnabled, setOrbitEnabled] = useState(true);
  const pendingPositions = useRef<Record<string, [number, number, number]>>({});

  // Firebase Auth & Cloud Storage States
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState("");
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // States for Manual Coordinate Input
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [manualX, setManualX] = useState("0");
  const [manualY, setManualY] = useState("0");
  const [manualZ, setManualZ] = useState("0");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedElementId) {
        // Assume text inputs stop propagation, so if we reach here, it's a global delete
        if (
          (e.target as HTMLElement).tagName === "INPUT" ||
          (e.target as HTMLElement).tagName === "TEXTAREA"
        )
          return;

        setConfig((prev) => {
          const newElements = prev.manualElements.filter(
            (el) => el.id !== selectedElementId,
          );
          return {
            ...prev,
            manualElements: newElements,
            showResult: newElements.length > 0 ? prev.showResult : false,
          };
        });
        setSelectedElementId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedElementId]);

  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, "test", "connection"));
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("the client is offline")
        ) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        loadProjects(currentUser.uid);
      } else {
        setProjects([]);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      toast.success("Successfully logged in with Google!");
    } catch (e) {
      toast.error("Failed to login.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success("Logged out successfully.");
      window.location.reload();
    } catch (e) {
      toast.error("Failed to log out.");
    }
  };

  const saveProject = async () => {
    if (!user) return toast.error("Please login to save projects.");
    if (!saveName.trim()) return toast.error("Please provide a name.");

    setIsSaving(true);
    try {
      await addDoc(collection(db, "projects"), {
        name: saveName.trim(),
        description: saveDesc.trim() || "No description provided.",
        ownerId: user.uid,
        configuration: config,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success("Project saved successfully!");
      setSaveModalOpen(false);
      setSaveName("");
      setSaveDesc("");
      loadProjects(user.uid);
    } catch (error: any) {
      toast.error("Failed to save project.");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const loadProjects = async (uid: string) => {
    setIsLoadingProjects(true);
    try {
      const q = query(collection(db, "projects"), where("ownerId", "==", uid));
      const querySnapshot = await getDocs(q);
      const projData: any[] = [];
      querySnapshot.forEach((d) => {
        projData.push({ id: d.id, ...d.data() });
      });
      setProjects(
        projData.sort(
          (a, b) =>
            (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0),
        ),
      );
    } catch (error) {
      toast.error("Failed to load projects.");
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const handleLoadProject = (proj: any) => {
    if (proj.configuration) {
      setConfig({
        ...DEFAULT_CONFIG,
        manualElements: [], // Fallback for old projects
        ...proj.configuration,
      });
      setProjectsOpen(false);
      toast.success(`Loaded project: ${proj.name}`);
    }
  };

  const handleDeleteProject = async (
    e: React.MouseEvent,
    projectId: string,
  ) => {
    e.stopPropagation();
    if (!user) return;
    try {
      await deleteDoc(doc(db, "projects", projectId));
      toast.success("Project deleted.");
      loadProjects(user.uid);
    } catch (error) {
      toast.error("Failed to delete project.");
    }
  };

  const handleNewProject = () => {
    setConfig({
      ...DEFAULT_CONFIG,
      activeTab: "manual",
      manualElements: [],
      showResult: false,
    });
    toast.success("New manual project started.");
  };


  // AI Engineering Consultant - RAG Implementation
const handleAIQuery = async (query: string) => {
  if (!query.trim()) return;

  // 1. Add user message to the UI
  setMessages(prev => [...prev, { role: "user" as const, text: query }]);
  setInput(""); 
  setIsTyping(true);

  try {
    // 2. Fetch answer from your Flowise RAG endpoint
    const response = await fetch("https://cloud.flowiseai.com/api/v1/prediction/43c3fd60-f5e5-4b7e-bf72-a1885b466d02", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: query })
    });

    const result = await response.json();

    // 3. Add bot response to the UI
    setMessages(prev => [...prev, { 
      role: "assistant" as const, 
      text: result.text || result.answer || "Sorry, I couldn't find information on that." 
    }]);
  } catch (error) {
    console.error("RAG Query Error:", error);
    setMessages(prev => [...prev, { 
      role: "assistant" as const, 
      text: "Error: Unable to connect to the antenna engineering database." 
    }]);
  } finally {
    setIsTyping(false);
  }
};

  const { lambda } = useMemo(() => calculatePhysics(config), [config.freq]);

  const handleRunSimulation = () => {
    setConfig((p) => {
      // Sync all pending un-rendered positions securely into the physics engine
      const updatedElements = p.manualElements.map((el) => {
        if (pendingPositions.current[el.id]) {
          return { ...el, position: pendingPositions.current[el.id] };
        }
        return el;
      });

      return {
        ...p,
        manualElements: updatedElements,
        isSimulating: true,
        showResult: false,
      };
    });

    setTimeout(() => {
      setConfig((p) => ({
        ...p,
        isSimulating: false,
        showResult: true,
        is3D: true,
      }));
    }, 1500);
  };

  return (
    <div
      className={`flex flex-col h-screen overflow-hidden transition-colors duration-500 ${config.theme === "dark" ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"}`}
    >
      {/* Header */}
      <header
        className={`h-16 px-6 border-b flex items-center justify-between z-20 ${config.theme === "dark" ? "bg-slate-950/80 border-slate-800" : "bg-white/80 border-slate-200"} backdrop-blur-md`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Radio className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight">
              Antenna Laboratory{" "}
              <span className="text-blue-500 ml-1 text-sm font-medium">
                Professional v5.0
              </span>
            </h1>
            <p className="text-xs text-slate-500 font-mono">
              ID: {config.antName.toUpperCase().replace(/\s+/g, "_")} // FRQ:{" "}
              {config.freq}MHz
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div
            className={`px-4 py-1.5 rounded-full text-xs font-medium border hidden md:flex items-center gap-2 ${config.theme === "dark" ? "bg-slate-900 border-slate-800 text-slate-400" : "bg-slate-100 border-slate-200 text-slate-600"}`}
          >
            <Cpu className="w-3.5 h-3.5" />
            Physics Engine:{" "}
            <span className="text-emerald-500 font-mono">ACTIVE</span>
          </div>

          <div className="h-6 w-px bg-slate-300 dark:bg-slate-800 mx-2"></div>

          {/* User Account / Auth */}
          {user ? (
            <div className="flex items-center gap-3">
              <button
                onClick={handleNewProject}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-semibold transition-all ${config.theme === "dark" ? "bg-slate-800 text-blue-400 hover:text-white hover:bg-slate-700" : "bg-slate-100 text-blue-600 hover:text-blue-900 hover:bg-slate-200"}`}
              >
                <FilePlus className="w-4 h-4" />
                <span className="hidden sm:inline">New Project</span>
              </button>
              <button
                onClick={() => setProjectsOpen(true)}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-semibold transition-all ${config.theme === "dark" ? "bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700" : "bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200"}`}
              >
                <FolderOpen className="w-4 h-4" />
                <span className="hidden sm:inline">Library</span>
              </button>
              <button
                onClick={() => setSaveModalOpen(true)}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-semibold shadow-md transition-all bg-emerald-600 text-white hover:bg-emerald-500`}
              >
                <Save className="w-4 h-4" />
                <span className="hidden sm:inline">Save</span>
              </button>

              <div
                className="relative ml-2"
                onMouseEnter={() => setUserMenuOpen(true)}
                onMouseLeave={() => setUserMenuOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  className="flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full"
                >
                  <img
                    src={user.photoURL || ""}
                    alt="Profile"
                    className="w-8 h-8 rounded-full border-2 border-slate-700 dark:border-slate-500 hover:border-blue-500 transition-colors"
                  />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-full pt-1.5 z-50">
                    <div
                      className={`p-1 rounded-xl shadow-2xl border flex flex-col gap-1 w-36 ${
                        config.theme === "dark"
                          ? "bg-slate-800 border-slate-700 text-slate-200"
                          : "bg-white border-slate-200 text-slate-700"
                      }`}
                    >
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          setProjectsOpen(true);
                        }}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 text-left transition-colors ${
                          config.theme === "dark"
                            ? "hover:bg-slate-700 hover:text-white"
                            : "hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        <FolderOpen className="w-4 h-4" /> Library
                      </button>
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          setSaveModalOpen(true);
                        }}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 text-left transition-colors ${
                          config.theme === "dark"
                            ? "hover:bg-slate-700 hover:text-white"
                            : "hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        <Save className="w-4 h-4" /> Save Project
                      </button>
                      <div
                        className={`h-px my-1 ${
                          config.theme === "dark" ? "bg-slate-700" : "bg-slate-200"
                        }`}
                      />
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          handleLogout();
                        }}
                        className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 text-left transition-colors ${
                          config.theme === "dark"
                            ? "text-red-400 hover:bg-red-950/40 hover:text-red-300"
                            : "text-red-500 hover:bg-red-50 hover:text-red-700"
                        }`}
                      >
                        <LogOut className="w-4 h-4" /> Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={handleLogin}
              className="flex items-center gap-2 px-4 py-2 bg-white text-slate-900 font-semibold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all text-xs shadow-sm"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              <span>Log in</span>
            </button>
          )}

          <div className="h-6 w-px bg-slate-300 dark:bg-slate-800 mx-2"></div>

          <button
            onClick={() =>
              setConfig((p) => ({
                ...p,
                theme: p.theme === "dark" ? "light" : "dark",
              }))
            }
            className={`p-2 rounded-xl border transition-all ${config.theme === "dark" ? "hover:bg-slate-800 border-slate-800" : "hover:bg-slate-100 border-slate-200"}`}
          >
            {config.theme === "dark" ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Configuration Hub */}
        <aside
          className={`w-[30%] min-w-[320px] max-w-[400px] border-r flex flex-col z-10 ${config.theme === "dark" ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"}`}
        >
          <div className="flex border-b border-slate-800/50">
            {(["single", "2d", "3d", "manual"] as ConfigTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() =>
                  setConfig((p) => ({
                    ...p,
                    activeTab: tab,
                    showResult:
                      tab === "manual" && p.manualElements.length > 0
                        ? true
                        : false,
                  }))
                }
                className={`flex-1 py-3 text-[10px] uppercase font-bold tracking-widest transition-all ${config.activeTab === tab ? "text-blue-500 border-b-2 border-blue-500 bg-blue-500/5" : "text-slate-500 hover:text-slate-300"}`}
              >
                {tab === "single"
                  ? "Single"
                  : tab === "2d"
                    ? "2D Array"
                    : tab === "3d"
                      ? "3D Cylinder"
                      : "Manual"}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
            {/* Single Antenna Controls */}
            {config.activeTab === "single" && (
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-blue-500 font-semibold mb-2">
                  <Settings2 className="w-4 h-4" />
                  <h2 className="text-sm uppercase tracking-wider">
                    Radiator Specs
                  </h2>
                </div>

                <div className="space-y-4">
                  <div className="group">
                    <label className="text-[10px] uppercase font-bold text-slate-500 mb-1.5 block">
                      Antenna Type
                    </label>
                    <select
                      value={config.type}
                      onChange={(e) =>
                        setConfig((p) => ({ ...p, type: e.target.value }))
                      }
                      className={`w-full p-2.5 rounded-xl border text-xs outline-none transition-all ${config.theme === "dark" ? "bg-slate-900 border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-900"}`}
                    >
                      {antennaCategories.map((cat, idx) => (
                        <optgroup key={idx} label={cat.group}>
                          {cat.types.map((t, tidx) => (
                            <option key={tidx} value={t}>
                              {t}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-end">
                      <label className="text-[10px] uppercase font-bold text-slate-500">
                        Frequency
                      </label>
                      <span className="text-xs font-mono text-blue-500">
                        {config.freq} MHz
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="5000"
                      value={config.freq}
                      onChange={(e) =>
                        setConfig((p) => ({
                          ...p,
                          freq: Number(e.target.value),
                        }))
                      }
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-end">
                      <label className="text-[10px] uppercase font-bold text-slate-500">
                        Physical Length
                      </label>
                      <span className="text-xs font-mono text-blue-500">
                        {config.length.toFixed(2)}m
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.01"
                      max="10"
                      step="0.01"
                      value={config.length}
                      onChange={(e) =>
                        setConfig((p) => ({
                          ...p,
                          length: Number(e.target.value),
                        }))
                      }
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  {config.type.toLowerCase().includes("helix") && (
                    <div className="space-y-4 pt-4 border-t border-slate-800/30">
                      <div className="space-y-2">
                        <div className="flex justify-between items-end">
                          <label className="text-[10px] uppercase font-bold text-slate-500">
                            Helix Radius
                          </label>
                          <span className="text-xs font-mono text-blue-500">
                            {config.helixRadius.toFixed(2)}m
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.01"
                          max="1"
                          step="0.01"
                          value={config.helixRadius}
                          onChange={(e) =>
                            setConfig((p) => ({
                              ...p,
                              helixRadius: Number(e.target.value),
                            }))
                          }
                          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-end">
                          <label className="text-[10px] uppercase font-bold text-slate-500">
                            Pitch (S)
                          </label>
                          <span className="text-xs font-mono text-blue-500">
                            {config.helixPitch.toFixed(2)}m
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.01"
                          max="0.5"
                          step="0.01"
                          value={config.helixPitch}
                          onChange={(e) =>
                            setConfig((p) => ({
                              ...p,
                              helixPitch: Number(e.target.value),
                            }))
                          }
                          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-end">
                          <label className="text-[10px] uppercase font-bold text-slate-500">
                            Turns (N)
                          </label>
                          <span className="text-xs font-mono text-blue-500">
                            {config.helixTurns}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="20"
                          value={config.helixTurns}
                          onChange={(e) =>
                            setConfig((p) => ({
                              ...p,
                              helixTurns: Number(e.target.value),
                            }))
                          }
                          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Common Array Controls (2D & 3D) */}
            {(config.activeTab === "2d" || config.activeTab === "3d") && (
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-500 font-semibold mb-2">
                  <LayoutGrid className="w-4 h-4" />
                  <h2 className="text-sm uppercase tracking-wider">
                    Lattice Designer
                  </h2>
                </div>

                <div className="space-y-4">
                  <div className="group">
                    <label className="text-[10px] uppercase font-bold text-slate-500 mb-1.5 block">
                      Radiator Element Type
                    </label>
                    <select
                      value={config.type}
                      onChange={(e) =>
                        setConfig((p) => ({ ...p, type: e.target.value }))
                      }
                      className={`w-full p-2.5 rounded-xl border text-xs outline-none transition-all ${config.theme === "dark" ? "bg-slate-900 border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-900"}`}
                    >
                      {antennaCategories.map((cat, idx) => (
                        <optgroup key={idx} label={cat.group}>
                          {cat.types.map((t, tidx) => (
                            <option key={tidx} value={t}>
                              {t}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-end">
                      <label className="text-[10px] uppercase font-bold text-slate-500">
                        Number of Elements
                      </label>
                      <span className="text-xs font-mono text-emerald-500">
                        {config.elements}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="64"
                      value={config.elements}
                      onChange={(e) =>
                        setConfig((p) => ({
                          ...p,
                          elements: Number(e.target.value),
                        }))
                      }
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-slate-500">
                      Lattice Geometry
                    </label>
                    <select
                      value={config.geometry}
                      onChange={(e) =>
                        setConfig((p) => ({
                          ...p,
                          geometry: e.target.value as ArrayGeometry,
                        }))
                      }
                      className={`w-full p-2.5 rounded-xl border text-xs outline-none transition-all ${config.theme === "dark" ? "bg-slate-900 border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-900"}`}
                    >
                      <option value="linear">Linear Uniform Array</option>
                      <option value="square">Square Array</option>
                      <option value="circular">
                        Circular / Ring formation
                      </option>
                      <option value="triangular">Triangular / Hexagonal</option>
                    </select>
                  </div>

                  {config.activeTab === "3d" && (
                    <>
                      <div className="space-y-2 pt-4 border-t border-slate-800/30">
                        <div className="flex justify-between items-end">
                          <label className="text-[10px] uppercase font-bold text-slate-500">
                            Number of Stacks
                          </label>
                          <span className="text-xs font-mono text-emerald-500">
                            {config.stacks}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="8"
                          value={config.stacks}
                          onChange={(e) =>
                            setConfig((p) => ({
                              ...p,
                              stacks: Number(e.target.value),
                            }))
                          }
                          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-end">
                          <label className="text-[10px] uppercase font-bold text-slate-500">
                            Stack Spacing (λ)
                          </label>
                          <span className="text-xs font-mono text-emerald-500">
                            {config.stackSpacing.toFixed(2)}λ
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="2"
                          step="0.05"
                          value={config.stackSpacing}
                          onChange={(e) =>
                            setConfig((p) => ({
                              ...p,
                              stackSpacing: Number(e.target.value),
                            }))
                          }
                          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                      </div>
                    </>
                  )}

                  <div className="space-y-2">
                    <div className="flex justify-between items-end">
                      <label className="text-[10px] uppercase font-bold text-slate-500">
                        Element Spacing (λ)
                      </label>
                      <span className="text-xs font-mono text-emerald-500">
                        {config.spacing.toFixed(2)}λ
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="2"
                      step="0.05"
                      value={config.spacing}
                      onChange={(e) =>
                        setConfig((p) => ({
                          ...p,
                          spacing: Number(e.target.value),
                        }))
                      }
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>
                </div>
              </section>
            )}

            {/* Manual Array Controls */}
            {config.activeTab === "manual" && (
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-purple-500 font-semibold mb-2">
                  <LayoutGrid className="w-4 h-4" />
                  <h2 className="text-sm uppercase tracking-wider">
                    Manual Designer
                  </h2>
                </div>

                <div className="space-y-4">
                  <div className="group">
                    <label className="text-[10px] uppercase font-bold text-slate-500 mb-1.5 block">
                      Next Element Type
                    </label>
                    <select
                      value={config.type}
                      onChange={(e) =>
                        setConfig((p) => ({ ...p, type: e.target.value }))
                      }
                      className={`w-full p-2.5 rounded-xl border text-xs outline-none transition-all ${config.theme === "dark" ? "bg-slate-900 border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-900"}`}
                    >
                      {antennaCategories.map((cat, idx) => (
                        <optgroup key={idx} label={cat.group}>
                          {cat.types.map((t, tidx) => (
                            <option key={tidx} value={t}>
                              {t}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => {
                      if (config.type === "-") return;
                      setManualX("0");
                      setManualY("0");
                      setManualZ("0");
                      setAddModalOpen(true);
                    }}
                    disabled={config.type === "-"}
                    className={`w-full py-2 rounded-xl text-xs font-bold transition-all shadow-lg ${config.type === "-" ? "bg-slate-700 text-slate-500 cursor-not-allowed shadow-none" : "bg-purple-600 hover:bg-purple-500 text-white shadow-purple-500/20"}`}
                  >
                    Add Element to Canvas
                  </button>

                  <button
                    onClick={() => {
                      setConfig((p) => ({
                        ...p,
                        manualElements: [],
                        showResult: false,
                      }));
                      setSelectedElementId(null);
                    }}
                    className={`w-full py-2 rounded-xl border text-xs font-bold transition-all ${config.theme === "dark" ? "hover:bg-red-500/10 hover:text-red-500 border-slate-700 text-slate-400" : "hover:bg-red-50 hover:text-red-600 border-slate-300 text-slate-500"}`}
                  >
                    Clear Canvas
                  </button>

                  <div
                    className={`pt-4 border-t ${config.theme === "dark" ? "border-slate-800" : "border-slate-200"}`}
                  >
                    <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">
                      Elements Placed: {config.manualElements.length}
                    </p>

                    {/* List of currently placed elements with inline coordinate inputs */}
                    {config.manualElements.length > 0 && (
                      <div className="mt-2 mb-4 space-y-2 max-h-56 overflow-y-auto pr-1">
                        {config.manualElements.map((el, index) => (
                          <div
                            key={el.id}
                            className={`p-3 rounded-xl border flex flex-col gap-2 transition-all cursor-pointer ${
                              selectedElementId === el.id
                                ? "bg-purple-950/20 border-purple-500/60"
                                : config.theme === "dark"
                                  ? "bg-slate-800/40 border-slate-700 hover:bg-slate-800/60"
                                  : "bg-slate-100 border-slate-200 hover:bg-slate-200"
                            }`}
                            onClick={() => setSelectedElementId(el.id)}
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">
                                Element #{index + 1}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfig((p) => {
                                    const updated = p.manualElements.filter((item) => item.id !== el.id);
                                    return {
                                      ...p,
                                      manualElements: updated,
                                      showResult: updated.length > 0 ? p.showResult : false,
                                    };
                                  });
                                  if (selectedElementId === el.id) setSelectedElementId(null);
                                }}
                                className="text-slate-500 hover:text-red-400 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-[8px] uppercase text-slate-500 block font-bold mb-0.5">X (m)</label>
                                <input
                                  type="number"
                                  step={0.1}
                                  value={el.position[0]}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setConfig((p) => {
                                      const updated = [...p.manualElements];
                                      const oldEl = updated[index];
                                      updated[index] = {
                                        ...oldEl,
                                        position: [val, oldEl.position[1], oldEl.position[2]]
                                      };
                                      return { ...p, manualElements: updated };
                                    });
                                  }}
                                  className={`w-full px-1.5 py-1 rounded text-xs select-none outline-none font-mono ${
                                    config.theme === "dark"
                                      ? "bg-black/40 border border-slate-700 text-white focus:border-purple-500"
                                      : "bg-white border border-slate-300 text-slate-800 focus:border-purple-500"
                                  }`}
                                />
                              </div>
                              <div>
                                <label className="text-[8px] uppercase text-slate-500 block font-bold mb-0.5">Y (m)</label>
                                <input
                                  type="number"
                                  step={0.1}
                                  value={el.position[1]}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setConfig((p) => {
                                      const updated = [...p.manualElements];
                                      const oldEl = updated[index];
                                      updated[index] = {
                                        ...oldEl,
                                        position: [oldEl.position[0], val, oldEl.position[2]]
                                      };
                                      return { ...p, manualElements: updated };
                                    });
                                  }}
                                  className={`w-full px-1.5 py-1 rounded text-xs select-none outline-none font-mono ${
                                    config.theme === "dark"
                                      ? "bg-black/40 border border-slate-700 text-white focus:border-purple-500"
                                      : "bg-white border border-slate-300 text-slate-800 focus:border-purple-500"
                                  }`}
                                />
                              </div>
                              <div>
                                <label className="text-[8px] uppercase text-slate-500 block font-bold mb-0.5">Z (m)</label>
                                <input
                                  type="number"
                                  step={0.1}
                                  value={el.position[2]}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setConfig((p) => {
                                      const updated = [...p.manualElements];
                                      const oldEl = updated[index];
                                      updated[index] = {
                                        ...oldEl,
                                        position: [oldEl.position[0], oldEl.position[1], val]
                                      };
                                      return { ...p, manualElements: updated };
                                    });
                                  }}
                                  className={`w-full px-1.5 py-1 rounded text-xs select-none outline-none font-mono ${
                                    config.theme === "dark"
                                      ? "bg-black/40 border border-slate-700 text-white focus:border-purple-500"
                                      : "bg-white border border-slate-300 text-slate-800 focus:border-purple-500"
                                  }`}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="text-xs text-slate-400">
                      Enter coordinates to position exactly. Selected antenna highlighted in preview.
                      Right-Click to pan camera. Press{" "}
                      <kbd className="bg-slate-800 px-1 rounded">Delete</kbd> to
                      remove selected element.
                    </p>
                  </div>
                </div>
              </section>
            )}

            <button
              onClick={handleRunSimulation}
              disabled={config.isSimulating}
              className={`w-full py-4 rounded-2xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all shadow-xl ${config.isSimulating ? "bg-slate-800 text-slate-500" : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20"}`}
            >
              {config.isSimulating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              {config.isSimulating ? "Computing Fields..." : "Run Simulation"}
            </button>
          </div>

          <div
            className={`p-4 border-t flex flex-col gap-3 ${config.theme === "dark" ? "bg-slate-900/30 border-slate-800" : "bg-slate-50 border-slate-200"}`}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                <Waves className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase text-slate-500 font-bold">
                  Resonant λ
                </p>
                <p className="text-sm font-mono font-bold">
                  {lambda.toFixed(4)} m
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase text-slate-500 font-bold">
                  Calculated Gain
                </p>
                <p className="text-sm font-mono font-bold">
                  {calculateGain(config, lambda)} dBi
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* Visualization Theatre */}
        <section
          className={`flex-1 relative overflow-hidden flex flex-col ${config.theme === "dark" ? "bg-[#020617]" : "bg-slate-100"}`}
        >
          <AnimatePresence>
            {config.isSimulating && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-900/40 backdrop-blur-sm"
              >
                <div className="w-16 h-16 rounded-2xl bg-blue-600/20 flex items-center justify-center mb-4">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
                <h3 className="text-white font-bold tracking-widest uppercase text-sm">
                  Computing Array Factor...
                </h3>
                <p className="text-blue-200 text-xs mt-2 font-mono">
                  Parallel Phase Matrix evaluation
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center p-1.5 bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl z-20 shadow-2xl">
            <button
              onClick={() => setConfig((p) => ({ ...p, is3D: true }))}
              className={`p-2.5 rounded-xl flex items-center gap-2 text-sm font-medium transition-all ${config.is3D ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "text-slate-400 hover:text-white"}`}
            >
              <Box className="w-4 h-4" />
              3D Spatial Model
            </button>
            <button
              onClick={() => setConfig((p) => ({ ...p, is3D: false }))}
              className={`p-2.5 rounded-xl flex items-center gap-2 text-sm font-medium transition-all ${!config.is3D ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "text-slate-400 hover:text-white"}`}
            >
              <Maximize2 className="w-4 h-4" />
              Linear Radiation (Radar)
            </button>
          </div>

          <div className="flex-1 w-full h-full">
            {config.is3D ? (
              <Canvas
                shadows
                dpr={[1, 2]}
                onPointerMissed={() => setSelectedElementId(null)}
              >
                <PerspectiveCamera makeDefault position={[3, 3, 3]} fov={50} />
                <OrbitControls
                  makeDefault
                  enabled={orbitEnabled}
                  enableDamping
                  enablePan={true}
                  mouseButtons={{
                    LEFT: THREE.MOUSE.ROTATE,
                    MIDDLE: THREE.MOUSE.DOLLY,
                    RIGHT: THREE.MOUSE.PAN,
                  }}
                  minDistance={0.001}
                  maxDistance={100000}
                  autoRotate={false}
                />
                <ambientLight intensity={0.5} />
                <spotLight
                  position={[10, 10, 10]}
                  angle={0.15}
                  penumbra={1}
                  intensity={1}
                  castShadow
                />
                <pointLight
                  position={[-10, -10, -10]}
                  intensity={0.5}
                  color="#3b82f6"
                />

                <Environment preset="city" />

                {config.activeTab === "manual" ? (
                  <group>
                    <AntennaElements3D
                      config={config}
                      selectedElementId={selectedElementId}
                      onSelectElement={setSelectedElementId}
                      setOrbitEnabled={setOrbitEnabled}
                      onPositionChange={(id, pos, isDragEnd) => {
                        pendingPositions.current[id] = pos;
                        if (isDragEnd) {
                          setConfig((p) => ({
                            ...p,
                            manualElements: p.manualElements.map((el) =>
                              el.id === id ? { ...el, position: pos } : el,
                            ),
                          }));
                        }
                      }}
                    />
                    {config.showResult && (
                      <RadiationPattern3D config={config} />
                    )}
                  </group>
                ) : (
                  <Float
                    speed={1.5}
                    rotationIntensity={0.5}
                    floatIntensity={0.5}
                  >
                    <AntennaElements3D config={config} />
                    {config.showResult && (
                      <RadiationPattern3D config={config} />
                    )}
                  </Float>
                )}

                <Grid
                  infiniteGrid
                  fadeDistance={15}
                  sectionSize={1}
                  cellSize={0.2}
                  sectionThickness={1.5}
                  cellThickness={0.5}
                  sectionColor={config.theme === "dark" ? "#1e293b" : "#cbd5e1"}
                  cellColor={config.theme === "dark" ? "#0f172a" : "#e2e8f0"}
                />

                <ContactShadows
                  position={[0, -1.5, 0]}
                  opacity={0.4}
                  scale={10}
                  blur={2.5}
                  far={4}
                />
              </Canvas>
            ) : (
              <div className="w-full h-full flex items-center justify-center p-12">
                <div className="w-full max-w-4xl h-full flex items-center justify-center">
                  <Radar
                    data={{
                      labels: Array.from(
                        { length: 180 },
                        (_, i) => `${i * 2}°`,
                      ),
                      datasets: [
                        {
                          label: "Relative Field Intesity (V/m)",
                          data: Array.from({ length: 180 }, (_, i) => {
                            const theta = (i * 2 * Math.PI) / 180;
                            const physics = calculatePhysics(config);
                            const el = getElementField(
                              config.type,
                              theta,
                              physics.kL_2,
                              physics.kL,
                            );
                            const af = getArrayFactor(
                              config,
                              theta,
                              0,
                              physics.k,
                              physics.lambda,
                            );
                            return el * af;
                          }),
                          backgroundColor: "rgba(59, 130, 246, 0.2)",
                          borderColor: "#3b82f6",
                          borderWidth: 2,
                          pointRadius: 0,
                        },
                      ],
                    }}
                    options={{
                      scales: {
                        r: {
                          angleLines: {
                            color:
                              config.theme === "dark" ? "#1e293b" : "#e2e8f0",
                          },
                          grid: {
                            color:
                              config.theme === "dark" ? "#1e293b" : "#e2e8f0",
                          },
                          pointLabels: { display: false },
                          ticks: { display: false },
                          suggestedMin: 0,
                        },
                      },
                      plugins: {
                        legend: { display: false },
                      },
                      maintainAspectRatio: false,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Mathematical & Specific Formula Overlay */}
          <div className="absolute bottom-[100px] left-6 z-20 flex flex-col gap-4">
            <AnimatePresence>
              {config.showFormula && (
                <motion.div
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -20, opacity: 0 }}
                  className={`p-6 rounded-3xl border backdrop-blur-xl shadow-2xl space-y-4 max-w-3xl ${config.theme === "dark" ? "bg-slate-900/90 border-slate-700" : "bg-white/90 border-slate-200"}`}
                >
                  <div className="flex items-center justify-between gap-2 text-blue-500 mb-2">
                    <div className="flex items-center gap-2">
                      <FunctionSquare className="w-5 h-5" />
                      <h3 className="text-xs font-bold uppercase tracking-tight">
                        Final Radiation Formula
                      </h3>
                    </div>
                    <button
                      onClick={() =>
                        setConfig((p) => ({ ...p, showFormula: false }))
                      }
                      className="text-slate-500 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div
                    className={`p-4 rounded-xl font-mono text-center overflow-x-auto ${config.theme === "dark" ? "bg-black/40" : "bg-slate-100"}`}
                  >
                    <BlockMath math={getGeneralizedFormula(config)} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="absolute bottom-6 left-6 z-20">
            <button
              onClick={() =>
                setConfig((p) => ({ ...p, showFormula: !p.showFormula }))
              }
              className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 hover:scale-110 transition-transform"
            >
              <Sigma className="w-6 h-6" />
            </button>
          </div>
        </section>

        {/* AI Consultant */}
        <AnimatePresence>
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className={`fixed bottom-6 right-6 w-96 rounded-3xl shadow-2xl flex flex-col z-50 overflow-hidden border ${config.theme === "dark" ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"} ${chatOpen ? "h-[600px]" : "h-14"}`}
          >
            {/* Chat Header */}
            <div
              onClick={() => setChatOpen(!chatOpen)}
              className="h-14 px-5 flex items-center justify-between cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                  <Sparkles className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold tracking-tight">
                  AI Physics Consultant
                </span>
              </div>
              {chatOpen ? (
                <Minimize2 className="w-4 h-4 text-slate-500" />
              ) : (
                <Maximize2 className="w-4 h-4 text-slate-500" />
              )}
            </div>

            {chatOpen && (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide bg-slate-950/20">
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
                    >
                      {m.thought && (
                        <div className="mb-2 p-2 bg-slate-800/30 border border-slate-700/30 rounded-lg text-[10px] font-mono text-slate-500 max-w-[90%]">
                          <div className="flex items-center gap-1 mb-1 opacity-50">
                            <Terminal className="w-3 h-3" />
                            REASONING_LOG
                          </div>
                          {m.thought}
                        </div>
                      )}
                      <div
                        className={`p-4 rounded-2xl text-xs leading-relaxed max-w-[90%] shadow-sm ${m.role === "user" ? "bg-blue-600 text-white rounded-tr-none" : "bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700"}`}
                      >
                        {m.text}
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex gap-2 p-4 bg-slate-800/50 rounded-2xl w-fit rounded-tl-none border border-slate-700 animate-pulse">
                      <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
                      <span className="text-xs text-slate-500">
                        Consulting physics engine...
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-slate-900 border-t border-slate-800 flex gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAIQuery(input)}
                    placeholder="Ask about antenna theory or optimizations..."
                    className="flex-1 bg-slate-800 border-slate-700 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-slate-600"
                  />
                  <button
                    onClick={() => handleAIQuery(input)}
                    disabled={isTyping}
                    className="p-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-white transition-colors disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Status Bar */}
      <footer
        className={`h-8 px-6 border-t flex items-center justify-between text-[10px] font-mono ${config.theme === "dark" ? "bg-slate-900 border-slate-800 text-slate-500" : "bg-slate-50 border-slate-200 text-slate-400"}`}
      >
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-emerald-500" /> SYSTEM_STABLE
          </span>
          <span>
            // RUNTIME: {Math.floor((Date.now() - sessionStarted) / 1000)}s
          </span>
          <span>// PERSISTENCE: FIREBASE_CLOUD_SYNC</span>
        </div>
        <div className="flex gap-4">
          <span className="flex items-center gap-1">
            <Database className="w-3 h-3" /> FIRESTORE_ENABLED
          </span>
          <span className="flex items-center gap-1">
            <Layers className="w-3 h-3" /> COMP_V5_STYLUS
          </span>
        </div>
      </footer>

      {/* Add Element Modal */}
      <AnimatePresence>
        {addModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`p-6 w-96 rounded-2xl shadow-2xl space-y-6 ${config.theme === "dark" ? "bg-slate-900 border border-slate-700 text-white" : "bg-white border border-slate-200 text-slate-900"}`}
            >
              <div>
                <h3 className="text-xl font-bold mb-2">Configure Manual Position</h3>
                <p className="text-xs text-slate-500 font-sans">
                  Please enter the precise coordinates (in meters) for placement of the chosen {config.type} antenna element.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1 uppercase tracking-wider">X Coordinate (m)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={manualX}
                    onChange={(e) => setManualX(e.target.value)}
                    placeholder="0.0"
                    className={`w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-purple-500 outline-none text-sm font-mono transition-all ${config.theme === "dark" ? "bg-black/40 border-slate-700 focus:border-purple-500 text-white" : "bg-slate-50 border-slate-300 focus:border-purple-500 text-slate-900"}`}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1 uppercase tracking-wider">Y Coordinate (m)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={manualY}
                    onChange={(e) => setManualY(e.target.value)}
                    placeholder="0.0"
                    className={`w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-purple-500 outline-none text-sm font-mono transition-all ${config.theme === "dark" ? "bg-black/40 border-slate-700 focus:border-purple-500 text-white" : "bg-slate-50 border-slate-300 focus:border-purple-500 text-slate-900"}`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1 uppercase tracking-wider">Z Coordinate (m)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={manualZ}
                    onChange={(e) => setManualZ(e.target.value)}
                    placeholder="0.0"
                    className={`w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-purple-500 outline-none text-sm font-mono transition-all ${config.theme === "dark" ? "bg-black/40 border-slate-700 focus:border-purple-500 text-white" : "bg-slate-50 border-slate-300 focus:border-purple-500 text-slate-900"}`}
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => setAddModalOpen(false)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${config.theme === "dark" ? "hover:bg-slate-800 text-slate-300" : "hover:bg-slate-100 text-slate-700"}`}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const parsedX = parseFloat(manualX) || 0;
                    const parsedY = parseFloat(manualY) || 0;
                    const parsedZ = parseFloat(manualZ) || 0;
                    const newEl: ManualElement = {
                      id: Math.random().toString(36).substring(2, 10),
                      type: config.type,
                      position: [parsedX, parsedY, parsedZ],
                    };
                    setConfig((p) => ({
                      ...p,
                      manualElements: [...p.manualElements, newEl],
                      showResult: false, // Defer to explicit Run Simulation
                    }));
                    setSelectedElementId(newEl.id);
                    setAddModalOpen(false);
                    toast.success("Element placed at specified coordinates.");
                  }}
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-bold shadow-lg transition-all"
                >
                  Confirm & Place
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Save Project Modal */}
      <AnimatePresence>
        {saveModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`p-6 w-96 rounded-2xl shadow-2xl space-y-6 ${config.theme === "dark" ? "bg-slate-900 border border-slate-700" : "bg-white border border-slate-200"}`}
            >
              <div>
                <h3 className="text-xl font-bold mb-2">Save Project</h3>
                <p className="text-xs text-slate-500">
                  Save your current hardware configuration to your cloud
                  library.
                </p>
              </div>
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. 5G Hex Yagi Array..."
                className={`w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none text-sm transition-all ${config.theme === "dark" ? "bg-black/40 border-slate-700 focus:border-emerald-500 text-white" : "bg-slate-50 border-slate-300 focus:border-emerald-500"}`}
                autoFocus
              />
              <textarea
                value={saveDesc}
                onChange={(e) => setSaveDesc(e.target.value)}
                placeholder="Description of the antenna layout..."
                rows={3}
                className={`w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none text-sm transition-all resize-none ${config.theme === "dark" ? "bg-black/40 border-slate-700 focus:border-emerald-500 text-white" : "bg-slate-50 border-slate-300 focus:border-emerald-500"}`}
              />
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setSaveModalOpen(false)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${config.theme === "dark" ? "hover:bg-slate-800" : "hover:bg-slate-100"}`}
                >
                  Cancel
                </button>
                <button
                  onClick={saveProject}
                  disabled={isSaving}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-lg transition-all flex items-center gap-2"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {isSaving ? "Saving..." : "Confirm Save"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Projects Library Drawer/Modal */}
      <AnimatePresence>
        {projectsOpen && (
          <div className="fixed inset-0 z-[100] flex justify-end bg-black/60 backdrop-blur-sm">
            <div
              className="absolute inset-0"
              onClick={() => setProjectsOpen(false)}
            ></div>
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className={`w-96 h-full shadow-2xl flex flex-col ${config.theme === "dark" ? "bg-slate-900 border-l border-slate-800" : "bg-white border-l border-slate-200"} relative z-10`}
            >
              <div className="p-6 border-b flex items-center justify-between border-slate-800/50">
                <div className="flex items-center gap-3">
                  <Database className="w-5 h-5 text-blue-500" />
                  <h3 className="text-xl font-bold">Project Library</h3>
                </div>
                <button
                  onClick={() => setProjectsOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {isLoadingProjects ? (
                  <div className="flex flex-col items-center justify-center p-10 opacity-50">
                    <Loader2 className="w-8 h-8 animate-spin mb-4" />
                    <p className="text-sm">Fetching cloud architecture...</p>
                  </div>
                ) : projects.length === 0 ? (
                  <div className="text-center p-10 opacity-50 flex flex-col items-center">
                    <FolderOpen className="w-12 h-12 mb-4 opacity-20" />
                    <p>No saved projects found.</p>
                    <p className="text-xs mt-2">
                      Save your current configuration to see it here.
                    </p>
                  </div>
                ) : (
                  projects.map((proj) => (
                    <div
                      key={proj.id}
                      className={`p-4 rounded-2xl border transition-all hover:scale-[1.02] cursor-pointer shadow-sm group ${config.theme === "dark" ? "bg-slate-800/50 border-slate-700 hover:border-blue-500" : "bg-slate-50 border-slate-200 hover:border-blue-500"}`}
                      onClick={() => handleLoadProject(proj)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-sm text-blue-500">
                          {proj.name}
                        </h4>
                        <button
                          onClick={(e) => handleDeleteProject(e, proj.id)}
                          className="text-slate-500 hover:text-red-500 transition-colors p-1"
                          title="Delete Project"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {proj.description && (
                        <p className="text-xs text-slate-500 mb-2 truncate">
                          {proj.description}
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-y-2 text-[10px] font-mono text-slate-500">
                        <span>
                          TYPE: {proj.configuration?.type?.split(" ")[0]}
                        </span>
                        <span>FREQ: {proj.configuration?.freq} MHz</span>
                        {proj.configuration?.elements > 1 && (
                          <span>
                            LATTICE:{" "}
                            {proj.configuration?.geometry?.toUpperCase()}
                          </span>
                        )}
                        {proj.configuration?.elements > 1 && (
                          <span>ELEM: N={proj.configuration?.elements}</span>
                        )}
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-700/50 text-[10px] text-slate-400">
                        Saved:{" "}
                        {proj.createdAt
                          ? new Date(proj.createdAt.toDate()).toLocaleString()
                          : "Just now"}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: config.theme === "dark" ? "#1e293b" : "#fff",
            color: config.theme === "dark" ? "#fff" : "#0f172a",
            border: "1px solid #334155",
          },
        }}
      />
    </div>
  );
  // Function to communicate with the Flowise RAG chatbot
  const queryFlowise = async (question: string) => {
    try {
      const response = await fetch(
        "https://cloud.flowiseai.com/api/v1/prediction/43c3fd60-f5e5-4b7e-bf72-a1885b466d02",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ question }),
        }
      );
      
      const result = await response.json();
      return result; 
    } catch (error) {
      console.error("Error connecting to Flowise chatbot:", error);
      return { text: "Sorry, I'm having trouble connecting to the chatbot right now." };
    }
  };
}
