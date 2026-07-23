# After Effects MCP Server

![Node.js](https://img.shields.io/badge/node-%3E=14.x-brightgreen.svg)
![Build](https://img.shields.io/badge/build-passing-success)
![License](https://img.shields.io/github/license/Dakkshin/after-effects-mcp)
![Platform](https://img.shields.io/badge/platform-after%20effects-blue)

A Model Context Protocol (MCP) server for Adobe After Effects. It lets AI assistants and other MCP clients control After Effects — creating compositions, layers, keyframes, and effects — through a standardized protocol.

## About this fork

This is a fork of [Dakkshin/after-effects-mcp](https://github.com/Dakkshin/after-effects-mcp). Tools and behavior are unchanged for end users; the fork is a maintainability refactor:

- `src/index.ts` (~1064 lines) split into a thin orchestrator plus one module per concern: `src/bridge/client.ts` (IPC with the AE panel), `src/schemas.ts` (shared Zod schemas), `src/resources.ts`, `src/prompts.ts`, and one `src/tools/*.ts` file per tool domain.
- `src/scripts/MCP Bridge.jsx` (~2596 lines) split into `src/scripts/bridge-lib/*.jsx` (one file per command domain) plus `bridge-entry.jsx` (panel UI/polling). `scripts/build-bridge.js` concatenates these at build time into the single file After Effects loads. An ExtendScript `#include`-based split was tried first and reverted — it silently broke the panel's hot-reload path (see `CLAUDE.md`).
- Removed 10 unreferenced legacy `.jsx` files under `src/scripts/`.
- Trimmed `CLAUDE.md` to project structure and hard rules.

If you only want to use the server, everything below applies exactly as it does upstream.

## Table of contents
- [Features](#features)
  - [Core composition features](#core-composition-features)
  - [Layer management](#layer-management)
  - [Animation capabilities](#animation-capabilities)
- [Setup instructions](#setup-instructions)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Update MCP config](#update-mcp-config)
  - [Running the server](#running-the-server)
- [Usage guide](#usage-guide)
  - [Creating compositions](#creating-compositions)
  - [Working with layers](#working-with-layers)
  - [Animation](#animation)
- [Available MCP tools](#available-mcp-tools)
- [For developers](#for-developers)
  - [Project structure](#project-structure)
  - [Building the project](#building-the-project)
  - [Contributing](#contributing)
- [License](#license)

## Features

### Core composition features
- Create compositions with custom settings (size, frame rate, duration, background color)
- List all compositions in a project
- Get project information such as frame rate, dimensions, and duration

### Layer management
- Create text layers with customizable properties (font, size, color, position)
- Create shape layers (rectangle, ellipse, polygon, star) with colors and strokes
- Create solid/adjustment layers for backgrounds and effects
- Create camera layers with configurable zoom and position
- Create null objects for animation control
- Modify layer properties: position, scale, rotation, opacity, timing
- Toggle 2D/3D mode for layers
- Set blend modes (normal, multiply, screen, etc.)
- Track matte support (alpha, luma, inverted)
- Duplicate layers with optional rename
- Delete layers from composition
- Create and modify masks with feather, expansion, and opacity

### Animation capabilities
- Set keyframes for layer properties (position, scale, rotation, opacity, etc.)
- Apply expressions to layer properties for dynamic animations
- Batch set properties across multiple layers at once

## Setup instructions

### Prerequisites
- Adobe After Effects (2022 or later)
- Node.js (v14 or later)
- npm or yarn

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/JTCHE/after-effects-mcp.git
   cd after-effects-mcp
   ```

2. Install dependencies
   ```bash
   npm install
   # or
   yarn install
   ```

3. Build the project
   ```bash
   npm run build
   # or
   yarn build
   ```

4. Install the After Effects panel
   ```bash
   npm run install-bridge
   # or
   yarn install-bridge
   ```
   This copies the necessary scripts to your After Effects installation.

### Update MCP config

**Option 1: `.mcp.json` (recommended for Claude Code)**

The repository includes a `.mcp.json` file. Copy or reference it in your MCP settings:

```json
{
  "mcpServers": {
    "AfterEffectsMCP": {
      "command": "node",
      "args": ["PATH/TO/after-effects-mcp/build/index.js"]
    }
  }
}
```

**Option 2: Manual configuration**

Update your MCP client's config file (Claude, Cursor, etc.):

```json
{
  "mcpServers": {
    "AfterEffectsMCP": {
      "command": "node",
      "args": ["C:\\path\\to\\after-effects-mcp\\build\\index.js"]
    }
  }
}
```

### Running the server

1. Start the MCP server
   ```bash
   npm start
   # or
   yarn start
   ```
2. Open After Effects.
3. Open the MCP Bridge panel: Window > MCP Bridge.jsx. It polls for commands every few seconds — make sure "Auto-run commands" is checked.

## Usage guide

Once the server is running and the MCP Bridge panel is open in After Effects, an MCP client can send it commands.

### Creating compositions

Create compositions with a name, width/height, frame rate, duration, and background color.

```javascript
mcp_aftereffects_create_composition({
  name: "My Composition",
  width: 1920,
  height: 1080,
  frameRate: 30,
  duration: 10
});
```

### Working with layers

**Text layers** — content, font, size, color, position, timing, opacity.

**Shape layers** — rectangles, ellipses, polygons, stars; fill/stroke colors; size and position.

**Solid layers** — background colors and adjustment layers for effects.

### Animation

**Keyframes** — set property values at specific times; motion, scale, rotation, opacity.

**Expressions** — apply JavaScript expressions to properties for procedural, linked animation.

## Available MCP tools

| Command | Description |
|---|---|
| `create-composition` | Create a new composition |
| `run-script` | Run a JS script inside AE |
| `get-results` | Get script results |
| `get-help` | Help for available commands |
| `setLayerKeyframe` | Add keyframe to layer property |
| `setLayerExpression` | Add/remove expressions from properties |
| `setLayerProperties` | Set layer properties (position, scale, rotation, opacity, blendMode, threeDLayer, trackMatteType, enabled, etc.) |
| `batchSetLayerProperties` | Apply properties to multiple layers |
| `getLayerInfo` | Get layer info (position, 3D status) |
| `createCamera` | Create camera layer |
| `createNullObject` | Create null object for animation |
| `duplicateLayer` | Duplicate a layer |
| `deleteLayer` | Delete a layer |
| `setLayerMask` | Create/modify layer masks |

## For developers

### Project structure

- `src/index.ts` — thin orchestrator that wires up the MCP server
- `src/bridge/client.ts` — file-based IPC with the AE-side panel
- `src/schemas.ts` — shared Zod schemas
- `src/resources.ts`, `src/prompts.ts` — MCP resources/prompts
- `src/tools/*.ts` — one file per tool domain (composition, effects, keyframes-expressions, jsx, inspection, viewport, help, scripts)
- `src/scripts/bridge-lib/*.jsx` + `src/scripts/bridge-entry.jsx` — ExtendScript source, concatenated by `scripts/build-bridge.js` into `src/scripts/MCP Bridge.jsx` (generated — the file After Effects actually loads)
- `install-bridge.js` — installs the panel into After Effects

### Building the project

```bash
npm run build
# or
yarn build
```

This uses esbuild, which replaced an earlier TypeScript-compiler build that ran out of memory on larger codebases.

### Contributing

Pull requests are welcome.

## License

MIT — see the LICENSE file for details.
