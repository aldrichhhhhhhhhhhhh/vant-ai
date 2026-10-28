import katex from "katex";
import "katex/dist/katex.min.css";

function inline(source, theme, isDark, prefix) {
  const pattern = /(\\\([^\n]+?\\\)|\\\[[\s\S]+?\\\]|\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(\x60[^\x60]+\x60)|(\*\*[^*]+\*\*)|(~~[^~]+~~)|(\*[^*\n]+\*)/g;
  const out = []; let last = 0, match, n = 0;
  while ((match = pattern.exec(source))) {
    if (match.index > last) out.push(source.slice(last, match.index));
    const value = match[0], key = prefix + "-" + n++;
    if (value.startsWith("\\(") || value.startsWith("\\[") || value.startsWith("$$") || value.startsWith("$")) {
      const display = value.startsWith("\\[") || value.startsWith("$$");
      const width = value.startsWith("\\") || value.startsWith("$$") ? 2 : 1;
      out.push(<span key={key} className={display ? "vant-math-display" : "vant-math-inline"} dangerouslySetInnerHTML={{__html:katex.renderToString(value.slice(width,-width),{displayMode:display,throwOnError:false,trust:false,strict:"ignore"})}} />);
    } else if (match[3] && match[4]) out.push(<a key={key} href={match[4]} target="_blank" rel="noreferrer" style={{color:isDark?"#BDA7FF":"#5B36B8",textDecoration:"underline"}}>{match[3]}</a>);
    else if (value.startsWith(String.fromCharCode(96))) out.push(<code key={key} style={{padding:"2px 5px",borderRadius:5,background:theme.surfaceStrong,border:"1px solid "+theme.border,fontFamily:"JetBrains Mono, monospace"}}>{value.slice(1,-1)}</code>);
    else if (value.startsWith("**")) out.push(<strong key={key}>{value.slice(2,-2)}</strong>);
    else if (value.startsWith("~~")) out.push(<del key={key}>{value.slice(2,-2)}</del>);
    else out.push(<em key={key}>{value.slice(1,-1)}</em>);
    last=match.index+value.length;
  }
  if(last<source.length) out.push(source.slice(last));
  return out;
}

export default function VantRichRenderer({source,theme,isDark=false,compact=false}) {
  const text=String(source||"").replace(/\r\n/g,"\n").replace(/<br\s*\/?>/gi," · ").replace(/^\s*(?:\*\*VANT WORK ENGINE\*\*|VANT WORK ENGINE)\s*[\s\S]*?^---\s*\n?/im,"").trim();
  if(!text)return null;
  const lines=text.split("\n"),blocks=[];let i=0,n=0;
  const key=(name)=>name+"-"+n++;
  const cells=(line)=>line.trim().replace(/^\\|/,"").replace(/\\|$/,"").split("|").map(x=>x.trim());
  const sep=(line)=>cells(line).every(x=>/^:?-{3,}:?$/.test(x.replace(/\s/g,"")));
  while(i<lines.length){
    const line=lines[i].trim();if(!line){i++;continue}
    if(line.startsWith(String.fromCharCode(96).repeat(3))){
      const lang=line.slice(3).trim(),code=[];i++;
      while(i<lines.length&&!lines[i].trim().startsWith(String.fromCharCode(96).repeat(3)))code.push(lines[i++]);
      if(i<lines.length)i++;
      blocks.push(<pre key={key("code")} style={{overflowX:"auto",padding:12,borderRadius:9,background:isDark?"rgba(0,0,0,.28)":"rgba(15,15,35,.055)",border:"1px solid "+theme.border,fontFamily:"JetBrains Mono, monospace",fontSize:compact?11.5:12.5,lineHeight:1.55,whiteSpace:"pre"}}>{lang&&<div style={{color:theme.textFaint,fontSize:10,marginBottom:7}}>{lang.toUpperCase()}</div>}<code>{code.join("\\n")}</code></pre>);continue
    }
    if(i+1<lines.length&&line.includes("|")&&sep(lines[i+1])){
      const head=cells(line);i+=2;const rows=[];
      while(i<lines.length&&lines[i].trim()&&lines[i].includes("|"))rows.push(cells(lines[i++]));
      blocks.push(<div key={key("table")} style={{overflowX:"auto",margin:"10px 0"}}><table style={{width:"100%",minWidth:300,borderCollapse:"collapse",fontSize:compact?11.5:12.5}}><thead><tr>{head.map((x,j)=><th key={j} style={{textAlign:"left",padding:8,borderBottom:"1px solid "+theme.border,color:theme.text}}>{inline(x,theme,isDark,"th"+n+j)}</th>)}</tr></thead><tbody>{rows.map((row,j)=><tr key={j}>{head.map((_,z)=><td key={z} style={{padding:8,borderBottom:"1px solid "+theme.border,verticalAlign:"top"}}>{inline(row[z]||"",theme,isDark,"td"+n+j+z)}</td>)}</tr>)}</tbody></table></div>);continue
    }
    const h=line.match(/^(#{1,6})\s+(.+)$/);
    if(h){const Tag=h[1].length<3?"h3":"h4";blocks.push(<Tag key={key("h")} style={{color:theme.text,margin:"13px 0 6px",fontSize:h[1].length===1?19:h[1].length===2?16:14,lineHeight:1.3}}>{inline(h[2],theme,isDark,"h"+n)}</Tag>);i++;continue}
    if(/^(---+|\*\*\*+|___+)$/.test(line)){blocks.push(<hr key={key("hr")} style={{border:0,borderTop:"1px solid "+theme.border,margin:"12px 0"}}/>);i++;continue}
    const bullet=line.match(/^[-*+]\s+(.+)$/),ordered=line.match(/^\d+[.)]\s+(.+)$/);
    if(bullet||ordered){const ol=!!ordered,items=[];while(i<lines.length){const m=lines[i].trim().match(ol?/^\\d+[.)]\\s+(.+)$/:/^[-*+]\\s+(.+)$/);if(!m)break;items.push(m[1]);i++}const List=ol?"ol":"ul";blocks.push(<List key={key("list")} style={{margin:"7px 0",paddingLeft:22}}>{items.map((x,j)=><li key={j} style={{margin:"4px 0"}}>{inline(x,theme,isDark,"li"+n+j)}</li>)}</List>);continue}
    if(line.startsWith(">")){const q=[];while(i<lines.length&&lines[i].trim().startsWith(">"))q.push(lines[i++].trim().replace(/^>\s?/,""));blocks.push(<blockquote key={key("quote")} style={{margin:"9px 0",padding:"7px 11px",borderLeft:"3px solid "+(isDark?"#9B7BEA":"#7651C8"),background:theme.surface,color:theme.textMuted}}>{inline(q.join("\\n"),theme,isDark,"q"+n)}</blockquote>);continue}
    if(line.startsWith("\\\\[")||line.startsWith("$$")){const d=line.startsWith("\\\\[")?"\\\\]":"$$",close=line.indexOf(d,2);let math="";if(close>=0){math=line.slice(2,close);i++}else{let end=-1,col=-1;for(let j=i+1;j<lines.length;j++){const at=lines[j].indexOf(d);if(at>=0){end=j;col=at;break}}if(end<0){blocks.push(<p key={key("p")}>{inline(line,theme,isDark,"p"+n)}</p>);i++;continue}math=[line.slice(2),...lines.slice(i+1,end),lines[end].slice(0,col)].join("\\n");i=end+1}blocks.push(<div key={key("math")} className="vant-math-display" style={{overflowX:"auto",margin:"8px 0"}} dangerouslySetInnerHTML={{__html:katex.renderToString(math.trim(),{displayMode:true,throwOnError:false,trust:false,strict:"ignore"})}}/>);continue}
    const p=[line];i++;while(i<lines.length&&lines[i].trim()){const next=lines[i].trim();if(/^#{1,6}\s+/.test(next)||next.startsWith(String.fromCharCode(96).repeat(3))||/^[-*+]\s+/.test(next)||/^\d+[.)]\s+/.test(next)||next.startsWith(">")||next.startsWith("\\[")||next.startsWith("$"))break;if(i+1<lines.length&&next.includes("|")&&sep(lines[i+1]))break;p.push(next);i++}
    blocks.push(<p key={key("p")} style={{margin:"7px 0",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{p.map((part,j)=><span key={j}>{j?" ":""}{inline(part,theme,isDark,"p"+n+j)}</span>)}</p>);
  }
  return <div className="vant-rich-rendering" style={{overflowWrap:"anywhere",fontSize:compact?12:13,lineHeight:1.6,color:theme.textMuted}}>{blocks}</div>;
}
