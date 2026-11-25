'use strict';
const fs=require('node:fs'),path=require('node:path');
let html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'styles.css'),'utf8').replace(/^@charset[^;]+;\s*/,'');
const scripts=['core.js','app.js'].map(name=>fs.readFileSync(path.join(__dirname,name),'utf8'));
html=html.replace('<link rel="stylesheet" href="styles.css">',()=>`<style>\n${css}\n</style>`)
 .replace('<script src="core.js" defer></script><script src="app.js" defer></script>','')
 .replace('</body>',()=>scripts.map(s=>`<script>\n${s}\n</script>`).join('\n')+'\n</body>');
const target=path.resolve(__dirname,'..','灵感画室.html');fs.writeFileSync(target,html,'utf8');
console.log(`已生成独立离线画板：${target}，${Buffer.byteLength(html)} 字节。`);
