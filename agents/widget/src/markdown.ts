import {isSafeLink} from "./links";

/**
 * What a reply can be written in, as plain data for the page to draw: paragraphs, lists, bold, italics, code and links.
 * There's no HTML anywhere on the way, so nothing in a reply can run, and a link that isn't a web address stays text.
 */
export type Inline =
    | {type: "text"; text: string}
    | {type: "strong"; children: Inline[]}
    | {type: "em"; children: Inline[]}
    | {type: "code"; text: string}
    | {type: "link"; href: string; children: Inline[]};

export type Block =
    | {type: "paragraph"; children: Inline[]}
    | {type: "list"; ordered: boolean; items: Inline[][]};

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const TOKEN = /\*\*(.+?)\*\*|__(.+?)__|\*([^*\n]+?)\*|`([^`\n]+?)`|\[([^\]\n]+?)\]\(([^)\s]+?)\)|(https?:\/\/[^\s<>()]+)/g;

export function parseInline(text: string): Inline[] {
    const found: Inline[] = [];
    let at = 0;
    for (const match of text.matchAll(TOKEN)) {
        if (match.index > at) found.push({type: "text", text: text.slice(at, match.index)});
        const [whole, strong, strongToo, em, code, label, href, bare] = match;
        if (strong !== undefined || strongToo !== undefined) found.push({type: "strong", children: parseInline(strong ?? strongToo ?? "")});
        else if (em !== undefined) found.push({type: "em", children: parseInline(em)});
        else if (code !== undefined) found.push({type: "code", text: code});
        else if (label !== undefined && href !== undefined) {
            found.push(isSafeLink(href) ? {type: "link", href, children: parseInline(label)} : {type: "text", text: whole});
        } else if (bare !== undefined) {
            // The sentence's own full stop isn't part of the address.
            const address = bare.replace(/[.,;:!?]+$/, "");
            found.push({type: "link", href: address, children: [{type: "text", text: address}]});
            if (address.length < bare.length) found.push({type: "text", text: bare.slice(address.length)});
        }
        at = match.index + whole.length;
    }
    if (at < text.length) found.push({type: "text", text: text.slice(at)});
    return found;
}

export function parseMarkdown(text: string): Block[] {
    const blocks: Block[] = [];
    let paragraph: string[] = [];
    let list: {ordered: boolean; items: Inline[][]} | null = null;
    const endParagraph = () => {
        if (paragraph.length > 0) blocks.push({type: "paragraph", children: parseInline(paragraph.join("\n"))});
        paragraph = [];
    };
    const endList = () => {
        if (list !== null) blocks.push({type: "list", ...list});
        list = null;
    };
    for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
        const bullet = BULLET.exec(line)?.[1];
        const numbered = bullet === undefined ? NUMBERED.exec(line)?.[1] : undefined;
        const item = bullet ?? numbered;
        if (item !== undefined) {
            endParagraph();
            const ordered = numbered !== undefined;
            if (list === null || (list as {ordered: boolean}).ordered !== ordered) {
                endList();
                list = {ordered, items: []};
            }
            (list as {items: Inline[][]}).items.push(parseInline(item));
        } else if (line.trim() === "") {
            endParagraph();
            endList();
        } else {
            endList();
            paragraph.push(line);
        }
    }
    endParagraph();
    endList();
    return blocks;
}
