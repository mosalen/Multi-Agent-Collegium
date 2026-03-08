import { estimateTokens } from "./config.js";

export async function callAnthropic(key, model, system, user, temp, maxTokens, signal) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens || 4096,
      temperature: temp,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!r.ok) {
    const e = await r.json().catch(function() { return {}; });
    throw new Error(e?.error?.message || "Anthropic " + r.status);
  }
  var d = await r.json();
  var text = "";
  if (d.content && Array.isArray(d.content)) {
    text = d.content.filter(function(b) { return b.type === "text"; }).map(function(b) { return b.text; }).join("\n");
  }
  if (!text) {
    return {
      text: "[DEBUG] Anthropic returned no text. Raw: " + JSON.stringify(d).slice(0, 500),
      inputTokens: d.usage?.input_tokens || 0,
      outputTokens: d.usage?.output_tokens || 0,
    };
  }
  return {
    text: text,
    inputTokens: d.usage?.input_tokens || 0,
    outputTokens: d.usage?.output_tokens || 0,
  };
}

export async function callOpenAI(key, model, system, user, temp, maxTokens, signal) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + key,
    },
    body: JSON.stringify({
      model,
      max_completion_tokens: maxTokens || 4096,
      temperature: temp,
      reasoning_effort: "none",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!r.ok) {
    const e = await r.json().catch(function() { return {}; });
    throw new Error(e?.error?.message || "OpenAI " + r.status);
  }
  var d = await r.json();
  var msg = d.choices && d.choices[0] && d.choices[0].message;
  var text = "";
  if (msg) {
    text = msg.content || msg.reasoning_content || "";
  }
  if (!text) {
    return {
      text: "[DEBUG] OpenAI returned no text. Raw: " + JSON.stringify(msg || d).slice(0, 500),
      inputTokens: d.usage?.prompt_tokens || 0,
      outputTokens: d.usage?.completion_tokens || 0,
    };
  }
  return {
    text: text,
    inputTokens: d.usage?.prompt_tokens || 0,
    outputTokens: d.usage?.completion_tokens || 0,
  };
}

export async function callGoogle(key, model, system, user, temp, maxTokens, signal) {
  var url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + key;
  const r = await fetch(url, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ parts: [{ text: user }] }],
      generationConfig: {
        temperature: temp,
        maxOutputTokens: maxTokens || 4096,
      },
    }),
  });
  if (!r.ok) {
    const e = await r.json().catch(function() { return {}; });
    throw new Error(e?.error?.message || "Google " + r.status);
  }
  var d = await r.json();
  var text = "";
  if (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) {
    text = d.candidates[0].content.parts.map(function(p) { return p.text; }).join("\n");
  }
  return {
    text: text || "",
    inputTokens: d.usageMetadata?.promptTokenCount || estimateTokens(system + user),
    outputTokens: d.usageMetadata?.candidatesTokenCount || estimateTokens(text),
  };
}

export async function callLLM(provider, key, model, system, user, temp, maxTokens, signal) {
  if (provider === "anthropic") return callAnthropic(key, model, system, user, temp, maxTokens, signal);
  if (provider === "openai") return callOpenAI(key, model, system, user, temp, maxTokens, signal);
  if (provider === "google") return callGoogle(key, model, system, user, temp, maxTokens, signal);
  throw new Error("Unknown provider: " + provider);
}
