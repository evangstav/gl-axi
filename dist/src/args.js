/**
 * Get a flag's value from `--flag value` or `--flag=value` without modifying args.
 *
 * A space-separated value that itself looks like a flag (`-`-prefixed) is treated as
 * a missing value rather than silently swallowed — so `mr create --title --draft`
 * leaves the title unset instead of setting it to "--draft". None of gl-axi's value
 * flags take a `-`-leading value; a literal one can still be passed via `--flag=-x`.
 */
export function getFlag(args, name) {
    const equalsPrefix = `${name}=`;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === name) {
            const next = args[i + 1];
            if (next === undefined || next.startsWith("-"))
                return undefined;
            return next;
        }
        if (arg.startsWith(equalsPrefix)) {
            return arg.slice(equalsPrefix.length);
        }
    }
    return undefined;
}
/**
 * Parse a positive-integer count flag (e.g. `--top`), falling back to `fallback`
 * when absent or malformed. Values above `max` are clamped so callers can rely on
 * the result as a sane page/row budget.
 */
export function getCount(args, name, fallback, max) {
    const raw = getFlag(args, name);
    if (raw === undefined)
        return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0)
        return fallback;
    return Math.min(n, max);
}
/** Check if a boolean flag is present. */
export function hasFlag(args, flag) {
    return args.includes(flag);
}
/** Get the first positional (non-`-`-prefixed) arg at or after startIndex. */
export function getPositional(args, startIndex) {
    for (let i = startIndex; i < args.length; i++) {
        if (!args[i].startsWith("-"))
            return args[i];
    }
    return undefined;
}
//# sourceMappingURL=args.js.map