/**
 * Get a flag's value from `--flag value` or `--flag=value` without modifying args.
 *
 * A space-separated value that itself looks like a flag (`-`-prefixed) is treated as
 * a missing value rather than silently swallowed — so `mr create --title --draft`
 * leaves the title unset instead of setting it to "--draft". None of gl-axi's value
 * flags take a `-`-leading value; a literal one can still be passed via `--flag=-x`.
 */
export declare function getFlag(args: string[], name: string): string | undefined;
/**
 * Parse a positive-integer count flag (e.g. `--top`), falling back to `fallback`
 * when absent or malformed. Values above `max` are clamped so callers can rely on
 * the result as a sane page/row budget.
 */
export declare function getCount(args: string[], name: string, fallback: number, max: number): number;
/** Check if a boolean flag is present. */
export declare function hasFlag(args: string[], flag: string): boolean;
/** Get the first positional (non-`-`-prefixed) arg at or after startIndex. */
export declare function getPositional(args: string[], startIndex: number): string | undefined;
