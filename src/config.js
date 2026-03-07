// ─── Constants ────────────────────────────────────────────────────
export const MAX_SESSIONS = 50;
export const MAX_MSG_CHARS = 200000;
export const WARN_SESSIONS = 40;
export const DEFAULT_MAX_TOKENS = 4096;

export const PROVIDERS = {
  anthropic:{name:"Anthropic",models:[
    {id:"claude-sonnet-4-6-20250217",label:"Sonnet 4.6",input:3,output:15},
    {id:"claude-opus-4-6-20250205",label:"Opus 4.6",input:15,output:75},
    {id:"claude-sonnet-4-5-20250929",label:"Sonnet 4.5",input:3,output:15},
    {id:"claude-haiku-4-5-20251001",label:"Haiku 4.5",input:.25,output:1.25},
  ],defaultModel:"claude-sonnet-4-6-20250217",placeholder:"sk-ant-api03-..."},
  openai:{name:"OpenAI",models:[
    {id:"gpt-5.4",label:"GPT-5.4",input:2.5,output:15},
    {id:"gpt-5.2",label:"GPT-5.2",input:1.75,output:14},
    {id:"gpt-5-mini",label:"GPT-5 Mini",input:.4,output:1.6},
    {id:"gpt-4.1",label:"GPT-4.1",input:2,output:8},
    {id:"gpt-4o",label:"GPT-4o",input:2.5,output:10},
  ],defaultModel:"gpt-5.4",placeholder:"sk-proj-..."},
  google:{name:"Google",models:[
    {id:"gemini-3.1-pro-preview",label:"Gemini 3.1 Pro",input:1.25,output:10},
    {id:"gemini-3-flash-preview",label:"Gemini 3 Flash",input:.15,output:.6},
    {id:"gemini-2.5-flash",label:"Gemini 2.5 Flash",input:.15,output:.6},
    {id:"gemini-2.5-pro",label:"Gemini 2.5 Pro",input:1.25,output:10},
  ],defaultModel:"gemini-3.1-pro-preview",placeholder:"AIza..."},
};

export const COLORS = ["#8b2500","#1a4f6e","#2d5016","#6b3a7d","#8b6914","#1a3a4f","#6b1a2a","#3a5f3a"];

export function getModelPricing(provider, modelId) {
  const m = PROVIDERS[provider]?.models.find(v => v.id === modelId);
  return m ? { input: m.input, output: m.output } : { input: 0, output: 0 };
}

export function estimateTokens(text) {
  if (!text) return 0;
  const cn = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  return Math.ceil(cn / 1.5 + (text.length - cn) / 4);
}

// ─── i18n ─────────────────────────────────────────────────────────
export const T = {
  zh:{
    brand:"MAC",brandFull:"Multi-Agent Collegium",subtitle:"多智能体学术讨论工具",
    scenarioTitle:"选择讨论场景",scenarioDesc:"预置场景或从零开始自定义你的智能体面板",
    customScenario:"自定义场景",customDesc:"从空白开始，自由定义智能体阵容",
    apiKeys:"API 密钥配置",apiDesc:"至少配置一个提供商的密钥。密钥仅在本地使用。",
    configured:"已配置",notConfigured:"未配置",
    agents:"智能体配置",addAgent:"添加智能体",agentName:"名称",agentRole:"角色描述",
    rounds:"讨论轮数",roundsHint:"更多轮次 = 更深入",
    startBtn:"开始讨论",stopBtn:"终止",copyBtn:"复制全部",rerunBtn:"重新运行",
    backBtn:"返回",settingsBtn:"密钥",
    inputPlaceholder:"在此输入你的研究内容、论文摘要、研究想法...",
    discussionDone:"讨论完成",replies:"条回复",
    progress:"讨论进行中",thinking:"思考中...",langSwitch:"EN",
    noApiKey:"请先配置对应提供商的 API 密钥",
    editConfig:"修改配置",
    followUpPlaceholder:"输入追问，智能体会继续回复...",
    followUpBtn:"追问",continueHint:"你可以继续追问",
    uploadHint:"拖拽文件或点击上传 (PDF / TXT / MD)",
    history:"历史讨论",noSaved:"暂无",
    saveSession:"命名保存",loadSession:"打开",deleteSession:"删除",
    exportJson:"JSON",exportMd:"Markdown",
    sessionName:"讨论名称",save:"保存",cancel:"取消",
    agentHint:"可自由增删、编辑角色与提示词",
    chars:"字符",autoSaved:"已自动保存",
    summaryTitle:"讨论摘要",summaryGenerating:"正在生成摘要...",
    costLabel:"费用",tokensLabel:"tok",copySingle:"复制",regenSingle:"重新生成",
    searchPlaceholder:"搜索讨论内容...",
    sortNewest:"最新优先",sortOldest:"最早优先",sortName:"按名称",
    preview:"预览",msgCount:"条消息",
    templates:"配置模板",saveTemplate:"保存为模板",loadTemplate:"使用模板",deleteTemplate:"删除",
    templateName:"模板名称",noTemplates:"暂无模板",
    storageUsage:"存储用量",sessionsUsed:"个讨论",ofMax:"上限",
    storageFull:"存储已满，请删除旧讨论",storageWarn:"接近存储上限",
    charLimit:"此讨论内容已接近单条上限",
    maxTokens:"最大输出",
    s_review:"模拟论文评审",s_review_d:"模拟顶刊审稿流程",
    s_brainstorm:"研究头脑风暴",s_brainstorm_d:"多角色迭代打磨研究方向",
    s_student:"模拟学生提问",s_student_d:"预演答辩或课堂提问",
    s_revision:"修改策略教练",s_revision_d:"系统性修改方案与回复信",
  },
  en:{
    brand:"MAC",brandFull:"Multi-Agent Collegium",subtitle:"Multi-Agent Academic Discussion Tool",
    scenarioTitle:"Choose a Scenario",scenarioDesc:"Use a preset or build your own agent panel",
    customScenario:"Custom Scenario",customDesc:"Start blank, define your own agents",
    apiKeys:"API Key Configuration",apiDesc:"Configure at least one provider. Keys are stored locally only.",
    configured:"OK",notConfigured:"—",
    agents:"Agent Configuration",addAgent:"Add Agent",agentName:"Name",agentRole:"Role Description",
    rounds:"Rounds",roundsHint:"More rounds = deeper",
    startBtn:"Start Discussion",stopBtn:"Stop",copyBtn:"Copy All",rerunBtn:"Re-run",
    backBtn:"Back",settingsBtn:"Keys",
    inputPlaceholder:"Enter your research content, paper abstract, or ideas...",
    discussionDone:"Discussion Complete",replies:"replies",
    progress:"In progress",thinking:"Thinking...",langSwitch:"中文",
    noApiKey:"Configure the API key for this provider first",
    editConfig:"Edit Config",
    followUpPlaceholder:"Follow-up question...",
    followUpBtn:"Follow up",continueHint:"Continue — agents respond from full history.",
    uploadHint:"Drag & drop or click to upload (PDF / TXT / MD)",
    history:"History",noSaved:"None yet",
    saveSession:"Save As",loadSession:"Open",deleteSession:"Delete",
    exportJson:"JSON",exportMd:"Markdown",
    sessionName:"Session name",save:"Save",cancel:"Cancel",
    agentHint:"Add, remove, or edit agents and prompts freely.",
    chars:"chars",autoSaved:"Auto-saved",
    summaryTitle:"Discussion Summary",summaryGenerating:"Generating summary...",
    costLabel:"cost",tokensLabel:"tok",copySingle:"Copy",regenSingle:"Regen",
    searchPlaceholder:"Search discussions...",
    sortNewest:"Newest",sortOldest:"Oldest",sortName:"By name",
    preview:"Preview",msgCount:"messages",
    templates:"Templates",saveTemplate:"Save as Template",loadTemplate:"Use",deleteTemplate:"Delete",
    templateName:"Template name",noTemplates:"No templates yet",
    storageUsage:"Storage",sessionsUsed:"sessions",ofMax:"max",
    storageFull:"Storage full — delete old sessions",storageWarn:"Near storage limit",
    charLimit:"Session near size limit",
    maxTokens:"Max output",
    s_review:"Paper Review",s_review_d:"Simulate top-journal peer review",
    s_brainstorm:"Brainstorm",s_brainstorm_d:"Multi-role iterative idea development",
    s_student:"Student Q&A",s_student_d:"Rehearse seminar or defense questions",
    s_revision:"Revision Coach",s_revision_d:"Revision planning & response letter",
  },
};

export function makePresets(lang) {
  const t = T[lang];
  const lI = lang === "zh"
    ? "\n\nPlease respond entirely in Chinese (简体中文)."
    : "\n\nPlease respond entirely in English.";
  return {
    paper_review: { label: t.s_review, desc: t.s_review_d, icon: "§", rounds: 1, agents: [
      { id:"r1", name:"Reviewer 1", role:"You are Reviewer 1 — a methodological expert for a top-tier journal. Focus on research design rigor, causal identification, statistical methods. Write a structured review with Major and Minor concerns."+lI, provider:"anthropic", model:"claude-sonnet-4-6-20250217", temp:.6, maxTokens: DEFAULT_MAX_TOKENS, color: COLORS[0] },
      { id:"r2", name:"Reviewer 2", role:"You are Reviewer 2 — a theoretical contribution expert. Focus on theoretical framing, novelty, literature positioning. Write a structured review."+lI, provider:"anthropic", model:"claude-sonnet-4-6-20250217", temp:.6, maxTokens: DEFAULT_MAX_TOKENS, color: COLORS[1] },
      { id:"ae", name:"Associate Editor", role:"You are the Associate Editor. Synthesize reviews into a decision letter with a clear editorial decision (Reject / Major Revision / Minor Revision / Accept)."+lI, provider:"anthropic", model:"claude-sonnet-4-6-20250217", temp:.4, maxTokens: DEFAULT_MAX_TOKENS, color: COLORS[2] },
    ]},
    idea_brainstorm: { label: t.s_brainstorm, desc: t.s_brainstorm_d, icon: "◊", rounds: 3, agents: [
      { id:"vis", name:"Visionary", role:"You are 'The Visionary'. Generate bold research directions. Cross-field connections. Novel methodologies."+lI, provider:"anthropic", model:"claude-sonnet-4-6-20250217", temp:.9, maxTokens: DEFAULT_MAX_TOKENS, color: COLORS[3] },
      { id:"str", name:"Strategist", role:"You are 'The Strategist'. Stress-test ideas. Suggest designs (RCT, DiD, IV, RDD, DML). Upgrade ideas."+lI, provider:"anthropic", model:"claude-sonnet-4-6-20250217", temp:.6, maxTokens: DEFAULT_MAX_TOKENS, color: COLORS[1] },
      { id:"val", name:"Validator", role:"You are 'The Validator'. Assess publishability in top journals. Be demanding."+lI, provider:"anthropic", model:"claude-sonnet-4-6-20250217", temp:.5, maxTokens: DEFAULT_MAX_TOKENS, color: COLORS[0] },
    ]},
    student_qa: { label: t.s_student, desc: t.s_student_d, icon: "∴", rounds: 1, agents: [
      { id:"ug", name: lang==="zh"?"好奇本科生":"Undergrad", role:"You are a curious undergraduate. Ask 2-3 fundamental questions."+lI, provider:"anthropic", model:"claude-sonnet-4-6-20250217", temp:.8, maxTokens: 2048, color: COLORS[4] },
      { id:"phd", name: lang==="zh"?"博士同学":"PhD Peer", role:"You are a PhD student. Ask 2-3 pointed technical questions. Challenge assumptions."+lI, provider:"anthropic", model:"claude-sonnet-4-6-20250217", temp:.7, maxTokens: 2048, color: COLORS[1] },
      { id:"prof", name: lang==="zh"?"资深教授":"Professor", role:"You are a tenured professor. Ask 2-3 high-level questions about contribution and positioning."+lI, provider:"anthropic", model:"claude-sonnet-4-6-20250217", temp:.6, maxTokens: 2048, color: COLORS[0] },
    ]},
    revision_coach: { label: t.s_revision, desc: t.s_revision_d, icon: "¶", rounds: 1, agents: [
      { id:"diag", name: lang==="zh"?"诊断师":"Diagnostician", role:"Analyze reviewer comments. Identify core issues by severity and type."+lI, provider:"anthropic", model:"claude-sonnet-4-6-20250217", temp:.5, maxTokens: DEFAULT_MAX_TOKENS, color: COLORS[0] },
      { id:"revs", name: lang==="zh"?"策略师":"Strategist", role:"Create a revision roadmap. Prioritize changes, suggest improvements."+lI, provider:"anthropic", model:"claude-sonnet-4-6-20250217", temp:.6, maxTokens: DEFAULT_MAX_TOKENS, color: COLORS[1] },
      { id:"resp", name: lang==="zh"?"回复撰写":"Response Crafter", role:"Draft a point-by-point response letter to reviewers."+lI, provider:"anthropic", model:"claude-sonnet-4-6-20250217", temp:.5, maxTokens: DEFAULT_MAX_TOKENS, color: COLORS[2] },
    ]},
  };
}
