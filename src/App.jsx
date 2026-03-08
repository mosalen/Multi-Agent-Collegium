import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { storageGet, storageSet, storageDelete } from "./storage.js";
import { callLLM } from "./api.js";
import { runDiscussion } from "./orchestrator.js";
import {
  MAX_SESSIONS, MAX_MSG_CHARS, DEFAULT_MAX_TOKENS,
  PROVIDERS, COLORS, getModelPricing, T, makePresets,
} from "./config.js";
import "./styles.css";

// ─── Storage wrappers ─────────────────────────────────────────────
async function loadIndex(){try{return(await storageGet("mac-idx"))||[];}catch{return[];}}
async function saveIdx(list){try{await storageSet("mac-idx",list);}catch(e){console.error(e);}}
async function saveSess(s){try{const list=await loadIndex();if(list.length>=MAX_SESSIONS&&!list.find(x=>x.id===s.id))return false;const i=list.findIndex(x=>x.id===s.id);const meta={id:s.id,name:s.name,updatedAt:new Date().toISOString(),msgCount:s.messages?.length||0,preview:(s.input||"").slice(0,80)};if(i>=0)list[i]=meta;else list.unshift(meta);await saveIdx(list);await storageSet(`mac:${s.id}`,s);return true;}catch(e){console.error(e);return false;}}
async function loadSess(id){try{return await storageGet(`mac:${id}`);}catch{return null;}}
async function deleteSess(id){try{const list=await loadIndex();await saveIdx(list.filter(s=>s.id!==id));await storageDelete(`mac:${id}`);return true;}catch{return false;}}
async function loadTemplates(){try{return(await storageGet("mac-tpl"))||[];}catch{return[];}}
async function saveTemplateList(list){try{await storageSet("mac-tpl",list);}catch(e){console.error(e);}}

// ─── Helpers ──────────────────────────────────────────────────────
function readFileAsText(f){return new Promise((res,rej)=>{const r=new FileReader();if(f.type==="application/pdf"){r.onload=()=>res({text:`[PDF: ${f.name}, ${(f.size/1024).toFixed(0)}KB]`,name:f.name});r.onerror=()=>rej(new Error("Read failed"));r.readAsDataURL(f);}else{r.onload=()=>res({text:r.result,name:f.name});r.onerror=()=>rej(new Error("Read failed"));r.readAsText(f);}});}
function dlFile(c,fn,ty="text/plain"){const b=new Blob([c],{type:ty});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=fn;a.click();URL.revokeObjectURL(u);}

// ─── Components ───────────────────────────────────────────────────
function MsgBubble({msg,rounds,lang,onCopy,onRegen,running}){
  const{agent,content,round,isUser,inputTokens,outputTokens,cost}=msg;
  const[col,setCol]=useState(false);const long=content.length>800;const t=T[lang];
  if(isUser)return(<div className="me" style={{marginBottom:22,display:"flex",gap:12,alignItems:"flex-start"}}><div style={{width:30,height:30,borderRadius:"50%",background:"#9a9485",color:"#faf8f4",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,flexShrink:0,fontFamily:"var(--fd)"}}>U</div><div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:"#5a5549",fontFamily:"var(--fd)",marginBottom:3}}>You</div><div style={{fontSize:13,lineHeight:1.8,color:"var(--fg)",whiteSpace:"pre-wrap",fontFamily:"var(--fb)",padding:"8px 12px",background:"#f0ede6",borderRadius:"4px 12px 12px 12px"}}>{content}</div></div></div>);
  const ml=PROVIDERS[agent?.provider]?.models.find(x=>x.id===agent?.model);
  return(<div className="me" style={{marginBottom:26,position:"relative"}}><div style={{position:"absolute",left:14,top:34,bottom:-26,width:1,background:"var(--border)"}}/><div style={{display:"flex",gap:12,alignItems:"flex-start"}}><div style={{width:30,height:30,borderRadius:"50%",background:agent?.color||"#666",color:"#faf8f4",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,flexShrink:0,fontFamily:"var(--fd)",position:"relative",zIndex:1}}>{(agent?.name||"?")[0].toUpperCase()}</div><div style={{flex:1,minWidth:0}}><div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:4,flexWrap:"wrap"}}><span style={{fontWeight:700,fontSize:13,color:agent?.color||"#666",fontFamily:"var(--fd)"}}>{agent?.name}</span>{ml&&<span style={{fontSize:10,color:"#b0a898",fontFamily:"var(--fm)"}}>{ml.label}</span>}{round&&rounds>1&&<span style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--fm)"}}>R{round}</span>}{long&&<button onClick={()=>setCol(!col)} style={{fontSize:10,color:"var(--muted)",background:"none",border:"none",cursor:"pointer",fontFamily:"var(--fm)"}}>[{col?"▼":"▶"}]</button>}</div><div style={{fontSize:13,lineHeight:1.85,color:"var(--fg)",whiteSpace:"pre-wrap",maxHeight:col?120:"none",overflow:"hidden",position:"relative",fontFamily:"var(--fb)"}}>{content}{col&&<div style={{position:"absolute",bottom:0,left:0,right:0,height:50,background:"linear-gradient(transparent,var(--bg))"}}/>}</div><div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>{(inputTokens>0||outputTokens>0)&&<span style={{fontSize:9,color:"#c4baa8",fontFamily:"var(--fm)"}}>{inputTokens+outputTokens} {t.tokensLabel}{cost>0&&` · $${cost.toFixed(4)}`}</span>}<button onClick={()=>onCopy(content)} style={{fontSize:9,color:"var(--muted)",background:"none",border:"none",cursor:"pointer",fontFamily:"var(--fm)"}}>{t.copySingle}</button>{!running&&<button onClick={()=>onRegen(msg)} style={{fontSize:9,color:"var(--muted)",background:"none",border:"none",cursor:"pointer",fontFamily:"var(--fm)"}}>{t.regenSingle}</button>}</div></div></div></div>);
}

function AgentEditor({agent,onUpdate,onRemove,canRemove,apiKeys,lang}){
  const t=T[lang];
  return(<div style={{padding:"12px 14px",borderRadius:8,background:"#fff",border:"1px solid var(--border)",marginBottom:8}}>
    <div style={{display:"flex",gap:6,marginBottom:6,alignItems:"center",flexWrap:"wrap"}}>
      <div style={{width:8,height:8,borderRadius:"50%",background:agent.color,flexShrink:0}}/>
      <input value={agent.name} onChange={e=>onUpdate({...agent,name:e.target.value})} style={{flex:"1 1 80px",border:"none",borderBottom:"1px solid var(--border)",padding:"2px 0",fontSize:13,fontWeight:600,fontFamily:"var(--fd)",color:"var(--fg)",background:"transparent",outline:"none",minWidth:50}}/>
      <select value={agent.provider} onChange={e=>{const p=e.target.value;onUpdate({...agent,provider:p,model:PROVIDERS[p].defaultModel});}} style={{fontSize:10,border:"1px solid var(--border)",borderRadius:3,padding:"2px 4px",color:"#5a5549",background:"var(--bg)",fontFamily:"var(--fm)"}}>{Object.entries(PROVIDERS).map(([k,v])=><option key={k} value={k}>{v.name}{apiKeys[k]?" ✓":""}</option>)}</select>
      <select value={agent.model} onChange={e=>onUpdate({...agent,model:e.target.value})} style={{fontSize:10,border:"1px solid var(--border)",borderRadius:3,padding:"2px 4px",color:"#5a5549",background:"var(--bg)",fontFamily:"var(--fm)"}}>{PROVIDERS[agent.provider].models.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select>
      {/* Temperature */}
      <div style={{display:"flex",alignItems:"center",gap:2,flexShrink:0}}>
        <span style={{fontSize:9,color:"var(--muted)",fontFamily:"var(--fm)"}}>T</span>
        <input type="range" min="0" max="1" step="0.1" value={agent.temp} onChange={e=>onUpdate({...agent,temp:parseFloat(e.target.value)})} style={{width:36,accentColor:agent.color}}/>
        <span style={{fontSize:9,color:"var(--muted)",fontFamily:"var(--fm)",width:18,textAlign:"right"}}>{agent.temp}</span>
      </div>
      {/* Max Tokens */}
      <div style={{display:"flex",alignItems:"center",gap:2,flexShrink:0}}>
        <span style={{fontSize:9,color:"var(--muted)",fontFamily:"var(--fm)"}}>{t.maxTokens}</span>
        <select value={agent.maxTokens||DEFAULT_MAX_TOKENS} onChange={e=>onUpdate({...agent,maxTokens:parseInt(e.target.value)})} style={{fontSize:9,border:"1px solid var(--border)",borderRadius:3,padding:"1px 3px",color:"#5a5549",background:"var(--bg)",fontFamily:"var(--fm)"}}>
          {[512,1024,2048,4096,8192,16384].map(v=><option key={v} value={v}>{v>=1024?`${v/1024}k`:v}</option>)}
        </select>
      </div>
      {canRemove&&<button onClick={onRemove} style={{background:"none",border:"none",cursor:"pointer",color:"#c4baa8",fontSize:16,padding:"0 2px",lineHeight:1}}>×</button>}
    </div>
    <textarea value={agent.role} onChange={e=>onUpdate({...agent,role:e.target.value})} rows={2} style={{width:"100%",border:"1px solid var(--border)",borderRadius:3,padding:"6px 8px",fontSize:11,lineHeight:1.6,color:"#5a5549",background:"#fdfcfa",fontFamily:"var(--fb)",resize:"vertical",boxSizing:"border-box",outline:"none"}}/>
  </div>);
}

function StorageBar({count,max,lang}){
  const t=T[lang];const pct=Math.min(100,(count/max)*100);
  const color=pct>=90?"#8b2500":pct>=70?"#8b6914":"#2d5016";
  return(<div style={{marginBottom:16}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--muted)",fontFamily:"var(--fm)",marginBottom:4}}><span>{t.storageUsage}</span><span>{count}/{max}</span></div><div style={{height:4,background:"var(--border)",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",background:color,width:`${pct}%`,transition:"width .3s",borderRadius:2}}/></div>{pct>=90&&<div style={{fontSize:10,color:"#8b2500",marginTop:4}}>{pct>=100?t.storageFull:t.storageWarn}</div>}</div>);
}

// ─── Main App ─────────────────────────────────────────────────────
export default function App(){
  const[lang,setLang]=useState("zh");
  const[page,setPage]=useState("home");
  const[agents,setAgents]=useState([]);
  const[rounds,setRounds]=useState(1);
  const[input,setInput]=useState("");
  const[uploadedFiles,setUploadedFiles]=useState([]);
  const[messages,setMessages]=useState([]);
  const[running,setRunning]=useState(false);
  const[curAgent,setCurAgent]=useState(null);
  const[curRound,setCurRound]=useState(0);
  const[error,setError]=useState(null);
  const[showKeys,setShowKeys]=useState(false);
  const[apiKeys,setApiKeys]=useState({anthropic:"",openai:"",google:""});
  const[followUp,setFollowUp]=useState("");
  const[sessionList,setSessionList]=useState([]);
  const[sessionId,setSessionId]=useState(null);
  const[showSaveModal,setShowSaveModal]=useState(false);
  const[saveName,setSaveName]=useState("");
  const[dragOver,setDragOver]=useState(false);
  const[summary,setSummary]=useState(null);
  const[summaryLoading,setSummaryLoading]=useState(false);
  const[autoSaveStatus,setAutoSaveStatus]=useState("");
  const[totalCost,setTotalCost]=useState(0);
  const[totalTokens,setTotalTokens]=useState(0);
  const[historySearch,setHistorySearch]=useState("");
  const[historySort,setHistorySort]=useState("newest");
  const[templates,setTemplates]=useState([]);
  const[showTplModal,setShowTplModal]=useState(false);
  const[tplName,setTplName]=useState("");
  const[ftResults,setFtResults]=useState(null);
  const[ftLoading,setFtLoading]=useState(false);
  const[enableSearch,setEnableSearch]=useState(true);
  const[convergence,setConvergence]=useState(null);

  const scrollRef=useRef(null);
  const abortRef=useRef(null);
  const fileInputRef=useRef(null);
  const t=T[lang];
  const presets=makePresets(lang);

  useEffect(()=>{scrollRef.current?.scrollTo({top:scrollRef.current.scrollHeight,behavior:"smooth"});},[messages,curAgent,summary]);
  useEffect(()=>{loadIndex().then(setSessionList);loadTemplates().then(setTemplates);
    // Load persisted API keys
    storageGet("mac-keys").then(k=>{if(k)setApiKeys(k);});
  },[]);
  // Persist API keys whenever they change
  useEffect(()=>{const hasAny=Object.values(apiKeys).some(Boolean);if(hasAny)storageSet("mac-keys",apiKeys);},[apiKeys]);

  const sessionChars=useMemo(()=>messages.reduce((s,m)=>s+m.content.length,0),[messages]);
  const charLimitWarn=sessionChars>MAX_MSG_CHARS*0.8;

  const filteredSessions=useMemo(()=>{
    let list=[...sessionList];
    if(historySearch.trim()){const q=historySearch.toLowerCase();list=list.filter(s=>s.name?.toLowerCase().includes(q)||s.preview?.toLowerCase().includes(q));}
    if(historySort==="newest")list.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
    else if(historySort==="oldest")list.sort((a,b)=>new Date(a.updatedAt)-new Date(b.updatedAt));
    else if(historySort==="name")list.sort((a,b)=>(a.name||"").localeCompare(b.name||""));
    return list;
  },[sessionList,historySearch,historySort]);

  const doFullTextSearch=useCallback(async(query)=>{
    if(!query.trim()){setFtResults(null);return;}
    setFtLoading(true);const q=query.toLowerCase();const results=[];
    for(const s of sessionList){const sess=await loadSess(s.id);if(!sess)continue;const matches=(sess.messages||[]).filter(m=>m.content?.toLowerCase().includes(q));if(matches.length>0||sess.input?.toLowerCase().includes(q))results.push({session:s,matchCount:matches.length,firstMatch:matches[0]?.content?.slice(0,120)});}
    setFtResults(results);setFtLoading(false);
  },[sessionList]);

  // Auto-save
  const autoSave=useCallback(async(msgs,sid,nm)=>{
    if(!sid||msgs.length===0)return;
    const ok=await saveSess({id:sid,name:nm||saveName||`MAC ${new Date().toLocaleString()}`,input,agents:agents.map(a=>({id:a.id,name:a.name,role:a.role,provider:a.provider,model:a.model,temp:a.temp,maxTokens:a.maxTokens||DEFAULT_MAX_TOKENS,color:a.color})),rounds,messages:msgs.map(m=>({agentName:m.agentName||m.agent?.name,content:m.content,round:m.round,isUser:!!m.isUser,agentColor:m.agent?.color,agentProvider:m.agent?.provider,agentModel:m.agent?.model,inputTokens:m.inputTokens,outputTokens:m.outputTokens,cost:m.cost})),summary,totalCost,totalTokens,updatedAt:new Date().toISOString()});
    if(ok){setAutoSaveStatus(t.autoSaved);setTimeout(()=>setAutoSaveStatus(""),2000);setSessionList(await loadIndex());}
  },[input,agents,rounds,saveName,summary,totalCost,totalTokens,t]);

  const handleFiles=async(files)=>{const nf=[];for(const f of files){try{nf.push(await readFileAsText(f));}catch(e){setError(`${f.name}: ${e.message}`);}}setUploadedFiles(prev=>[...prev,...nf]);};
  const getFullInput=()=>{let full=input;if(uploadedFiles.length>0){full+="\n\n---\n## Uploaded Files\n";for(const f of uploadedFiles)full+=`\n### ${f.name}\n${f.text}\n`;}return full;};

  const selectScenario=(key)=>{if(key==="custom"){setAgents([{id:"a1",name:lang==="zh"?"智能体 1":"Agent 1",role:"",provider:"anthropic",model:"claude-sonnet-4-6",temp:.7,maxTokens:DEFAULT_MAX_TOKENS,color:COLORS[0]}]);setRounds(1);}else{const p=presets[key];setAgents(p.agents.map(a=>({...a})));setRounds(p.rounds);}setPage("setup");};
  const addAgent=()=>{const i=agents.length;setAgents([...agents,{id:`a${Date.now()}`,name:lang==="zh"?`智能体 ${i+1}`:`Agent ${i+1}`,role:"",provider:"anthropic",model:"claude-sonnet-4-6",temp:.7,maxTokens:DEFAULT_MAX_TOKENS,color:COLORS[i%COLORS.length]}]);};
  const checkKeys=()=>{const needed=[...new Set(agents.map(a=>a.provider))];for(const p of needed){if(!apiKeys[p]){setError(t.noApiKey+` (${PROVIDERS[p].name})`);setShowKeys(true);return false;}}return true;};

  const saveTemplate=async()=>{const tpl={id:`tpl_${Date.now()}`,name:tplName||"Untitled",agents:agents.map(a=>({name:a.name,role:a.role,provider:a.provider,model:a.model,temp:a.temp,maxTokens:a.maxTokens||DEFAULT_MAX_TOKENS,color:a.color})),rounds};const list=[tpl,...templates];await saveTemplateList(list);setTemplates(list);setShowTplModal(false);setTplName("");};
  const applyTemplate=(tpl)=>{setAgents(tpl.agents.map((a,i)=>({...a,id:`a${Date.now()}_${i}`})));setRounds(tpl.rounds||1);};
  const deleteTemplate=async(id)=>{const list=templates.filter(t=>t.id!==id);await saveTemplateList(list);setTemplates(list);};

  // Summary generation (still uses direct LLM call)
  const generateSummary=useCallback(async(msgs)=>{
    if(msgs.filter(m=>!m.isUser).length<2)return;setSummaryLoading(true);
    const a=agents[0];if(!a||!apiKeys[a.provider]){setSummaryLoading(false);return;}
    const transcript=msgs.map(m=>`**[${m.isUser?"User":m.agentName}]:** ${m.content}`).join("\n\n");
    const sys=lang==="zh"?"根据讨论生成结构化摘要：1)关键结论 2)主要分歧 3)待办事项。简洁，中文。":"Generate structured summary: 1) Key Conclusions 2) Disagreements 3) Action Items. Concise.";
    try{const r=await callLLM(a.provider,apiKeys[a.provider],a.model,sys,transcript,.3,2048,null);setSummary(r.text);}catch(e){console.error(e);}finally{setSummaryLoading(false);}
  },[agents,apiKeys,lang]);

  // Regen single message (still uses direct LLM call for simplicity)
  const handleRegen=useCallback(async(msg)=>{
    const idx=messages.findIndex(m=>m===msg);if(idx<0||!msg.agent||!apiKeys[msg.agent.provider])return;
    setRunning(true);setCurAgent(msg.agent);setError(null);
    const prior=messages.slice(0,idx);const fi=getFullInput();
    let ctx=`## Original Input\n${fi}\n\n`;if(prior.length>0){ctx+="## Discussion History\n";for(const m of prior)ctx+=`\n**[${m.isUser?"User":m.agentName}]:**\n${m.content}\n`;}ctx+=`---\nRespond as "${msg.agent.name}". Directly reference and engage with other agents' points by name.`;
    try{const r=await callLLM(msg.agent.provider,apiKeys[msg.agent.provider],msg.agent.model,msg.agent.role||"",ctx,msg.agent.temp||.7,msg.agent.maxTokens||DEFAULT_MAX_TOKENS,null);const pr=getModelPricing(msg.agent.provider,msg.agent.model);const c=(r.inputTokens*pr.input+r.outputTokens*pr.output)/1e6;const nm={...msg,content:r.text,inputTokens:r.inputTokens,outputTokens:r.outputTokens,cost:c};const ms=[...messages];ms[idx]=nm;setMessages(ms);const tc=ms.filter(m=>!m.isUser).reduce((s,m)=>s+(m.cost||0),0);const tt=ms.filter(m=>!m.isUser).reduce((s,m)=>s+(m.inputTokens||0)+(m.outputTokens||0),0);setTotalCost(tc);setTotalTokens(tt);const sid=sessionId||`mac_${Date.now()}`;if(!sessionId)setSessionId(sid);autoSave(ms,sid);}catch(e){setError(e.message);}finally{setRunning(false);setCurAgent(null);}
  },[messages,agents,apiKeys,input,uploadedFiles,sessionId,autoSave]);

  // ── Orchestrator-based discussion ─────────────────────────
  const runSession=useCallback(async(userInput,existingMessages,isFollowUp)=>{
    if(!userInput.trim()||agents.length===0)return;if(!checkKeys())return;
    if(!isFollowUp){setPage("discuss");setSummary(null);setConvergence(null);}
    setRunning(true);setError(null);setCurRound(0);
    const sid=sessionId||`mac_${Date.now()}`;if(!sessionId)setSessionId(sid);
    const ctrl=new AbortController();abortRef.current=ctrl;

    try{
      const result=await runDiscussion({
        agents,rounds,
        userInput:isFollowUp?input:getFullInput(),
        apiKeys,
        enableSearch,
        existingMessages,
        isFollowUp,
        followUpText:isFollowUp?userInput:"",
        signal:ctrl.signal,
        onMessage:(msg,cost,tokens,allMsgs)=>{
          setMessages(prev=>[...prev,msg]);
          if(cost!==undefined)setTotalCost(cost);
          if(tokens!==undefined)setTotalTokens(tokens);
          if(allMsgs)autoSave(allMsgs,sid);
        },
        onStatus:(status)=>{
          if(status.type==="round")setCurRound(status.round);
          if(status.type==="agent")setCurAgent(status.agent);
          if(status.type==="convergence"){setCurAgent(null);setSummaryLoading(true);}
        },
      });

      // Set convergence results
      if(result.convergence)setConvergence(result.convergence);
      setTotalCost(result.totalCost);
      setTotalTokens(result.totalTokens);

      // Generate readable summary
      generateSummary(result.messages);

    }catch(err){if(err.name!=="AbortError")setError(err.message);}
    finally{setRunning(false);setCurAgent(null);abortRef.current=null;setSummaryLoading(false);}
  },[agents,rounds,apiKeys,input,uploadedFiles,sessionId,enableSearch,autoSave,generateSummary]);

  const handleStart=()=>{setMessages([]);setSessionId(null);setTotalCost(0);setTotalTokens(0);setSummary(null);setConvergence(null);runSession(getFullInput(),[],false);};
  const handleFollowUp=()=>{if(!followUp.trim())return;const fu=followUp;setFollowUp("");runSession(fu,messages,true);};
  const stop=()=>{abortRef.current?.abort();setRunning(false);setCurAgent(null);};
  const reset=()=>{stop();setMessages([]);setCurRound(0);setError(null);setFollowUp("");setSessionId(null);setTotalCost(0);setTotalTokens(0);setSummary(null);setConvergence(null);};

  const handleLoad=async(id)=>{const s=await loadSess(id);if(!s)return;setInput(s.input||"");setAgents(s.agents||[]);setRounds(s.rounds||1);setMessages((s.messages||[]).map(m=>({agent:{name:m.agentName,color:m.agentColor||"#666",provider:m.agentProvider,model:m.agentModel,maxTokens:m.maxTokens},agentName:m.agentName,content:m.content,round:m.round,isUser:m.isUser,inputTokens:m.inputTokens,outputTokens:m.outputTokens,cost:m.cost})));setSessionId(s.id);setSaveName(s.name||"");setTotalCost(s.totalCost||0);setTotalTokens(s.totalTokens||0);setSummary(s.summary||null);setUploadedFiles([]);setPage("discuss");};
  const handleDelete=async(id)=>{await deleteSess(id);setSessionList(await loadIndex());};
  const exportJson=()=>{dlFile(JSON.stringify({input,agents:agents.map(a=>({name:a.name,role:a.role,provider:a.provider,model:a.model,temp:a.temp,maxTokens:a.maxTokens})),rounds,messages:messages.map(m=>({agent:m.agentName,content:m.content,round:m.round,isUser:!!m.isUser,tokens:(m.inputTokens||0)+(m.outputTokens||0),cost:m.cost})),summary,totalCost,totalTokens,exportedAt:new Date().toISOString()},null,2),`mac_${Date.now()}.json`,"application/json");};
  const exportMd=()=>{let md=`# MAC Discussion\n\n**Date:** ${new Date().toLocaleString()}\n\n## Input\n\n${input}\n\n---\n\n`;for(const m of messages){md+=m.isUser?`## You\n\n${m.content}\n\n---\n\n`:`## ${m.agentName}${m.round?` (R${m.round})`:""}\n\n${m.content}\n\n---\n\n`;}if(summary)md+=`## Summary\n\n${summary}\n`;dlFile(md,`mac_${Date.now()}.md`);};
  const cc=Object.values(apiKeys).filter(Boolean).length;

  // ═══ RENDER ═══════════════════════════════════════════════════════
  return(
    <div style={{minHeight:"100vh",height:"100%",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <header style={{borderBottom:"1px solid var(--border)",padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"var(--bg)",flexShrink:0}}>
        <div style={{cursor:"pointer",display:"flex",alignItems:"baseline",gap:8}} onClick={()=>{reset();setPage("home");}}>
          <span style={{fontFamily:"var(--fd)",fontSize:20,fontWeight:700,letterSpacing:1}}>{t.brand}</span>
          <span style={{fontSize:10,color:"#c4baa8",fontFamily:"var(--fm)"}}>{t.brandFull}</span>
          {autoSaveStatus&&<span style={{fontSize:9,color:"#2d5016",fontFamily:"var(--fm)",marginLeft:6}}>✓ {autoSaveStatus}</span>}
        </div>
        <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
          {page==="discuss"&&totalTokens>0&&<span style={{fontSize:9,color:"var(--muted)",fontFamily:"var(--fm)",padding:"2px 6px",background:"#f0ede6",borderRadius:3}}>{totalTokens.toLocaleString()} {t.tokensLabel} · ${totalCost.toFixed(4)}</span>}
          <button className="bs" onClick={()=>setPage("history")} style={{padding:"3px 8px",borderRadius:4,fontSize:11}}>{t.history}{sessionList.length>0&&` (${sessionList.length})`}</button>
          <button className="bs" onClick={()=>setShowKeys(true)} style={{padding:"3px 8px",borderRadius:4,fontSize:11}}>{t.settingsBtn}{cc>0&&<span style={{color:"#2d5016",fontFamily:"var(--fm)"}}> {cc}</span>}</button>
          <button className="bs" onClick={()=>setLang(l=>l==="zh"?"en":"zh")} style={{padding:"3px 8px",borderRadius:4,fontSize:11,fontFamily:"var(--fm)"}}>{t.langSwitch}</button>
          {page!=="home"&&<button className="bs" onClick={()=>{reset();setPage("home");}} style={{padding:"3px 8px",borderRadius:4,fontSize:11}}>←</button>}
        </div>
      </header>

      {/* Main content - fills remaining height */}
      <div style={{flex:1,overflow:"auto"}}>

      {/* Modals */}
      {showKeys&&(<div className="ov" onClick={e=>{if(e.target===e.currentTarget)setShowKeys(false);}}><div style={{background:"var(--bg)",borderRadius:10,padding:"22px 26px",width:"100%",maxWidth:440,border:"1px solid var(--border)",boxShadow:"0 20px 60px rgba(44,40,32,.15)"}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h2 style={{fontSize:17,fontWeight:700,fontFamily:"var(--fd)",margin:0}}>{t.apiKeys}</h2><button onClick={()=>setShowKeys(false)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"var(--muted)"}}>×</button></div><p style={{fontSize:12,color:"var(--muted)",marginBottom:16,lineHeight:1.6}}>{t.apiDesc}</p>{Object.entries(PROVIDERS).map(([key,prov])=>(<div key={key} style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><label style={{fontSize:12,fontWeight:600,fontFamily:"var(--fd)"}}>{prov.name}</label><span style={{fontSize:10,fontFamily:"var(--fm)",color:apiKeys[key]?"#2d5016":"#c4baa8"}}>{apiKeys[key]?`✓ ${t.configured}`:t.notConfigured}</span></div><input type="password" value={apiKeys[key]} onChange={e=>setApiKeys(prev=>({...prev,[key]:e.target.value}))} placeholder={prov.placeholder} style={{width:"100%",border:"1px solid var(--border)",borderRadius:4,padding:"6px 8px",fontSize:12,fontFamily:"var(--fm)",background:"#fff"}}/></div>))}<button className="bp" onClick={()=>setShowKeys(false)} style={{width:"100%",padding:"8px",borderRadius:5,fontSize:13,marginTop:4}}>Done</button></div></div>)}
      {showSaveModal&&(<div className="ov" onClick={e=>{if(e.target===e.currentTarget)setShowSaveModal(false);}}><div style={{background:"var(--bg)",borderRadius:10,padding:"22px 26px",width:"100%",maxWidth:380,border:"1px solid var(--border)"}}><h3 style={{fontSize:15,fontWeight:700,fontFamily:"var(--fd)",margin:"0 0 14px"}}>{t.saveSession}</h3><input value={saveName} onChange={e=>setSaveName(e.target.value)} placeholder={t.sessionName} autoFocus onKeyDown={e=>{if(e.key==="Enter"){const id=sessionId||`mac_${Date.now()}`;if(!sessionId)setSessionId(id);autoSave(messages,id,saveName);setShowSaveModal(false);}}} style={{width:"100%",border:"1px solid var(--border)",borderRadius:5,padding:"7px 10px",fontSize:13,fontFamily:"var(--fb)",marginBottom:14,background:"#fff"}}/><div style={{display:"flex",gap:6,justifyContent:"flex-end"}}><button className="bs" onClick={()=>setShowSaveModal(false)} style={{padding:"5px 14px",borderRadius:5,fontSize:12}}>{t.cancel}</button><button className="bp" onClick={()=>{const id=sessionId||`mac_${Date.now()}`;if(!sessionId)setSessionId(id);autoSave(messages,id,saveName);setShowSaveModal(false);}} style={{padding:"5px 14px",borderRadius:5,fontSize:12}}>{t.save}</button></div></div></div>)}
      {showTplModal&&(<div className="ov" onClick={e=>{if(e.target===e.currentTarget)setShowTplModal(false);}}><div style={{background:"var(--bg)",borderRadius:10,padding:"22px 26px",width:"100%",maxWidth:380,border:"1px solid var(--border)"}}><h3 style={{fontSize:15,fontWeight:700,fontFamily:"var(--fd)",margin:"0 0 14px"}}>{t.saveTemplate}</h3><input value={tplName} onChange={e=>setTplName(e.target.value)} placeholder={t.templateName} autoFocus onKeyDown={e=>{if(e.key==="Enter")saveTemplate();}} style={{width:"100%",border:"1px solid var(--border)",borderRadius:5,padding:"7px 10px",fontSize:13,fontFamily:"var(--fb)",marginBottom:14,background:"#fff"}}/><div style={{display:"flex",gap:6,justifyContent:"flex-end"}}><button className="bs" onClick={()=>setShowTplModal(false)} style={{padding:"5px 14px",borderRadius:5,fontSize:12}}>{t.cancel}</button><button className="bp" onClick={saveTemplate} style={{padding:"5px 14px",borderRadius:5,fontSize:12}}>{t.save}</button></div></div></div>)}

      {/* HOME */}
      {page==="home"&&(<div className="paper-bg" style={{maxWidth:1600,margin:"0 auto",padding:"48px 20px"}}><div style={{textAlign:"center",marginBottom:40}}><h1 style={{fontSize:44,fontWeight:700,fontFamily:"var(--fd)",letterSpacing:2,marginBottom:2}}>{t.brand}</h1><div style={{fontSize:12,color:"#b0a898",fontFamily:"var(--fm)",marginBottom:6}}>{t.brandFull}</div><p style={{fontSize:13,color:"var(--muted)",maxWidth:380,margin:"0 auto",lineHeight:1.7}}>{t.scenarioDesc}</p></div><div className="scenario-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>{Object.entries(presets).map(([key,p])=>(<button key={key} className="ch" onClick={()=>selectScenario(key)} style={{padding:"18px 16px",borderRadius:8,border:"1px solid var(--border)",background:"#fff",cursor:"pointer",textAlign:"left"}}><div style={{fontSize:24,fontFamily:"var(--fd)",fontWeight:300,color:"#c4baa8",marginBottom:8}}>{p.icon}</div><div style={{fontSize:14,fontWeight:700,fontFamily:"var(--fd)",marginBottom:4}}>{p.label}</div><div style={{fontSize:11.5,color:"var(--muted)",lineHeight:1.6,marginBottom:10}}>{p.desc}</div><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{p.agents.map(a=><span key={a.id} style={{fontSize:9.5,padding:"1px 6px",borderRadius:3,background:a.color+"0d",color:a.color,fontWeight:600,fontFamily:"var(--fm)"}}>{a.name}</span>)}</div></button>))}</div><button className="ch" onClick={()=>selectScenario("custom")} style={{marginTop:10,width:"100%",padding:"14px 16px",borderRadius:8,border:"1px dashed #d5d0c5",background:"transparent",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:20,color:"#c4baa8",fontFamily:"var(--fd)"}}>+</span><div><div style={{fontSize:13,fontWeight:700,fontFamily:"var(--fd)"}}>{t.customScenario}</div><div style={{fontSize:11.5,color:"var(--muted)"}}>{t.customDesc}</div></div></button></div>)}

      {/* HISTORY */}
      {page==="history"&&(<div style={{maxWidth:1600,margin:"0 auto",padding:"28px 20px"}}><h2 style={{fontSize:18,fontWeight:700,fontFamily:"var(--fd)",marginBottom:16}}>{t.history}</h2><StorageBar count={sessionList.length} max={MAX_SESSIONS} lang={lang}/><div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}><input value={historySearch} onChange={e=>{setHistorySearch(e.target.value);if(e.target.value.length>2)doFullTextSearch(e.target.value);else setFtResults(null);}} placeholder={t.searchPlaceholder} style={{flex:1,border:"1px solid var(--border)",borderRadius:6,padding:"7px 10px",fontSize:12,fontFamily:"var(--fb)",background:"#fff",minWidth:150}}/><div style={{display:"flex",gap:4}}>{[["newest",t.sortNewest],["oldest",t.sortOldest],["name",t.sortName]].map(([k,l])=>(<button key={k} onClick={()=>setHistorySort(k)} style={{padding:"4px 10px",borderRadius:4,fontSize:11,fontFamily:"var(--fm)",border:historySort===k?"1px solid var(--accent)":"1px solid #d5d0c5",background:historySort===k?"var(--accent)":"transparent",color:historySort===k?"var(--bg)":"#5a5549",cursor:"pointer"}}>{l}</button>))}</div></div>
      {ftLoading&&<div style={{fontSize:12,color:"var(--muted)",marginBottom:12,fontStyle:"italic"}}>Searching...</div>}
      {ftResults&&ftResults.length>0&&(<div style={{marginBottom:16,padding:"12px 14px",background:"#f5f2ec",borderRadius:8,border:"1px solid var(--border)"}}><div style={{fontSize:12,fontWeight:600,fontFamily:"var(--fd)",marginBottom:8,color:"#5a5549"}}>{lang==="zh"?`在 ${ftResults.length} 个讨论中找到匹配`:`Found in ${ftResults.length} sessions`}</div>{ftResults.map(r=>(<div key={r.session.id} style={{padding:"6px 0",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:12,fontWeight:600,fontFamily:"var(--fd)"}}>{r.session.name}</div><div style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--fm)",marginTop:2}}>{r.matchCount} {lang==="zh"?"处匹配":"matches"}</div></div><button className="bp" onClick={()=>handleLoad(r.session.id)} style={{padding:"3px 10px",borderRadius:4,fontSize:11}}>{t.loadSession}</button></div>))}</div>)}
      {filteredSessions.length===0&&!ftResults&&<p style={{color:"var(--muted)",fontSize:13}}>{t.noSaved}</p>}
      {filteredSessions.map(s=>(<div key={s.id} style={{padding:"10px 14px",border:"1px solid var(--border)",borderRadius:8,marginBottom:6,background:"#fff"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,fontFamily:"var(--fd)"}}>{s.name}</div><div style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--fm)",marginTop:2}}>{new Date(s.updatedAt).toLocaleString()} · {s.msgCount||0} {t.msgCount}</div>{s.preview&&<div style={{fontSize:11,color:"#b0a898",marginTop:3,fontStyle:"italic"}}>{s.preview}...</div>}</div><div style={{display:"flex",gap:4,flexShrink:0,marginLeft:8}}><button className="bp" onClick={()=>handleLoad(s.id)} style={{padding:"4px 10px",borderRadius:4,fontSize:11}}>{t.loadSession}</button><button className="bs" onClick={()=>handleDelete(s.id)} style={{padding:"4px 8px",borderRadius:4,fontSize:11,color:"#8b2500",borderColor:"#8b250030"}}>{t.deleteSession}</button></div></div></div>))}
      <div className="dv"/><h3 style={{fontSize:15,fontWeight:700,fontFamily:"var(--fd)",marginBottom:12}}>{t.templates}</h3>{templates.length===0&&<p style={{color:"var(--muted)",fontSize:12}}>{t.noTemplates}</p>}{templates.map(tpl=>(<div key={tpl.id} style={{padding:"10px 14px",border:"1px solid var(--border)",borderRadius:8,marginBottom:6,background:"#fff",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:13,fontWeight:600,fontFamily:"var(--fd)"}}>{tpl.name}</div><div style={{display:"flex",gap:4,marginTop:4}}>{tpl.agents.map((a,i)=><span key={i} style={{fontSize:9.5,padding:"1px 6px",borderRadius:3,background:(a.color||"#666")+"0d",color:a.color||"#666",fontFamily:"var(--fm)"}}>{a.name}</span>)}</div></div><div style={{display:"flex",gap:4}}><button className="bp" onClick={()=>{applyTemplate(tpl);setPage("setup");}} style={{padding:"4px 10px",borderRadius:4,fontSize:11}}>{t.loadTemplate}</button><button className="bs" onClick={()=>deleteTemplate(tpl.id)} style={{padding:"4px 8px",borderRadius:4,fontSize:11,color:"#8b2500",borderColor:"#8b250030"}}>{t.deleteTemplate}</button></div></div>))}</div>)}

      {/* SETUP */}
      {page==="setup"&&(<div style={{maxWidth:1600,margin:"0 auto",padding:"24px 20px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}><h2 style={{fontSize:18,fontWeight:700,fontFamily:"var(--fd)",margin:0}}>{t.agents}</h2><button className="bs" onClick={()=>setShowTplModal(true)} style={{padding:"3px 10px",borderRadius:4,fontSize:11}}>{t.saveTemplate}</button></div><p style={{fontSize:11.5,color:"var(--muted)",marginBottom:14,lineHeight:1.6}}>{t.agentHint}</p>{templates.length>0&&(<div style={{marginBottom:14,display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}><span style={{fontSize:11,color:"var(--muted)"}}>{t.templates}:</span>{templates.map(tpl=><button key={tpl.id} className="bs" onClick={()=>applyTemplate(tpl)} style={{padding:"2px 8px",borderRadius:4,fontSize:10}}>{tpl.name}</button>)}</div>)}{agents.map((a,i)=><AgentEditor key={a.id} agent={a} onUpdate={u=>{const n=[...agents];n[i]=u;setAgents(n);}} onRemove={()=>agents.length>1&&setAgents(agents.filter((_,j)=>j!==i))} canRemove={agents.length>1} apiKeys={apiKeys} lang={lang}/>)}<button className="bs" onClick={addAgent} style={{padding:"6px 0",borderRadius:5,fontSize:12,width:"100%",marginBottom:20}}>+ {t.addAgent}</button><div style={{marginBottom:20}}><label style={{fontSize:13,fontWeight:600,fontFamily:"var(--fd)",display:"block",marginBottom:6}}>{t.rounds}</label><div style={{display:"flex",gap:5,alignItems:"center"}}>{[1,2,3,5].map(n=><button key={n} onClick={()=>setRounds(n)} style={{padding:"4px 14px",borderRadius:4,fontSize:12,fontFamily:"var(--fm)",cursor:"pointer",border:rounds===n?"2px solid var(--accent)":"1px solid #d5d0c5",background:rounds===n?"var(--accent)":"transparent",color:rounds===n?"var(--bg)":"#5a5549"}}>{n}</button>)}<span style={{fontSize:11,color:"#b0a898",marginLeft:4}}>{t.roundsHint}</span></div></div><div style={{marginBottom:20,display:"flex",alignItems:"center",gap:8}}><label style={{fontSize:13,fontWeight:600,fontFamily:"var(--fd)",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}><input type="checkbox" checked={enableSearch} onChange={e=>setEnableSearch(e.target.checked)} style={{accentColor:"var(--accent)"}}/>{lang==="zh"?"启用 arXiv 文献搜索":"Enable arXiv search"}</label><span style={{fontSize:10,color:"var(--muted)"}}>{lang==="zh"?"Agent 可自主搜索论文来支撑观点":"Agents can search papers to support arguments"}</span></div><div style={{marginBottom:14}}><div className={`dz${dragOver?" active":""}`} onDrop={e=>{e.preventDefault();setDragOver(false);if(e.dataTransfer.files.length)handleFiles(Array.from(e.dataTransfer.files));}} onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onClick={()=>fileInputRef.current?.click()}><input ref={fileInputRef} type="file" multiple accept=".pdf,.txt,.md,.tex,.csv" style={{display:"none"}} onChange={e=>{if(e.target.files.length)handleFiles(Array.from(e.target.files));e.target.value="";}}/><div style={{fontSize:12,color:"var(--muted)"}}>{t.uploadHint}</div></div>{uploadedFiles.length>0&&<div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:4}}>{uploadedFiles.map((f,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:5,background:"#f0ede6",fontSize:10,fontFamily:"var(--fm)"}}><span>{f.name}</span><button onClick={()=>setUploadedFiles(prev=>prev.filter((_,j)=>j!==i))} style={{background:"none",border:"none",cursor:"pointer",color:"#c4baa8",fontSize:13,lineHeight:1}}>×</button></div>)}</div>}</div><textarea value={input} onChange={e=>setInput(e.target.value)} placeholder={t.inputPlaceholder} rows={6} style={{width:"100%",border:"1px solid var(--border)",borderRadius:5,padding:"12px 14px",fontSize:13,lineHeight:1.8,fontFamily:"var(--fb)",background:"#fff",resize:"vertical",marginBottom:8}}/><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:11,color:"#c4baa8",fontFamily:"var(--fm)"}}>{input.length>0?`${input.length} ${t.chars}`:""}</span><button className="bp" onClick={handleStart} disabled={(!input.trim()&&uploadedFiles.length===0)||agents.length===0} style={{padding:"8px 24px",borderRadius:5,fontSize:13}}>{t.startBtn} →</button></div></div>)}

      {/* DISCUSS */}
      {page==="discuss"&&(<div style={{maxWidth:1600,margin:"0 auto",padding:"24px 20px 130px"}}>{charLimitWarn&&<div style={{marginBottom:12,padding:"8px 12px",borderRadius:6,fontSize:11,background:"#8b69140a",border:"1px solid #8b691420",color:"#8b6914"}}>{t.charLimit}</div>}{running&&(<div style={{marginBottom:20}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--muted)",fontFamily:"var(--fm)",marginBottom:4}}><span>{t.progress}</span><span>R{curRound}/{rounds}</span></div><div style={{height:2,background:"var(--border)",borderRadius:1,overflow:"hidden"}}><div style={{height:"100%",background:"var(--accent)",width:`${Math.min(100,((messages.filter(m=>!m.isUser).length%(agents.length*rounds))/(agents.length*rounds))*100)}%`,transition:"width .5s"}}/></div><div style={{textAlign:"right",marginTop:4}}><button className="bs" onClick={stop} style={{padding:"2px 10px",borderRadius:4,fontSize:11,color:"#8b2500",borderColor:"#8b250040"}}>■ {t.stopBtn}</button></div></div>)}{error&&<div style={{marginBottom:14,padding:"8px 12px",borderRadius:5,fontSize:12,background:"#8b25000a",border:"1px solid #8b250020",color:"#8b2500"}}>{error}</div>}<div ref={scrollRef}>{messages.map((m,i)=><MsgBubble key={i} msg={m} rounds={rounds} lang={lang} running={running} onCopy={txt=>navigator.clipboard.writeText(txt)} onRegen={handleRegen}/>)}{running&&curAgent&&(<div className="me" style={{display:"flex",gap:12,alignItems:"center",padding:"6px 0"}}><div style={{width:30,height:30,borderRadius:"50%",background:curAgent.color,color:"#faf8f4",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,fontFamily:"var(--fd)"}}>{curAgent.name[0].toUpperCase()}</div><span style={{fontWeight:600,fontSize:13,color:curAgent.color,fontFamily:"var(--fd)"}}>{curAgent.name}</span><span className="tp" style={{fontSize:12,color:"var(--muted)",fontStyle:"italic"}}>{t.thinking}</span></div>)}{summaryLoading&&<div className="me" style={{padding:"14px 18px",background:"#f5f2ec",borderRadius:8,marginTop:12}}><span className="tp" style={{fontSize:12,color:"var(--muted)",fontFamily:"var(--fm)",fontStyle:"italic"}}>{t.summaryGenerating}</span></div>}{summary&&!summaryLoading&&<div className="me" style={{padding:"16px 18px",background:"#f5f2ec",borderRadius:8,marginTop:12,border:"1px solid var(--border)"}}><div style={{fontSize:13,fontWeight:700,fontFamily:"var(--fd)",marginBottom:8}}>{t.summaryTitle}</div><div style={{fontSize:12,lineHeight:1.8,whiteSpace:"pre-wrap",fontFamily:"var(--fb)"}}>{summary}</div></div>}{convergence&&<div className="me" style={{padding:"14px 18px",background:"#f0ede6",borderRadius:8,marginTop:8,border:"1px solid var(--border)"}}><div style={{fontSize:12,fontWeight:700,fontFamily:"var(--fd)",marginBottom:6}}>{lang==="zh"?"收敛评估":"Convergence Assessment"} — <span style={{color:convergence.convergenceLevel==="high"?"#2d5016":convergence.convergenceLevel==="medium"?"#8b6914":"#8b2500"}}>{convergence.convergenceLevel}</span></div>{convergence.consensusPoints?.length>0&&<div style={{marginBottom:6}}><span style={{fontSize:11,fontWeight:600,color:"#2d5016"}}>✓ {lang==="zh"?"共识":"Consensus"}:</span>{convergence.consensusPoints.map((p,i)=><div key={i} style={{fontSize:11,color:"#5a5549",marginLeft:12,lineHeight:1.6}}>• {p}</div>)}</div>}{convergence.disagreements?.length>0&&<div style={{marginBottom:6}}><span style={{fontSize:11,fontWeight:600,color:"#8b2500"}}>✗ {lang==="zh"?"分歧":"Disagreements"}:</span>{convergence.disagreements.map((p,i)=><div key={i} style={{fontSize:11,color:"#5a5549",marginLeft:12,lineHeight:1.6}}>• {p}</div>)}</div>}{convergence.openQuestions?.length>0&&<div style={{marginBottom:6}}><span style={{fontSize:11,fontWeight:600,color:"#8b6914"}}>? {lang==="zh"?"待解决":"Open"}:</span>{convergence.openQuestions.map((p,i)=><div key={i} style={{fontSize:11,color:"#5a5549",marginLeft:12,lineHeight:1.6}}>• {p}</div>)}</div>}{convergence.recommendation&&<div style={{fontSize:11,color:"var(--muted)",fontStyle:"italic",marginTop:4}}>{convergence.recommendation}</div>}</div>}</div>{!running&&messages.length>0&&(<div><div className="dv"/><div style={{textAlign:"center",padding:"2px 0 14px"}}><div style={{fontSize:13,fontWeight:600,fontFamily:"var(--fd)",marginBottom:2}}>{t.discussionDone}</div><div style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--fm)",marginBottom:3}}>{messages.filter(m=>!m.isUser).length} {t.replies}{totalTokens>0&&` · ${totalTokens.toLocaleString()} ${t.tokensLabel} · ${t.costLabel} $${totalCost.toFixed(4)}`}</div><div style={{fontSize:11,color:"#b0a898",fontStyle:"italic",marginBottom:12}}>{t.continueHint}</div><div style={{display:"flex",gap:5,justifyContent:"center",flexWrap:"wrap",marginBottom:16}}><button className="bs" onClick={()=>{const txt=messages.filter(m=>!m.isUser).map(m=>`## ${m.agentName}${m.round?` (R${m.round})`:""}\n\n${m.content}`).join("\n\n---\n\n")+(summary?`\n\n---\n\n## Summary\n\n${summary}`:"");navigator.clipboard.writeText(txt);}} style={{padding:"4px 10px",borderRadius:4,fontSize:11}}>{t.copyBtn}</button><button className="bs" onClick={()=>setShowSaveModal(true)} style={{padding:"4px 10px",borderRadius:4,fontSize:11}}>{t.saveSession}</button><button className="bs" onClick={exportJson} style={{padding:"4px 10px",borderRadius:4,fontSize:11}}>{t.exportJson}</button><button className="bs" onClick={exportMd} style={{padding:"4px 10px",borderRadius:4,fontSize:11}}>{t.exportMd}</button><button className="bs" onClick={()=>{setPage("setup");reset();}} style={{padding:"4px 10px",borderRadius:4,fontSize:11}}>← {t.editConfig}</button><button className="bp" onClick={()=>{reset();handleStart();}} style={{padding:"4px 10px",borderRadius:4,fontSize:11}}>{t.rerunBtn}</button></div></div><div style={{display:"flex",gap:6,alignItems:"flex-end"}}><textarea value={followUp} onChange={e=>setFollowUp(e.target.value)} placeholder={t.followUpPlaceholder} rows={2} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleFollowUp();}}} className="fi" style={{flex:1,border:"1px solid var(--border)",borderRadius:7,padding:"9px 12px",fontSize:13,lineHeight:1.7,fontFamily:"var(--fb)",background:"#fff",resize:"none"}}/><button className="bp" onClick={handleFollowUp} disabled={!followUp.trim()} style={{padding:"9px 16px",borderRadius:7,fontSize:12,flexShrink:0,height:48}}>{t.followUpBtn} →</button></div></div>)}</div>)}

      </div>{/* end main content */}
    </div>
  );
}
