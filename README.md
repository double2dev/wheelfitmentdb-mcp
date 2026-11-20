# WheelFitmentDB MCP Server (`wheelfitmentdb-mcp`)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

Model Context Protocol (MCP) server for **automotive wheel fitment engineering** and **OEM-verified vehicle spec lookups**, built by **[WheelFitmentDB](https://wheelfitmentdb.com/mcp/)**.

Give Claude, Cursor, Codex, and custom automotive AI agents deterministic wheel fitment math and structured hub geometry — eliminating LLM bolt pattern and lug hardware hallucinations.

### Quick Links
- **Website**: [https://wheelfitmentdb.com/mcp/](https://wheelfitmentdb.com/mcp/)
- **MCP Documentation & Tool Reference**: [https://wheelfitmentdb.com/docs/mcp/](https://wheelfitmentdb.com/docs/mcp/)
- **Full 12,902-Vehicle Master Dataset (CSV/JSON)**: [https://wheelfitmentdb.com/dataset/](https://wheelfitmentdb.com/dataset/)
- **Visual Web Calculators**: [Offset & Tire Visualizer](https://wheelfitmentdb.com/tools/wheel-offset-tire-comparison/) · [Wheel Interchange Finder](https://wheelfitmentdb.com/tools/wheel-interchange-compatibility-finder/)

---

## Available MCP Tools

| Tool Name | Purpose | Data Required |
| :--- | :--- | :--- |
| `calculate_wheel_offset_comparison` | Compare stock vs. aftermarket rim width, offset (ET) & tire size: inner strut clearance, outer poke, rolling diameter %, and 60 mph speedo error. | Pure physics math (0 external deps) |
| `convert_offset_backspacing` | Bidirectional wheel offset (ET mm) ↔ backspacing (inches) converter accounting for standard 1.0" flange width. | Pure physics math |
| `convert_bolt_pattern_pcd` | Metric ↔ Imperial bolt pattern converter (e.g. `5x114.3` ↔ `5x4.5"`). | Pure math |
| `calculate_hub_centric_ring` | Compute required hub-centric ring OD/ID dimensions and compatibility status. | Pure math |
| `lookup_vehicle_fitment` | Deterministic OEM vehicle spec lookup (PCD, center bore, offset, thread size, seat type, hex size). | 50-model preview built-in, or full 12,902-vehicle local JSON |

---

## Installation

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "wheelfitmentdb": {
      "command": "npx",
      "args": ["-y", "wheelfitmentdb-mcp"]
    }
  }
}
```

### Cursor / Windsurf / VS Code (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "wheelfitmentdb": {
      "command": "npx",
      "args": ["-y", "wheelfitmentdb-mcp"]
    }
  }
}
```

### Unlock All 12,902 Vehicles Offline (Business Pro)

By default, `lookup_vehicle_fitment` ships with a 50-model public preview of 2026 flagship vehicles. To enable zero-latency offline queries across all **12,902 verified vehicles (1992–2026, incl. 553 MY2026 models)**, download the [WheelFitmentDB Business Pro JSON ($89 one-time)](https://wheelfitmentdb.com/dataset/) and pass `WHEELFITMENTDB_DATA_PATH`:

```json
{
  "mcpServers": {
    "wheelfitmentdb": {
      "command": "npx",
      "args": ["-y", "wheelfitmentdb-mcp"],
      "env": {
        "WHEELFITMENTDB_DATA_PATH": "/absolute/path/to/WheelFitmentDB_Master_Database_v2.6.json"
      }
    }
  }
}
```

---

## Local Development

```bash
npm install
npm run build
npm start
```

## License

MIT © [WheelFitmentDB](https://wheelfitmentdb.com)
