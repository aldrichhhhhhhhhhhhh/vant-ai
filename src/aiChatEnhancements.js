import { parseAttachment } from "./chatAttachmentParser";

const fileStore = new Map();
const nativeFetch = window.fetch.bind(window);

function keyFor(file) {
  return `${file.name}::${file.size}`;
}

function rememberFiles(input) {
  for (const file of Array.from(input?.files || [])) fileStore.set(keyFor(file), file);
}

document.addEventListener("change", (event) => {
  const input = event.target;
  if (input?.tagName === "INPUT" && input.type === "file") rememberFiles(input);
});

async function enrichChatBody(rawBody) {
  let body;
  try { body = JSON.parse(rawBody); } catch { return rawBody; }
  if (!Array.isArray(body?.messages)) return rawBody;
  const messages = await Promise.all(body.messages.map(async (message) => {
    if (!Array.isArray(message?.content)) return message;
    const content = [];
    for (const part of message.content) {
      content.push(part);
      if (part?.type !== "text") continue;
      const match = String(part.text || "").match(/^Attachment:\s*(.+?)\s*\((\d+)\s*KB\)/i);
      if (!match) continue;
      const file = fileStore.get(`${match[1]}::${Math.round((Number(match[2]) * 1024))}`) || Array.from(fileStore.values()).find((f) => f.name === match[1]);
      if (!file || file.type.startsWith("image/")) continue;
      try {
        const parsed = await parseAttachment(file, { maxChars: 40000 });
        if (parsed?.text) content.push({ type: "text", text: `VANT PARSED ATTACHMENT CONTENT:\nTYPE: ${parsed.kind}\n${parsed.text}` });
      } catch (error) {
        content.push({ type: "text", text: `VANT ATTACHMENT PARSER NOTE: ${error?.message || "The attachment could not be parsed."}` });
      }
    }
    return { ...message, content };
  }));
  return JSON.stringify({ ...body, messages });
}

window.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input?.url || "";
  if (url.endsWith("/api/chat") && String(init?.method || "GET").toUpperCase() === "POST" && typeof init.body === "string") init = { ...init, body: await enrichChatBody(init.body) };
  return nativeFetch(input, init);
};

const buttonStyle = "border:0;background:transparent;color:inherit;cursor:pointer;padding:6px 8px;border-radius:8px;font-size:11.5px";
function addMenuButton(parent, label, menuItems) {
  const wrap = document.createElement("div"); wrap.style.position = "relative";
  const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.setAttribute("style", buttonStyle); wrap.appendChild(button);
  const menu = document.createElement("div"); menu.style.cssText = "display:none;position:absolute;bottom:34px;left:0;width:190px;padding:6px;border-radius:10px;background:var(--vant-menu-bg,#121722);border:1px solid rgba(255,255,255,.14);z-index:100";
  for (const item of menuItems) { const b = document.createElement("button"); b.type="button"; b.textContent=item.label; b.setAttribute("style","width:100%;text-align:left;border:0;background:transparent;color:inherit;cursor:pointer;padding:7px 8px;border-radius:7px;font-size:11.5px"); b.onclick=()=>{item.onClick();menu.style.display="none";}; menu.appendChild(b); }
  button.onclick=()=>{menu.style.display=menu.style.display==="none"?"block":"none";}; wrap.appendChild(menu); parent.appendChild(wrap);
}
function decorateResponseActions() {
  document.querySelectorAll(".v-msg .v-actions").forEach((bar) => {
    if (bar.dataset.vantEnhanced) return;
    const wrapper=bar.closest(".v-msg"); if(!wrapper || !/\bVANT\b/.test(wrapper.textContent||"")) return;
    bar.dataset.vantEnhanced="1";
    addMenuButton(bar,"React",["👍","❤️","😂","😮"].map((emoji)=>({label:emoji,onClick:()=>{bar.dataset.reaction=emoji;}})));
    addMenuButton(bar,"Bad response",["Wrong or inaccurate","Didn't follow my request","Too verbose","Not useful"].map((reason)=>({label:reason,onClick:()=>window.dispatchEvent(new CustomEvent("vant-feedback",{detail:reason}))})));
    addMenuButton(bar,"More options",[{label:"Copy response",onClick:()=>bar.querySelector("button")?.click()},{label:"Report response",onClick:()=>window.dispatchEvent(new CustomEvent("vant-feedback",{detail:"report"}))}]);
  });
}
function conversationText(){const messages=[];document.querySelectorAll(".v-msg").forEach((node)=>{const text=(node.textContent||"").trim();if(text)messages.push(text);});return messages.join("\n\n");}
function decorateConversationHeader(){
  const title=Array.from(document.querySelectorAll("div")).find((el)=>el.textContent?.trim()==="Work session"); const header=title?.parentElement?.parentElement;
  if(!header||header.dataset.vantConversationTools)return; header.dataset.vantConversationTools="1";
  const tools=document.createElement("div");tools.style.cssText="margin-left:auto;display:flex;gap:8px;align-items:center";
  const outputs=document.createElement("button");outputs.type="button";outputs.textContent="Outputs";outputs.setAttribute("style",buttonStyle);
  const share=document.createElement("button");share.type="button";share.textContent="Share";share.setAttribute("style",buttonStyle);
  outputs.onclick=()=>{const items=Array.from(document.querySelectorAll(".v-msg")).filter((n)=>/\bVANT\b/.test(n.textContent||"")).map((n)=>(n.textContent||"").trim()).slice(-10);window.alert(items.length?`Outputs\n\n${items.join("\n\n")}`:"Outputs\n\nNo outputs yet.");};
  share.onclick=async()=>{try{await navigator.clipboard.writeText(conversationText());}catch{}}; tools.append(outputs,share);header.appendChild(tools);
}
const observer=new MutationObserver(()=>{decorateResponseActions();decorateConversationHeader();});observer.observe(document.documentElement,{childList:true,subtree:true});
setTimeout(()=>{decorateResponseActions();decorateConversationHeader();},250);
