// Copies the finished web app into www/ so Capacitor can wrap it.
import fs from 'fs'; import path from 'path';
const root = path.resolve(import.meta.dirname, '..', '..'), www = path.resolve(import.meta.dirname, '..', 'www');
fs.rmSync(www, { recursive: true, force: true }); fs.mkdirSync(www, { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest']) fs.copyFileSync(path.join(root, f), path.join(www, f));
fs.cpSync(path.join(root, 'icons'), path.join(www, 'icons'), { recursive: true });
console.log('web app copied to', www);
