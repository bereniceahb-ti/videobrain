"use client";
import {useRef,useState} from "react";
import {Camera,Link2,ImagePlus,Sparkles,Library,Search,Brain,Clock3,X} from "lucide-react";

type Shot={id:string,name:string,url:string};
export default function Home(){
 const input=useRef<HTMLInputElement>(null); const [shots,setShots]=useState<Shot[]>([]); const [links,setLinks]=useState("");
 const add=(files:FileList|null)=>{if(!files)return; const next=[...files].filter(f=>f.type.startsWith("image/")).map(f=>({id:crypto.randomUUID(),name:f.name,url:URL.createObjectURL(f)}));setShots(s=>[...s,...next]);};
 const remove=(id:string)=>setShots(s=>s.filter(x=>x.id!==id));
 return <main>
  <header><div className="brand"><div className="logo"><Brain size={25}/></div><div><b>VideoBrain</b><span>Sua biblioteca inteligente do YouTube</span></div></div><button className="library"><Library size={18}/> Minha biblioteca</button></header>
  <section className="hero"><div className="eyebrow"><Sparkles size={15}/> Menos vídeos acumulados. Mais conhecimento.</div><h1>O que você salvou no YouTube<br/><em>pode finalmente trabalhar por você.</em></h1><p>Envie prints da sua lista ou cole vários links. O VideoBrain organiza os vídeos e prepara o caminho para resumos objetivos.</p></section>
  <section className="panel"><div className="tabs"><button className="active"><Camera size={17}/> Prints</button><button><Link2 size={17}/> Links</button></div>
   <div className="drop" onClick={()=>input.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();add(e.dataTransfer.files)}}><input ref={input} hidden multiple type="file" accept="image/*" onChange={e=>add(e.target.files)}/><div className="dropIcon"><ImagePlus/></div><h2>Adicione seus prints do YouTube</h2><p>Arraste imagens para cá ou toque para escolher da galeria.</p><small>Você pode enviar vários prints de uma vez · PNG, JPG ou WEBP</small><button>Escolher prints</button></div>
   {shots.length>0&&<div className="preview"><div className="previewHead"><b>{shots.length} {shots.length===1?"print selecionado":"prints selecionados"}</b><button onClick={()=>setShots([])}>Limpar</button></div><div className="shots">{shots.map(s=><div className="shot" key={s.id}><img src={s.url} alt={s.name}/><button aria-label="Remover" onClick={()=>remove(s.id)}><X size={15}/></button></div>)}</div><button className="primary"><Sparkles size={18}/> Identificar vídeos nos prints</button><p className="privacy">Os prints serão usados apenas para identificar os vídeos. Você confirma os resultados antes de salvar.</p></div>}
   <div className="or"><span/>ou<span/></div><label className="linkLabel">Já tem os links? Cole vários de uma vez</label><textarea value={links} onChange={e=>setLinks(e.target.value)} placeholder={"https://youtube.com/watch?v=...\nhttps://youtu.be/..."} /><button className="secondary" disabled={!links.trim()}><Link2 size={17}/> Adicionar links</button>
  </section>
  <section className="steps"><article><div>1</div><Camera/><b>Você envia</b><p>Prints da sua lista ou vários links.</p></article><article><div>2</div><Search/><b>VideoBrain identifica</b><p>Título, canal e vídeo correto.</p></article><article><div>3</div><Clock3/><b>Você confirma</b><p>Nada é processado por engano.</p></article><article><div>4</div><Brain/><b>IA organiza</b><p>Resumo, temas e biblioteca.</p></article></section>
  <footer>VideoBrain <span>•</span> Feito para transformar “Assistir mais tarde” em “Aprendi”.</footer>
 </main>
}