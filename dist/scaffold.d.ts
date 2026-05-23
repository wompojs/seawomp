export interface ScaffoldOptions {
    /** Absolute path of the project directory to create. */
    dir: string;
    /** package.json `name`. */
    name: string;
    /** Skip the post-write `bun install` step. */
    skipInstall?: boolean;
}
/** Public entry — writes every template, then runs `bun install` unless told not to. */
export declare function scaffoldProject(opts: ScaffoldOptions): Promise<void>;
