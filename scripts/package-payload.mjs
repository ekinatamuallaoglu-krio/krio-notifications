import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import JavaScriptObfuscator from "javascript-obfuscator";
import { create } from "tar";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), standalone = path.join(root, ".next", "standalone"), stage = path.join(root, "dist", "payload"), launcher = path.join(root, "launcher"), payload = path.join(launcher, "payload.tar.gz");
await stat(path.join(standalone, "server.js"));
await rm(stage, { recursive: true, force: true }); await mkdir(stage, { recursive: true }); await cp(standalone, path.join(stage, "app"), { recursive: true });
await cp(path.join(root, ".next", "static"), path.join(stage, "app", ".next", "static"), { recursive: true });
try { await cp(path.join(root, "public"), path.join(stage, "app", "public"), { recursive: true }); } catch {}
const nodeSource = process.execPath, nodeName = process.platform === "win32" ? "node.exe" : "node"; await cp(nodeSource, path.join(stage, nodeName));

async function protect(dir) { for (const name of await readdir(dir)) { const file = path.join(dir, name), info = await stat(file); if (info.isDirectory()) await protect(file); else if (name.endsWith(".map")) await rm(file); else if (name.endsWith(".js") && file.includes(`${path.sep}.next${path.sep}server${path.sep}app${path.sep}`)) { const source = await readFile(file, "utf8"); const output = JavaScriptObfuscator.obfuscate(source, { compact: true, identifierNamesGenerator: "hexadecimal", renameGlobals: false, selfDefending: false, stringArray: true, stringArrayThreshold: .5 }).getObfuscatedCode(); await writeFile(file, output); } } }
await protect(path.join(stage, "app"));
await rm(payload, { force: true }); await create({ gzip: true, cwd: stage, file: payload, portable: true }, ["app", nodeName]);
const hash = createHash("sha256").update(await readFile(payload)).digest("hex"); await writeFile(path.join(launcher, "payload.sha256"), `${hash}\n`); console.log(`Payload ready: ${payload} (${hash})`);
