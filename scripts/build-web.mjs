import { build } from 'esbuild';
import { mkdir,copyFile,cp,readdir,readFile,writeFile } from 'node:fs/promises';
const output='Sources/MacDownGitLab/Web';
await mkdir(output,{recursive:true});
await build({entryPoints:['Web/editor.js'],bundle:true,outfile:output+'/editor.js',format:'iife',platform:'browser',target:['safari17'],minify:true,legalComments:'eof'});
await Promise.all(['index.html','style.css'].map(name=>copyFile('Web/'+name,output+'/'+name)));
await cp('node_modules/katex/dist',output+'/katex',{recursive:true});
let notices='MacDown GitLab third-party notices\n\n';
async function collect(folder) {
  for(const entry of await readdir(folder,{withFileTypes:true})) {
    if(!entry.isDirectory()) continue;
    const dir=folder+'/'+entry.name;
    if(entry.name.startsWith('@')) {await collect(dir);continue;}
    try {
      const pkg=JSON.parse(await readFile(dir+'/package.json','utf8'));
      notices+=`\n--- ${pkg.name} ${pkg.version} (${pkg.license || 'see licence'}) ---\n`;
      for(const name of await readdir(dir)) if(/^(licen[cs]e|copying|notice)(\.|$)/i.test(name)) {
        try {notices+='\n'+await readFile(dir+'/'+name,'utf8')+'\n';} catch {}
      }
      if((await readdir(dir)).includes('node_modules')) await collect(dir+'/node_modules');
    } catch {}
  }
}
await collect('node_modules');
await writeFile(output+'/THIRD_PARTY_NOTICES.txt',notices);
console.log('Offline editor resources built in '+output);
