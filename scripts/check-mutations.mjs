import {readFile,writeFile,unlink,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const source=await readFile('Web/core.js','utf8');
const cases=[
  ['drop the first byte after every edited range','source.slice(end);','source.slice(end + 1);'],
  ['reverse settings precedence',"[['file',file],['project',project],['global',global]]","[['global',global],['project',project],['file',file]]"],
  ['normalize CRLF during block edits',"export const newlineOf = source => source.includes('\\r\\n') ? '\\r\\n' : '\\n';","export const newlineOf = source => '\\n';"]
];
const results=[];
for(const [name,before,after] of cases) {
  if(!source.includes(before)) throw new Error('Mutation no longer matches implementation: '+name);
  const file=resolve('Web/.core-mutant-'+Date.now()+'.js');
  try {
    await writeFile(file,source.replace(before,after));
    const run=spawnSync(process.execPath,['--test','tests/core.test.mjs'],{
      encoding:'utf8',env:{...process.env,MACDOWN_CORE:pathToFileURL(file).href},timeout:30000
    });
    const output=run.stdout+run.stderr;
    const killed=run.status!==0 && /AssertionError/.test(output) && /fail [1-9]/.test(output);
    results.push({mutation:name,detected:killed});
    if(!killed) throw new Error('Regression tests did not detect: '+name+'\n'+output);
    console.log('Detected: '+name);
  } finally {await unlink(file);}
}
await mkdir('docs/test-evidence',{recursive:true});
await writeFile('docs/test-evidence/mutations.json',JSON.stringify({passed:true,results},null,2)+'\n');
