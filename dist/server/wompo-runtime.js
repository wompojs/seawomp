import { pathToFileURL } from 'node:url';
const runtimeByCwd = new Map();
function importFromApp(spec, cwd) {
    const resolved = Bun.resolveSync(spec, cwd);
    return import(pathToFileURL(resolved).href);
}
export function getWompoRuntime(cwd) {
    let cached = runtimeByCwd.get(cwd);
    if (!cached) {
        cached = Promise.all([importFromApp('wompo', cwd), importFromApp('wompo/ssr', cwd)]).then(([wompo, ssr]) => ({
            attrs: wompo.attrs,
            defineWompo: wompo.defineWompo,
            html: wompo.html,
            renderToStream: ssr.renderToStream,
            ssr,
        }));
        runtimeByCwd.set(cwd, cached);
    }
    return cached;
}
