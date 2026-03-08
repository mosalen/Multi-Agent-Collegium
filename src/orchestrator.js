// MAC Orchestrator — Multi-Agent Conversation Engine
//
// vs. a simple for-loop:
// 1. Selective context: each agent gets a tailored view, not raw dump
// 2. Inter-agent references: prompt instructs agent to engage with specific prior points
// 3. Tool use: agent decides if it needs arXiv search, orchestrator executes, injects results
// 4. Convergence: final agent in last round assesses consensus/disagreement

import { callLLM } from "./api.js";
import { searchArxiv, formatSearchResults } from "./tools.js";
import { getModelPricing, DEFAULT_MAX_TOKENS } from "./config.js";

// ─── Context Builder ──────────────────────────────────────────────
// Builds a focused, structured prompt for each agent instead of dumping everything

function buildAgentContext({ agent, agentIndex, agents, allMessages, userInput, round, totalRounds, isFollowUp, followUpText }) {
  const parts = [];

  // 1. Original input (always included, but summarized if very long)
  const inputText = userInput.length > 3000
    ? userInput.slice(0, 3000) + "\n\n[... input truncated for context efficiency ...]"
    : userInput;
  parts.push(`## Research Input\n${inputText}`);

  // 2. For follow-ups, include the follow-up question prominently
  if (isFollowUp && followUpText) {
    parts.push(`## User Follow-up Question\n${followUpText}`);
  }

  // 3. Selective history: only include messages relevant to this agent
  if (allMessages.length > 0) {
    parts.push(`## Discussion So Far`);

    // For the current round, include ALL messages (agents need to see what just happened)
    // For previous rounds, include a compressed summary
    const currentRoundMsgs = allMessages.filter(m => m.round === round || m.round === null);
    const priorMsgs = allMessages.filter(m => m.round !== null && m.round < round);

    // Prior rounds: compressed
    if (priorMsgs.length > 0) {
      parts.push(`### Previous Rounds (Summary)`);
      // Group by round
      const byRound = {};
      for (const m of priorMsgs) {
        if (!byRound[m.round]) byRound[m.round] = [];
        byRound[m.round].push(m);
      }
      for (const [r, msgs] of Object.entries(byRound)) {
        parts.push(`**Round ${r}:**`);
        for (const m of msgs) {
          // Compress: only first 500 chars of prior round messages
          const compressed = m.content.length > 500
            ? m.content.slice(0, 500) + " [...]"
            : m.content;
          parts.push(`- **${m.isUser ? "User" : m.agentName}**: ${compressed}`);
        }
      }
    }

    // Current round: full text, with explicit reference pointers
    if (currentRoundMsgs.length > 0) {
      parts.push(`### Current Round — Full Responses`);
      for (const m of currentRoundMsgs) {
        const label = m.isUser ? "User" : m.agentName;
        parts.push(`**[${label}]:**\n${m.content}`);
      }
    }
  }

  // 4. Inter-agent reference instructions
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

  // 5. Round context
  if (!isFollowUp) {
    parts.push(`Round ${round} of ${totalRounds}.`);
  }

  // 6. Search results (will be injected by orchestrator if agent requested search)
  // This is a placeholder — actual results get appended in runAgentWithTools

  return parts.join("\n\n");
}

// ─── Search Decision ──────────────────────────────────────────────
// Quick LLM call to ask: "Do you need to search arXiv before responding?"

const SEARCH_DECISION_PROMPT = `You are about to respond to an academic discussion. Before you respond, decide if you need to search arXiv for relevant papers to support your points.

Respond with ONLY a JSON object (no markdown, no backticks):
{"needsSearch": true/false, "searchQuery": "your search query if needed"}

Search when: checking novelty, finding related work, verifying claims, supporting methodology suggestions.
Don't search when: giving general feedback, discussing writing style, making editorial decisions.`;

async function decideSearch(agent, context, apiKeys, signal) {
  try {
    const result = await callLLM(
      agent.provider,
      apiKeys[agent.provider],
      agent.model,
      SEARCH_DECISION_PROMPT,
      context.slice(0, 2000), // Short context for quick decision
      0.3,
      1024,
      signal
    );

    // Parse the decision
    const text = result.text.trim();
    // Try to extract JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const decision = JSON.parse(jsonMatch[0]);
      return {
        needsSearch: !!decision.needsSearch,
        searchQuery: decision.searchQuery || "",
        tokens: result.inputTokens + result.outputTokens,
        cost: (() => {
          const pr = getModelPricing(agent.provider, agent.model);
          return (result.inputTokens * pr.input + result.outputTokens * pr.output) / 1e6;
        })(),
      };
    }
  } catch (e) {
    // If search decision fails, just skip it
    console.warn("Search decision failed:", e.message);
  }
  return { needsSearch: false, searchQuery: "", tokens: 0, cost: 0 };
}

// ─── Convergence Assessment ───────────────────────────────────────

const CONVERGENCE_PROMPT = `You are assessing the convergence of an academic multi-agent discussion.

Analyze the discussion and output ONLY a JSON object (no markdown):
{
  "convergenceLevel": "high" | "medium" | "low",
  "consensusPoints": ["point 1", "point 2"],
  "disagreements": ["disagreement 1"],
  "openQuestions": ["question 1"],
  "recommendation": "brief recommendation for the user"
}`;

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
      CONVERGENCE_PROMPT,
      transcript,
      0.2,
      1024,
      null
    );

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.warn("Convergence assessment failed:", e.message);
  }
  return null;
}

// ─── Main Orchestrator ────────────────────────────────────────────

/**
 * Run a single agent with the two-phase approach:
 * Phase 1: Search decision (should I look up papers?)
 * Phase 2: Main response (with search results if applicable)
 *
 * @returns {{ text, inputTokens, outputTokens, cost, searchResults }}
 */
async function runAgentWithTools(agent, context, apiKeys, enableSearch, signal) {
  let searchResults = null;
  let searchText = "";
  let extraTokens = 0;
  let extraCost = 0;

  // Phase 1: Search decision (only if search is enabled for this agent)
  if (enableSearch) {
    const decision = await decideSearch(agent, context, apiKeys, signal);
    extraTokens += decision.tokens;
    extraCost += decision.cost;

    if (decision.needsSearch && decision.searchQuery) {
      try {
        searchResults = await searchArxiv(decision.searchQuery, 5);
        searchText = formatSearchResults(searchResults);
      } catch (e) {
        searchText = `[arXiv search failed: ${e.message}]`;
      }
    }
  }

  // Phase 2: Main response
  const fullContext = searchText
    ? context + `\n\n## Literature Search Results\nYou searched arXiv and found:\n${searchText}\n\nIncorporate relevant findings into your response. Cite specific papers when referencing them.`
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
  const mainCost = (result.inputTokens * pricing.input + result.outputTokens * pricing.output) / 1e6;

  return {
    text: result.text,
    inputTokens: result.inputTokens + extraTokens,
    outputTokens: result.outputTokens,
    cost: mainCost + extraCost,
    searchResults,
  };
}

/**
 * Run a complete multi-agent discussion session.
 *
 * @param {Object} params
 * @param {Array} params.agents - Agent configurations
 * @param {number} params.rounds - Number of discussion rounds
 * @param {string} params.userInput - User's input text
 * @param {Object} params.apiKeys - API keys by provider
 * @param {boolean} params.enableSearch - Whether agents can search arXiv
 * @param {Array} params.existingMessages - Prior messages (for follow-ups)
 * @param {boolean} params.isFollowUp - Is this a follow-up?
 * @param {string} params.followUpText - Follow-up question text
 * @param {AbortSignal} params.signal - Abort signal
 * @param {Function} params.onMessage - Callback when a message is produced
 * @param {Function} params.onStatus - Callback for status updates
 * @returns {Promise<{messages, totalCost, totalTokens, convergence}>}
 */
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

  // Add user follow-up message
  if (isFollowUp && followUpText) {
    const userMsg = {
      agent: { name: "You", color: "#9a9485" },
      agentName: "User",
      content: followUpText,
      round: null,
      isUser: true,
    };
    allMessages.push(userMsg);
    onMessage?.(userMsg);
  }

  // Run rounds
  for (let round = 1; round <= rounds; round++) {
    onStatus?.({ type: "round", round, totalRounds: rounds });

    for (let i = 0; i < agents.length; i++) {
      if (signal?.aborted) return { messages: allMessages, totalCost, totalTokens, convergence: null };

      const agent = agents[i];
      onStatus?.({ type: "agent", agent, round });

      // Build selective context for this specific agent
      const context = buildAgentContext({
        agent,
        agentIndex: i,
        agents,
        allMessages,
        userInput,
        round,
        totalRounds: rounds,
        isFollowUp,
        followUpText,
      });

      // Run agent with potential tool use
      const result = await runAgentWithTools(agent, context, apiKeys, enableSearch, signal);

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

      onMessage?.(msg, totalCost, totalTokens, [...allMessages]);
    }
  }

  // Convergence assessment (using the last agent)
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
