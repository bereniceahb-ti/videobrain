"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {Camera,Link2,ImagePlus,Sparkles,Library,Search,Brain,Clock3,X,CheckCircle2,LoaderCircle,ExternalLink,AlertCircle,Trash2,ArrowLeft,Cloud,LogIn,LogOut} from "lucide-react";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";

type Shot={id:string,name:string,url:string,file:File};
type Candidate={youtubeId:string;title:string;channel:string;thumbnail:string;url:string;rank:number};
type Result={detected:{title:string;channel?:string;duration?:string;confidence?:number};candidates:Candidate[]};
type Choice="want"|"known"|"discard";
type SummaryStatus="pending"|"processing"|"ready"|"failed";
type SavedVideo=Candidate&{status:Choice;savedAt:string;cloudId?:string;summaryShort?:string;summaryFull?:string;keyPoints?:string[];applications?:string[];category?:string;tags?:string[];summaryStatus?:SummaryStatus;summaryError?:string};

const STORAGE_KEY="videobrain-library-v1";

export default function Home(){
 const input=useRef<HTMLInputElement>(null);
 const supabase=useMemo(()=>createSupabaseBrowserClient(),[]);
 const [shots,setShots]=useState<Shot[]>([]),[links,setLinks]=useState(""),[busy,setBusy]=useState(false),[linkBusy,setLinkBusy]=useState(false),[error,setError]=useState(""),[results,setResults]=useState<Result[]>([]),[resultSource,setResultSource]=useState<"prints"|"links">("prints"),[selected,setSelected]=useState<Record<number,string>>({}),[choices,setChoices]=useState<Record<number,Choice>>({}),[library,setLibrary]=useState<SavedVideo[]>([]),[view,setView]=useState<"home"|"library">("home"),[savedMsg,setSavedMsg]=useState("");
 const [authOpen,setAuthOpen]=useState(false),[authMode,setAuthMode]=useState<"login"|"signup">("login"),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[authMsg,setAuthMsg]=useState(""),[authBusy,setAuthBusy]=useState(false),[userId,setUserId]=useState<string|null>(null),[userEmail,setUserEmail]=useState<string|null>(null),[syncing,setSyncing]=useState(false);
 const [summaryBusy,setSummaryBusy]=useState<Record<string,boolean>>({}),[expanded,setExpanded]=useState<Record<string,boolean>>({}),[notionBusy,setNotionBusy]=useState<Record<string,boolean>>({}),[notionMsg,setNotionMsg]=useState<Record<string,string>>({});
 const [librarySearch,setLibrarySearch]=useState(""),[videoFilter,setVideoFilter]=useState<"all"|"want"|"known">("all"),[summaryFilter,setSummaryFilter]=useState<"all"|SummaryStatus>("all"),[categoryFilter,setCategoryFilter]=useState("all");

 const persistLocal=(items:SavedVideo[])=>{setLibrary(items);try{localStorage.setItem(STORAGE_KEY,JSON.stringify(items));}catch{}};
 const patchLocal=(youtubeId:string,patch:Partial<SavedVideo>)=>{setLibrary(current=>{const next=current.map(v=>v.youtubeId===youtubeId?{...v,...patch}:v);try{localStorage.setItem(STORAGE_KEY,JSON.stringify(next));}catch{}return next;});};
 const dbStatus=(s:Choice)=>s==="known"?"ja_conheco":"quero_este";
 const uiStatus=(s:string):Choice=>s==="ja_conheco"?"known":"want";
 const strings=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==="string"):[];
 const rowToSaved=(r:any):SavedVideo=>({youtubeId:r.youtube_id,title:r.title,channel:r.channel||"",thumbnail:r.thumbnail_url||"",url:r.youtube_url,rank:1,status:uiStatus(r.status),savedAt:r.created_at,cloudId:r.id,summaryShort:r.summary_short||"",summaryFull:r.summary_full||"",keyPoints:strings(r.key_points),applications:strings(r.applications),category:r.category||"",tags:strings(r.tags),summaryStatus:(r.summary_status||"pending") as SummaryStatus,summaryError:r.summary_error||""});

 const loadCloud=async(uid:string)=>{
  if(!supabase)return;
  const {data,error}=await supabase.from("videos").select("id,youtube_id,youtube_url,title,channel,thumbnail_url,status,category,tags,summary_short,summary_full,key_points,applications,summary_status,summary_error,created_at").eq("user_id",uid).order("created_at",{ascending:false});
  if(error){setSavedMsg("Não consegui carregar a biblioteca da nuvem.");return;}
  persistLocal((data||[]).map(rowToSaved));
 };

 const migrateLocalAndLoad=async(uid:string)=>{
  if(!supabase)return;
  setSyncing(true);
  try{
   let local:SavedVideo[]=[];
   try{const raw=localStorage.getItem(STORAGE_KEY);if(raw)local=JSON.parse(raw);}catch{}
   if(local.length){
    const rows=local.filter(v=>v.status!=="discard").map(v=>({user_id:uid,youtube_id:v.youtubeId,youtube_url:v.url,title:v.title,channel:v.channel,thumbnail_url:v.thumbnail,status:dbStatus(v.status)}));
    if(rows.length)await supabase.from("videos").upsert(rows,{onConflict:"user_id,youtube_id"});
   }
   await loadCloud(uid);
  }finally{setSyncing(false)}
 };

 useEffect(()=>{
  try{const raw=localStorage.getItem(STORAGE_KEY);if(raw)setLibrary(JSON.parse(raw));}catch{}
  if(!supabase)return;
  supabase.auth.getSession().then(({data})=>{const u=data.session?.user;if(u){setUserId(u.id);setUserEmail(u.email||null);migrateLocalAndLoad(u.id);}});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{const u=session?.user;if(u){setUserId(u.id);setUserEmail(u.email||null);migrateLocalAndLoad(u.id);}else{setUserId(null);setUserEmail(null);}});
  return()=>subscription.unsubscribe();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[supabase]);

 const syncNotion=async(videoId:string,youtubeId:string,showMessage=true)=>{
  if(!supabase||!userId)return false;
  setNotionBusy(s=>({...s,[youtubeId]:true}));
  if(showMessage)setNotionMsg(s=>({...s,[youtubeId]:""}));
  try{
   const {data:{session}}=await supabase.auth.getSession();
   if(!session?.access_token)throw new Error("Sua sessão expirou. Entre novamente.");
   const res=await fetch("/api/notion-sync",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({videoId})});
   const data=await res.json();
   if(!res.ok)throw new Error(data.error||"Não consegui sincronizar com o Notion.");
   if(showMessage)setNotionMsg(s=>({...s,[youtubeId]:data.action==="updated"?"Atualizado no Notion ✓":"Enviado ao Notion ✓"}));
   return true;
  }catch(e){if(showMessage)setNotionMsg(s=>({...s,[youtubeId]:e instanceof Error?e.message:"Falha ao sincronizar com o Notion."}));return false;}
  finally{setNotionBusy(s=>({...s,[youtubeId]:false}));}
 };

 const requestSummary=async(videoId:string,youtubeId:string,reload=true)=>{
  if(!supabase||!userId)return false;
  setSummaryBusy(s=>({...s,[youtubeId]:true}));
  patchLocal(youtubeId,{summaryStatus:"processing",summaryError:""});
  try{
   const {data:{session}}=await supabase.auth.getSession();
   if(!session?.access_token)throw new Error("Sua sessão expirou. Entre novamente.");
   const res=await fetch("/api/summarize",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({videoId})});
   const data=await res.json();
   if(!res.ok)throw new Error(data.error||"Não consegui resumir este vídeo.");
   if(data.notion?.ok)setNotionMsg(s=>({...s,[youtubeId]:"Sincronizado automaticamente com o Notion ✓"}));
   else if(data.notion?.error)setNotionMsg(s=>({...s,[youtubeId]:"Resumo pronto, mas o Notion não sincronizou. Use o botão N para tentar novamente."}));
   if(reload)await loadCloud(userId);
   setExpanded(e=>({...e,[youtubeId]:true}));
   return true;
  }catch(e){patchLocal(youtubeId,{summaryStatus:"failed",summaryError:e instanceof Error?e.message:"Falha ao gerar resumo."});return false;}
  finally{setSummaryBusy(s=>({...s,[youtubeId]:false}));}
 };

 const seedResults=(items:Result[],source:"prints"|"links")=>{
  setResults(items);setResultSource(source);
  const auto:Record<number,string>={};const ch:Record<number,Choice>={};
  items.forEach((r,i)=>{if(r.candidates?.[0]){auto[i]=r.candidates[0].youtubeId;ch[i]="want";}});
  setSelected(auto);setChoices(ch);
 };

 const add=(files:FileList|null)=>{if(!files)return;const next=[...files].filter(f=>f.type.startsWith("image/")).slice(0,8).map(f=>({id:crypto.randomUUID(),name:f.name,url:URL.createObjectURL(f),file:f}));setShots(s=>[...s,...next].slice(0,8));};
 const remove=(id:string)=>setShots(s=>s.filter(x=>x.id!==id));
 const identify=async()=>{if(!shots.length)return;setBusy(true);setError("");setResults([]);setSavedMsg("");try{const fd=new FormData();shots.forEach(s=>fd.append("images",s.file));const res=await fetch("/api/identify",{method:"POST",body:fd});const data=await res.json();if(!res.ok)throw new Error(data.error||"Não consegui analisar os prints.");seedResults(data.results||[],"prints");}catch(e){setError(e instanceof Error?e.message:"Algo deu errado.");}finally{setBusy(false)}};
 const addLinks=async()=>{if(!links.trim())return;setLinkBusy(true);setError("");setSavedMsg("");setResults([]);try{const res=await fetch("/api/links",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:links})});const data=await res.json();if(!res.ok)throw new Error(data.error||"Não consegui importar esses links.");seedResults(data.results||[],"links");const ignored=(data.invalid?.length||0)+(data.notFound?.length||0);setSavedMsg(ignored?`${data.results?.length||0} vídeo(s) encontrado(s) · ${ignored} link(s) não puderam ser importados.`:`${data.results?.length||0} vídeo(s) encontrado(s) pelos links.`);}catch(e){setError(e instanceof Error?e.message:"Não consegui importar os links.");}finally{setLinkBusy(false)}};

 const saveLibrary=async()=>{
  const picked:SavedVideo[]=[];
  results.forEach((r,i)=>{const id=selected[i],status=choices[i];if(!id||!status||status==="discard")return;const c=r.candidates.find(x=>x.youtubeId===id);if(c)picked.push({...c,status,savedAt:new Date().toISOString()});});
  if(!picked.length){setSavedMsg("Nenhum vídeo marcado para salvar.");return;}
  const next=[...library];let added=0,updated=0;
  picked.forEach(item=>{const idx=next.findIndex(x=>x.youtubeId===item.youtubeId);if(idx>=0){next[idx]={...next[idx],...item};updated++;}else{next.unshift(item);added++;}});
  persistLocal(next);
  if(userId&&supabase){
   setSyncing(true);
   const rows=picked.map(v=>({user_id:userId,youtube_id:v.youtubeId,youtube_url:v.url,title:v.title,channel:v.channel,thumbnail_url:v.thumbnail,status:dbStatus(v.status)}));
   const {data:savedRows,error}=await supabase.from("videos").upsert(rows,{onConflict:"user_id,youtube_id"}).select("id,youtube_id,summary_status,summary_short");
   setSyncing(false);
   if(error){setSavedMsg("Salvei neste aparelho, mas a sincronização falhou. Tente novamente.");return;}
   await loadCloud(userId);
   const pending=(savedRows||[]).filter((r:any)=>r.summary_status==="pending"&&!r.summary_short);
   setSavedMsg(`${added} novo(s) salvo(s) na nuvem${updated?` · ${updated} atualizado(s)`:""}${pending.length?" · preparando resumo…":""}.`);
   if(pending.length)void(async()=>{for(const r of pending)await requestSummary(r.id,r.youtube_id,false);await loadCloud(userId);})();
  }else{
   setSavedMsg(`${added} novo(s) salvo(s) neste aparelho${updated?` · ${updated} atualizado(s)`:""}. Entre para sincronizar e gerar resumos.`);
  }
 };

 const removeSaved=async(id:string)=>{
  const target=library.find(v=>v.youtubeId===id);
  persistLocal(library.filter(v=>v.youtubeId!==id));
  if(userId&&supabase&&target?.cloudId)await supabase.from("videos").delete().eq("id",target.cloudId).eq("user_id",userId);
 };
 const statusLabel=(s:Choice)=>s==="want"?"Quero este":s==="known"?"Já conheço":"Descartar";
 const summaryLabel=(s?:SummaryStatus)=>s==="ready"?"Resumo pronto":s==="processing"?"Resumindo…":s==="failed"?"Falhou":"Resumo pendente";
 const categories=useMemo(()=>Array.from(new Set(library.map(v=>v.category).filter((x):x is string=>Boolean(x)))).sort((a,b)=>a.localeCompare(b,"pt-BR")),[library]);
 const filteredLibrary=useMemo(()=>{const q=librarySearch.trim().toLocaleLowerCase("pt-BR");return library.filter(v=>{const searchText=[v.title,v.channel,v.summaryShort,v.summaryFull,v.category,...(v.tags||[]),...(v.keyPoints||[]),...(v.applications||[])].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");const matchesSearch=!q||searchText.includes(q);const matchesVideo=videoFilter==="all"||(videoFilter==="want"?v.status==="want":v.status==="known");const status=v.summaryStatus||"pending";const matchesSummary=summaryFilter==="all"||status===summaryFilter;const matchesCategory=categoryFilter==="all"||v.category===categoryFilter;return matchesSearch&&matchesVideo&&matchesSummary&&matchesCategory;});},[library,librarySearch,videoFilter,summaryFilter,categoryFilter]);
 const clearLibraryFilters=()=>{setLibrarySearch("");setVideoFilter("all");setSummaryFilter("all");setCategoryFilter("all");};

 const submitAuth=async()=>{
  if(!supabase){setAuthMsg("A conexão com o Supabase ainda não foi configurada na Vercel.");return;}
  if(!email||password.length<6){setAuthMsg("Informe seu e-mail e uma senha com pelo menos 6 caracteres.");return;}
  setAuthBusy(true);setAuthMsg("");
  if(authMode==="login"){
   const {data,error}=await supabase.auth.signInWithPassword({email,password});
   if(error)setAuthMsg("Não consegui entrar. Confira e-mail e senha.");
   else if(data.user){setAuthOpen(false);setPassword("");}
  }else{
   const redirectTo=typeof window!=="undefined"?window.location.origin:undefined;
   const {data,error}=await supabase.auth.signUp({email,password,options:redirectTo?{emailRedirectTo:redirectTo}:undefined});
   if(error)setAuthMsg(error.message);
   else if(data.session){setAuthOpen(false);setPassword("");}
   else setAuthMsg("Conta criada. Confira seu e-mail para confirmar o cadastro e depois entre no VideoBrain.");
  }
  setAuthBusy(false);
 };
 const signOut=async()=>{if(supabase)await supabase.auth.signOut();setUserId(null);setUserEmail(null);setSavedMsg("Você saiu da conta. A biblioteca deste aparelho continua disponível.");};

 const accountControls=<div className="accountControls">{userId?<><span className="syncChip"><Cloud size={14}/>{syncing?"Sincronizando...":userEmail||"Sincronizado"}</span><button className="authButton" onClick={signOut} title="Sair"><LogOut size={16}/><span>Sair</span></button></>:<button className="authButton" onClick={()=>{setAuthMode("login");setAuthOpen(true);setAuthMsg("")}}><LogIn size={16}/> Entrar</button>}</div>;

 const authModal=<div className="modalBackdrop" onMouseDown={()=>setAuthOpen(false)}><div className="authModal" onMouseDown={e=>e.stopPropagation()}><button className="modalClose" onClick={()=>setAuthOpen(false)}><X size={18}/></button><div className="logo"><Brain size={23}/></div><h2>{authMode==="login"?"Entrar no VideoBrain":"Criar sua conta"}</h2><p>Sincronize sua biblioteca entre celular e computador.</p><label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@email.com" autoComplete="email"/></label><label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="mínimo 6 caracteres" autoComplete={authMode==="login"?"current-password":"new-password"}/></label>{authMsg&&<div className="authMsg">{authMsg}</div>}<button className="primary authSubmit" onClick={submitAuth} disabled={authBusy}>{authBusy?<><LoaderCircle className="spin" size={17}/> Aguarde...</>:authMode==="login"?"Entrar":"Criar conta"}</button><button className="authSwitch" onClick={()=>{setAuthMode(m=>m==="login"?"signup":"login");setAuthMsg("")}}>{authMode==="login"?"Ainda não tenho conta":"Já tenho uma conta"}</button></div></div>;

 if(view==="library")return <main><header><div className="brand"><div className="logo"><Brain size={25}/></div><div><b>VideoBrain</b><span>Sua biblioteca inteligente do YouTube</span></div></div><div className="headerActions">{accountControls}<button className="library" onClick={()=>setView("home")}><ArrowLeft size={18}/> Voltar</button></div></header><section className="libraryPage"><div className="libraryTitle"><div><span className="eyebrow"><Library size={15}/> Minha biblioteca</span><h1>Seus vídeos salvos</h1><p>{library.length} vídeo(s) {userId?"sincronizado(s) na sua conta":"guardado(s) neste navegador"}.</p></div></div>{library.length===0?<div className="emptyLib"><Library size={34}/><b>Sua biblioteca ainda está vazia.</b><p>Volte, identifique um print ou cole um link e salve seus primeiros vídeos.</p><button onClick={()=>setView("home")}>Adicionar vídeos</button></div>:<><div className="libraryTools"><div className="librarySearch"><Search size={18}/><input value={librarySearch} onChange={e=>setLibrarySearch(e.target.value)} placeholder="Buscar por título, canal, tema, tag ou conteúdo do resumo..."/>{librarySearch&&<button onClick={()=>setLibrarySearch("")} aria-label="Limpar busca"><X size={16}/></button>}</div><div className="filterRow"><label><span>Vídeos</span><select value={videoFilter} onChange={e=>setVideoFilter(e.target.value as "all"|"want"|"known")}><option value="all">Todos</option><option value="want">Quero este</option><option value="known">Já conheço</option></select></label><label><span>Resumo</span><select value={summaryFilter} onChange={e=>setSummaryFilter(e.target.value as "all"|SummaryStatus)}><option value="all">Todos</option><option value="ready">Pronto</option><option value="pending">Pendente</option><option value="processing">Resumindo</option><option value="failed">Falhou</option></select></label><label><span>Categoria</span><select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="all">Todas</option>{categories.map(cat=><option key={cat} value={cat}>{cat}</option>)}</select></label><button className="clearFilters" onClick={clearLibraryFilters}>Limpar filtros</button></div><div className="filterCount"><b>{filteredLibrary.length}</b> de {library.length} vídeo(s)</div></div>{filteredLibrary.length===0?<div className="emptyLib filtered"><Search size={30}/><b>Nenhum vídeo encontrado.</b><p>Tente outro termo ou limpe os filtros.</p><button onClick={clearLibraryFilters}>Limpar filtros</button></div>:<div className="libraryGrid">{filteredLibrary.map(v=><article className="libraryCard" key={v.youtubeId}><img src={v.thumbnail} alt=""/><div className="libraryCardBody"><div className="badgeRow"><span className={v.status==="known"?"status known":"status want"}>{statusLabel(v.status)}</span>{userId&&<span className={`summaryStatus ${v.summaryStatus||"pending"}`}>{summaryLabel(v.summaryStatus)}</span>}</div><b>{v.title}</b><small>{v.channel}</small>{v.summaryStatus==="ready"&&v.summaryShort?<div className="summaryBox"><strong>Resumo</strong><p>{v.summaryShort}</p><button className="summaryToggle" onClick={()=>setExpanded(e=>({...e,[v.youtubeId]:!e[v.youtubeId]}))}>{expanded[v.youtubeId]?"Ocultar detalhes":"Ver resumo completo"}</button>{expanded[v.youtubeId]&&<div className="summaryDetails">{v.category&&<div className="summaryCategory">{v.category}</div>}<p className="fullSummary">{v.summaryFull}</p>{(v.keyPoints?.length||0)>0&&<><h4>Pontos principais</h4><ul>{v.keyPoints!.map((p,i)=><li key={i}>{p}</li>)}</ul></>}{(v.applications?.length||0)>0&&<><h4>Aplicações práticas</h4><ul>{v.applications!.map((p,i)=><li key={i}>{p}</li>)}</ul></>}{(v.tags?.length||0)>0&&<div className="tagRow">{v.tags!.map(t=><span key={t}>#{t}</span>)}</div>}</div>}</div>:userId?<div className={`summaryBox compact ${v.summaryStatus||"pending"}`}>{v.summaryStatus==="processing"||summaryBusy[v.youtubeId]?<><LoaderCircle className="spin" size={16}/><span>Assistindo e resumindo o vídeo…</span></>:<><span>{v.summaryStatus==="failed"?(v.summaryError||"Não consegui resumir este vídeo."):"Este vídeo ainda não tem resumo."}</span>{v.cloudId&&<button className="summaryButton" onClick={()=>requestSummary(v.cloudId!,v.youtubeId)}>{v.summaryStatus==="failed"?"Tentar novamente":"Gerar resumo"}</button>}</>}</div>:<div className="summaryBox compact"><span>Entre na conta para gerar o resumo com IA.</span></div>}{notionMsg[v.youtubeId]&&<div className="notionMsg">{notionMsg[v.youtubeId]}</div>}<div className="cardActions"><a href={v.url} target="_blank" rel="noreferrer">YouTube <ExternalLink size={12}/></a><div className="cardRight">{v.summaryStatus==="ready"&&v.cloudId&&<><button className="notionButton" onClick={()=>syncNotion(v.cloudId!,v.youtubeId)} title="Enviar ou atualizar no Notion" disabled={notionBusy[v.youtubeId]}>{notionBusy[v.youtubeId]?<LoaderCircle className="spin" size={14}/>:<span className="notionMark">N</span>}</button><button className="regenButton" onClick={()=>requestSummary(v.cloudId!,v.youtubeId)} title="Gerar resumo novamente"><Sparkles size={14}/></button></>}<button onClick={()=>removeSaved(v.youtubeId)} aria-label="Remover"><Trash2 size={14}/></button></div></div></div></article>)}</div>}</>}</section><footer>VideoBrain <span>•</span> Sua biblioteca pessoal de aprendizagem.</footer>{authOpen&&authModal}</main>;

 return <main>
  <header><div className="brand"><div className="logo"><Brain size={25}/></div><div><b>VideoBrain</b><span>Sua biblioteca inteligente do YouTube</span></div></div><div className="headerActions">{accountControls}<button className="library" onClick={()=>setView("library")}><Library size={18}/> Minha biblioteca {library.length>0&&<strong>{library.length}</strong>}</button></div></header>
  <section className="hero"><div className="eyebrow"><Sparkles size={15}/> Menos vídeos acumulados. Mais conhecimento.</div><h1>O que você salvou no YouTube<br/><em>pode finalmente trabalhar por você.</em></h1><p>Envie prints da sua lista ou cole links. O VideoBrain identifica os vídeos e deixa você confirmar antes de salvar.</p></section>
  <section className="panel"><div className="tabs"><button className="active"><Camera size={17}/> Prints</button><button><Link2 size={17}/> Links</button></div>
   <div className="drop" onClick={()=>input.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();add(e.dataTransfer.files)}}><input ref={input} hidden multiple type="file" accept="image/*" onChange={e=>add(e.target.files)}/><div className="dropIcon"><ImagePlus/></div><h2>Adicione seus prints do YouTube</h2><p>Arraste imagens para cá ou toque para escolher da galeria.</p><small>Até 8 prints por análise · PNG, JPG ou WEBP</small><button>Escolher prints</button></div>
   {shots.length>0&&<div className="preview"><div className="previewHead"><b>{shots.length} {shots.length===1?"print selecionado":"prints selecionados"}</b><button onClick={()=>{setShots([]);setResults([]);setSavedMsg("")}}>Limpar</button></div><div className="shots">{shots.map(s=><div className="shot" key={s.id}><img src={s.url} alt={s.name}/><button aria-label="Remover" onClick={()=>remove(s.id)}><X size={15}/></button></div>)}</div><button className="primary" disabled={busy} onClick={identify}>{busy?<><LoaderCircle className="spin" size={18}/> Lendo prints e procurando vídeos...</>:<><Sparkles size={18}/> Identificar vídeos nos prints</>}</button><p className="privacy">Os prints são analisados para identificar os vídeos. Você confirma os resultados antes de salvar.</p></div>}
   {error&&<div className="error"><AlertCircle size={18}/><span><b>Não consegui concluir a análise.</b><br/>{error}</span></div>}
   {results.length>0&&<section className="found"><div className="foundHead"><div><b>{results.length} vídeos identificados</b><span>Confira o vídeo e diga o que fazer com cada um.</span></div><CheckCircle2/></div>{results.map((r,i)=><article className="match" key={i}><div className="read"><small>{resultSource==="links"?"Recebi pelo link":"Li no print"}</small><b>{r.detected.title}</b>{r.detected.channel&&<span>{r.detected.channel}</span>}</div>{r.candidates.length?<><div className="candidates">{r.candidates.map(c=><label className={selected[i]===c.youtubeId?"candidate chosen":"candidate"} key={c.youtubeId}><input type="radio" name={"video-"+i} checked={selected[i]===c.youtubeId} onChange={()=>setSelected(s=>({...s,[i]:c.youtubeId}))}/><img src={c.thumbnail} alt=""/><div><b>{c.title}</b><span>{c.channel}</span><a href={c.url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}>Abrir no YouTube <ExternalLink size={12}/></a></div></label>)}</div><div className="choiceRow"><button className={choices[i]==="want"?"choice active":"choice"} onClick={()=>setChoices(s=>({...s,[i]:"want"}))}>Quero este</button><button className={choices[i]==="known"?"choice active":"choice"} onClick={()=>setChoices(s=>({...s,[i]:"known"}))}>Já conheço</button><button className={choices[i]==="discard"?"choice discard active":"choice discard"} onClick={()=>setChoices(s=>({...s,[i]:"discard"}))}>Descartar</button></div></>:<p className="none">Não encontrei um candidato confiável para este título.</p>}</article>)}
    {savedMsg&&<div className="savedMsg"><CheckCircle2 size={17}/>{savedMsg}</div>}
    <div className="confirmBar"><span><b>{Object.values(choices).filter(x=>x!=="discard").length}</b> para salvar {userId&&<small>· na nuvem + resumo automático</small>}</span><button className="saveButton" onClick={saveLibrary} disabled={syncing}>{syncing?"Sincronizando...":"Salvar na biblioteca"}</button></div>
   </section>}
   <div className="or"><span/>ou<span/></div><label className="linkLabel">Já tem os links? Cole um ou vários de uma vez</label><textarea value={links} onChange={e=>setLinks(e.target.value)} placeholder={"https://youtube.com/watch?v=...\nhttps://youtu.be/..."} /><button className="secondary" disabled={!links.trim()||linkBusy} onClick={addLinks}>{linkBusy?<><LoaderCircle className="spin" size={17}/> Buscando vídeos...</>:<><Link2 size={17}/> Adicionar links</>}</button>
  </section>
  <section className="steps"><article><div>1</div><Camera/><b>Você envia</b><p>Prints da sua lista ou vários links.</p></article><article><div>2</div><Search/><b>VideoBrain identifica</b><p>Título, canal e vídeo correto.</p></article><article><div>3</div><Clock3/><b>Você confirma</b><p>Nada é processado por engano.</p></article><article><div>4</div><Brain/><b>IA organiza</b><p>Resumo, temas e biblioteca.</p></article></section>
  <footer>VideoBrain <span>•</span> Feito para transformar “Assistir mais tarde” em “Aprendi”.</footer>
  {authOpen&&authModal}
 </main>
}
