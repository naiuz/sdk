import {createRenderer, h, nextTick} from "vue";
import type {Component} from "vue";

/** A page with nothing in it: elements are plain objects, so screens run in Node. */
export interface FakeNode {
    tag: string;
    text?: string;
    props: Record<string, unknown>;
    parent: FakeNode | null;
    children: FakeNode[];
    style: Record<string, string>;
}

function node(tag: string): FakeNode {
    return {tag, props: {}, parent: null, children: [], style: {}};
}

function detach(child: FakeNode): void {
    if (child.parent !== null) child.parent.children.splice(child.parent.children.indexOf(child), 1);
    child.parent = null;
}

const {createApp} = createRenderer<FakeNode, FakeNode>({
    insert(child, parent, anchor) {
        detach(child);
        const at = anchor === null || anchor === undefined ? -1 : parent.children.indexOf(anchor);
        parent.children.splice(at < 0 ? parent.children.length : at, 0, child);
        child.parent = parent;
    },
    remove: detach,
    createElement: node,
    createText(text) {
        return {...node("#text"), text};
    },
    createComment() {
        return node("#comment");
    },
    setText(target, text) {
        target.text = text;
    },
    setElementText(target, text) {
        target.children = [{...node("#text"), text, parent: target}];
    },
    parentNode: (target) => target.parent,
    nextSibling(target) {
        const siblings = target.parent?.children ?? [];
        return siblings[siblings.indexOf(target) + 1] ?? null;
    },
    patchProp(target, key, _previous, next) {
        target.props[key] = next;
    },
});

function saying(target: FakeNode, words: string): boolean {
    const label = target.props["aria-label"];
    return typeof label === "string" && label.includes(words);
}

/** Mounts a component, and gives what's on the page to look at and press. */
export function mount(component: Component, props: Record<string, unknown> = {}) {
    const root = node("root");
    const app = createApp({render: () => h(component, props)});
    app.mount(root);

    const walk = (from: FakeNode): FakeNode[] => [from, ...from.children.flatMap(walk)];
    const all = () => walk(root);
    const textOf = (from: FakeNode): string => walk(from).map((one) => one.text ?? "").join(" ").replace(/\s+/g, " ").trim();
    const hasClass = (target: FakeNode, name: string) => {
        const value = target.props.class;
        const flat = (classes: unknown): string[] => (Array.isArray(classes) ? classes.flatMap(flat) : typeof classes === "string" ? classes.split(" ") : []);
        return flat(value).includes(name);
    };

    return {
        root,
        text: () => textOf(root),
        all,
        byClass: (name: string) => all().filter((one) => hasClass(one, name)),
        hasClass: (name: string) => all().some((one) => hasClass(one, name)),
        /** The button whose words or label say this. */
        button(words: string): FakeNode {
            const found = all().filter((one) => one.tag === "button" && (textOf(one).includes(words) || saying(one, words)));
            const last = found.at(-1);
            if (last === undefined) throw new Error(`There's no button saying "${words}": ${textOf(root)}`);
            return last;
        },
        hasButton: (words: string) => all().some((one) => one.tag === "button" && (textOf(one).includes(words) || saying(one, words))),
        async press(words: string) {
            const button = all().filter((one) => one.tag === "button" && (textOf(one).includes(words) || saying(one, words))).at(-1);
            if (button === undefined) throw new Error(`There's no button saying "${words}": ${textOf(root)}`);
            (button.props.onClick as () => void)();
            await settled();
        },
        unmount: () => {
            app.unmount();
        },
    };
}

/** Lets what was promised, and what depends on it, happen. */
export async function settled(): Promise<void> {
    for (let turn = 0; turn < 12; turn += 1) {
        await Promise.resolve();
        await nextTick();
    }
}

/** Calls an element's handler. */
export function fire(target: FakeNode, name: string, event: unknown = {}): void {
    (target.props[name] as (event: unknown) => void)(event);
}
