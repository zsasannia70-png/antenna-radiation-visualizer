/**
 * Physics & math engine for the Antenna Radiation Visualizer.
 *
 * Pure, framework-agnostic functions extracted from App.tsx so the UI layer
 * and the computational core live in separate modules (separation of concerns).
 * Nothing here imports React or three.js; every function is a pure transform
 * of a ConfigurationState, which makes this module independently testable.
 */

export type AntennaType = string;
export type ArrayGeometry = "linear" | "square" | "circular" | "triangular";
export type ConfigTab = "single" | "2d" | "3d" | "manual";

export interface ManualElement {
  id: string;
  type: AntennaType;
  position: [number, number, number];
}

export interface ConfigurationState {
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

export const DEFAULT_CONFIG: ConfigurationState = {
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

export const calculatePhysics = (config: ConfigurationState) => {
  const c = 299792458;
  const lambda = c / (config.freq * 1e6);
  const k = (2 * Math.PI) / lambda;
  const kL = k * config.length;
  const kL_2 = kL / 2;

  return { lambda, k, kL, kL_2 };
};

export const getAntennaPositions = (config: ConfigurationState, lambda: number) => {
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

export const getElementField = (
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

export const calculateGain = (config: ConfigurationState, lambda: number) => {
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

export const getAntennaFormula = (config: ConfigurationState) => {
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

export const getGeneralizedFormula = (config: ConfigurationState) => {
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

export const getArrayFactor = (
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

export const getCentroid = (elements: any[]) => {
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
