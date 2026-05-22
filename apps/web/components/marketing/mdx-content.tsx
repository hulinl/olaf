import { MDXRemote } from "next-mdx-remote/rsc";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import remarkGfm from "remark-gfm";

import { slugifyHeading } from "@/lib/content";

/** Pull a plain-text string out of any React children tree, so we
 *  can derive an `id` slug from the heading content even when MDX
 *  has injected inline tags (e.g. `<code>` inside an h2). */
function childrenToText(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(childrenToText).join("");
  }
  if (
    children &&
    typeof children === "object" &&
    "props" in children &&
    children.props &&
    typeof children.props === "object" &&
    "children" in children.props
  ) {
    return childrenToText(children.props.children as ReactNode);
  }
  return "";
}

/**
 * Tailwind-styled MDX wrapper. Headings, code, lists, tables all
 * get OLAF styling without per-article styling boilerplate.
 *
 * We use `next-mdx-remote/rsc` (server-component variant) so this
 * renders at request time on the server — no client JS for the
 * article body itself.
 */

const components = {
  h2: ({ children, ...props }: ComponentProps<"h2">) => {
    const id = slugifyHeading(childrenToText(children));
    return (
      <h2
        id={id}
        className="mt-12 scroll-mt-24 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl"
        style={{ letterSpacing: "-0.02em" }}
        {...props}
      >
        {children}
      </h2>
    );
  },
  h3: ({ children, ...props }: ComponentProps<"h3">) => {
    const id = slugifyHeading(childrenToText(children));
    return (
      <h3
        id={id}
        className="mt-8 scroll-mt-24 text-xl font-semibold text-ink-900"
        {...props}
      >
        {children}
      </h3>
    );
  },
  p: (props: ComponentProps<"p">) => (
    <p className="mt-4 leading-relaxed text-ink-700" {...props} />
  ),
  ul: (props: ComponentProps<"ul">) => (
    <ul
      className="mt-4 flex list-disc flex-col gap-2 pl-6 leading-relaxed text-ink-700 marker:text-ink-300"
      {...props}
    />
  ),
  ol: (props: ComponentProps<"ol">) => (
    <ol
      className="mt-4 flex list-decimal flex-col gap-2 pl-6 leading-relaxed text-ink-700 marker:text-ink-500"
      {...props}
    />
  ),
  li: (props: ComponentProps<"li">) => <li className="pl-1" {...props} />,
  table: (props: ComponentProps<"table">) => (
    <div className="mt-6 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm" {...props} />
    </div>
  ),
  thead: (props: ComponentProps<"thead">) => (
    <thead className="bg-surface-muted/60 text-xs uppercase tracking-[0.1em] text-ink-500" {...props} />
  ),
  th: (props: ComponentProps<"th">) => (
    <th className="px-4 py-3 font-medium" {...props} />
  ),
  td: (props: ComponentProps<"td">) => (
    <td className="border-t border-border px-4 py-3 align-top text-ink-700" {...props} />
  ),
  code: (props: ComponentProps<"code">) => (
    <code
      className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[0.9em] text-ink-900"
      {...props}
    />
  ),
  pre: (props: ComponentProps<"pre">) => (
    <pre
      className="mt-4 overflow-x-auto rounded-lg border border-border bg-ink-900 p-4 text-sm leading-relaxed text-ink-inverse"
      {...props}
    />
  ),
  blockquote: (props: ComponentProps<"blockquote">) => (
    <blockquote
      className="mt-6 border-l-4 border-brand pl-4 text-ink-700 italic"
      {...props}
    />
  ),
  a: ({ href, ...rest }: ComponentProps<"a">) => {
    const isInternal = typeof href === "string" && href.startsWith("/");
    if (isInternal) {
      return (
        <Link
          href={href}
          className="text-brand underline decoration-brand/40 underline-offset-4 hover:decoration-brand"
          {...rest}
        />
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand underline decoration-brand/40 underline-offset-4 hover:decoration-brand"
        {...rest}
      />
    );
  },
  hr: () => <hr className="my-10 border-border" />,
};

export function MdxContent({ source }: { source: string }) {
  return (
    <article className="text-ink-900">
      <MDXRemote
        source={source}
        components={components}
        options={{
          mdxOptions: {
            remarkPlugins: [remarkGfm],
          },
        }}
      />
    </article>
  );
}
