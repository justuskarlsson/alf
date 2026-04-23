/** Shared backend configuration derived from environment. */

/** Name of the alf metadata directory inside each repo (e.g. ".alf" or ".alf-test"). */
export const ALF_DIR = process.env.ALF_DIR ?? ".alf";

/** Root directory containing all repos. */
export const REPOS_ROOT = process.env.REPOS_ROOT ?? `${process.env.HOME}/repos`;
