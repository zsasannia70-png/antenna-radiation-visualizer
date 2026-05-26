# AI Logic, Architecture & Guardrails Reflection

## Context and Purpose
This document provides an introspective analysis of the technical and strategic decisions made during the AI-driven refactoring of the *Antenna Simulator* to reach Grade 5 engineering standards.

## 1. Universal Physical Geometries (`react-three-fiber` Core)
**Decision**: Transition away from basic proxy shapes (boxes/spheres) towards fully parameterized `react-three-fiber` geometry classes for all antenna types.
*   **Helix Implementation**: The Helical antenna utilizes a true `CatmullRomCurve3` mapped dynamically via inverse parameters: `x=a cos(t), y=t S, z=a sin(t)`. Rather than rendering proxy bounding boxes, I passed this curve to a `<tubeGeometry>` component.
*   **Horn & Parabolics**: Horns were developed utilizing `CylinderGeometry` truncated properties (where top and bottom radii are offset). Parabolic dishes utilize `<sphereGeometry>` with cropped `thetaLength` parameters acting natively as concave reflection dishes.

## 2. Advanced Perimeter Lattice Engine
**The Challenge**: Standard algorithms usually fill rect/circular bounds sequentially, which contradicts modern edge-fed array patterns.
*   **Rectangular Geometry**: The updated spatial logic intercepts the `rectangular` switch and calculates a strictly perimeter-bound lattice map. Instead of $M = \sqrt{N}$ grids placing elements natively within internal domains, the script builds 4 vertex vectors $( \pm L/2, \pm L/2 )$ and steps exactly $(N-4)/4$ antennas evenly along the edges.
*   **Triangular Correction**: The math engine strictly boundaries $N$ limits to enforce perfect equilateral structures. Regardless of user numerical inputs for $N$, a new constant $N_{eff} = \max(3, \text{round}(N/3)\times 3)$ dynamically bounds rendering limits. This prevents open-ended fractional triangle arrays and enforces strict mathematical symmetry.
*   **Physics Mirroring**: These identical coordinates were mapped directly into the Array Factor (AF) integrations $e^{j(k\vec{r}\cdot\hat{r} + \alpha)}$ within the radiation engine.

## 3. Radiation Factor Bounds (`SafeAF`)
**The Challenge**: A core, deeply mathematical bug existed in 3D pattern generation. At specifically exactly $0^\circ$ and similar nodal phases, $\sin(N\psi/2)/(N\sin(\psi/2))$ hits $0/0$ states, causing Three.js vector failures. 
*   **Implementation**: An internal limit bounding function (`safeAF()`) was deployed intercepting coordinates infinitesimally near zero. Using a threshold tolerance limit of `1e-6`, zero-limits are overridden with `L'Hôpital's` derivative limits pointing directly to normalized peak limits, resolving missing lobes.

## 4. UI Architecture & Safeties
*   **70/30 Split Philosophy**: The DOM is strictly proportioned leveraging modern Flexbox. The application workspace strictly guarantees the mathematical visualization tools occupy the primary ~70% bounding box while keeping configuration and physics settings anchored rightward natively (`min-w-[320px]`).
*   **LLM Consultant Toolchain**: The floating Consultant component provides direct parameter mutation using Gemini 3.1 Pro's System Instructions and Strict Schema Function Calling (`updateConfig()`).
*   **AI Guardrails**: The System Prompt forces the consultant into `GUARDRAILS`:
    1. Rejection of generic coding tasks outside telecommunications.
    2. Enforced `<thought>` derivations explaining physics limits prior to function-calling.
    3. Direct linkage constraining input mutations to the physical parameters bound in `ConfigurationState`.
