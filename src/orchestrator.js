// MAC Orchestrator — Multi-Agent Conversation Engine

import { callLLM } from "./api.js";
import { searchArxiv, formatSearchResults } from "./tools.js";
import { getModelPricing, DEFAULT_MAX_TOKENS } from "./config.js";

// ─── Context Builder ──────────────────────────────────────────────

function buildAgentContext({ agent, agentIndex, agents, allMessages, userInput, round, totalRounds, isFollowUp, followUpText }) {
  const parts = [];

  const inputText = userInput.length > 3000
    ? userInput.slice(0, 3000) + "\n\n[... input truncated for context efficiency ...]"
    : userInput;
  parts.push(`## Research Input\n${inputText}`);

  if (isFollowUp && followUpText) {
    parts.push(`## User Follow-up Question\n${followUpText}`);
  }

  if (allMessages.length > 0) {
    parts.push(`## Discussion So Far`);

    const currentRoundMsgs = allMessages.filter(m => m.round === round || m.round === null);
    const priorMsgs = allMessages.filter(m => m.round !== null && m.round < round);

    if (priorMsgs.length > 0) {
      parts.push(`### Previous Rounds (Summary)`);
      const byRound = {};
      for (const m of priorMsgs) {
        if (!byRound[m.round]) byRound[m.round] = [];
        byRound[m.round].push(m);
      }
      for (const [r, msgs] of Object.entries(byRound)) {
        parts.push(`**Round ${r}:**`);
        for (const m of msgs) {
          const compressed = m.content.length > 500 ? m.content.slice(0, 500) + " [...]" : m.content;
          parts.push(`- **${m.isUser ? "User" : m.agentName}**: ${compressed}`);
        }
      }
    }

    if (currentRoundMsgs.length > 0) {
      parts.push(`### Current Round — Full Responses`);
      for (const m of currentRoundMsgs) {
        parts.push(`**[${m.isUser ? "User" : m.agentName}]:**\n${m.content}`);
      }
    }
  }

  const priorAgentNames = allMessages
    .filter(m => !m.isUser && m.round === round)
    .map(m => m.agentName);

  if (priorAgentNames.length > 0) {
    parts.push(`## Your Task
You are "${agent.name}". The following agents have already spoken in this round: ${priorAgentNames.join(", ")}.

**Important instructions:**
- Directly engage with their specific points — agree, disagree, or build on them
- Reference other agents by name (e.g., "As ${priorAgentNames[0]} noted..." or "I disagree with ${priorAgentNames[0]}'s point about...")
- Don't repeat what others have already said
- Add your unique perspective based on your role`);
  } else {
    parts.push(`## Your Task
You are "${agent.name}". You speak first in Round ${round}. Set the direction for this round's discussion.`);
  }

  if (!isFollowUp) {
    parts.push(`Round ${round} of ${totalRounds}.`);
  }

  return parts.join("\n\n");
}

// ─── Search Decision ──────────────────────────────────────────────
// Quick check: does this agent need to search arXiv?
// Returns search query or null. Never throws, never produces visible output.

async function decideSearch(agent, context, apiKeys, signal) {
  try {
    const prompt = `Decide if you need to search arXiv before responding to this academic discussion. Respond with ONLY valid JSON, no markdown: {"needsSearch": true/false, "searchQuery": "query if needed"}`;

    const result = await callLLM(
      agent.provider,
      apiKeys[agent.provider],
      agent.model,
      prompt,
      context.slice(0, 2000),
      0.3,
      1024,
      signal
    );

    const text = (result.text || "").trim();
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const decision = JSON.parse(jsonMatch[0]);
      if (decision.needsSearch && decision.searchQuery) {
        return {
          searchQuery: decision.searchQuery,
          tokens: (result.inputTokens || 0) + (result.outputTokens || 0),
          cost: (() => {
            const pr = getModelPricing(agent.provider, agent.model);
            return ((result.inputTokens || 0) * pr.input + (result.outputTokens || 0) * pr.output) / 1e6;
          })(),
        };
      }
    }
  } catch (e) {
    console.warn("Search decision skipped:", e.message);
  }
  return null;
}

// ─── Convergence Assessment ───────────────────────────────────────

async function assessConvergence(messages, agent, apiKeys) {
  try {
    const transcript = messages
      .filter(m => !m.isUser)
      .map(m => `**${m.agentName}**: ${m.content.slice(0, 800)}`)
      .join("\n\n");

    const result = await callLLM(
      agent.provider,
      apiKeys[agent.provider],
      agent.model,
      `Assess convergence of this academic discussion. Output ONLY valid JSON, no markdown: {"convergenceLevel": "high"|"medium"|"low", "consensusPoints": ["..."], "disagreements": ["..."], "openQuestions": ["..."], "recommendation": "..."}`,
      transcript,
      0.2,
      1024,
      null
    );

    const text = (result.text || "").trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.warn("Convergence assessment skipped:", e.message);
  }
  return null;
}

// ─── Run Agent with Tools ─────────────────────────────────────────

async function runAgentWithTools(agent, context, apiKeys, enableSearch, signal) {
  let searchText = "";
  let searchResults = null;
  let extraTokens = 0;
  let extraCost = 0;

  // Phase 1: Search decision (silent — never produces a message)
  if (enableSearch) {
    const decision = await decideSearch(agent, context, apiKeys, signal);
    if (decision) {
      extraTokens += decision.tokens;
      extraCost += decision.cost;
      try {
        searchResults = await searchArxiv(decision.searchQuery, 5);
        searchText = formatSearchResults(searchResults);
      } catch (e) {
        console.warn("arXiv search failed:", e.message);
      }
    }
  }

  // Phase 2: Main response
  const fullContext = searchText
    ? context + `\n\n## Literature Search Results\nYou searched arXiv and found:\n${searchText}\n\nIncorporate relevant findings. Cite specific papers when referencing them.`
    : context;

  const result = await callLLM(
    agent.provider,
    apiKeys[agent.provider],
    agent.model,
    agent.role,
    fullContext,
    agent.temp,
    agent.maxTokens || DEFAULT_MAX_TOKENS,
    signal
  );

  const pricing = getModelPricing(agent.provider, agent.model);
  const mainCost = ((result.inputTokens || 0) * pricing.input + (result.outputTokens || 0) * pricing.output) / 1e6;

  return {
    text: result.text || "",
    inputTokens: (result.inputTokens || 0) + extraTokens,
    outputTokens: result.outputTokens || 0,
    cost: mainCost + extraCost,
    searchResults,
  };
}

// ─── Main Orchestrator ────────────────────────────────────────────

export async function runDiscussion({
  agents,
  rounds,
  userInput,
  apiKeys,
  enableSearch = true,
  existingMessages = [],
  isFollowUp = false,
  followUpText = "",
  signal,
  onMessage,
  onStatus,
}) {
  const allMessages = [...existingMessages];
  let totalCost = existingMessages.reduce((s, m) => s + (m.cost || 0), 0);
  let totalTokens = existingMessages.reduce((s, m) => s + (m.inputTokens || 0) + (m.outputTokens || 0), 0);

  if (isFollowUp && followUpText) {
    const userMsg = {
      agent: { name: "You", color: "#9a9485" },
      agentName: "User",
      content: followUpText,
      round: null,
      isUser: true,
    };
    allMessages.push(userMsg);
    onMessage?.(userMsg, totalCost, totalTokens, [...allMessages]);
  }

  for (let round = 1; round <= rounds; round++) {
    onStatus?.({ type: "round", round, totalRounds: rounds });

    for (let i = 0; i < agents.length; i++) {
      if (signal?.aborted) return { messages: allMessages, totalCost, totalTokens, convergence: null };

      const agent = agents[i];
      onStatus?.({ type: "agent", agent, round });

      const context = buildAgentContext({
        agent, agentIndex: i, agents, allMessages, userInput,
        round, totalRounds: rounds, isFollowUp, followUpText,
      });

      var result;
      try {
        result = await runAgentWithTools(agent, context, apiKeys, enableSearch, signal);
      } catch (agentErr) {
        result = { text: "[ERROR] " + agent.name + " (" + agent.model + "): " + agentErr.message, inputTokens: 0, outputTokens: 0, cost: 0, searchResults: null };
      }

      const msg = {
        agent,
        agentName: agent.name,
        content: result.text,
        round: isFollowUp ? null : round,
        isUser: false,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cost: result.cost,
        searchResults: result.searchResults,
      };

      allMessages.push(msg);
      totalCost += result.cost;
      totalTokens += result.inputTokens + result.outputTokens;

      // Pass full allMessages for proper auto-save
      onMessage?.(msg, totalCost, totalTokens, [...allMessages]);
    }
  }

  let convergence = null;
  if (allMessages.filter(m => !m.isUser).length >= 2) {
    const lastAgent = agents[agents.length - 1];
    if (apiKeys[lastAgent.provider]) {
      onStatus?.({ type: "convergence" });
      convergence = await assessConvergence(allMessages, lastAgent, apiKeys);
    }
  }

  return { messages: allMessages, totalCost, totalTokens, convergence };
}
