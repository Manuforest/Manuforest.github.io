'use strict';
/* Local-only writing desk. No network requests or GitHub credentials.
   IndexedDB stores one working draft plus image blobs; export ZIP is the backup. */
(() => {
  const $ = s => document.querySelector(s);
  const textarea = $('#draft-text'), slugInput = $('#file-slug');
  const status = $('#save-status'), notice = $('#writer-notice');
  let files = [], db, objectURLs = [], timer, revision = 0, savedRevision = -1;
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const template = () => `---\ntitle: "写下这一刻的标题"\ndate: ${today()}\ncategory: "随记"\ntags: ["日常"]\ndraft: true\n---\n\n## 从一句话开始\n\n把想留下的事情，慢慢写在这里。\n\n> 记录没有失去的瞬间。\n\n写好后，把顶部的 draft: true 改成 draft: false。\n`;
  const safeName = value => value.normalize('NFKC').replace(/[^\p{L}\p{N}_.-]+/gu,'-').replace(/^[-_.]+|[-_.]+$/g,'');
  function slug() { const s = safeName(slugInput.value.trim()); if (!s) throw Error('请先填写文件夹名。'); return s; }
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function headerAndBody(value) {
    const match = value.replace(/^\uFEFF/, '').replace(/\r\n/g,'\n').match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
    return match ? {header:match[1], body:value.replace(/^\uFEFF/, '').replace(/\r\n/g,'\n').slice(match[0].length)} : {header:'', body:value};
  }
  function inline(value) {
    // Text is escaped first. Only code/emphasis/link/image elements are emitted.
    const tokens = [];
    const hold = html => { tokens.push(html); return `\u0000${tokens.length-1}\u0000`; };
    let text = escape(value).replace(/`([^`]+)`/g, (_, s) => hold(`<code>${s}</code>`));
    text = text.replace(/!\[([^\]]*)\]\(([^\s)]+)\)/g, (_, alt, raw) => {
      const url = raw.replace(/&amp;/g,'&');
      const name = url.startsWith('images/') ? url.slice(7) : url.startsWith('./images/') ? url.slice(9) : null;
      let decoded = name || ''; try { decoded = decodeURIComponent(decoded); } catch (_) { /* Keep malformed reference as text. */ }
      const file = files.find(f => f.name === decoded);
      if (file) { const local = URL.createObjectURL(file); objectURLs.push(local); return hold(`<img src="${local}" alt="${alt}">`); }
      // External images stay placeholders in the draft: no third-party tracking.
      return hold(`<span class="muted">[图片：${alt || '未命名'} · ${escape(url)}]</span>`);
    });
    text = text.replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (_, label) => hold(`<span class="text-link">${label} ↗</span>`));
    text = text.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/~~(.+?)~~/g,'<del>$1</del>');
    return text.replace(/\u0000(\d+)\u0000/g, (_, n) => tokens[Number(n)]);
  }
  function preview() {
    objectURLs.forEach(url => URL.revokeObjectURL(url)); objectURLs = [];
    const {header, body} = headerAndBody(textarea.value);
    const titleLine = header.match(/^title:\s*(.+)$/m);
    let title = titleLine ? titleLine[1].trim() : '';
    if ((title.startsWith('"') && title.endsWith('"')) || (title.startsWith("'") && title.endsWith("'"))) title = title.slice(1,-1);
    const lines = body.split('\n'), out = []; let paragraph = [], code = null, fence = '', list = null;
    const flush = () => { if (paragraph.length) { out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`); paragraph=[]; } if (list) {out.push(`</${list}>`); list=null;} };
    for (const line of lines) {
      const marker = line.match(/^\s*(`{3,}|~{3,})/);
      if (marker && code === null) { flush(); code=[]; fence=marker[1][0]; continue; }
      if (code !== null) { if (marker && marker[1][0] === fence) {out.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`); code=null;} else code.push(line); continue; }
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {flush();out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);continue;}
      if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {flush();out.push('<hr>');continue;}
      if (/^>\s?/.test(line)) {flush();out.push(`<blockquote>${inline(line.replace(/^>\s?/,''))}</blockquote>`);continue;}
      const item = line.match(/^\s*(?:([-*+])|(\d+)\.)\s+(.+)$/);
      if (item) {if (paragraph.length) flush();const type=item[1]?'ul':'ol';if(list && list!==type)flush();if(!list){out.push(`<${type}>`);list=type;}out.push(`<li>${inline(item[3])}</li>`);continue;}
      if (!line.trim()) {flush();continue;}
      if (list) flush(); paragraph.push(line);
    }
    flush();if(code!==null)out.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`);
    $('#draft-preview').innerHTML = (title ? `<h1>${escape(title)}</h1>` : '') + out.join('');
    $('#word-count').textContent = `${body.replace(/\s/g,'').length} 字 · ${files.length} 张图片`;
    const attachments = $('#attachment-list'); attachments.replaceChildren();
    files.forEach((file, i) => {
      const chip = document.createElement('span'); chip.className='attachment-chip'; chip.textContent=`${file.name} · ${(file.size/1024).toFixed(0)} KB`;
      const remove = document.createElement('button');remove.textContent='移除';remove.type='button';remove.setAttribute('aria-label',`移除图片 ${file.name}`);
      remove.addEventListener('click',()=>{ if(!confirm('移除这张图片？正文中的图片引用需要一并删除。'))return;files.splice(i,1);changed();});
      chip.append(remove);attachments.append(chip);
    });
  }
  function openDB() {return new Promise((resolve,reject)=>{const request=indexedDB.open('manuforest-writing-desk',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
  function readDraft() {return new Promise((resolve,reject)=>{const request=db.transaction('drafts').objectStore('drafts').get('current');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
  async function save() {
    if(!db){status.textContent='无法本机保存，请下载备份';return;}
    const current=revision;
    try {await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({text:textarea.value,slug:slugInput.value,files},'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});savedRevision=current;status.textContent=current===revision?'草稿已保存在此浏览器':'正在保存…';}
    catch(_){status.textContent='保存失败，请立即下载文章包备份';}
  }
  function changed(){revision++;preview();status.textContent='正在保存…';clearTimeout(timer);timer=setTimeout(save,500);}
  textarea.addEventListener('input',changed);slugInput.addEventListener('input',changed);
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();}});
  window.addEventListener('beforeunload',e=>{if(revision!==savedRevision){e.preventDefault();e.returnValue='';}});
  function insert(value){textarea.setRangeText(value,textarea.selectionStart,textarea.selectionEnd,'end');textarea.focus();changed();}
  async function addImages(incoming) {
    let inserted='';
    for(const raw of incoming){
      if(!['image/png','image/jpeg','image/gif','image/webp','image/avif'].includes(raw.type)){notice.textContent='只接受 PNG、JPEG、GIF、WebP、AVIF 图片。';continue;}
      if(raw.size>20*1024*1024){notice.textContent='单张图片请小于 20 MiB，建议压缩到 2 MiB 以下。';continue;}
      const stem=safeName(raw.name.replace(/\.[^.]+$/,''))||'image';const ext=({'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','image/avif':'avif'})[raw.type];
      let name=`${stem}.${ext}`,n=1;while(files.some(f=>f.name===name))name=`${stem}-${n++}.${ext}`;
      files.push(new File([raw],name,{type:raw.type}));inserted+=`\n![${stem}](images/${encodeURIComponent(name)})\n`;
    }
    if(inserted)insert(inserted);
  }
  $('#add-images').addEventListener('change',e=>{addImages([...e.target.files]);e.target.value='';});
  textarea.addEventListener('paste',e=>{const images=[...e.clipboardData.files].filter(f=>f.type.startsWith('image/'));if(images.length){e.preventDefault();addImages(images);}});
  textarea.addEventListener('dragover',e=>e.preventDefault());
  textarea.addEventListener('drop',e=>{e.preventDefault();addImages([...e.dataTransfer.files]);});
  $('#import-md').addEventListener('change',async e=>{
    const file=e.target.files[0];e.target.value='';if(!file)return;
    if(file.size>2*1024*1024){notice.textContent='Markdown 文件请小于 2 MiB。';return;}
    if(textarea.value.trim()&&!confirm('导入会替换当前草稿及附件，请先导出备份。继续吗？'))return;
    textarea.value=await file.text();slugInput.value=safeName(file.name.replace(/\.(md|markdown)$/i,''))||'my-note';files=[];notice.textContent='已原样导入 Markdown。外部图片不会在基础预览中联网加载；本地图片请重新添加。';changed();
  });
  $('#new-draft').addEventListener('click',()=>{if(!confirm('新建会替换当前本机草稿及附件。已经下载备份了吗？'))return;textarea.value=template();slugInput.value=`${today()}-note`;files=[];notice.textContent='';changed();});
  function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  function valid(){const s=slug();if(!textarea.value.trim())throw Error('还没有正文。');const {header}=headerAndBody(textarea.value);if(!/^date:\s*['"]?\d{4}-\d{2}-\d{2}/m.test(header)&&!/^\d{4}-\d{2}-\d{2}/.test(s))throw Error('请填写 date: YYYY-MM-DD，或使用日期开头的文件夹名。');return s;}
  $('#download-md').addEventListener('click',()=>{try{const s=valid();download(new Blob([textarea.value],{type:'text/markdown;charset=utf-8'}),`${s}.md`);notice.textContent=files.length?'只导出了 Markdown；有图片时请使用「下载文章包」。':'Markdown 已下载；草稿不会自动发布。';}catch(e){notice.textContent=e.message;}});
  const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
  function crc32(bytes){let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);return(n^0xffffffff)>>>0;}
  async function zip(entries){
    const encoder=new TextEncoder(),locals=[],centrals=[];let offset=0,centralSize=0;
    for(const entry of entries){const name=encoder.encode(entry.name),data=new Uint8Array(await entry.blob.arrayBuffer()),crc=crc32(data);
      const local=new Uint8Array(30+name.length),l=new DataView(local.buffer);l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint16(12,33,true);l.setUint32(14,crc,true);l.setUint32(18,data.length,true);l.setUint32(22,data.length,true);l.setUint16(26,name.length,true);local.set(name,30);
      const central=new Uint8Array(46+name.length),c=new DataView(central.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.set(name,46);
      locals.push(local,data);centrals.push(central);offset+=local.length+data.length;centralSize+=central.length;
    }
    const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);return new Blob([...locals,...centrals,end],{type:'application/zip'});
  }
  $('#download-zip').addEventListener('click',async e=>{const button=e.currentTarget;button.disabled=true;try{const s=valid();const entries=[{name:`${s}/index.md`,blob:new Blob([textarea.value])},...files.map(file=>({name:`${s}/images/${file.name}`,blob:file}))];download(await zip(entries),`${s}.zip`);notice.textContent='文章包已下载。解压后，把文章文件夹上传到 content/posts；不要直接上传 ZIP。';await save();}catch(error){notice.textContent=error.message||'导出失败，请重试。';}finally{button.disabled=false;}});
  // Initial restoration must finish before inputs can replace the saved draft.
  textarea.disabled=true;slugInput.disabled=true;
  (async()=>{try{db=await openDB();const draft=await readDraft();if(draft){textarea.value=draft.text||'';slugInput.value=draft.slug||'my-note';files=draft.files||[];}else{textarea.value=template();slugInput.value=`${today()}-note`;}status.textContent='草稿仅保存在此浏览器';savedRevision=revision;}
    catch(_){textarea.value=template();status.textContent='浏览器存储不可用，请及时导出备份';}
    finally{textarea.disabled=false;slugInput.disabled=false;preview();}})();
})();
