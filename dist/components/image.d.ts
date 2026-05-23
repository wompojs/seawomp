export {};
declare global {
    interface Window {
        /** Build manifest: maps original src → list of `[src, type, width]` triplets. */
        __SEAWOMP_IMAGES?: Record<string, {
            src: string;
            type: string;
            width: number;
        }[]>;
    }
}
