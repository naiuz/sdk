const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

/**
 * How spec/openapi.json is written: the server's own key order, two-space
 * indentation and a final newline. Pinning an unchanged document again leaves
 * the file byte for byte the same.
 */
export function toPinnedText(document) {
    return `${JSON.stringify(document, null, 2)}\n`;
}

/** Whether two JSON values are equal, ignoring the order of object keys. */
export function sameDocument(a, b) {
    if (a === b) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) return a.length === b.length && a.every((item, index) => sameDocument(item, b[index]));
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && sameDocument(a[key], b[key]));
}

function operationsOf(document) {
    const operations = new Map();
    for (const [path, item] of Object.entries(document.paths ?? {})) {
        for (const method of METHODS) {
            const operation = item?.[method];
            if (operation) operations.set(operation.operationId ?? `${method.toUpperCase()} ${path}`, operation);
        }
    }
    return operations;
}

function compareKeyed(pinned, live) {
    return {
        added: [...live.keys()].filter((key) => !pinned.has(key)),
        removed: [...pinned.keys()].filter((key) => !live.has(key)),
        changed: [...live.keys()].filter((key) => pinned.has(key) && !sameDocument(pinned.get(key), live.get(key))),
    };
}

function withoutOperationsAndSchemas(document) {
    const copy = JSON.parse(JSON.stringify(document));
    for (const item of Object.values(copy.paths ?? {})) {
        for (const method of METHODS) delete item?.[method];
    }
    if (copy.components) delete copy.components.schemas;
    return copy;
}

/**
 * What differs between the pinned and the live document, in the terms a
 * person reviewing a drift report uses: operations by operationId, component
 * schemas by name, and whether anything else changed (info, servers, tags,
 * security, or path-level settings).
 */
export function describeDrift(pinned, live) {
    const operations = compareKeyed(operationsOf(pinned), operationsOf(live));
    const schemas = compareKeyed(
        new Map(Object.entries(pinned.components?.schemas ?? {})),
        new Map(Object.entries(live.components?.schemas ?? {})),
    );
    return {
        addedOperations: operations.added,
        removedOperations: operations.removed,
        changedOperations: operations.changed,
        addedSchemas: schemas.added,
        removedSchemas: schemas.removed,
        changedSchemas: schemas.changed,
        otherChanges: !sameDocument(withoutOperationsAndSchemas(pinned), withoutOperationsAndSchemas(live)),
    };
}

/** The drift report: one line per kind of change that happened. */
export function formatDrift(drift) {
    const lines = ["The live document differs from spec/openapi.json:"];
    const list = (label, items) => {
        if (items.length > 0) lines.push(`- ${label}: ${items.join(", ")}`);
    };
    list("operations added", drift.addedOperations);
    list("operations removed", drift.removedOperations);
    list("operations changed", drift.changedOperations);
    list("schemas added", drift.addedSchemas);
    list("schemas removed", drift.removedSchemas);
    list("schemas changed", drift.changedSchemas);
    if (drift.otherChanges) lines.push("- other parts of the document changed (info, servers, tags, security or path-level settings)");
    return lines.join("\n");
}
