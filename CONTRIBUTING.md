# Contributing

Notes for working on the Antenna Visualization & Analysis Laboratory.

## Prerequisites

* **Node.js** 18+ and npm
* **Java** 21+ — required only to run the Firestore security-rules tests (the Firebase emulator runs on the JVM)
* A **Google Gemini API key** for the AI assistant

## Local setup

```bash
git clone https://github.com/zsasannia70-png/antenna-radiation-visualizer.git
cd antenna-radiation-visualizer
npm install

# Create a .env file in the project root:
#   VITE_GEMINI_API_KEY=your_gemini_api_key

npm run dev        # http://localhost:3000
```

## Running the tests

```bash
npm run test:unit     # physics engine + AI-pipeline logic (no emulator needed)
npm run test:rules    # Firestore security rules (requires Java + Firebase emulator)
```

* `test:unit` covers the pure logic: the electromagnetic engine (`physics.ts`) and the AI routing/validation (`aiPipeline.ts`). It needs no network or emulator.
* `test:rules` starts the Firestore emulator and runs the threat-model security suite against `firestore.rules`.

## Build check before submitting

Always confirm a clean production build before opening a pull request or pushing to `main`:

```bash
npm run build
```

A green `✓ built` is required. Fix any build error before submitting.

## Branch & commit expectations

* Work on a feature branch (`feature/<short-name>`) rather than committing directly to `main`.
* Write descriptive commit messages that explain *why*, not just *what* (e.g. `Add whitelist validation for AI tool-call arguments`).
* Never commit secrets. `.env` is git-ignored; keys go in `.env` locally and in Vercel's environment variables.
* Run `npm run test:unit` and `npm run build` before pushing.

## Where things live

| Path | Responsibility |
| --- | --- |
| `src/App.tsx` | UI, 3D scene, and the AI assistant handler |
| `src/physics.ts` | Pure electromagnetic engine |
| `src/aiPipeline.ts` | Pure AI routing + tool-argument validation |
| `src/*.test.ts` | Unit and integration tests |
| `firestore.rules` / `firestore.rules.test.ts` | Data-layer security + its tests |
