// @vitest-environment node
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
it('canonical application/functions metadata, README and changelog agree',()=>{
 const json=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
 const version=json('package.json').version;
 for(const path of ['package-lock.json','functions/package.json','functions/package-lock.json'])expect(json(path).version).toBe(version);
 for(const path of ['package-lock.json','functions/package-lock.json'])expect(json(path).packages[''].version).toBe(version);
 const readme=readFileSync(new URL('../README.md',import.meta.url),'utf8');
 expect(readme).toContain(`Release-v${version}`);expect(readme).toContain(`Current release target: **v${version}**`);expect(readme).not.toContain('1.6.3');
 const changelog=readFileSync(new URL('../CHANGELOG.md',import.meta.url),'utf8');expect(changelog.match(/## \[([^\]]+)\]/)[1]).toBe(version);
});
