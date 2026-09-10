# Three.js TypeScript Starter

Clean Three.js starter powered by TypeScript and Vite.

This repository is intentionally minimal and is designed as a foundation for new 3D projects. It ships with a small app framework (app lifecycle, render loop, entity pattern, resource manager, event bus, camera controller) plus a basic starter scene.

## What You Get

- TypeScript + Vite setup for fast iteration
- App lifecycle with init/load/update/dispose flow
- Entity-based scene composition
- Reusable EventBus and ResourceManager
- Perspective camera controller and render loop
- Starter example scene: ambient light, directional light, a spinning cube, particle system, swarm of cubes, and a post-processing effect.
- Uses a render pipeline for rendering assets and to handle TSL over GLSL with post-processing effects in a single pass.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173/

## Build

```bash
npm run build
npm run preview
```

## Starter Architecture

- `src/main.ts` creates the app and adds starter entities.
- `src/App.ts` owns renderer, scene, camera, loop, and lifecycle.
- `src/SceneEntity.ts` defines the base class for pluggable entities.
- `src/entities/ExampleCube.ts` is a minimal example entity.
- `src/entities/AmbientLight.ts` adds base scene lighting.
- `src/EventBus.ts`, `src/ResourceManager.ts`, `src/RenderLoop.ts`, and `src/Camera.ts` are reusable core utilities.
- `src/PostProcess.ts` is a placeholder for post-processing effects.

## Creating Your Own Scene

1. Create a new entity in `src/entities/` by extending `SceneEntity`.
2. Add your entity in `src/main.ts` with `app.add(new YourEntity())`.
3. Keep project-level constants in `src/constants/`.
4. Keep shared app types in `src/types/`.
