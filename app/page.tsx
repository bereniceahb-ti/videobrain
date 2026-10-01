"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {Camera,Link2,ImagePlus,Sparkles,Library,Search,Brain,Clock3,X,CheckCircle2,LoaderCircle,ExternalLink,AlertCircle,Trash2,ArrowLeft,Cloud,LogIn,LogOut} from "lucide-react";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";

type Shot={id:string,name:string,url:string,file:File};
type Candidate={youtubeId:string;title:string;channel:string;thumbnail:string;url:string;rank:number};
type Result={detected:{title:string;channel?:string;duration?:string;confidence?:number};candidates:Candidate[]};
type Choice="want"|"known"|"discard";
type SavedVideo=Candidate&{status:Choice;savedAt:string};

const STORAGE_KEY="videobrain-library-v1";

export default function Home(){
 const input=useRef<HTMLInputElement>(null);
 const supabase=useMemo(()=>createSupabaseBrowserClient(),[]);
 const [shots,setShots]=useState<Shot[]>([]),[links,setLinks]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[results,setResults]=useState<Result[]>([]),[selected,setSelected]=useState<Record<number,string>>({}),[choices,setChoices]=useState<Record<number,Choice>>({}),[library,setLibrary]=useState<SavedVideo[]>([]),[view,setView]=useState<"home"|"library">("home"),[savedMsg,setSavedMsg]=useState("");
 const [authOpen,setAuthOpen]=useState(false),[authMode,setAuthMode]=useState<"login"|"signup">("login"),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[authMsg,setAuthMsg]=useState(""),[authBusy,setAuthBusy]=useState(false),[userId,setUserId]=useState<string|null>(null),[userEmail,setUserEmail]=useState<string|null>(null),[syncing,setSyncing]=useState(false);

 const persistLocal=(items:SavedVideo[])=>{setLibrary(items);try{localStorage.setItem(STORAGE_KEY,JSON.stringify(items));}catch{}};
 const dbStatus=(s:Choice)=>s==="known"?"ja_conheco":"quero_este";
 const uiStatus=(s:string):Choice=>s==="ja_conheco"?"known":"want";
 const rowToSaved=(r:any):SavedVideo=>({youtubeId:r.youtube_id,title:r.title,channel:r.channel||"",thumbnail:r.thumbnail_url||"",url:r.youtube_url,rank:1,status:uiStatus(r.status),savedAt:r.created_at});

 const loadCloud=async(uid:string)=>{
  if(!supabase)return;
  const {data,error}=await supabase.from("videos").select("youtube_id,youtube_url,title,channel,thumbnail_url,status,created_at").eq("user_id",uid).order("created_at",{ascending:false});
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

 const add=(files:FileList|null)=>{if(!files)return;const next=[...files].filter(f=>f.type.startsWith("image/")).slice(0,8).map(f=>({id:crypto.randomUUID(),name:f.name,url:URL.createObjectURL(f),file:f}));setShots(s=>[...s,...next].slice(0,8));};
 const remove=(id:string)=>setShots(s=>s.filter(x=>x.id!==id));
 const identify=async()=>{if(!shots.length)return;setBusy(true);setError("");setResults([]);setSavedMsg("");try{const fd=new FormData();shots.forEach(s=>fd.append("images",s.file));const res=await fetch("/api/identify",{method:"POST",body:fd});const data=await res.json();if(!res.ok)throw new Error(data.error||"Não consegui analisar os prints.");setResults(data.results||[]);const auto:Record<number,string>={};const ch:Record<number,Choice>={};(data.results||[]).forEach((r:Result,i:number)=>{if(r.candidates?.[0]){auto[i]=r.candidates[0].youtubeId;ch[i]="want";}});setSelected(auto);setChoices(ch);}catch(e){setError(e instanceof Error?e.message:"Algo deu errado.");}finally{setBusy(false)}};

 const saveLibrary=async()=>{
  const picked:SavedVideo[]=[];
  results.forEach((r,i)=>{const id=selected[i],status=choices[i];if(!id||!status||status==="discard")return;const c=r.candidates.find(x=>x.youtubeId===id);if(c)picked.push({...c,status,savedAt:new Date().toISOString()});});
  if(!picked.length){setSavedMsg("Nenhum vídeo marcado para salvar.");return;}
  const next=[...library];let added=0,updated=0;
  picked.forEach(item=>{const idx=next.findIndex(x=>x.youtubeId===item.youtubeId);if(idx>=0){next[idx]=item;updated++;}else{next.unshift(item);added++;}});
  persistLocal(next);
  if(userId&&supabase){
   setSyncing(true);
   const rows=picked.map(v=>({user_id:userId,youtube_id:v.youtubeId,youtube_url:v.url,title:v.title,channel:v.channel,thumbnail_url:v.thumbnail,status:dbStatus(v.status)}));
   const {error}=await supabase.from("videos").upsert(rows,{onConflict:"user_id,youtube_id"});
   setSyncing(false);
   if(error){setSavedMsg("Salvei neste aparelho, mas a sincronização falhou. Tente novamente.");return;}
   await loadCloud(userId);
   setSavedMsg(`${added} novo(s) salvo(s) na nuvem${updated?` · ${updated} atualizado(s)`:""}.`);
  }else{
   setSavedMsg(`${added} novo(s) salvo(s) neste aparelho${updated?` · ${updated} atualizado(s)`:""}. Entre para sincronizar.`);
  }
 };

 const removeSaved=async(id:string)=>{
  persistLocal(library.filter(v=>v.youtubeId!==id));
  if(userId&&supabase)await supabase.from("videos").delete().eq("user_id",userId).eq("youtube_id",id);
 };
 const statusLabel=(s:Choice)=>s==="want"?"Quero este":s==="known"?"Já conheço":"Descartar";

 const submitAuth=async()=>{
  if(!supabase){setAuthMsg("A conexão com o Supabase ainda não foi configurada na Vercel.");return;}
  if(!email||password.length<6){setAuthMsg("Informe seu e-mail e uma senha com pelo menos 6 caracteres.");return;}
  setAuthBusy(true);setAuthMsg("");
  if(authMode==="login"){
   const {data,error}=await supabase.auth.signInWithPassword({email,password});
   if(error)setAuthMsg("Não consegui entrar. Confira e-mail e senha.");
   else if(data.user){setAuthOpen(false);setPassword("");}
  }else{
   const {data,error}=await supabase.auth.signUp({email,password});
   if(error)setAuthMsg(error.message);
   else if(data.session){setAuthOpen(false);setPassword("");}
   else setAuthMsg("Conta criada. Confira seu e-mail para confirmar o cadastro e depois entre no VideoBrain.");
  }
  setAuthBusy(false);
 };
 const signOut=async()=>{if(supabase)await supabase.auth.signOut();setUserId(null);setUserEmail(null);setSavedMsg("Você saiu da conta. A biblioteca deste aparelho continua disponível.");};

 const accountControls=<div className="accountControls">{userId?<><span className="syncChip"><Cloud size={14}/>{syncing?"Sincronizando...":userEmail||"Sincronizado"}</span><button className="authButton" onClick={signOut} title="Sair"><LogOut size={16}/><span>Sair</span></button></>:<button className="authButton" onClick={()=>{setAuthMode("login");setAuthOpen(true);setAuthMsg("")}}><LogIn size={16}/> Entrar</button>}</div>;

 if(view==="library")return <main><header><div className="brand"><div className="logo"><Brain size={25}/></div><div><b>VideoBrain</b><span>Sua biblioteca inteligente do YouTube</span></div></div><div className="headerActions">{accountControls}<button className="library" onClick={()=>setView("home")}><ArrowLeft size={18}/> Voltar</button></div></header><section className="libraryPage"><div className="libraryTitle"><div><span className="eyebrow"><Library size={15}/> Minha biblioteca</span><h1>Seus vídeos salvos</h1><p>{library.length} vídeo(s) {userId?"sincronizado(s) na sua conta":"guardado(s) neste navegador"}.</p></div></div>{library.length===0?<div className="emptyLib"><Library size={34}/><b>Sua biblioteca ainda está vazia.</b><p>Volte, identifique um print e salve seus primeiros vídeos.</p><button onClick={()=>setView("home")}>Adicionar vídeos</button></div>:<div className="libraryGrid">{library.map(v=><article className="libraryCard" key={v.youtubeId}><img src={v.thumbnail} alt=""/><div className="libraryCardBody"><span className={v.status==="known"?"status known":"status want"}>{statusLabel(v.status)}</span><b>{v.title}</b><small>{v.channel}</small><div className="cardActions"><a href={v.url} target="_blank" rel="noreferrer">YouTube <ExternalLink size={12}/></a><button onClick={()=>removeSaved(v.youtubeId)} aria-label="Remover"><Trash2 size={14}/></button></div></div></article>)}</div>}</section><footer>VideoBrain <span>•</span> Sua biblioteca pessoal de aprendizagem.</footer>{authOpen&&<AuthModal/>}</main>;

 function AuthModal(){return <div className="modalBackdrop" onMouseDown={()=>setAuthOpen(false)}><div className="authModal" onMouseDown={e=>e.stopPropagation()}><button className="modalClose" onClick={()=>setAuthOpen(false)}><X size={18}/></button><div className="logo"><Brain size={23}/></div><h2>{authMode==="login"?"Entrar no VideoBrain":"Criar sua conta"}</h2><p>Sincronize sua biblioteca entre celular e computador.</p><label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@email.com"/></label><label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="mínimo 6 caracteres"/></label>{authMsg&&<div className="authMsg">{authMsg}</div>}<button className="primary authSubmit" onClick={submitAuth} disabled={authBusy}>{authBusy?<><LoaderCircle className="spin" size={17}/> Aguarde...</>:authMode==="login"?"Entrar":"Criar conta"}</button><button className="authSwitch" onClick={()=>{setAuthMode(m=>m==="login"?"signup":"login");setAuthMsg("")}}>{authMode==="login"?"Ainda não tenho conta":"Já tenho uma conta"}</button></div></div>}

 return <main>
  <header><div className="brand"><div className="logo"><Brain size={25}/></div><div><b>VideoBrain</b><span>Sua biblioteca inteligente do YouTube</span></div></div><div className="headerActions">{accountControls}<button className="library" onClick={()=>setView("library")}><Library size={18}/> Minha biblioteca {library.length>0&&<strong>{library.length}</strong>}</button></div></header>
  <section className="hero"><div className="eyebrow"><Sparkles size={15}/> Menos vídeos acumulados. Mais conhecimento.</div><h1>O que você salvou no YouTube<br/><em>pode finalmente trabalhar por você.</em></h1><p>Envie prints da sua lista. O VideoBrain lê a tela, procura os vídeos no YouTube e deixa você confirmar antes de salvar.</p></section>
  <section className="panel"><div className="tabs"><button className="active"><Camera size={17}/> Prints</button><button><Link2 size={17}/> Links</button></div>
   <div className="drop" onClick={()=>input.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();add(e.dataTransfer.files)}}><input ref={input} hidden multiple type="file" accept="image/*" onChange={e=>add(e.target.files)}/><div className="dropIcon"><ImagePlus/></div><h2>Adicione seus prints do YouTube</h2><p>Arraste imagens para cá ou toque para escolher da galeria.</p><small>Até 8 prints por análise · PNG, JPG ou WEBP</small><button>Escolher prints</button></div>
   {shots.length>0&&<div className="preview"><div className="previewHead"><b>{shots.length} {shots.length===1?"print selecionado":"prints selecionados"}</b><button onClick={()=>{setShots([]);setResults([]);setSavedMsg("")}}>Limpar</button></div><div className="shots">{shots.map(s=><div className="shot" key={s.id}><img src={s.url} alt={s.name}/><button aria-label="Remover" onClick={()=>remove(s.id)}><X size={15}/></button></div>)}</div><button className="primary" disabled={busy} onClick={identify}>{busy?<><LoaderCircle className="spin" size={18}/> Lendo prints e procurando vídeos...</>:<><Sparkles size={18}/> Identificar vídeos nos prints</>}</button><p className="privacy">Os prints são analisados para identificar os vídeos. Você confirma os resultados antes de salvar.</p></div>}
   {error&&<div className="error"><AlertCircle size={18}/><span><b>Não consegui concluir a análise.</b><br/>{error}</span></div>}
   {results.length>0&&<section className="found"><div className="foundHead"><div><b>{results.length} vídeos identificados</b><span>Confira o candidato e diga o que fazer com cada vídeo.</span></div><CheckCircle2/></div>{results.map((r,i)=><article className="match" key={i}><div className="read"><small>Li no print</small><b>{r.detected.title}</b>{r.detected.channel&&<span>{r.detected.channel}</span>}</div>{r.candidates.length?<><div className="candidates">{r.candidates.map(c=><label className={selected[i]===c.youtubeId?"candidate chosen":"candidate"} key={c.youtubeId}><input type="radio" name={"video-"+i} checked={selected[i]===c.youtubeId} onChange={()=>setSelected(s=>({...s,[i]:c.youtubeId}))}/><img src={c.thumbnail} alt=""/><div><b>{c.title}</b><span>{c.channel}</span><a href={c.url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}>Abrir no YouTube <ExternalLink size={12}/></a></div></label>)}</div><div className="choiceRow"><button className={choices[i]==="want"?"choice active":"choice"} onClick={()=>setChoices(s=>({...s,[i]:"want"}))}>Quero este</button><button className={choices[i]==="known"?"choice active":"choice"} onClick={()=>setChoices(s=>({...s,[i]:"known"}))}>Já conheço</button><button className={choices[i]==="discard"?"choice discard active":"choice discard"} onClick={()=>setChoices(s=>({...s,[i]:"discard"}))}>Descartar</button></div></>:<p className="none">Não encontrei um candidato confiável para este título.</p>}</article>)}
    {savedMsg&&<div className="savedMsg"><CheckCircle2 size={17}/>{savedMsg}</div>}
    <div className="confirmBar"><span><b>{Object.values(choices).filter(x=>x!=="discard").length}</b> para salvar {userId&&<small>· na nuvem</small>}</span><button className="saveButton" onClick={saveLibrary} disabled={syncing}>{syncing?"Sincronizando...":"Salvar na biblioteca"}</button></div>
   </section>}
   <div className="or"><span/>ou<span/></div><label className="linkLabel">Já tem os links? Cole vários de uma vez</label><textarea value={links} onChange={e=>setLinks(e.target.value)} placeholder={"https://youtube.com/watch?v=...\nhttps://youtu.be/..."} /><button className="secondary" disabled={!links.trim()}><Link2 size={17}/> Adicionar links</button>
  </section>
  <section className="steps"><article><div>1</div><Camera/><b>Você envia</b><p>Prints da sua lista ou vários links.</p></article><article><div>2</div><Search/><b>VideoBrain identifica</b><p>Título, canal e vídeo correto.</p></article><article><div>3</div><Clock3/><b>Você confirma</b><p>Nada é processado por engano.</p></article><article><div>4</div><Brain/><b>IA organiza</b><p>Resumo, temas e biblioteca.</p></article></section>
  <footer>VideoBrain <span>•</span> Feito para transformar “Assistir mais tarde” em “Aprendi”.</footer>
  {authOpen&&<AuthModal/>}
 </main>
}