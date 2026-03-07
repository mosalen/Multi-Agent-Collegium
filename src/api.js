// API call functions for Anthropic, OpenAI, Google
// Each returns { text, inputTokens, outputTokens }

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
    const e = await r.json().catch(() => ({}));
    throw new Error(e?.error?.message || `Anthropic ${r.status}`);
  }
  const d = await r.json();
  return {
    text: d.content.filter(b => b.type === "text").map(b => b.text).join("\n"),
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
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens || 4096,
      temperature: temp,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e?.error?.message || `OpenAI ${r.status}`);
  }
  const d = await r.json();
  return {
    text: d.choices[0].message.content,
    inputTokens: d.usage?.prompt_tokens || 0,
    outputTokens: d.usage?.completion_tokens || 0,
  };
}

export async function callGoogle(key, model, system, user, temp, maxTokens, signal) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
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
    const e = await r.json().catch(() => ({}));
    throw new Error(e?.error?.message || `Google ${r.status}`);
  }
  const d = await r.json();
  const text = d.candidates?.[0]?.content?.parts?.map(p => p.text).join("\n") || "";
  return {
    text,
    inputTokens: d.usageMetadata?.promptTokenCount || estimateTokens(system + user),
    outputTokens: d.usageMetadata?.candidatesTokenCount || estimateTokens(text),
  };
}

export async function callLLM(provider, key, model, system, user, temp, maxTokens, signal) {
  switch (provider) {
    case "anthropic": return callAnthropic(key, model, system, user, temp, maxTokens, signal);
    case "openai": return callOpenAI(key, model, system, user, temp, maxTokens, signal);
    case "google": return callGoogle(key, model, system, user, temp, maxTokens, signal);
    default: throw new Error(`Unknown provider: ${provider}`);
  }
}
