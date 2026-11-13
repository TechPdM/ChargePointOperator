/**
 * Version and build commit, injected at build time by `vite.config.ts`.
 * Guarded so anything importing this still works where Vite's define has not
 * run (the headless CLI and the tests never render it, but stay safe).
 */
export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
export const APP_COMMIT = typeof __APP_COMMIT__ === "string" ? __APP_COMMIT__ : "";
