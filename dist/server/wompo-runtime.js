const runtimeByCwd = new Map();
function importFromApp(spec, _cwd) {
    // Import via the *bare* specifier rather than resolving to an absolute path and
    // `pathToFileURL()`-importing it. Bun keeps two module-cache namespaces: `file://`
    // URLs and absolute paths share one instance, but bare specifiers (`import 'wompo'`)
    // resolve into a SEPARATE instance. seawomp's own components (`components/link.js`,
    // `components/image.js`, …) and the dev SSR bundle's externalized imports all use the
    // bare form, so resolving the runtime as a `file://` URL here loaded wompo's
    // render-context a SECOND time → "[wompo] render-context loaded more than once".
    // Using the bare specifier puts the render runtime in the same instance as everything
    // else that imports wompo, so there is a single shared render-context / element registry.
    return import(spec);
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
