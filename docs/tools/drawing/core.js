(function(root){
 'use strict';
 const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
 function hexToRgb(hex){const s=String(hex).replace(/^#/,'');const full=s.length===3?s.split('').map(c=>c+c).join(''):s;if(!/^[0-9a-f]{6}$/i.test(full))return null;return {r:parseInt(full.slice(0,2),16),g:parseInt(full.slice(2,4),16),b:parseInt(full.slice(4,6),16)};}
 function rgbToHex(r,g,b){return '#'+[r,g,b].map(v=>Math.round(clamp(v,0,255)).toString(16).padStart(2,'0')).join('');}
 function rgbToHsv(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0;if(d)h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;return {h:(h*60+360)%360,s:max?d/max:0,v:max};}
 function hsvToRgb(h,s,v){h=((h%360)+360)%360;const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;const a=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return {r:Math.round((a[0]+m)*255),g:Math.round((a[1]+m)*255),b:Math.round((a[2]+m)*255)};}
 function rectFromPoints(a,b,width,height){const x=clamp(Math.floor(Math.min(a.x,b.x)),0,width),y=clamp(Math.floor(Math.min(a.y,b.y)),0,height),right=clamp(Math.ceil(Math.max(a.x,b.x)),0,width),bottom=clamp(Math.ceil(Math.max(a.y,b.y)),0,height);return {x,y,w:Math.max(0,right-x),h:Math.max(0,bottom-y)};}
 function zoomAt(view,point,next){const zoom=clamp(next,.05,8),dx=(point.x-view.x)/view.zoom,dy=(point.y-view.y)/view.zoom;return {x:point.x-dx*zoom,y:point.y-dy*zoom,zoom};}
 function floodRegion(data,width,height,sx,sy,tolerance=32,bounds=null){
  const result=new Uint8Array(width*height),startX=Math.floor(sx),startY=Math.floor(sy);
  const x0=bounds?bounds.x:0,y0=bounds?bounds.y:0,x1=bounds?bounds.x+bounds.w:width,y1=bounds?bounds.y+bounds.h:height;
  if(startX<x0||startY<y0||startX>=x1||startY>=y1)return result;
  const offset=(startY*width+startX)*4,target=[data[offset],data[offset+1],data[offset+2],data[offset+3]];
  const matches=(x,y)=>{if(x<x0||x>=x1||y<y0||y>=y1)return false;const i=y*width+x;if(result[i])return false;const p=i*4;if(Math.abs(data[p+3]-target[3])>tolerance)return false;if(target[3]===0&&data[p+3]===0)return true;return Math.max(Math.abs(data[p]-target[0]),Math.abs(data[p+1]-target[1]),Math.abs(data[p+2]-target[2]))<=tolerance;};
  const stack=[startY*width+startX];while(stack.length){const p=stack.pop(),y=Math.floor(p/width);let x=p%width;if(!matches(x,y))continue;while(x>x0&&matches(x-1,y))x--;let up=false,down=false;for(;x<x1&&matches(x,y);x++){result[y*width+x]=1;const a=matches(x,y-1),b=matches(x,y+1);if(a&&!up)stack.push((y-1)*width+x);if(b&&!down)stack.push((y+1)*width+x);up=a;down=b;}}return result;
 }
 function validateProject(input){
  if(!input||input.app!=='pigment-studio'||input.version!==1)throw new Error('这不是灵感画室的工程文件。');
  const {width,height,layers}=input;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096||width*height>8000000)throw new Error('画布尺寸超出范围：单边最大 4096，总像素不超过 800 万。');
  if(!Array.isArray(layers)||layers.length<1||layers.length>12)throw new Error('工程需要包含 1 到 12 个图层。');
  const ids=new Set();let bytes=0;
  for(const l of layers){if(!l||typeof l.id!=='string'||ids.has(l.id)||typeof l.data!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(l.data))throw new Error('图层数据无效，无法打开。');ids.add(l.id);bytes+=l.data.length;if(bytes>45000000)throw new Error('工程文件过大，请使用小于 45 MB 的工程。');if(typeof l.opacity!=='number'||!Number.isFinite(l.opacity)||l.opacity<0||l.opacity>1)throw new Error('图层透明度无效。');}
  return {app:'pigment-studio',version:1,width,height,title:String(input.title||'未命名作品').slice(0,60),activeId:ids.has(input.activeId)?input.activeId:layers.at(-1).id,layers:layers.map(l=>({id:l.id,name:String(l.name||'图层').slice(0,60),visible:l.visible!==false,locked:Boolean(l.locked),opacity:l.opacity,hasContent:Boolean(l.hasContent),data:l.data}))};
 }
 const api={clamp,hexToRgb,rgbToHex,rgbToHsv,hsvToRgb,rectFromPoints,zoomAt,floodRegion,validateProject};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Pigment=api;
})(globalThis);
