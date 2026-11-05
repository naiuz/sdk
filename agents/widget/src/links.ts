/** www. is the same site as its twin; a sub-domain is another site. */
function bareHost(host: string): string {
    return host.toLowerCase().replace(/^www\./, "");
}

/** The web addresses a message may link to: nothing that runs in the page. */
export function isSafeLink(href: string): boolean {
    try {
        const {protocol} = new URL(href, "https://relative.invalid");
        return protocol === "http:" || protocol === "https:" || protocol === "mailto:" || protocol === "tel:";
    } catch {
        return false;
    }
}

/** Whether a link stays on the site the widget is on: relative, or the same host or its www. twin. */
export function isSameSite(href: string, host: string): boolean {
    try {
        const url = new URL(href, `https://${host}`);
        return (url.protocol === "http:" || url.protocol === "https:") && bareHost(url.hostname) === bareHost(host);
    } catch {
        return false;
    }
}

/**
 * Follows a link on the site the widget is on, so the visitor keeps the chat. A site with a router can take it by
 * listening for neuron-widget:navigate and cancelling it. Otherwise it's as if they clicked a link on the page: a router
 * that listens for clicks takes it without a reload, and the browser follows it where none does.
 */
export function followOnThisSite(href: string): void {
    const target = new URL(href, window.location.href);
    const request = new CustomEvent("neuron-widget:navigate", {cancelable: true, detail: {url: target.href}});
    if (!window.dispatchEvent(request)) return;
    const link = document.createElement("a");
    link.href = target.href;
    link.style.display = "none";
    document.body.appendChild(link);
    link.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true, view: window}));
    window.setTimeout(() => {
        link.remove();
    }, 0);
}
