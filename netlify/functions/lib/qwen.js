// EdenAtlas Atlas Assistant — Qwen (Alibaba Cloud Model Studio, OpenAI-compatible Chat
// Completions API) client + the bounded tool-calling agent loop.
//
// Every bound here is a hard server-side constant, never a client-supplied value: the frontend
// cannot raise its own token budget, round count, or timeout by sending a different number in
// the request body — see assistant.js's request validation, which caps user input length before
// any of this ever runs.

const { TOOLS, toolDefsForScopes, ToolValidationError } = require("./tools");

const MAX_TOOL_ROUNDS = 3;
const MAX_TOOL_CALLS_PER_ROUND = 4; // bounded tool results per round, not just per request
const MAX_OUTPUT_TOKENS = 800;
const QWEN_REQUEST_TIMEOUT_MS = 15000; // per HTTP call to Qwen, not per whole agent loop
const MAX_TOOL_RESULT_CHARS = 4000; // each tool result fed back to the model is capped this long
const TEMPERATURE = 0.3;

class QwenError extends Error {
  constructor(message, { status } = {}) {
    super(message);
    this.name = "QwenError";
    this.status = status || null;
  }
}

function boundedJson(value, maxChars) {
  let str;
  try {
    str = JSON.stringify(value);
  } catch {
    str = JSON.stringify({ error: "unserializable_tool_result" });
  }
  return str.length > maxChars ? str.slice(0, maxChars) + '..."}' : str;
}

// A single, non-retried call to Qwen's OpenAI-compatible /chat/completions endpoint. No
// automatic retry on failure — the task explicitly requires no retries that could create
// uncontrolled cost; a failed call surfaces as a QwenError for the caller to report once.
async function callQwenChatCompletions({ baseUrl, apiKey, model, messages, tools, fetchImpl }) {
  const doFetch = fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QWEN_REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await doFetch(`${String(baseUrl).replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        ...(tools && tools.length ? { tools, tool_choice: "auto" } : {}),
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: TEMPERATURE,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err && err.name === "AbortError") throw new QwenError("qwen_request_timeout");
    throw new QwenError("qwen_request_failed");
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  if (!res.ok) {
    // Checked BEFORE attempting to parse the body as JSON: an error response from a gateway/
    // proxy in front of the real API is not guaranteed to be JSON at all (could be plain text
    // or an HTML error page), and we never want that shape to determine what error the caller
    // sees. Deliberately never forward the raw provider error body to the client or a log line
    // either way — it's provider-controlled text that could (in principle) echo back request
    // fragments; only a stable, low-cardinality status code is kept.
    throw new QwenError(`qwen_http_${res.status}`, { status: res.status });
  }
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new QwenError("qwen_invalid_json_response", { status: res.status });
  }
  return json;
}

// Builds the FRONTEND-facing source list from `ctx`'s handle registry (real {type,id,label} —
// the frontend is the authenticated Owner's own browser and needs real ids to build working
// gallery.html/journal.html/timeline.html deep links) — deliberately never derived from what a
// tool sent back to the model (which only ever contains opaque handles, never ids; see
// lib/tools.js's header comment). Deduped by (type,id): the same item can legitimately be
// registered more than once across tool calls in one turn (e.g. surfaced by both
// search_memories and list_calendar), and should only appear once as a source chip.
function dedupeSources(collectedSources) {
  const seen = new Set();
  const out = [];
  for (const s of collectedSources) {
    const key = `${s.type}:${s.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: s.type, id: s.id, label: s.label });
  }
  return out.slice(0, 20);
}

// Creates a fresh, per-request opaque-handle registry (task E). Nothing here ever persists past
// one runAgentLoop() call — a handle issued during one HTTP request can never resolve during a
// later, different request, even for the exact same authenticated Owner, even for the exact same
// underlying document. This is what makes `ctx.resolveHandle()` safe to trust in draft_reflection
// without re-checking ownership: the only way a handle exists in this registry at all is that
// THIS request's own tool execution (already uid-scoped) put it there moments ago.
function createRefRegistry() {
  const byHandle = new Map(); // handle -> { type, id }
  const collected = []; // { type, id, handle, label } — in registration order, for sources
  let counter = 0;
  return {
    registerRef(type, id, label) {
      counter += 1;
      const handle = `h${counter}`;
      byHandle.set(handle, { type, id });
      collected.push({ type, id, handle, label: label || null });
      return handle;
    },
    resolveHandle(handle) {
      return byHandle.get(handle) || null;
    },
    collected,
  };
}

// Runs up to MAX_TOOL_ROUNDS request/tool-execution round-trips against Qwen. `db`/`uid` are
// the already-verified Firestore Admin handle and Owner uid — every tool executor threads them
// through untouched; nothing here ever reads a uid or collection name out of the model's output.
// `now`/`timeZone` are the single authoritative clock reading for this whole request (see
// assistant.js, which reads `now` once and passes it here) — every date-resolving tool call
// during this loop sees the exact same `now`, so a multi-round conversation can never drift
// between two different ideas of "today" mid-turn.
async function runAgentLoop({ qwenConfig, systemPrompt, history, userMessage, scopes, db, uid, now, timeZone, fetchImpl }) {
  const messages = [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: userMessage }];
  const toolDefs = toolDefsForScopes(scopes);
  const registry = createRefRegistry();
  const ctx = {
    db,
    uid,
    now,
    timeZone,
    registerRef: registry.registerRef,
    resolveHandle: registry.resolveHandle,
  };

  let finalAnswer = null;
  let lastUsage = null;
  let roundsUsed = 0;

  for (let round = 1; round <= MAX_TOOL_ROUNDS; round++) {
    roundsUsed = round;
    const resp = await callQwenChatCompletions({ ...qwenConfig, messages, tools: toolDefs, fetchImpl });
    if (resp.usage) lastUsage = resp.usage;
    const choice = resp.choices && resp.choices[0];
    const msg = choice && choice.message;
    if (!msg) throw new QwenError("qwen_empty_response");

    if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
      messages.push({ role: "assistant", content: msg.content || null, tool_calls: msg.tool_calls });
      const calls = msg.tool_calls.slice(0, MAX_TOOL_CALLS_PER_ROUND);
      for (const call of calls) {
        const name = call.function && call.function.name;
        let resultPayload;
        let parsedArgs;
        try {
          parsedArgs = call.function && call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          parsedArgs = undefined;
        }

        if (!Object.prototype.hasOwnProperty.call(TOOLS, name)) {
          resultPayload = { error: "unknown_tool" };
        } else if (parsedArgs === undefined) {
          resultPayload = { error: "invalid_tool_arguments_json" };
        } else {
          try {
            const validated = TOOLS[name].validate(parsedArgs, ctx);
            // `result` is exactly what gets JSON-stringified for the model below — tool
            // executors are responsible for never putting a raw `id` field in it (they put the
            // opaque `handle` from ctx.registerRef() instead; see lib/tools.js's header
            // comment). This is the enforcement point, not a place that strips ids after the
            // fact — there is deliberately no generic "id stripper" here that could be bypassed
            // by a tool shaped slightly differently than expected.
            resultPayload = await TOOLS[name].execute(validated, ctx);
          } catch (err) {
            resultPayload = { error: err instanceof ToolValidationError ? err.message : "tool_execution_failed" };
          }
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: boundedJson(resultPayload, MAX_TOOL_RESULT_CHARS) });
      }
      // any tool_calls beyond MAX_TOOL_CALLS_PER_ROUND are silently not executed, and never
      // acknowledged with a tool message — this is intentional: the next round's model call
      // will simply not see a result for them, which Qwen treats as "that call didn't happen."
      continue;
    }

    finalAnswer = msg.content || "";
    break;
  }

  if (finalAnswer == null) {
    finalAnswer = "I gathered some information but reached the step limit before finishing. Try asking a more specific question, or narrow the date range.";
  }

  return { answer: finalAnswer, sources: dedupeSources(registry.collected), usage: lastUsage, roundsUsed };
}

module.exports = {
  QwenError,
  callQwenChatCompletions,
  runAgentLoop,
  MAX_TOOL_ROUNDS,
  MAX_TOOL_CALLS_PER_ROUND,
  MAX_OUTPUT_TOKENS,
  QWEN_REQUEST_TIMEOUT_MS,
};
