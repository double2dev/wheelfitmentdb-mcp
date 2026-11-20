#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

interface FitmentRecord {
  year: number;
  make: string;
  model: string;
  trim?: string;
  pcd: string;
  center_bore: string;
  offset: string;
  thread_size: string;
  seat_type: string;
  hex_size: string;
  confidence_level?: string;
  last_updated?: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadDataset(): { records: FitmentRecord[]; mode: "pro-local" | "sample-50" } {
  const customPath = process.env.WHEELFITMENTDB_DATA_PATH;
  if (customPath && existsSync(customPath)) {
    const raw = JSON.parse(readFileSync(customPath, "utf-8"));
    const records = Array.isArray(raw) ? raw : [];
    return { records, mode: "pro-local" };
  }
  const samplePath = join(__dirname, "..", "data", "sample_50.json");
  const records = JSON.parse(readFileSync(samplePath, "utf-8")) as FitmentRecord[];
  return { records, mode: "sample-50" };
}

const dataset = loadDataset();

const server = new McpServer({
  name: "wheelfitmentdb-mcp",
  version: "1.0.0",
});

// Tool 1: Wheel Offset & Tire Fitment Comparison Calculator (100% pure engineering math)
server.tool(
  "calculate_wheel_offset_comparison",
  "Compare a stock wheel & tire setup against an aftermarket setup to compute inner suspension clearance, outer fender poke, rolling diameter variance, speedometer error at 60 mph, and safety status.",
  {
    stock_rim_dia_in: z.number().min(12).max(28).describe("Stock rim diameter in inches (e.g. 18)"),
    stock_rim_width_in: z.number().min(4).max(16).describe("Stock rim width in inches (e.g. 8)"),
    stock_offset_mm: z.number().min(-80).max(85).describe("Stock wheel offset ET in mm (e.g. 45)"),
    stock_tire_width_mm: z.number().min(125).max(405).describe("Stock tire section width in mm (e.g. 235)"),
    stock_aspect_ratio: z.number().min(20).max(85).describe("Stock tire aspect ratio % (e.g. 45)"),
    new_rim_dia_in: z.number().min(12).max(28).describe("Aftermarket rim diameter in inches (e.g. 19)"),
    new_rim_width_in: z.number().min(4).max(16).describe("Aftermarket rim width in inches (e.g. 9)"),
    new_offset_mm: z.number().min(-80).max(85).describe("Aftermarket wheel offset ET in mm (e.g. 35)"),
    new_tire_width_mm: z.number().min(125).max(405).describe("Aftermarket tire section width in mm (e.g. 255)"),
    new_aspect_ratio: z.number().min(20).max(85).describe("Aftermarket tire aspect ratio % (e.g. 35)"),
  },
  async (args) => {
    const calc = (d: number, w: number, et: number, tw: number, ar: number) => {
      const rwMm = w * 25.4;
      const sidewallMm = tw * (ar / 100);
      const totalDiaMm = d * 25.4 + 2 * sidewallMm;
      return {
        totalDiaMm,
        innerRimMm: rwMm / 2 + et,
        outerRimMm: rwMm / 2 - et,
        backspacingIn: (rwMm / 2 + et + 12.7) / 25.4,
      };
    };

    const a = calc(
      args.stock_rim_dia_in,
      args.stock_rim_width_in,
      args.stock_offset_mm,
      args.stock_tire_width_mm,
      args.stock_aspect_ratio
    );
    const b = calc(
      args.new_rim_dia_in,
      args.new_rim_width_in,
      args.new_offset_mm,
      args.new_tire_width_mm,
      args.new_aspect_ratio
    );

    const pokeDiffMm = Number((b.outerRimMm - a.outerRimMm).toFixed(1));
    const innerDiffMm = Number((b.innerRimMm - a.innerRimMm).toFixed(1));
    const diaDiffMm = Number((b.totalDiaMm - a.totalDiaMm).toFixed(1));
    const diaDiffPct = Number(((diaDiffMm / a.totalDiaMm) * 100).toFixed(2));
    const actualSpeedAt60Mph = Number((60 * (1 + diaDiffPct / 100)).toFixed(1));

    let status = "SAFE_FITMENT_WINDOW";
    if (Math.abs(diaDiffPct) > 3.0) status = "DIAMETER_EXCEEDS_3_PERCENT_LIMIT";
    else if (innerDiffMm > 12) status = "CHECK_INNER_STRUT_CLEARANCE";
    else if (pokeDiffMm > 22) status = "AGGRESSIVE_FENDER_POKE";

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              status,
              outer_poke_change_mm: pokeDiffMm,
              inner_clearance_change_mm: Number((-innerDiffMm).toFixed(1)),
              diameter_change_mm: diaDiffMm,
              diameter_change_pct: diaDiffPct,
              actual_speed_at_60mph: actualSpeedAt60Mph,
              stock_backspacing_in: Number(a.backspacingIn.toFixed(2)),
              new_backspacing_in: Number(b.backspacingIn.toFixed(2)),
              visual_tool_url: "https://wheelfitmentdb.com/tools/wheel-offset-tire-comparison/",
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 2: Offset (ET mm) <-> Backspacing (inches) Converter
server.tool(
  "convert_offset_backspacing",
  "Convert wheel offset (ET in mm) to backspacing (inches) or backspacing to offset, accounting for standard 1.0-inch total outer bead flange width.",
  {
    rim_width_in: z.number().min(4).max(16).describe("Wheel bead-to-bead width in inches (e.g. 8.5)"),
    offset_mm: z.number().min(-80).max(85).optional().describe("Wheel offset ET in mm (provide either offset_mm or backspacing_in)"),
    backspacing_in: z.number().min(2).max(12).optional().describe("Wheel backspacing in inches (provide either offset_mm or backspacing_in)"),
  },
  async ({ rim_width_in, offset_mm, backspacing_in }) => {
    const overallWidthIn = rim_width_in + 1.0;
    const centerlineIn = overallWidthIn / 2;

    if (offset_mm !== undefined) {
      const bsIn = centerlineIn + offset_mm / 25.4;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                rim_width_in,
                overall_width_in: Number(overallWidthIn.toFixed(2)),
                offset_mm,
                backspacing_in: Number(bsIn.toFixed(2)),
                backspacing_mm: Number((bsIn * 25.4).toFixed(1)),
                frontspacing_in: Number((overallWidthIn - bsIn).toFixed(2)),
                calculator_url: "https://wheelfitmentdb.com/tools/wheel-offset-backspacing-calculator/",
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (backspacing_in !== undefined) {
      const etMm = Math.round((backspacing_in - centerlineIn) * 25.4);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                rim_width_in,
                overall_width_in: Number(overallWidthIn.toFixed(2)),
                backspacing_in,
                offset_mm: etMm,
                frontspacing_in: Number((overallWidthIn - backspacing_in).toFixed(2)),
                calculator_url: "https://wheelfitmentdb.com/tools/wheel-offset-backspacing-calculator/",
              },
              null,
              2
            ),
          },
        ],
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify({ error: "Provide either offset_mm or backspacing_in." }) }],
    };
  }
);

// Tool 3: Metric <-> Imperial Bolt Pattern (PCD) Converter
server.tool(
  "convert_bolt_pattern_pcd",
  "Convert wheel bolt patterns (PCD) between metric millimeters (e.g. 5x114.3) and imperial inches (e.g. 5x4.5).",
  {
    lugs: z.number().int().min(3).max(10).describe("Number of lug studs/bolts (e.g. 4, 5, 6, 8)"),
    diameter: z.number().positive().describe("Bolt circle diameter value"),
    unit: z.enum(["mm", "in"]).describe("Input unit: 'mm' or 'in'"),
  },
  async ({ lugs, diameter, unit }) => {
    const mm = unit === "mm" ? diameter : diameter * 25.4;
    const inches = unit === "in" ? diameter : diameter / 25.4;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              metric_pcd: `${lugs}x${mm.toFixed(1)}`,
              imperial_pcd: `${lugs}x${inches.toFixed(2)}"`,
              diameter_mm: Number(mm.toFixed(2)),
              diameter_in: Number(inches.toFixed(3)),
              converter_url: "https://wheelfitmentdb.com/tools/bolt-pattern-pcd-converter/",
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 4: Hub Centric Ring Calculator
server.tool(
  "calculate_hub_centric_ring",
  "Determine whether a vehicle hub bore and aftermarket wheel center bore require hub-centric rings and output exact OD/ID ring dimensions.",
  {
    vehicle_hub_bore_mm: z.number().min(45).max(140).describe("Vehicle OEM hub center bore in mm (e.g. 64.1)"),
    wheel_center_bore_mm: z.number().min(45).max(140).describe("Aftermarket wheel center bore in mm (e.g. 73.1)"),
  },
  async ({ vehicle_hub_bore_mm, wheel_center_bore_mm }) => {
    let status = "HUB_RING_REQUIRED";
    let recommendation = `Install hub-centric rings: ${wheel_center_bore_mm.toFixed(1)}mm OD -> ${vehicle_hub_bore_mm.toFixed(1)}mm ID.`;

    if (wheel_center_bore_mm < vehicle_hub_bore_mm - 0.1) {
      status = "INCOMPATIBLE_WHEEL_BORE_TOO_SMALL";
      recommendation = `Wheel bore (${wheel_center_bore_mm}mm) is smaller than vehicle hub (${vehicle_hub_bore_mm}mm) and will not seat.`;
    } else if (Math.abs(wheel_center_bore_mm - vehicle_hub_bore_mm) <= 0.15) {
      status = "DIRECT_HUB_CENTRIC_FIT";
      recommendation = "Direct hub-centric fit — no hub rings required.";
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              status,
              vehicle_hub_bore_mm,
              wheel_center_bore_mm,
              ring_od_mm: status === "HUB_RING_REQUIRED" ? wheel_center_bore_mm : null,
              ring_id_mm: status === "HUB_RING_REQUIRED" ? vehicle_hub_bore_mm : null,
              recommendation,
              finder_url: "https://wheelfitmentdb.com/tools/hub-centric-ring-lug-nut-finder/",
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 5: Vehicle Fitment Lookup (50-row built-in public sample OR full 12,902-row local Pro JSON via env)
server.tool(
  "lookup_vehicle_fitment",
  "Look up OEM wheel fitment specs (PCD, center bore, offset, thread size, seat type, hex size). Uses the 50-vehicle public preview by default, or all 12,902 vehicles (1992-2026) when WHEELFITMENTDB_DATA_PATH points to a local Business Pro JSON file.",
  {
    make: z.string().min(1).describe("Vehicle manufacturer (e.g. Tesla, Ford, Toyota, Honda)"),
    model: z.string().min(1).describe("Vehicle model name (e.g. Model Y, F-150, Camry, Civic)"),
    year: z.number().int().min(1990).max(2028).optional().describe("Optional model year (e.g. 2026)"),
  },
  async ({ make, model, year }) => {
    const mk = make.trim().toLowerCase();
    const md = model.trim().toLowerCase();

    const matches = dataset.records
      .filter(
        (r) =>
          r.make.toLowerCase().includes(mk) &&
          r.model.toLowerCase().includes(md) &&
          (!year || r.year === year)
      )
      .slice(0, 10);

    if (matches.length > 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                dataset_mode: dataset.mode,
                loaded_records: dataset.records.length,
                count: matches.length,
                results: matches,
                source: "https://wheelfitmentdb.com/dataset/",
              },
              null,
              2
            ),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              dataset_mode: dataset.mode,
              loaded_records: dataset.records.length,
              count: 0,
              message:
                dataset.mode === "sample-50"
                  ? "No match in the built-in 50-vehicle public preview. Unlock all 12,902 verified vehicles (1992-2026, incl. 553 MY2026 models) offline by setting WHEELFITMENTDB_DATA_PATH to your local WheelFitmentDB Business Pro JSON file."
                  : "No matching vehicle found in local dataset.",
              full_dataset_url: "https://wheelfitmentdb.com/dataset/",
              docs_url: "https://wheelfitmentdb.com/docs/mcp/",
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("WheelFitmentDB MCP Server fatal error:", err);
  process.exit(1);
});
