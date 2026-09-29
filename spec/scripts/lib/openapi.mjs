const METHODS = ["get", "post", "put", "patch", "delete"];

/** One JSON Pointer segment, escaped: `~` becomes `~0` and `/` becomes `~1`. */
export function escapeSegment(segment) {
    return String(segment).replaceAll("~", "~0").replaceAll("/", "~1");
}

/** A local JSON Pointer fragment (`#/a/b`) built from raw segments. */
export function pointerTo(...segments) {
    return `#/${segments.map(escapeSegment).join("/")}`;
}

/** The value a local fragment (`#/…`) points at. Throws when it points nowhere. */
export function valueAt(document, fragment) {
    if (!fragment.startsWith("#/")) throw new Error(`Only local references are supported: ${fragment}`);
    return fragment
        .slice(2)
        .split("/")
        .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
        .reduce((node, key) => {
            if (node === null || typeof node !== "object" || !Object.hasOwn(node, key)) throw new Error(`Nothing at ${fragment}`);
            return node[key];
        }, document);
}

/**
 * Follows `$ref`s until it reaches a real object. Returns the object and the
 * pointer it lives at: the validator compiles schemas by pointer, so the $refs
 * inside them resolve against the whole document.
 */
export function follow(document, value, pointer) {
    let current = value;
    let at = pointer;
    const seen = new Set();
    while (current !== null && typeof current === "object" && typeof current.$ref === "string") {
        if (seen.has(current.$ref)) throw new Error(`Circular reference ${current.$ref}`);
        seen.add(current.$ref);
        at = current.$ref;
        current = valueAt(document, current.$ref);
    }
    return {value: current, pointer: at};
}

/** Every operation, in document order, with the pointers to it and to its path item. */
export function listOperations(document) {
    const operations = [];
    for (const [path, item] of Object.entries(document.paths ?? {})) {
        for (const method of METHODS) {
            if (!item?.[method]) continue;
            operations.push({
                operationId: item[method].operationId,
                method: method.toUpperCase(),
                path,
                operation: item[method],
                pointer: pointerTo("paths", path, method),
                pathPointer: pointerTo("paths", path),
            });
        }
    }
    return operations;
}

/** The operation's parameters, the path item's first, each resolved and carrying its pointer. */
export function parametersOf(document, entry) {
    const pathItem = valueAt(document, entry.pathPointer);
    const resolve = (base) => (parameter, index) => follow(document, parameter, `${base}/parameters/${index}`);
    return [
        ...(pathItem.parameters ?? []).map(resolve(entry.pathPointer)),
        ...(entry.operation.parameters ?? []).map(resolve(entry.pointer)),
    ].map(({value, pointer}) => ({...value, pointer}));
}
