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
            if (operation) operations.set(operation.operationId ?? `${method.toUpperCase()} ${path}`, {method: method.toUpperCase(), path, operation});
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

/**
 * Like compareKeyed, but each value is {method, path, operation}: an
 * operation whose method or path changed is reported as having moved,
 * naming the operation, rather than folded into "changed" or lost entirely.
 */
function compareOperations(pinned, live) {
    const added = [...live.keys()].filter((key) => !pinned.has(key));
    const removed = [...pinned.keys()].filter((key) => !live.has(key));
    const changed = [];
    const moved = new Map();
    for (const key of live.keys()) {
        if (!pinned.has(key)) continue;
        const before = pinned.get(key);
        const after = live.get(key);
        if (before.method !== after.method || before.path !== after.path) {
            changed.push(`${key} moved from ${before.method} ${before.path} to ${after.method} ${after.path}`);
            moved.set(key, {from: before, to: after});
        } else if (!sameDocument(before.operation, after.operation)) {
            changed.push(key);
        }
    }
    return {added, removed, changed, moved};
}

/**
 * The document without per-operation and per-schema content. `moved` names,
 * for each relocated operationId, the {method, path} it used to and now
 * lives at; when that's the whole story for a path (nothing but operations
 * lived there), the now-vacated or newly-occupied path entry is dropped too,
 * so a plain move isn't also double-reported as an "other parts" change.
 */
function withoutOperationsAndSchemas(document, moved = new Map(), side = "from") {
    const copy = JSON.parse(JSON.stringify(document));
    for (const item of Object.values(copy.paths ?? {})) {
        for (const method of METHODS) delete item?.[method];
    }
    for (const {from, to} of moved.values()) {
        const path = (side === "from" ? from : to).path;
        const item = copy.paths?.[path];
        if (item && Object.keys(item).length === 0) delete copy.paths[path];
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
    const operations = compareOperations(operationsOf(pinned), operationsOf(live));
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
        otherChanges: !sameDocument(
            withoutOperationsAndSchemas(pinned, operations.moved, "from"),
            withoutOperationsAndSchemas(live, operations.moved, "to"),
        ),
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
