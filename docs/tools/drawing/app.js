(() => {
  'use strict';
  const $=id=>document.getElementById(id), P=Pigment;
  const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#${name}"/></svg>`;
  const tools=[
    ['绘画',[['brush','画笔','B','自由绘制，让灵感自然发生。'],['pencil','铅笔','P','细腻的颗粒，保留手绘温度。'],['marker','马克笔','','扁圆笔头，利落的线条。'],['highlight','荧光笔','','半透明笔迹，为重点上色。'],['spray','喷枪','','点状喷涂，轻松营造颗粒感。'],['eraser','橡皮擦','E','只擦除当前图层，支持柔边。']]],
    ['颜色',[['dropper','吸色器','I','从所有可见图层拾取颜色。'],['fill','油漆桶','G','点击填充相近颜色的连通区域。'],['gradient','渐变','','拖动画布，从前景色过渡到尾色。']]],
    ['形状',[['line','直线','L','按住 Shift，锁定 45° 方向。'],['arrow','箭头','','拖动绘制箭头，大小控制线宽。'],['rect','矩形','R','按住 Shift 绘制正方形。'],['ellipse','圆形','','按住 Shift 绘制正圆。'],['polygon','正多边形','','可调边数，拖动设置大小和方向。']]],
    ['编辑',[['text','文字','T','点击画布，放入一段文字。'],['select','矩形选区','M','拖出选区，限制绘画与编辑范围。'],['move','移动','V','移动选区内像素，或整个当前图层。'],['crop','裁剪','C','拖出裁剪区域，按 Enter 应用。']]],
    ['视图',[['hand','抓手','H','拖动画布；任何工具下可按住空格。'],['zoom','缩放','Z','点击放大，按住 Alt 点击缩小。']]]
  ];
  const flatTools=tools.flatMap(g=>g[1]), drawingTools=['brush','pencil','marker','highlight','spray','eraser'];
  const shapeTools=['line','arrow','rect','ellipse','polygon'];
  const defaults={brush:[24,85,100],pencil:[4,100,90],marker:[28,90,85],highlight:[44,75,32],spray:[70,25,65],eraser:[40,85,100],line:[4,100,100],arrow:[5,100,100],rect:[3,100,100],ellipse:[3,100,100],polygon:[3,100,100],fill:[24,100,100],gradient:[24,100,100],text:[24,100,100]};
  const settings=Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,{size:v[0],hardness:v[1],opacity:v[2]}]));
  let tool='brush',size=24,hardness=85,opacity=100,primary='#23b99b',secondary='#b8a3f4',hsv=P.rgbToHsv(35,185,155);
  let width=1280,height=800,title='未命名作品',layers=[],activeId='',sequence=0;
  let view={x:0,y:0,zoom:1},selection=null,mirrorX=false,mirrorY=false,grid=false,spaceHeld=false,busy=false;
  let pointer=null,strokeLive=false,strokeIsMove=false,moveBase=null,movePixels=null,drawQueued=false,airTimer=null;
  let history=[],historyIndex=-1,autosaveTimer=null,toastTimer=null,tip=null,recent=[],pendingText=null;
  const storageKey='pigment.studio.autosave.v1';
  const viewport=$('viewport'),paper=$('paper'),art=$('art-canvas'),overlay=$('overlay-canvas');
  const ctx=art.getContext('2d',{willReadFrequently:true}),overlayCtx=overlay.getContext('2d');
  const makeCanvas=(w=width,h=height)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  let stroke=makeCanvas(),working=makeCanvas(),mirrored=makeCanvas();
  function activeLayer(){return layers.find(l=>l.id===activeId);}
  function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3600);}
  function status(message){$('status-message').textContent=message;}
  function createLayer(name,background=null){const canvas=makeCanvas();if(background&&background!=='transparent'){const c=canvas.getContext('2d');c.fillStyle=background;c.fillRect(0,0,width,height);}return {id:`layer-${Date.now()}-${++sequence}`,name,canvas,opacity:1,visible:true,locked:false,hasContent:Boolean(background&&background!=='transparent'),png:null};}
  function ensureEditable(){const l=activeLayer();if(busy)return false;if(!l){toast('请先新建一个图层。');return false;}if(l.locked){toast('当前图层已锁定，请点击图层右侧的锁解锁。');return false;}if(!l.visible){toast('当前图层已隐藏，请先打开左侧的眼睛。');return false;}return true;}
  function resetBuffers(){for(const c of [art,overlay,stroke,working,mirrored]){c.width=width;c.height=height;}paper.style.width=`${width}px`;paper.style.height=`${height}px`;}
  function applyView(){paper.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.zoom})`;$('zoom-label').textContent=`${Math.round(view.zoom*100)}%`;drawRulers();renderOverlay();}
  function fitView(){const r=viewport.getBoundingClientRect(),padding=r.width<500?25:72;view.zoom=P.clamp(Math.min((r.width-padding)/width,(r.height-padding-26)/height),.05,2);view.x=(r.width-width*view.zoom)/2;view.y=(r.height-height*view.zoom)/2-13;applyView();}
  function setZoom(zoom,point={x:viewport.clientWidth/2,y:viewport.clientHeight/2}){view=P.zoomAt(view,point,zoom);applyView();}
  function drawRulers(){
    const w=viewport.clientWidth,h=viewport.clientHeight,dpr=Math.min(devicePixelRatio||1,2);
    for(const [id,length,vertical] of [['ruler-top',w,false],['ruler-left',h,true]]){
      const c=$(id);c.width=(vertical?22:length)*dpr;c.height=(vertical?length:22)*dpr;c.style.width=`${vertical?22:length}px`;c.style.height=`${vertical?length:22}px`;
      const r=c.getContext('2d');r.scale(dpr,dpr);r.fillStyle='#171c26';r.fillRect(0,0,vertical?22:length,vertical?length:22);r.strokeStyle='#364254';r.fillStyle='#687b95';r.lineWidth=1;r.font='7px Consolas,monospace';
      const origin=vertical?view.y:view.x;let major=100;while(major*view.zoom<65)major*=2;while(major*view.zoom>180)major/=2;const step=major/5,start=Math.floor(-origin/view.zoom/step)*step;
      for(let v=start;origin+v*view.zoom<length;v+=step){const pos=Math.round(origin+v*view.zoom)+.5,isMajor=Math.abs(v/major-Math.round(v/major))<.01;r.beginPath();if(vertical){r.moveTo(22,pos);r.lineTo(isMajor?13:18,pos);}else{r.moveTo(pos,22);r.lineTo(pos,isMajor?13:18);}r.stroke();if(isMajor){if(vertical){r.save();r.translate(8,pos+3);r.rotate(-Math.PI/2);r.fillText(Math.round(v),0,0);r.restore();}else r.fillText(Math.round(v),pos+4,9);}}
    }
  }
  function clipSelection(c){if(selection&&tool!=='crop'){c.beginPath();c.rect(selection.x,selection.y,selection.w,selection.h);c.clip();}}
  function mirroredStroke(){const c=mirrored.getContext('2d');c.clearRect(0,0,width,height);c.drawImage(stroke,0,0);if(!drawingTools.includes(tool)&&!shapeTools.includes(tool))return mirrored;
    for(const [x,y,on] of [[-1,1,mirrorX],[1,-1,mirrorY],[-1,-1,mirrorX&&mirrorY]])if(on){c.save();c.translate(x<0?width:0,y<0?height:0);c.scale(x,y);c.drawImage(stroke,0,0);c.restore();}return mirrored;
  }
  function buildWorking(){const l=activeLayer(),c=working.getContext('2d');c.clearRect(0,0,width,height);if(strokeIsMove){c.drawImage(stroke,0,0);return;}c.drawImage(l.canvas,0,0);c.save();clipSelection(c);c.globalAlpha=opacity/100;c.globalCompositeOperation=tool==='eraser'?'destination-out':'source-over';c.drawImage(mirroredStroke(),0,0);c.restore();}
  function compose(target=ctx,preview=true){target.clearRect(0,0,width,height);if(strokeLive&&preview)buildWorking();for(const l of layers){if(!l.visible)continue;target.save();target.globalAlpha=l.opacity;target.drawImage(strokeLive&&preview&&l.id===activeId?working:l.canvas,0,0);target.restore();}}
  function requestRender(){if(drawQueued)return;drawQueued=true;requestAnimationFrame(()=>{drawQueued=false;compose();renderOverlay();});}
  function renderOverlay(){overlayCtx.clearRect(0,0,width,height);const c=overlayCtx;c.lineWidth=1/view.zoom;
    if(grid){c.strokeStyle='#637a9630';c.beginPath();for(let x=0;x<width;x+=50){c.moveTo(x,0);c.lineTo(x,height);}for(let y=0;y<height;y+=50){c.moveTo(0,y);c.lineTo(width,y);}c.stroke();}
    if(mirrorX||mirrorY){c.strokeStyle='#47b99b70';c.setLineDash([5/view.zoom,5/view.zoom]);c.beginPath();if(mirrorX){c.moveTo(width/2,0);c.lineTo(width/2,height);}if(mirrorY){c.moveTo(0,height/2);c.lineTo(width,height/2);}c.stroke();c.setLineDash([]);}
    if(selection){const s=selection;if(tool==='crop'){c.fillStyle='#08121c66';c.fillRect(0,0,width,s.y);c.fillRect(0,s.y+s.h,width,height-s.y-s.h);c.fillRect(0,s.y,s.x,s.h);c.fillRect(s.x+s.w,s.y,width-s.x-s.w,s.h);}c.strokeStyle='#fff';c.setLineDash([]);c.strokeRect(s.x,s.y,s.w,s.h);c.strokeStyle='#17382e';c.setLineDash([5/view.zoom,5/view.zoom]);c.strokeRect(s.x,s.y,s.w,s.h);c.setLineDash([]);for(const [x,y] of [[s.x,s.y],[s.x+s.w,s.y],[s.x,s.y+s.h],[s.x+s.w,s.y+s.h]]){c.fillStyle='#fff';c.fillRect(x-2/view.zoom,y-2/view.zoom,4/view.zoom,4/view.zoom);} }
    const empty=!strokeLive&&!layers.some(l=>l.visible&&l.hasContent&&!l.isBackground);$('empty-hint').hidden=!empty;
    $('selection-actions').hidden=!selection||tool==='crop';$('canvas-tip').hidden=Boolean(selection);
    if(selection)$('selection-size').textContent=`${selection.w} × ${selection.h} px`;
    $('apply-crop').disabled=!selection||selection.w<1||selection.h<1;
  }
  function updateDocumentUI(){ $('document-name').value=title;$('canvas-tab-name').textContent=title;$('canvas-tab-size').textContent=`${width} × ${height}`;renderLayers();compose();renderOverlay(); }
  function snapshot(){return {app:'pigment-studio',version:1,width,height,title,activeId,layers:layers.map(l=>{if(l.png===null)l.png=l.canvas.toDataURL('image/png');return {id:l.id,name:l.name,visible:l.visible,locked:l.locked,opacity:l.opacity,hasContent:l.hasContent,isBackground:Boolean(l.isBackground),data:l.png};})};}
  function commit(message='操作已完成',dirty=true){const l=activeLayer();if(dirty&&l){l.png=null;l.hasContent=true;}history=history.slice(0,historyIndex+1);history.push(snapshot());while(history.length>26)history.shift();let estimated=history.reduce((n,s)=>n+s.layers.reduce((m,l)=>m+l.data.length,0),0);while(estimated>48000000&&history.length>2){const gone=history.shift();estimated-=gone.layers.reduce((n,l)=>n+l.data.length,0);}historyIndex=history.length-1;updateHistory();updateDocumentUI();scheduleSave();status(message);}
  function updateHistory(){$('undo-btn').disabled=busy||historyIndex<=0;$('redo-btn').disabled=busy||historyIndex>=history.length-1;}
  function setBusy(value){busy=value;document.body.classList.toggle('busy',value);document.querySelectorAll('.header-actions button,.layer-actions button,#add-layer').forEach(b=>b.disabled=value);updateHistory();if(!value&&layers.length)renderLayers();}
  function decodeImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('图片无法解码，请尝试其他文件。'));img.src=src;});}
  async function restore(data,fit=false){
    const project=P.validateProject(data);setBusy(true);
    try{const loaded=await Promise.all(project.layers.map(async(l,i)=>{const img=await decodeImage(l.data);if(img.naturalWidth!==project.width||img.naturalHeight!==project.height)throw new Error('工程图层尺寸不一致。');const canvas=makeCanvas(project.width,project.height);canvas.getContext('2d').drawImage(img,0,0);return {...l,canvas,png:l.data,isBackground:Boolean(data.layers[i].isBackground)};}));
      width=project.width;height=project.height;title=project.title;layers=loaded;activeId=project.activeId;selection=null;strokeLive=false;resetBuffers();updateDocumentUI();if(fit)fitView();else applyView();
    }finally{setBusy(false);}
  }
  async function travelHistory(delta){if(busy||pointer)return;const next=historyIndex+delta;if(next<0||next>=history.length)return;try{const target=history[next],resized=width!==target.width||height!==target.height;await restore(target,resized);historyIndex=next;updateHistory();scheduleSave();status(delta<0?'已撤销上一步':'已重做一步');}catch(e){toast(e.message);}}
  function scheduleSave(){clearTimeout(autosaveTimer);$('save-state').innerHTML='<i></i>正在暂存';autosaveTimer=setTimeout(()=>{try{localStorage.setItem(storageKey,JSON.stringify(snapshot()));$('save-state').innerHTML='<i></i>已自动暂存';}catch{$('save-state').innerHTML='<i></i>请保存作品';$('save-state').title='浏览器暂存不可用或空间不足，请使用“保存作品”。';}},700);}
  function refreshColor(){document.documentElement.style.setProperty('--primary',primary);document.documentElement.style.setProperty('--secondary',secondary);document.documentElement.style.setProperty('--hue',`hsl(${hsv.h} 100% 50%)`);$('hex-color').value=primary.toUpperCase();$('native-color').value=primary;$('secondary-native').value=secondary;$('color-handle').style.left=`${hsv.s*100}%`;$('color-handle').style.top=`${(1-hsv.v)*100}%`;$('hue-range').value=hsv.h;$('color-square').setAttribute('aria-valuetext',`饱和度 ${Math.round(hsv.s*100)}%，亮度 ${Math.round(hsv.v*100)}%`);document.querySelectorAll('[data-color]').forEach(b=>{b.classList.toggle('active',b.dataset.color===primary);b.setAttribute('aria-pressed',String(b.dataset.color===primary));});tip=null;drawBrushPreview();}
  function setColor(color,keepHue=false){const rgb=P.hexToRgb(color);if(!rgb)return false;primary=P.rgbToHex(rgb.r,rgb.g,rgb.b);if(!keepHue){const next=P.rgbToHsv(rgb.r,rgb.g,rgb.b);if(next.s===0)next.h=hsv.h;hsv=next;}refreshColor();return true;}
  function rememberColor(){recent=[primary,...recent.filter(c=>c!==primary)].slice(0,7);$('recent-colors').replaceChildren(...recent.map(color=>{const b=document.createElement('button');b.style.backgroundColor=color;b.setAttribute('aria-label',`使用颜色 ${color}`);b.title=color;b.onclick=()=>setColor(color);return b;}));}
  function makeTip(){const c=makeCanvas(128,128),r=c.getContext('2d'),rgb=P.hexToRgb(tool==='eraser'?'#ffffff':primary),hard=P.clamp(hardness/100,0,.999),color=`${rgb.r},${rgb.g},${rgb.b}`;r.save();r.translate(64,64);if(tool==='marker'||tool==='highlight'){r.rotate(-.5);r.scale(1,.46);}const gradient=r.createRadialGradient(0,0,hard*62,0,0,63);gradient.addColorStop(0,`rgba(${color},1)`);gradient.addColorStop(1,`rgba(${color},0)`);r.fillStyle=gradient;r.beginPath();r.arc(0,0,63,0,Math.PI*2);r.fill();r.restore();if(tool==='pencil'){r.globalCompositeOperation='destination-out';let seed=89;for(let i=0;i<850;i++){seed=(seed*16807)%2147483647;const x=seed%128;seed=(seed*16807)%2147483647;const y=seed%128;r.fillStyle='rgba(0,0,0,.3)';r.fillRect(x,y,1,1);}}return c;}
  function drawBrushPreview(){const c=$('brush-preview'),r=c.getContext('2d');r.clearRect(0,0,c.width,c.height);const brush=makeTip(),s=tool==='pencil'?5:Math.min(42,Math.max(6,size*.75));r.globalAlpha=opacity/100;for(let i=0;i<210;i++){const t=i/209,x=37+t*383,y=57+Math.sin(t*Math.PI*2)*14;r.drawImage(brush,x-s/2,y-s/2,s,s);}r.globalAlpha=1;$('brush-preview-label').textContent=tool==='eraser'?'柔边擦除':tool==='pencil'?'颗粒铅笔':tool==='marker'?'扁圆笔头':tool==='highlight'?'透明叠色':tool==='spray'?'细颗粒喷涂':hardness>95?'硬边圆头':hardness<35?'柔雾笔头':'柔边圆头';}
  function syncProperties(){for(const [k,v] of [['size',size],['hardness',hardness],['opacity',opacity]]){$(`${k}-number`).value=v;$(`${k}-range`).value=v;$(`${k}-range`).style.background=`linear-gradient(to right,#70e0c3 ${100*(v-Number($(`${k}-range`).min))/(Number($(`${k}-range`).max)-Number($(`${k}-range`).min))}%,#363e4c 0)`;}tip=null;drawBrushPreview();}
  function selectTool(next){if(pointer||busy)return;if(!flatTools.some(t=>t[0]===next))return;if(settings[tool])settings[tool]={size,hardness,opacity};tool=next;if(settings[tool])({size,hardness,opacity}=settings[tool]);const info=flatTools.find(t=>t[0]===tool);$('tool-name').textContent=info[1];$('tool-description').textContent=info[3];$('context-icon').innerHTML=icon(tool);document.querySelectorAll('[data-tool]').forEach(b=>{b.classList.toggle('active',b.dataset.tool===tool);b.setAttribute('aria-pressed',String(b.dataset.tool===tool));});$('shape-options').hidden=!shapeTools.includes(tool);$('sides-wrap').hidden=tool!=='polygon';$('fill-options').hidden=tool!=='fill';$('gradient-options').hidden=tool!=='gradient';$('crop-options').hidden=tool!=='crop';syncProperties();setCursor();renderOverlay();status(info[3]);}
  function setCursor(){viewport.style.cursor=spaceHeld||tool==='hand'?'grab':tool==='zoom'?'zoom-in':tool==='text'?'text':tool==='move'?'move':drawingTools.includes(tool)?'none':'crosshair';$('brush-cursor').hidden=true;}
  function renderLayers(){
    $('layer-count').textContent=layers.length;const current=activeLayer();$('layer-opacity').value=Math.round((current?.opacity??1)*100);$('layer-opacity-label').textContent=`${$('layer-opacity').value}%`;
    $('layer-list').replaceChildren(...[...layers].reverse().map(l=>{
      const row=document.createElement('div');row.className=`layer-row${l.id===activeId?' active':''}`;row.tabIndex=0;row.setAttribute('role','listitem');row.setAttribute('aria-label',`${l.name}${l.id===activeId?'，当前图层':''}${l.locked?'，已锁定':''}`);
      const eye=document.createElement('button');eye.className='icon-button';eye.innerHTML=icon(l.visible?'eye':'eyeoff');eye.title=l.visible?'隐藏图层':'显示图层';eye.setAttribute('aria-label',`${eye.title} ${l.name}`);eye.onclick=e=>{e.stopPropagation();if(busy||pointer)return;l.visible=!l.visible;commit('图层可见性已更新',false);};
      const thumb=document.createElement('img');thumb.className='layer-thumbnail';thumb.alt='';const mini=makeCanvas(78,58),mc=mini.getContext('2d'),scale=Math.min(78/width,58/height);mc.drawImage(l.canvas,(78-width*scale)/2,(58-height*scale)/2,width*scale,height*scale);thumb.src=mini.toDataURL();
      const meta=document.createElement('div');meta.className='layer-meta';const name=document.createElement('strong');name.textContent=l.name;const small=document.createElement('small');small.textContent=`正常 · ${Math.round(l.opacity*100)}%${l.locked?' · 锁定':''}`;meta.append(name,small);
      const lock=document.createElement('button');lock.className='icon-button';lock.innerHTML=icon(l.locked?'lock':'unlock');lock.title=l.locked?'解锁图层':'锁定图层';lock.setAttribute('aria-label',`${lock.title} ${l.name}`);lock.onclick=e=>{e.stopPropagation();if(busy||pointer)return;l.locked=!l.locked;commit('图层锁定状态已更新',false);};
      row.append(eye,thumb,meta,lock);const choose=()=>{if(busy||pointer)return;activeId=l.id;selection=null;renderLayers();renderOverlay();status(`当前图层：${l.name}`);};row.onclick=choose;row.onkeydown=e=>{if(e.target!==row)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}};return row;
    }));
    const index=layers.findIndex(l=>l.id===activeId);$('layer-up').disabled=busy||index===layers.length-1;$('layer-down').disabled=busy||index<=0;$('delete-layer').disabled=busy||layers.length<=1;$('add-layer').disabled=busy||layers.length>=12;$('duplicate-layer').disabled=busy||layers.length>=12;
  }

  function screenPoint(e){const r=viewport.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
  function scenePoint(e){const p=screenPoint(e);return {x:(p.x-view.x)/view.zoom,y:(p.y-view.y)/view.zoom,p:e.pointerType==='pen'&&$('pressure').checked?P.clamp(e.pressure||.1,.08,1):1};}
  function inside(p){return p.x>=0&&p.y>=0&&p.x<width&&p.y<height;}
  function stamp(p){
    const c=stroke.getContext('2d'),s=Math.max(1,size*p.p);
    if(tool==='spray'){c.fillStyle=primary;const count=Math.max(10,Math.round(s*.9));for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,d=Math.sqrt(Math.random())*s/2,x=p.x+Math.cos(a)*d,y=p.y+Math.sin(a)*d;c.globalAlpha=(.12+.35*hardness/100)*(1-d/s);c.beginPath();c.arc(x,y,Math.max(.5,s/65*Math.random()),0,Math.PI*2);c.fill();}c.globalAlpha=1;}
    else{if(!tip)tip=makeTip();c.drawImage(tip,p.x-s/2,p.y-s/2,s,s);}
  }
  function strokeSegment(from,to){const distance=Math.hypot(to.x-from.x,to.y-from.y),spacing=Math.max(.5,size*(tool==='spray'?.22:.12)*Math.min(from.p,to.p));const steps=Math.max(1,Math.ceil(distance/spacing));for(let i=1;i<=steps;i++){const t=i/steps;stamp({x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,p:from.p+(to.p-from.p)*t});}}
  function drawShape(a,b,constrain){const c=stroke.getContext('2d');c.clearRect(0,0,width,height);let dx=b.x-a.x,dy=b.y-a.y;
    if(constrain){if(['rect','ellipse'].includes(tool)){const side=Math.max(Math.abs(dx),Math.abs(dy));dx=Math.sign(dx||1)*side;dy=Math.sign(dy||1)*side;}else if(['line','arrow'].includes(tool)){const angle=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4,d=Math.hypot(dx,dy);dx=Math.cos(angle)*d;dy=Math.sin(angle)*d;}}
    const end={x:a.x+dx,y:a.y+dy},doStroke=$('shape-stroke').checked,doFill=$('shape-fill').checked;c.strokeStyle=primary;c.fillStyle=primary;c.lineWidth=size;c.lineCap='round';c.lineJoin='round';c.beginPath();
    if(tool==='line'||tool==='arrow'){c.moveTo(a.x,a.y);c.lineTo(end.x,end.y);c.stroke();if(tool==='arrow'){const angle=Math.atan2(dy,dx),head=Math.min(Math.hypot(dx,dy)*.45,Math.max(15,size*4));c.beginPath();c.moveTo(end.x,end.y);c.lineTo(end.x-head*Math.cos(angle-.45),end.y-head*Math.sin(angle-.45));c.lineTo(end.x-head*Math.cos(angle+.45),end.y-head*Math.sin(angle+.45));c.closePath();c.fill();}return;}
    if(tool==='rect')c.rect(a.x,a.y,dx,dy);else if(tool==='ellipse')c.ellipse(a.x+dx/2,a.y+dy/2,Math.abs(dx)/2,Math.abs(dy)/2,0,0,Math.PI*2);else if(tool==='polygon'){const count=P.clamp(parseInt($('polygon-sides').value)||6,3,12),radius=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);for(let i=0;i<count;i++){const x=a.x+Math.cos(angle+i*Math.PI*2/count)*radius,y=a.y+Math.sin(angle+i*Math.PI*2/count)*radius;i?c.lineTo(x,y):c.moveTo(x,y);}c.closePath();}
    if(doFill)c.fill();if(doStroke||!doFill)c.stroke();
  }
  function drawGradient(a,b){const c=stroke.getContext('2d');c.clearRect(0,0,width,height);if(Math.hypot(b.x-a.x,b.y-a.y)<.1)b={x:a.x+1,y:a.y};const gradient=$('gradient-type').value==='radial'?c.createRadialGradient(a.x,a.y,0,a.x,a.y,Math.hypot(b.x-a.x,b.y-a.y)):c.createLinearGradient(a.x,a.y,b.x,b.y);gradient.addColorStop(0,primary);gradient.addColorStop(1,secondary);c.fillStyle=gradient;c.fillRect(0,0,width,height);}
  function finishStroke(message){if(!strokeLive)return;buildWorking();const l=activeLayer(),c=l.canvas.getContext('2d');c.clearRect(0,0,width,height);c.drawImage(working,0,0);strokeLive=false;strokeIsMove=false;stroke.getContext('2d').clearRect(0,0,width,height);rememberColor();commit(message);}
  function pickColor(p){if(!inside(p))return;compose(ctx,false);const data=ctx.getImageData(Math.floor(p.x),Math.floor(p.y),1,1).data;if(!data[3]){toast('这里是透明区域，没有可拾取的颜色。');return;}setColor(P.rgbToHex(...data.slice(0,3)));toast(`已拾取 ${primary.toUpperCase()}`);}
  function bucket(p){if(!ensureEditable())return;const l=activeLayer();compose(ctx,false);const source=$('sample-all').checked?ctx:l.canvas.getContext('2d'),data=source.getImageData(0,0,width,height),mask=P.floodRegion(data.data,width,height,p.x,p.y,P.clamp(Number($('fill-tolerance').value)||0,0,150),selection);const c=stroke.getContext('2d'),image=c.createImageData(width,height),rgb=P.hexToRgb(primary);let count=0;for(let i=0;i<mask.length;i++){if(!mask[i])continue;const at=i*4;image.data[at]=rgb.r;image.data[at+1]=rgb.g;image.data[at+2]=rgb.b;image.data[at+3]=255;count++;}if(!count)return;c.putImageData(image,0,0);strokeLive=true;finishStroke(`已填色 ${count.toLocaleString()} 个像素`);}
  function prepareMove(p){const l=activeLayer();moveBase=makeCanvas();moveBase.getContext('2d').drawImage(l.canvas,0,0);const s=selection||{x:0,y:0,w:width,h:height};movePixels=makeCanvas(s.w,s.h);movePixels.getContext('2d').drawImage(l.canvas,s.x,s.y,s.w,s.h,0,0,s.w,s.h);moveBase.getContext('2d').clearRect(s.x,s.y,s.w,s.h);pointer.moveOrigin={...s};pointer.hadSelection=Boolean(selection);pointer.start=p;strokeIsMove=true;strokeLive=true;drawMove(p);}
  function drawMove(p){const dx=Math.round(p.x-pointer.start.x),dy=Math.round(p.y-pointer.start.y),s=pointer.moveOrigin,c=stroke.getContext('2d');c.clearRect(0,0,width,height);c.drawImage(moveBase,0,0);c.drawImage(movePixels,s.x+dx,s.y+dy);if(pointer.hadSelection)selection=P.rectFromPoints({x:s.x+dx,y:s.y+dy},{x:s.x+dx+s.w,y:s.y+dy+s.h},width,height);}
  function beginPointer(e){
    if(busy||pointer||e.button>1)return;if(e.target.closest('.selection-actions'))return;e.preventDefault();viewport.focus({preventScroll:true});const p=scenePoint(e),screen=screenPoint(e);
    if(spaceHeld||tool==='hand'||e.button===1){pointer={id:e.pointerId,kind:'pan',start:screen,view:{...view}};viewport.setPointerCapture(e.pointerId);viewport.style.cursor='grabbing';return;}
    if(tool==='zoom'){setZoom(view.zoom*(e.altKey ? .8 : 1.25),screen);return;}if(!inside(p))return;
    if(tool==='dropper'){pickColor(p);return;}if(tool==='fill'){bucket(p);return;}
    if(tool==='text'){if(!ensureEditable())return;pendingText=p;$('text-dialog').showModal();$('text-content').focus();return;}
    if(!['select','crop'].includes(tool)&&!ensureEditable())return;
    pointer={id:e.pointerId,kind:tool,start:p,last:p,raw:p,oldSelection:selection?{...selection}:null};viewport.setPointerCapture(e.pointerId);
    if(tool==='select'||tool==='crop'){selection={x:Math.floor(p.x),y:Math.floor(p.y),w:0,h:0};renderOverlay();return;}
    stroke.getContext('2d').clearRect(0,0,width,height);strokeLive=true;strokeIsMove=false;
    if(tool==='move')prepareMove(p);
    else if(drawingTools.includes(tool)){stamp(p);if(tool==='spray')airTimer=setInterval(()=>{if(pointer&&pointer.kind==='spray'){stamp(pointer.raw);requestRender();}},45);}
    else if(shapeTools.includes(tool))drawShape(p,p,e.shiftKey);
    requestRender();
  }
  function updatePointer(e){
    const p=scenePoint(e),screen=screenPoint(e);$('cursor-position').textContent=`X ${Math.round(p.x)}　Y ${Math.round(p.y)}`;
    const cursor=$('brush-cursor');if(drawingTools.includes(tool)&&!spaceHeld&&inside(p)&&!busy){cursor.hidden=false;cursor.style.left=`${screen.x}px`;cursor.style.top=`${screen.y}px`;cursor.style.width=`${Math.max(3,size*view.zoom*p.p)}px`;cursor.style.height=`${Math.max(3,size*view.zoom*p.p)}px`;}else cursor.hidden=true;
    if(!pointer||pointer.id!==e.pointerId)return;e.preventDefault();
    if(pointer.kind==='pan'){view.x=pointer.view.x+screen.x-pointer.start.x;view.y=pointer.view.y+screen.y-pointer.start.y;applyView();return;}
    pointer.raw=p;
    if(pointer.kind==='select'||pointer.kind==='crop'){let end=p;if(e.shiftKey){const d=Math.max(Math.abs(p.x-pointer.start.x),Math.abs(p.y-pointer.start.y));end={x:pointer.start.x+Math.sign(p.x-pointer.start.x||1)*d,y:pointer.start.y+Math.sign(p.y-pointer.start.y||1)*d};}selection=P.rectFromPoints(pointer.start,end,width,height);renderOverlay();return;}
    if(tool==='move')drawMove(p);
    else if(drawingTools.includes(tool)){const smooth=$('smoothing').checked&&tool!=='spray',next=smooth?{x:pointer.last.x+(p.x-pointer.last.x)*.68,y:pointer.last.y+(p.y-pointer.last.y)*.68,p:p.p}:p;strokeSegment(pointer.last,next);pointer.last=next;}
    else if(shapeTools.includes(tool))drawShape(pointer.start,p,e.shiftKey);
    else if(tool==='gradient')drawGradient(pointer.start,p);
    requestRender();
  }
  function endPointer(e){if(!pointer||pointer.id!==e.pointerId)return;clearInterval(airTimer);const kind=pointer.kind;
    if(drawingTools.includes(kind)&&kind!=='spray')strokeSegment(pointer.last,scenePoint(e));
    if(kind==='select'||kind==='crop'){if(!selection?.w||!selection?.h)selection=null;status(kind==='crop'?'按 Enter 应用裁剪，Esc 取消。':'选区已建立，可绘画、移动或清除选区内像素。');}
    else if(kind!=='pan')finishStroke(`${flatTools.find(t=>t[0]===tool)?.[1]||'绘画'} · 已完成`);
    pointer=null;moveBase=null;movePixels=null;if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);setCursor();renderOverlay();
  }
  function cancelPointer(){if(!pointer)return;clearInterval(airTimer);const old=pointer;pointer=null;strokeLive=false;strokeIsMove=false;selection=old.oldSelection||null;moveBase=null;movePixels=null;if(viewport.hasPointerCapture(old.id))viewport.releasePointerCapture(old.id);compose();renderOverlay();setCursor();}
  function cropCanvas(){if(busy||pointer||!selection||selection.w<1||selection.h<1){toast('请先拖出一个裁剪区域。');return;}const s=selection;layers.forEach(l=>{const c=makeCanvas(s.w,s.h);c.getContext('2d').drawImage(l.canvas,s.x,s.y,s.w,s.h,0,0,s.w,s.h);l.canvas=c;l.png=null;});width=s.w;height=s.h;selection=null;resetBuffers();fitView();commit(`画布已裁剪为 ${width} × ${height}`,false);}
  function clearSelected(){if(!selection||!ensureEditable()||pointer)return;activeLayer().canvas.getContext('2d').clearRect(selection.x,selection.y,selection.w,selection.h);commit('已清除选区内像素');}
  function newDocument(w,h,background='#ffffff',record=true){width=w;height=h;title='未命名作品';layers=[];if(background!=='transparent'){const bg=createLayer('背景',background);bg.locked=true;bg.isBackground=true;layers.push(bg);}const l=createLayer('图层 1');layers.push(l);activeId=l.id;selection=null;resetBuffers();fitView();updateDocumentUI();if(record)commit('新画布已创建，可撤销回到上一个作品。',false);}
  function addLayer(name='新图层'){if(busy||pointer)return;if(layers.length>=12){toast('最多支持 12 个图层。');return;}const l=createLayer(name),index=layers.findIndex(v=>v.id===activeId);layers.splice(index+1,0,l);activeId=l.id;selection=null;commit('已新建图层',false);}
  function moveLayer(offset){if(busy||pointer)return;const i=layers.findIndex(l=>l.id===activeId),next=i+offset;if(next<0||next>=layers.length)return;[layers[i],layers[next]]=[layers[next],layers[i]];commit('图层顺序已更新',false);}
  function download(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function safeFilename(){return (title||'未命名作品').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,60);}
  function saveProject(){if(busy||pointer)return;try{download(new Blob([JSON.stringify(snapshot())],{type:'application/json'}),`${safeFilename()}.pigment.json`);toast('工程文件已交给浏览器下载，包含全部图层。');}catch(e){toast(`保存失败：${e.message}`);}}
  function exportPNG(){if(busy||pointer)return;const c=makeCanvas();compose(c.getContext('2d'),false);c.toBlob(blob=>{if(!blob){toast('导出失败，请尝试保存工程。');return;}download(blob,`${safeFilename()}.png`);toast(`PNG 已交给浏览器下载 · ${width} × ${height}`);},'image/png');}
  function readFile(file,asText=false){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('读取文件失败。'));asText?reader.readAsText(file):reader.readAsDataURL(file);});}
  async function openFile(file){if(!file||busy||pointer)return;if(file.size>35000000){toast('文件过大，请选择 35 MB 以内的图片或工程。');return;}setBusy(true);
    try{
      if(/\.json$/i.test(file.name)){const data=JSON.parse(await readFile(file,true));await restore(data,true);commit('工程已打开，可撤销回到之前的画布。',false);toast('工程已打开，所有图层已恢复。');}
      else{if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type))throw new Error('请选择 PNG、JPEG、WebP、GIF 图片或画室工程。');if(layers.length>=12)throw new Error('图层已满，请先删除一个图层。');const image=await decodeImage(await readFile(file));if(image.naturalWidth*image.naturalHeight>40000000)throw new Error('图片像素过大，请缩小到 4000 万像素以内。');const l=createLayer(file.name.replace(/\.[^.]+$/,'')),scale=Math.min(width/image.naturalWidth,height/image.naturalHeight,1),w=image.naturalWidth*scale,h=image.naturalHeight*scale;l.canvas.getContext('2d').drawImage(image,(width-w)/2,(height-h)/2,w,h);l.hasContent=true;layers.push(l);activeId=l.id;selection=null;commit('图片已作为新图层导入',true);toast('图片已导入，可使用移动工具调整位置。');}
    }catch(e){toast(`无法打开：${e.message}`);}finally{setBusy(false);renderLayers();$('file-input').value='';}
  }
  function insertText(){if(!pendingText||!ensureEditable())return;const text=$('text-content').value;if(!text.trim())return;const c=stroke.getContext('2d'),fontSize=P.clamp(Number($('font-size').value)||48,8,400),font=$('font-family').value;c.clearRect(0,0,width,height);c.fillStyle=primary;c.font=`${$('font-bold').checked?'700':'400'} ${fontSize}px ${font==='sans-serif'?'"Microsoft YaHei UI","Segoe UI",sans-serif':font==='serif'?'"SimSun",Georgia,serif':'Consolas,monospace'}`;c.textBaseline='top';text.split('\n').slice(0,80).forEach((line,i)=>c.fillText(line,pendingText.x,pendingText.y+i*fontSize*1.3));strokeLive=true;finishStroke('文字已绘制到当前图层');pendingText=null;}
  function loadDemo(){
    if(busy||pointer)return;newDocument(1200,780,'#f6f2e9',false);title='灵感练习 · MAKE YOUR MARK';
    const shape=activeLayer();shape.name='几何与色彩';const c=shape.canvas.getContext('2d');c.fillStyle='#152a32';c.beginPath();c.arc(860,355,210,0,Math.PI*2);c.fill();c.fillStyle='#bddbc6';c.beginPath();c.arc(935,245,137,0,Math.PI*2);c.fill();c.fillStyle='#ee8f6e';c.fillRect(710,398,260,203);c.clearRect(710,398,100,90);c.lineCap='round';c.lineWidth=63;const g=c.createLinearGradient(520,610,1110,315);g.addColorStop(0,'#34b6a0');g.addColorStop(1,'#8adaad');c.strokeStyle=g;c.beginPath();c.moveTo(570,585);c.bezierCurveTo(700,585,612,270,796,300);c.bezierCurveTo(1000,330,835,690,1092,509);c.stroke();c.strokeStyle='#f7d77d';c.lineWidth=12;c.beginPath();c.moveTo(665,166);c.bezierCurveTo(1010,70,1126,280,1036,381);c.stroke();shape.hasContent=true;shape.png=null;
    const type=createLayer('标题与细节'),t=type.canvas.getContext('2d');t.fillStyle='#28463f';t.font='12px Consolas';t.fillText('P I G M E N T   /   C R E A T I V E   S T U D Y   0 1',70,74);t.fillStyle='#1d3636';t.font='700 78px "Segoe UI",sans-serif';t.fillText('MAKE',69,245);t.fillText('YOUR',69,335);t.fillText('MARK.',69,425);t.fillStyle='#74837b';t.font='18px "Microsoft YaHei UI",sans-serif';t.fillText('每一种灵感，都值得留下痕迹。',73,488);t.fillStyle='#6b7b75';t.font='11px Consolas';t.fillText('DRAW. EXPLORE. REPEAT.',74,527);['#1d3636','#34b6a0','#bddbc6','#ee8f6e','#f7d77d'].forEach((color,i)=>{t.fillStyle=color;t.beginPath();t.roundRect(73+i*45,604,32,32,4);t.fill();});t.fillStyle='#88948b';t.font='10px Consolas';t.fillText('YOUR CANVAS. YOUR POSSIBILITIES.',73,704);t.fillText('1200 × 780  /  RGB',962,704);type.hasContent=true;layers.push(type);
    const draw=createLayer('自由创作');layers.push(draw);activeId=draw.id;commit('示例已载入，可以在“自由创作”图层继续画。',false);fitView();toast('示例已打开；按撤销可回到之前的作品。');
  }

  for(const [groupName,entries] of tools){const group=document.createElement('div');group.className='tool-group';const name=document.createElement('span');name.className='tool-group-title';name.textContent=groupName;const grid=document.createElement('div');grid.className='tool-grid';for(const [key,label,shortcut] of entries){const b=document.createElement('button');b.className='tool-button';b.dataset.tool=key;b.title=`${label}${shortcut?` (${shortcut})`:''}`;b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed',String(key===tool));b.innerHTML=icon(key);b.onclick=()=>selectTool(key);grid.append(b);}group.append(name,grid);$('tool-groups').append(group);}
  const swatches=['#f7f4ed','#c4c9d1','#6b7b8f','#172936','#000000','#e86767','#efad73','#f4d57c','#c4dbae','#78c6aa','#23b99b','#62cdd4','#70a9e6','#7d83d7','#b8a3f4','#d6a6cf','#cc798c','#9e725b','#707969','#3e635c'];
  for(const color of swatches){const b=document.createElement('button');b.className='swatch';b.style.backgroundColor=color;b.dataset.color=color;b.title=color.toUpperCase();b.setAttribute('aria-label',`使用颜色 ${color}`);b.onclick=()=>setColor(color);$('swatches').append(b);}
  for(const property of ['size','hardness','opacity'])for(const kind of ['range','number']){
    const input=$(`${property}-${kind}`);if(property==='size'&&kind==='range')input.max='400';
    input.addEventListener('input',()=>{if(input.value===''||pointer)return;const v=P.clamp(Number(input.value),Number(input.min),Number(input.max));if(!Number.isFinite(v))return;if(property==='size')size=v;else if(property==='hardness')hardness=v;else opacity=v;syncProperties();});
    input.addEventListener('change',syncProperties);
  }
  let colorDrag=false;
  function colorAt(e){const r=$('color-square').getBoundingClientRect();hsv.s=P.clamp((e.clientX-r.left)/r.width,0,1);hsv.v=1-P.clamp((e.clientY-r.top)/r.height,0,1);const rgb=P.hsvToRgb(hsv.h,hsv.s,hsv.v);setColor(P.rgbToHex(rgb.r,rgb.g,rgb.b),true);}
  $('color-square').addEventListener('pointerdown',e=>{e.preventDefault();colorDrag=true;$('color-square').setPointerCapture(e.pointerId);colorAt(e);});
  $('color-square').addEventListener('pointermove',e=>{if(colorDrag)colorAt(e);});
  $('color-square').addEventListener('pointerup',()=>colorDrag=false);$('color-square').addEventListener('pointercancel',()=>colorDrag=false);
  $('color-square').addEventListener('keydown',e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();e.stopPropagation();const d=e.shiftKey?.1:.02;if(e.key==='ArrowRight')hsv.s=P.clamp(hsv.s+d,0,1);if(e.key==='ArrowLeft')hsv.s=P.clamp(hsv.s-d,0,1);if(e.key==='ArrowUp')hsv.v=P.clamp(hsv.v+d,0,1);if(e.key==='ArrowDown')hsv.v=P.clamp(hsv.v-d,0,1);const rgb=P.hsvToRgb(hsv.h,hsv.s,hsv.v);setColor(P.rgbToHex(rgb.r,rgb.g,rgb.b),true);});
  $('hue-range').addEventListener('input',e=>{hsv.h=Number(e.target.value);const rgb=P.hsvToRgb(hsv.h,hsv.s,hsv.v);setColor(P.rgbToHex(rgb.r,rgb.g,rgb.b),true);});
  $('native-color').addEventListener('input',e=>setColor(e.target.value));
  $('hex-color').addEventListener('change',e=>{if(!setColor(e.target.value)){toast('请输入 3 位或 6 位十六进制颜色，例如 #23B99B。');refreshColor();}});
  $('hex-color').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.target.blur();}});
  $('secondary-color-btn').onclick=()=>$('secondary-native').click();$('secondary-native').oninput=e=>{secondary=e.target.value;refreshColor();};
  $('swap-colors').onclick=()=>{const old=primary;setColor(secondary);secondary=old;refreshColor();};
  $('color-copy').onclick=async()=>{try{await navigator.clipboard.writeText(primary.toUpperCase());toast('颜色代码已复制。');}catch{$('hex-color').focus();$('hex-color').select();toast('已选中颜色代码，按 Ctrl+C 复制。');}};
  $('mirror-x').onclick=()=>{mirrorX=!mirrorX;$('mirror-x').setAttribute('aria-pressed',String(mirrorX));renderOverlay();};
  $('mirror-y').onclick=()=>{mirrorY=!mirrorY;$('mirror-y').setAttribute('aria-pressed',String(mirrorY));renderOverlay();};
  $('grid-btn').onclick=()=>{grid=!grid;$('grid-btn').setAttribute('aria-pressed',String(grid));renderOverlay();};
  for(const id of ['shape-stroke','shape-fill'])$(id).onchange=()=>{if(!$('shape-stroke').checked&&!$('shape-fill').checked)$(id==='shape-stroke'?'shape-fill':'shape-stroke').checked=true;};
  $('undo-btn').onclick=()=>travelHistory(-1);$('redo-btn').onclick=()=>travelHistory(1);
  $('zoom-in').onclick=()=>setZoom(view.zoom*1.2);$('zoom-out').onclick=()=>setZoom(view.zoom/1.2);$('zoom-label').onclick=()=>setZoom(1);$('fit-btn').onclick=fitView;
  viewport.addEventListener('pointerdown',beginPointer);viewport.addEventListener('pointermove',updatePointer);viewport.addEventListener('pointerup',endPointer);viewport.addEventListener('pointercancel',cancelPointer);viewport.addEventListener('lostpointercapture',()=>{if(pointer)cancelPointer();});
  viewport.addEventListener('pointerleave',()=>{$('brush-cursor').hidden=true;});viewport.addEventListener('contextmenu',e=>e.preventDefault());
  viewport.addEventListener('wheel',e=>{e.preventDefault();if(pointer)return;if(e.shiftKey){view.x-=e.deltaY;applyView();}else setZoom(view.zoom*Math.exp(-e.deltaY*.0015),screenPoint(e));},{passive:false});
  viewport.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';});viewport.addEventListener('drop',e=>{e.preventDefault();openFile(e.dataTransfer.files[0]);});
  $('apply-crop').onclick=cropCanvas;$('cancel-selection').onclick=$('deselect-btn').onclick=()=>{selection=null;renderOverlay();};$('clear-selection').onclick=clearSelected;
  $('add-layer').onclick=()=>addLayer(`图层 ${layers.filter(l=>!l.isBackground).length+1}`);
  $('layer-up').onclick=()=>moveLayer(1);$('layer-down').onclick=()=>moveLayer(-1);
  $('duplicate-layer').onclick=()=>{if(busy||pointer||layers.length>=12)return;const source=activeLayer(),copy=createLayer(`${source.name} 副本`);copy.canvas.getContext('2d').drawImage(source.canvas,0,0);copy.opacity=source.opacity;copy.visible=source.visible;copy.hasContent=source.hasContent;copy.isBackground=source.isBackground;layers.splice(layers.indexOf(source)+1,0,copy);activeId=copy.id;commit('图层已复制',false);};
  $('delete-layer').onclick=()=>{if(busy||pointer||layers.length<=1)return;const index=layers.findIndex(l=>l.id===activeId);layers.splice(index,1);activeId=layers[Math.min(index,layers.length-1)].id;selection=null;commit('图层已删除，可撤销找回。',false);};
  $('layer-opacity').oninput=e=>{if(busy||pointer)return;activeLayer().opacity=Number(e.target.value)/100;$('layer-opacity-label').textContent=`${e.target.value}%`;compose();};$('layer-opacity').onchange=()=>{if(!busy&&!pointer)commit('图层不透明度已更新',false);};
  $('rename-layer').onclick=()=>{if(busy||pointer)return;$('layer-name-input').value=activeLayer().name;$('rename-dialog').showModal();$('layer-name-input').focus();$('layer-name-input').select();};
  $('rename-form').onsubmit=e=>{if(e.submitter?.value!=='rename')return;e.preventDefault();const name=$('layer-name-input').value.trim();if(!name)return;activeLayer().name=name;$('rename-dialog').close();commit('图层已重命名',false);};
  $('document-name').onchange=e=>{if(busy||pointer)return;title=e.target.value.trim()||'未命名作品';commit('作品名称已更新',false);};
  $('new-btn').onclick=()=>{if(busy||pointer)return;$('new-dialog').showModal();};
  document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{const [w,h]=b.dataset.preset.split(',');$('new-width').value=w;$('new-height').value=h;document.querySelectorAll('[data-preset]').forEach(v=>v.classList.toggle('active',v===b));});
  $('new-form').onsubmit=e=>{if(e.submitter?.value!=='create')return;e.preventDefault();const w=Math.floor(Number($('new-width').value)),h=Math.floor(Number($('new-height').value));if(!Number.isFinite(w)||!Number.isFinite(h)||w<64||h<64||w>4096||h>4096||w*h>8000000){toast('画布单边为 64—4096 像素，总像素不能超过 800 万。');return;}$('new-dialog').close();newDocument(w,h,$('new-background').value);};
  $('text-form').onsubmit=e=>{if(e.submitter?.value!=='draw')return;e.preventDefault();insertText();$('text-dialog').close();};
  $('save-btn').onclick=saveProject;$('export-btn').onclick=exportPNG;$('open-btn').onclick=()=>{if(!busy&&!pointer)$('file-input').click();};$('file-input').onchange=e=>openFile(e.target.files[0]);
  $('help-btn').onclick=()=>{if(!pointer)$('help-dialog').showModal();};$('help-close').onclick=()=>$('help-dialog').close();$('demo-btn').onclick=()=>{$('help-dialog').close();loadDemo();};
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}));
  document.addEventListener('keydown',e=>{
    if(document.querySelector('dialog[open]')||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||busy)return;
    const key=e.key.toLowerCase(),command=e.ctrlKey||e.metaKey;
    if(command){if(key==='z'){e.preventDefault();travelHistory(e.shiftKey?1:-1);}else if(key==='y'){e.preventDefault();travelHistory(1);}else if(key==='s'){e.preventDefault();e.shiftKey?exportPNG():saveProject();}else if(key==='o'){e.preventDefault();$('file-input').click();}else if(key==='d'){e.preventDefault();selection=null;renderOverlay();}return;}
    if(key===' '||e.code==='Space'){e.preventDefault();spaceHeld=true;setCursor();return;}
    if(key==='escape'){if(pointer)cancelPointer();else{selection=null;renderOverlay();}return;}
    if(pointer)return;
    if(key==='enter'&&tool==='crop'){e.preventDefault();cropCanvas();return;}
    if((key==='delete'||key==='backspace')&&selection){e.preventDefault();clearSelected();return;}
    const chosen=flatTools.find(t=>t[2]&&t[2].toLowerCase()===key);if(chosen){e.preventDefault();selectTool(chosen[0]);return;}
    if(key==='['||key===']'){e.preventDefault();size=P.clamp(Math.round(size*(key===']'?1.15:.87))+(size<8?(key===']'?1:-1):0),1,400);syncProperties();}
    else if(key==='x')$('swap-colors').click();else if(key==='0'){e.preventDefault();fitView();}else if(key==='+'||key==='='){e.preventDefault();setZoom(view.zoom*1.2);}else if(key==='-'){e.preventDefault();setZoom(view.zoom/1.2);}else if(key==='?')$('help-dialog').showModal();
  });
  document.addEventListener('keyup',e=>{if(e.key===' '||e.code==='Space'){spaceHeld=false;setCursor();}});
  window.addEventListener('blur',()=>{spaceHeld=false;cancelPointer();setCursor();});
  new ResizeObserver(()=>{if(!pointer)fitView();}).observe(viewport);
  newDocument(1280,800,'#ffffff',false);selectTool('brush');refreshColor();history=[snapshot()];historyIndex=0;updateHistory();status('一切准备就绪，只差你的灵感。');
  try{const saved=localStorage.getItem(storageKey);if(saved){restore(JSON.parse(saved),true).then(()=>{history=[snapshot()];historyIndex=0;updateHistory();$('save-state').innerHTML='<i></i>已恢复暂存';status('已恢复上次的作品。');}).catch(()=>{toast('上次的暂存无法恢复，已打开新画布。');});}}catch{$('save-state').innerHTML='<i></i>手动保存模式';}
})();
