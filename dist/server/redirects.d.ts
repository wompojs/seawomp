import type { RedirectRule } from '../config.js';
export interface CompiledRedirectRule extends RedirectRule {
    regex: RegExp;
    paramNames: string[];
}
export declare function compileRedirects(rules?: RedirectRule[]): CompiledRedirectRule[];
export declare function matchRedirect(pathname: string, search: string, rules: CompiledRedirectRule[]): Response | null;
