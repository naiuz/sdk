import {defineComponent, h} from "vue";
import type {VNode} from "vue";
import {parseMarkdown} from "../markdown";
import type {Inline} from "../markdown";

function inline(nodes: Inline[]): (VNode | string)[] {
    return nodes.map((node) => {
        switch (node.type) {
            case "text":
                return node.text;
            case "strong":
                return <strong>{inline(node.children)}</strong>;
            case "em":
                return <em>{inline(node.children)}</em>;
            case "code":
                return <code>{node.text}</code>;
            case "link":
                return (
                    <a href={node.href} target="_blank" rel="noopener noreferrer">
                        {inline(node.children)}
                    </a>
                );
        }
    });
}

/** What the agent or an operator wrote. It's drawn from plain data, so nothing in it can run. */
export const Markdown = defineComponent({
    name: "Markdown",
    props: {text: {type: String, required: true}},
    setup(props) {
        return () => (
            <div class="markdown">
                {parseMarkdown(props.text).map((block, index) =>
                    block.type === "paragraph" ? (
                        <p key={index}>{inline(block.children)}</p>
                    ) : block.ordered ? (
                        <ol key={index}>
                            {block.items.map((item, position) => (
                                <li key={position}>{inline(item)}</li>
                            ))}
                        </ol>
                    ) : (
                        <ul key={index}>
                            {block.items.map((item, position) => (
                                <li key={position}>{inline(item)}</li>
                            ))}
                        </ul>
                    ),
                )}
            </div>
        );
    },
});
