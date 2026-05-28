#!/usr/bin/env bun
/* seawomp CLI — Bun-powered.
 *
 *   seawomp new <name>  — scaffold a new project (writes files + runs `bun install`).
 *   seawomp dev         — start the Bun dev server (hot reload, on-the-fly TS).
 *   seawomp build       — produce a minified production bundle + SSG pages.
 *   seawomp vercel-build — production build with Vercel-ready static output.
 *   seawomp start       — serve the built output via Bun.serve.
 */
import path from 'node:path';
import { loadConfig, resolveConfig } from './config.js';
const cmd = process.argv[2] || 'dev';
const cwd = process.cwd();
function usage() {
    console.error('Usage:');
    console.error('  seawomp new <name> [--no-install]   scaffold a new project');
    console.error('  seawomp dev                         start the dev server');
    console.error('  seawomp build [--target vercel]     production build');
    console.error('  seawomp vercel-build                production build for Vercel');
    console.error('  seawomp start                       serve the production build');
}
function optionValue(name) {
    const i = process.argv.indexOf(name);
    if (i === -1)
        return undefined;
    const value = process.argv[i + 1];
    return value && !value.startsWith('-') ? value : undefined;
}
function buildTarget() {
    const target = optionValue('--target') ?? (process.argv.includes('--vercel') ? 'vercel' : 'bun');
    if (target !== 'bun' && target !== 'vercel') {
        console.error(`Invalid build target: ${target}`);
        process.exit(1);
    }
    return target;
}
async function main() {
    switch (cmd) {
        case 'new': {
            const name = process.argv[3];
            if (!name || name.startsWith('-')) {
                console.error('Error: project name required.\n');
                usage();
                process.exit(1);
            }
            const skipInstall = process.argv.includes('--no-install');
            const target = path.resolve(cwd, name);
            const { scaffoldProject } = await import('./scaffold.js');
            return scaffoldProject({ dir: target, name: path.basename(name), skipInstall });
        }
        case 'dev': {
            const cfg = resolveConfig(cwd, await loadConfig(cwd), 'dev');
            const { startDev } = await import('./dev/server.js');
            return startDev(cfg, cwd);
        }
        case 'build': {
            const cfg = resolveConfig(cwd, await loadConfig(cwd), 'build');
            const { buildAll } = await import('./build/bundle.js');
            return buildAll(cfg, cwd, { target: buildTarget() });
        }
        case 'vercel-build': {
            const cfg = resolveConfig(cwd, await loadConfig(cwd), 'build');
            const { buildAll } = await import('./build/bundle.js');
            return buildAll(cfg, cwd, { target: 'vercel' });
        }
        case 'start': {
            const cfg = resolveConfig(cwd, await loadConfig(cwd), 'build');
            const { startProd } = await import('./build/serve-prod.js');
            return startProd(cfg, cwd);
        }
        case '-h':
        case '--help':
        case 'help':
            usage();
            return;
        default:
            console.error(`Unknown command: ${cmd}\n`);
            usage();
            process.exit(1);
    }
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
