# CozeLoop Tracing Integration

This document describes how to report trace data from the Claude Agent SDK (Node.js) to [CozeLoop](https://loop.coze.cn/) using the OpenTelemetry protocol.

## Overview

The Claude Agent SDK emits OpenTelemetry (OTel) traces and spans as it runs. By adding the [`openinference-instrumentation-claude-agent-sdk`](https://github.com/Arize-ai/openinference) library from Arize AI, you can automatically collect and forward the following data to CozeLoop **without modifying any business logic**:

- Model invocations
- Tool calls
- Custom business spans you add manually

All of this appears as a complete call tree on the CozeLoop Trace page.

> **Note:** The examples below use Node.js ESM. Traces are sent to `https://api.coze.cn/v1/loop/opentelemetry/v1/traces`.

---

## Prerequisites

Node.js **18.0 or higher** is required.

Install the necessary packages:

```bash
npm i @anthropic-ai/claude-agent-sdk \
  @arizeai/openinference-instrumentation-claude-agent-sdk \
  @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/sdk-trace-base \
  @opentelemetry/resources @opentelemetry/exporter-trace-otlp-proto
```

| Package | Purpose |
|---|---|
| `@anthropic-ai/claude-agent-sdk` | Claude Agent SDK |
| `@arizeai/openinference-instrumentation-claude-agent-sdk` | Auto-instrumentation for Claude Agent SDK. Hooks into `query()` and `ClaudeSDKClient` to emit OpenInference AGENT spans including prompt input, output, session/model metadata, token counts, and tool sub-spans. |
| `@opentelemetry/api`, `sdk-node`, `sdk-trace-base`, `resources`, `exporter-trace-otlp-proto` | OpenTelemetry SDK |

---

## Step 1 — Environment Variables

Set the following variables (use `.env` or CI injection — do not commit secrets):

```bash
# Anthropic
export ANTHROPIC_API_KEY="YOUR_ANTHROPIC_API_KEY"

# CozeLoop OTLP trace endpoint (fixed value)
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="https://api.coze.cn/v1/loop/opentelemetry/v1/traces"

# Comma-separated headers (ASCII commas only)
export OTEL_EXPORTER_OTLP_HEADERS="cozeloop-workspace-id=YOUR_SPACE_ID,Authorization=Bearer YOUR_TOKEN"
```

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key for accessing Anthropic's model service. Obtain from [Claude Developer Platform](https://console.anthropic.com/settings/keys). |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Fixed OTel export URL: `https://api.coze.cn/v1/loop/opentelemetry/v1/traces` |
| `OTEL_EXPORTER_OTLP_HEADERS` | Auth headers: `cozeloop-workspace-id` (CozeLoop workspace ID) and `Authorization` (personal or service access token). |

---

## Step 2 — Report Traces (ESM)

Initialize the OpenTelemetry SDK and wire up the OpenInference instrumentation. The `query()` method will then automatically generate `AGENT` and `TOOL` spans.

> **ESM caveat:** In ESM, modules imported via `import * as` are read-only, so patching them directly fails. Create a mutable shallow copy first (`const ClaudeAgentSDK = { ...ClaudeAgentSDKModule }`), then call `manuallyInstrument()` on the copy.
>
> Always call `await sdk.shutdown()` before process exit so the `BatchSpanProcessor` can flush all buffered spans to CozeLoop.

```typescript
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const { NodeSDK } = require("@opentelemetry/sdk-node");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-proto");
const { BatchSpanProcessor } = require("@opentelemetry/sdk-trace-base");
const { resourceFromAttributes } = require("@opentelemetry/resources");

const { ClaudeAgentSDKInstrumentation } = require(
  "@arizeai/openinference-instrumentation-claude-agent-sdk"
);

import * as ClaudeAgentSDKModule from "@anthropic-ai/claude-agent-sdk";

// 1. Exporter
const exporter = new OTLPTraceExporter({ timeoutMillis: 10000 });

// 2. ESM: create a mutable copy so instrumentation can overwrite exported functions
const ClaudeAgentSDK = { ...ClaudeAgentSDKModule };

const instrumentation = new ClaudeAgentSDKInstrumentation({
  // Optional: hide inputs/outputs to avoid reporting sensitive data
  // traceConfig: { hideInputs: true, hideOutputs: true },
});

instrumentation.manuallyInstrument(ClaudeAgentSDK);

// 3. NodeSDK
const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    // Set a recognizable service name for filtering on the Trace page
    "service.name": "claude-agent-cozeloop-demo",
  }),
  spanProcessors: [new BatchSpanProcessor(exporter)],
  instrumentations: [instrumentation],
});

sdk.start();

// 4. Use the patched query
const { query } = ClaudeAgentSDK;

for await (const message of query({
  prompt: "Hello, introduce yourself.",
  options: {
    model: "claude-sonnet-4-5-20250929",
  },
})) {
  // ... your business logic
}

// 5. Flush all buffered spans before exit
await sdk.shutdown();
```

### CommonJS (optional)

If your project uses CommonJS (`require()` / no `"type": "module"`), use the auto-instrumentation pattern instead:

```typescript
const { NodeTracerProvider } = require("@opentelemetry/sdk-trace-node");
const {
  ClaudeAgentSDKInstrumentation,
} = require("@arizeai/openinference-instrumentation-claude-agent-sdk");

const provider = new NodeTracerProvider();
provider.register();

const instrumentation = new ClaudeAgentSDKInstrumentation();
instrumentation.setTracerProvider(provider);
```

---

## Custom Spans

To add custom business spans to the call tree (e.g. input pre-processing, data retrieval, external dependency calls), create spans manually. They will be linked with the automatically emitted `AGENT` and `TOOL` spans.

```typescript
const { trace } = require("@opentelemetry/api");

const tracer = trace.getTracer("claude-agent-cozeloop-demo");

await tracer.startActiveSpan("root_span", async (span) => {
  span.setAttribute("cozeloop.span_type", "custom");
  span.setAttribute("biz.scene", "weather_demo");

  try {
    // Call ClaudeAgentSDK.query(...) here
  } finally {
    span.end();
  }
});
```

Follow the [CozeLoop OpenTelemetry field mapping spec](https://loop.coze.cn/open/docs/cozeloop/opentelemetry_field_mapping) for custom span attributes and events.

---

## Step 3 — View Traces

After reporting, open the [CozeLoop](https://loop.coze.cn/) Trace page, find the target span, and click it to inspect the full trace tree.

---

## More Examples

See [cozeloop-examples/js/integration/framework/claude_agent](https://github.com/coze-dev/cozeloop-examples/tree/main/js/integration/framework/claude_agent) for additional Node.js trace reporting examples.
