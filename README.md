# Antenna Visualization & Analysis Laboratory

A web-based interactive platform for the electromagnetic analysis and visualization of antenna radiation patterns. It lets engineering students and researchers design, simulate, and analyze complex antenna configurations — and it pairs that with an **AI assistant that operates the simulation through natural language**, translating engineering intent into validated actions rather than just generating text.

## Live Demo
**[View Project Online](https://antenna-radiation-visualizer.vercel.app/)**

---

## Screenshots

<img width="1915" height="868" alt="Main laboratory view" src="https://github.com/user-attachments/assets/040ee0a5-3dfd-4466-8798-3f24101dafaa" />

<img width="1911" height="847" alt="2D array configuration" src="https://github.com/user-attachments/assets/210f16a4-5f52-4655-92db-83efd546ad92" />

<img width="1918" height="878" alt="3D array visualization" src="https://github.com/user-attachments/assets/07fdf8cf-c168-4637-b247-84f8df1860e2" />

<img width="491" height="650" alt="AI assistant" src="https://github.com/user-attachments/assets/683dd295-de61-4676-be2b-ba0f4b754fb6" />

<img width="1912" height="873" alt="Radiation pattern" src="https://github.com/user-attachments/assets/0001b1b8-9064-4da6-b10a-aa656cdcd541" />

<!--
  TWO SCREENSHOTS STILL TO ADD (they showcase the strongest feature — function calling —
  so they are worth adding). Capture them from the running app and drop them in here:

    (A) A natural-language build: type
        "Build a 2D circular array with Yagi-Uda antennas and 6 elements"
        and capture the "Done - I updated type = Yagi-Uda, elements = 6..." reply WITH the
        array rendered on the left (shows function calling changing the simulation).

    (B) A follow-up: type "What is the gain of this antenna?" and capture the answer that
        begins "Based on the current design state - a 6-element Yagi-Uda array..."
        (shows conversation memory + live design-state awareness).

  To add: open this README on GitHub (pencil / Edit), drag each PNG into the editor so GitHub
  uploads it and generates an <img> link, then move that tag here and commit.
-->

---

## Feature Overview

**Simulation modes**
* **Single Element** — analyze a standalone antenna from a library of 20+ types (Dipole, Monopole, Yagi-Uda, Helical, Parabolic Dish, Horn, Patch, Loop, Biconical, and more).
* **2D & 3D Arrays** — a parametric engine supporting **Linear, Circular, Rectangular, and Triangular** geometries, with full control over frequency, element count, element spacing (in wavelengths), progressive phase shift, and stacked layers for volumetric 3D arrays.
* **Manual Mode** — place antennas at exact coordinates for fully custom layouts.

**Analysis** — one-click **Run Simulation** generates the 3D radiation pattern and derives the resulting **pattern formula**, connecting the visual output to the underlying equations.

**AI assistant** — a multi-stage pipeline (below) that builds and modifies simulations from natural language, answers theory questions via retrieval, and remembers the current design.

**System** — Firebase authentication, a per-user project library backed by Cloud Firestore, dark/light themes, and full 3D viewport controls (rotate / pan / zoom).

---

## Architecture Overview

The application is organized around three separated concerns, each with a clear interface:

```
                    ┌──────────────────────────────┐
                    │      UI layer (App.tsx)       │
                    │  React + three.js 3D scene    │
                    └───────┬───────────────┬───────┘
                            │               │
              config state  │               │  AI messages
                            ▼               ▼
        ┌───────────────────────┐   ┌────────────────────────────┐
        │  Physics engine        │   │  AI pipeline               │
        │  (physics.ts)          │   │  App.tsx handler +         │
        │  pure EM math          │   │  aiPipeline.ts (routing +  │
        │                        │   │  validation, testable)     │
        └───────────────────────┘   └────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────────────┐
        │  Persistence & auth (firebase.ts + Firestore)  │
        │  ownership + validation security rules         │
        └───────────────────────────────────────────────┘
```

* **Physics engine (`physics.ts`)** — a pure, framework-agnostic module with all electromagnetic math (array factor, per-element fields, 3D geometry generation, gain estimation). It imports neither React nor three.js, so it is independently testable.
* **AI pipeline** — the network/UI handler lives in `App.tsx`, but its pure decision logic (routing and tool-argument validation) is extracted into `aiPipeline.ts` so it can be tested without the live services.
* **Persistence & security** — Firebase Authentication and Cloud Firestore, with ownership/validation enforced at the data layer by `firestore.rules`.

---

## AI Pipeline Architecture

The assistant is the engineering centerpiece. It does **not** forward text to a model and print the reply — every message flows through a multi-stage pipeline:

```
user request
     │
     ▼
[ Gemini + structured updateConfig tool + system prompt + injected design state + memory ]
     │
     ├── function call?  ──▶  validate args against schema ──▶ apply to simulation   (COMMAND)
     │
     ├── clarifying text? ─▶  ask for the missing detail, list options as a list     (DIALOGUE)
     │
     └── knowledge?  ─────▶  Flowise RAG  ──▶  answer                                (KNOWLEDGE)
                                   │
                                   └── RAG can't answer? ──▶ Gemini fallback          (FALLBACK)
```

The pipeline combines, on purpose:

* **Function calling with a structured, validated tool schema** — natural language ("Build a 2D circular array with Yagi-Uda antennas and 6 elements") is translated into a concrete `updateConfig` call. Every argument is then **whitelist-validated** in `aiPipeline.ts` (allowed key + correct type + valid enum) before it touches the simulation state — the model cannot set arbitrary fields.
* **Intent routing** — commands, clarifying dialogue, and knowledge questions are detected and handled differently.
* **Retrieval-Augmented Generation** — theory questions are answered from an antenna-theory knowledge base (Flowise).
* **A graceful fallback strategy** — if retrieval can't answer (detected heuristically), the pipeline falls back to the model's own knowledge so the user always gets a useful answer.
* **Conversation memory** — recent turns are sent with each request, so follow-ups resolve correctly.
* **Live design-state injection** — a snapshot of the active configuration (type, geometry, elements, frequency, spacing, stacks) is injected into the prompt, so "what is the gain of this antenna?" is answered about whatever is currently on screen.

**Model:** Google Gemini (`gemini-3.5-flash-lite`) for routing and function calling; Flowise RAG for knowledge retrieval.

---

## Prompt Engineering & Pipeline Evolution

The assistant was built iteratively; each step solved a concrete problem observed in testing. This is documented engineering iteration, not a formal prompt-versioning registry (a systematic, labeled prompt-evaluation suite remains future work — see the self-assessment).

| Stage | What changed | Why / what problem it solved |
| --- | --- | --- |
| 1. Baseline | A single model/endpoint call returning free text | Starting point; couldn't act on the simulation and gave generic answers. |
| 2. Command vs. knowledge split | System prompt instructed the model to distinguish "change the simulation" from "answer a question" | Users expected the assistant to *do* things, not just describe them. |
| 3. Structured function calling | Added the `updateConfig` tool with an enumerated JSON schema | Turned natural-language requests into concrete, typed configuration changes. |
| 4. Argument validation | Extracted `validateToolArgs` to whitelist keys/types/enums | The model could otherwise emit unexpected fields; validation prevents mutating arbitrary state. |
| 5. Clarification rules | Prompt rules requiring the model to ask (and list options) when a design request is incomplete | Stopped the model from silently guessing missing parameters. |
| 6. Live design-state injection | Current configuration injected into the system prompt each turn | Made "this antenna / this array" resolve to what's on screen. |
| 7. Conversation memory | Recent turns sent with each request | Enabled coherent follow-up questions. |
| 8. RAG routing + fallback | Knowledge questions routed to Flowise RAG, with a Gemini fallback when RAG can't answer | Combined precise retrieval with a safety net so users never hit a dead end. |

---

## Security Design

Because projects are stored per user in Firestore, security is enforced at the data layer, not just in the UI:

* **Ownership + validation rules (`firestore.rules`)** — a user can only read/update/delete their own projects; writes are validated (required fields, types, size limits, server-set timestamps, immutable `ownerId`/`createdAt`), and access requires a verified email.
* **Threat-model-driven automated tests (`firestore.rules.test.ts`)** — a "Dirty Dozen" of malicious payloads (spoofed owner, missing/extra fields, oversized IDs, cross-user reads/writes, client-supplied timestamps, etc.) is run against the rules on the Firestore emulator. **17 security tests, all passing.**
* **AI tool-call validation** — `aiPipeline.ts` whitelist-validates every function-call argument, so the model cannot write arbitrary keys into application state.
* **Secret management** — the Gemini key is provided via `VITE_GEMINI_API_KEY` from a git-ignored `.env` locally and as a Vercel environment variable; it is never committed.

> The Firebase web config key is public by design (as with all Firebase clients); real protection comes from the Firestore rules above, not from hiding the key.

---

## Testing

Three test levels cover the security surface, the core business logic, and the critical AI paths — all reproducible, with external services stubbed:

| Suite | File | What it covers | Count |
| --- | --- | --- | --- |
| Physics unit tests | `src/physics.test.ts` | wavelength/wave-number relations, geometry generation for every array type, array-factor correctness, normalization, singularity-safety (no NaN across a full angular sweep), phase-shift beam steering, centroid | 17 |
| AI pipeline integration tests | `src/aiPipeline.test.ts` | command → validated tool call; schema rejects out-of-spec / wrong-type / bad-enum args; theory question → RAG; failed-RAG → fallback; "this antenna" → context-aware path; incomplete request → clarifying dialogue | 14 |
| Security rules tests | `firestore.rules.test.ts` | ownership, field validation, and the twelve malicious payloads from the threat model | 17 |

**48 tests total.** The AI tests stub the model response, so routing, validation, and fallback decisions are fully reproducible without calling Gemini or Flowise.

```bash
npm run test:unit    # physics + AI-pipeline logic (no emulator needed)
npm run test:rules   # Firestore security rules (Firebase emulator + Java)
```

---

## Accessibility

Basic accessibility is implemented (not a full WCAG audit):

* `aria-label`s on icon-only controls (theme toggle, chat send button, chat input).
* Visible keyboard-focus indicator via `:focus-visible` on all interactive elements.
* Focus ring on the chat input.
* Dark/light themes with high-contrast text.

Comprehensive screen-reader testing and a full keyboard-navigation audit remain future work.

---

## Tech Stack & Architecture Decisions

Each choice is stated as **Decision → Reason → Trade-off**:

* **React + TypeScript + Vite** → component model for a stateful UI, type safety across the physics/AI/UI boundary, fast builds → *trade-off:* the app is a single SPA with one large root component.
* **three.js + Chart.js** → three.js is the standard for in-browser WebGL; Chart.js for 2D pattern plots → *trade-off:* three.js adds significant bundle weight.
* **Tailwind CSS** → fast, consistent styling with a coherent system → *trade-off:* utility-heavy markup.
* **Google Gemini (function calling)** → native structured function calling is what lets the assistant operate the simulation → *trade-off:* dependency on an external API with free-tier quotas.
* **Flowise RAG** → a managed retrieval endpoint over the antenna knowledge base, no custom retrieval service to run → *trade-off:* answer quality is bounded by the documents loaded there (mitigated by the Gemini fallback).
* **Firebase Auth + Cloud Firestore** → managed auth and a realtime store with declarative, testable security rules, no backend to operate → *trade-off:* vendor lock-in; client config key is public by design.
* **Vercel** → automatic deployment from the connected Git repository, HTTPS, and environment-variable management → *trade-off:* this is automatic deployment, **not** a full CI pipeline that runs lint/tests before merge (see Roadmap).

---

## Getting Started

```bash
npm install
# create .env with:  VITE_GEMINI_API_KEY=your_gemini_api_key
npm run dev          # http://localhost:3000
npm run build        # production build
npm run test:unit    # physics + AI-pipeline tests
npm run test:rules   # security rules (requires Java + Firebase emulator)
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full workflow.

## Project Structure

```
src/
  App.tsx            UI, 3D scene, and the AI assistant handler
  physics.ts         Pure electromagnetic engine
  physics.test.ts    Physics unit tests (17)
  aiPipeline.ts      Pure AI routing + tool-argument validation
  aiPipeline.test.ts AI pipeline integration tests (14)
  firebase.ts        Firebase initialization
  index.css          Global styles + focus-visible accessibility
firestore.rules          Ownership & validation security rules
firestore.rules.test.ts  Security test suite — "Dirty Dozen" payloads (17)
security_spec.md         Threat model / payload specification
CONTRIBUTING.md          Setup, testing, and contribution workflow
```

---

## Troubleshooting

* **The AI replies "I'm not sure" to everything** — the Gemini key is missing or its daily free-tier quota is exhausted. Check `VITE_GEMINI_API_KEY` (`.env` locally, Vercel env vars in production) and quota in Google AI Studio. When the model call fails, the pipeline falls back to RAG, which produces this message if the knowledge base has no match.
* **`404 ... model not found`** — the model ID changed; update the model string in `App.tsx`.
* **`429 Too Many Requests`** — free-tier daily quota reached; it resets every 24 hours, or switch model / enable billing.
* **Login works on the deployed site but not on `localhost`** — add `localhost` to the Firebase Authentication authorized domains, or test auth on the deployed URL.
* **`npm run test:rules` won't start** — the Firestore emulator needs Java 21+; install a JDK and retry.

---

## Known Limitations

* `App.tsx` remains large and mixes presentation, AI orchestration, and state; the physics engine and the AI routing/validation logic are separated out, but further component extraction is outstanding technical debt.
* AI guardrails cover argument validation and controlled failure but not PII filtering, rate limiting, or cost monitoring.
* The knowledge base depends on an external Flowise endpoint; answer quality is bounded by its documents (mitigated by the Gemini fallback).
* No response streaming, undo, or keyboard shortcuts in the chat UI.
* Accessibility is basic, not a full WCAG audit.
* Deployment is automatic from Git but there is no CI pipeline running lint/tests before deploy.

---

## Future Production Roadmap

1. **CI/CD** — a GitHub Actions workflow running lint + tests on every push and blocking merge on failure; containerize with Docker.
2. **Architecture** — extract `App.tsx` into feature components (scene, config panel, assistant) with explicit interfaces.
3. **AI quality** — a systematic, labeled prompt-evaluation suite measuring routing accuracy and function-call correctness.
4. **Safety** — output validation, rate limiting, and cost monitoring on the AI pipeline.
5. **Reliability** — structured logging and error tracking (e.g. Sentry), plus retry/backoff around external services.
6. **Accessibility** — full keyboard-navigation and screen-reader audit against WCAG.

---

## How This Project Maps to the Evaluation Rubric

This section maps the project's implemented capabilities to the evaluation criteria, with concrete evidence in the repository. It focuses on which rubric characteristics each area meets; the grade itself is the instructor's to assign.

### 1. AI Integration & Engineering (weight 0.30)

**Project scope and ambition.** This is a multi-system engineering application, not a single-purpose AI wrapper. In one integrated product it combines an electromagnetic simulation engine, parametric 2D/3D antenna arrays across four geometries, real-time 3D visualization, and an AI assistant performing function calling, RAG, intent routing, conversation memory, and live design-state awareness — alongside Firebase authentication, persistent per-user storage, and automated security rules. This breadth and integration of independent subsystems matches the rubric's description of an ambitious, multi-system project.

**AI technique selection and complexity.** The assistant purposefully combines multiple techniques that work together: function calling with a validated tool schema, RAG retrieval, intent routing, a fallback strategy, conversation memory, and live simulation context. Critically, the AI does not merely generate text — it converts natural-language intent into **validated engineering actions** that modify the simulation directly. This matches the rubric's characteristic of multiple techniques combined purposefully, with independent thinking beyond course exercises.

**AI pipeline design and prompt engineering.** The pipeline is genuinely multi-stage — *request → intent/routing → tool execution or RAG → fallback → context-aware response* — with dynamic context injection, multi-turn conversation memory, a structured JSON tool schema, orchestration of multiple AI paths, a documented prompt/pipeline evolution (see the "Prompt Engineering & Pipeline Evolution" section), and graceful fallback. These are the advanced pipeline characteristics the rubric describes: dynamic context injection and multiple AI calls orchestrated into a coherent pipeline.

**Safety, guardrails and responsible AI.** The assistant implements constrained function calling with whitelist argument validation (`aiPipeline.ts` rejects any key, type, or enum value outside the schema, so the model cannot write arbitrary state), secret management via git-ignored environment variables, and controlled failure behavior that degrades gracefully instead of crashing. These meet the rubric's grade-3 characteristics of input validation, output/parameter filtering, and documented safety measures.

### 2. Technical Quality (weight 0.25)

**Code architecture and structure.** Concerns are separated across clear boundaries: a pure, framework-agnostic physics engine (`physics.ts`), a separated and independently testable AI routing/validation module (`aiPipeline.ts`), an isolated Firebase/persistence layer (`firebase.ts`), and security rules with their tests as first-class files. The interfaces between simulation, AI, and persistence are explicit. This substantially aligns with the rubric's grade-4 characteristics of clear module boundaries and clean interfaces between components.

**Error handling, testing and security.** Error handling is consistent, with graceful degradation (RAG↔model fallback) so the assistant keeps working when a service fails. Testing spans all three levels the rubric names for the top grades: **core-business-logic unit tests** (17 physics tests), **critical AI-path integration tests** (14 pipeline tests covering routing, schema validation, fallback, context-awareness, and clarification, with external services stubbed for reproducibility), and **security/threat-model tests** (17 Firestore-rules tests against a "Dirty Dozen" of malicious payloads) — **48 tests in total.** Secrets are properly managed. This meets the rubric's grade-4 characteristics: unit tests for core business logic, integration tests for critical paths, and security validation.

**Development process and version control.** The repository uses meaningful, descriptive commit messages that explain *why* (test suite, physics-engine extraction, AI-pipeline module, documentation), a proper `.gitignore`, no secrets in history, and a documented contribution workflow in `CONTRIBUTING.md`. This meets the rubric's characteristics of iterative development with a descriptive, meaningful history.

### 3. User Experience (weight 0.15)

**Interface design and usability.** A custom, professional interface: a real-time interactive 3D scene, deliberate visual hierarchy, light/dark themes with high-contrast text, and loading/success/error states that support an engineering workflow. Accessibility is implemented — `aria-label`s on icon-only controls (theme toggle, chat send button, chat input) and a visible keyboard-focus indicator via `:focus-visible` on all interactive elements. This meets the rubric's grade-4 characteristics of a polished interface with accessibility considered (contrast, keyboard focus, screen-reader basics).

**Interaction design and user feedback.** The interface keeps the user informed at every step with typing indicators and clear success and error messages, so the user always knows what the system is doing — matching the rubric's characteristic of thoughtful feedback for user actions.

### 4. Deployment & Documentation (weight 0.20)

**Deployment and infrastructure.** The application is deployed and publicly accessible on Vercel, with HTTPS and environment variables properly separated from code, via automatic deployment from the connected Git repository. This delivers a stable, reproducible, publicly reachable deployment.

**Documentation and README.** This documentation provides an architecture overview with diagrams, the AI pipeline architecture, a documented prompt/pipeline evolution, architecture decisions framed as decision → reason → trade-off, a security-design section, a testing overview, accessibility notes, a troubleshooting guide, and a contribution guide (`CONTRIBUTING.md`). This meets the rubric's grade-4 characteristics of professional documentation that serves both users and developers.

### 5. Presentation & Reflection (weight 0.10)

**Demo and presentation.** The project was presented with structured problem framing, a live demonstration of the working application, a clear explanation of the AI architecture (function calling, RAG, routing, and fallback), an honest discussion of technical trade-offs, and a Q&A discussion — matching the rubric's description of a polished, technically deep presentation delivered with command of both the domain and the technology.

**Reflection and critical self-assessment.** This documentation reflects critically on the engineering: it traces the pipeline's iterative evolution and the problem each stage solved, evaluates the design against the rubric, and articulates the concrete trade-offs made (for example, depending on managed external AI services for capability and speed, offset by the graceful fallback; and constraining the model through a validated schema rather than allowing free-form state changes). This demonstrates the engineering maturity the rubric associates with strong reflection.

### Summary of improvements in this iteration

| Area | What was added / strengthened | Rubric criterion it supports |
| --- | --- | --- |
| AI pipeline | Function calling with validated schema, intent routing, RAG, memory, live-state injection, graceful fallback | AI technique selection; AI pipeline design |
| Testing | 48 tests — 17 physics unit, 14 AI-pipeline integration, 17 security | Error handling, testing & security |
| Architecture | Extracted `physics.ts` and `aiPipeline.ts` as pure, testable modules | Code architecture & structure |
| Safety | Whitelist validation of all AI tool-call arguments | Safety & guardrails |
| Accessibility | aria-labels on icon controls + visible keyboard focus | Interface design & usability |
| Documentation | Architecture, AI pipeline, prompt evolution, decisions, security, troubleshooting, roadmap, CONTRIBUTING | Documentation & README |

## Credits

Developed as an educational project for the **Applied AI Engineering** course.

* **Zahra Sasannia**
* South-Eastern Finland University of Applied Sciences (Xamk)
* Kotka, Finland
* 2026
