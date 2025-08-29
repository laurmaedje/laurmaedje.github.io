import childProcess from "child_process";
import chokidar from "chokidar";
import feed from "feed";
import fs from "fs";
import hljs from "highlight.js";
import http from "http";
import livereload from "livereload";
import markdownIt from "markdown-it";
import markdownItFootnote from "markdown-it-footnote";
import moment from "moment";
import parseHtmlToReact from "html-react-parser";
import path from "path";
import prettier from "prettier";
import React from "react";
import ReactDOMServer from "react-dom/server";
import serveHandler from "serve-handler";
import yaml from "js-yaml";
import os from "os";

// One blog post.
type Post = {
  name: string;
  url: string;
  content: string;
  title: string;
  date: moment.Moment;
  description: string;
  hidden: boolean;
};

// YAML metadata in .md files.
type Meta = {
  title: string;
  date: Date;
  description: string;
  hidden?: boolean;
};

// Configuration.
const DEV = process.argv.includes("--dev");
const AHREFS =
  "ab196c32b430cd534174470f3bfc67da55eb94fc3c0b88a09f58dc62f75ec411";

// Metadata.
const NAME = "Laurenz Mädje";
const EMAIL = "laurmaedje@gmail.com";
const YEAR = new Date().getFullYear();
const TITLE = "Laurenz's Blog";
const DESCRIPTION = "Blog about my coding projects.";
const BASE_URL = "https://laurmaedje.github.io";
const RSS_PATH = "/rss.xml";
const ATOM_PATH = "/atom.xml";

// Setup markdown.
const markdown = markdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight,
}).use(markdownItFootnote);

main();

// Tool entrypoint.
function main() {
  build();

  if (!DEV) {
    return;
  }

  // File server.
  const port = 3000;
  http
    .createServer((req, res) => serveHandler(req, res, { public: "dist" }))
    .listen(port, "0.0.0.0", () => {
      console.log(
        `Serving at http://localhost:${port} and http://${os.hostname()}:${port}`
      );
    });

  // Recompilation.
  chokidar.watch(["src", "posts", "assets"]).on("change", build);

  // Live reload.
  livereload.createServer().watch("dist");
}

// Build the website.
function build() {
  console.log("Building.");

  // Read posts.
  const posts: Post[] = fs
    .readdirSync("posts")
    .map((filename) => {
      const name = path.parse(filename).name;
      const full = fs.readFileSync(`posts/${filename}`).toString();
      const [_, head, ...tail] = full.split("---");
      const meta = yaml.load(head) as Meta;
      const src = tail.join("---");
      const content = markdown.render(src);
      return {
        name,
        url: `/posts/${name}`,
        content,
        title: meta.title,
        date: moment(meta.date).utc(),
        description: meta.description,
        hidden: meta.hidden || false,
      };
    })
    .sort((a, b) => a.date.valueOf() - b.date.valueOf());

  // Setups output directory, write ahrefs file and copy style file.
  mkdir("dist");
  fs.writeFileSync(
    `dist/ahrefs_${AHREFS}`,
    `ahrefs-site-verification_${AHREFS}`
  );
  fs.copyFileSync(`src/styles.css`, `dist/styles.css`);

  // Copy assets.
  mkdir(`dist/assets`);
  for (const filename of fs.readdirSync("assets")) {
    fs.copyFileSync(`assets/${filename}`, `dist/assets/${filename}`);
  }

  // Copy public files.
  for (const filename of fs.readdirSync("public")) {
    fs.copyFileSync(`public/${filename}`, `dist/${filename}`);
  }

  // Generate posts.
  mkdir("dist/posts/");
  for (const post of posts) {
    mkdir(`dist/posts/${post.name}`);
    const html = renderToStandaloneHtml(<Post post={post} />);
    fs.writeFileSync(`dist/posts/${post.name}/index.html`, html);
  }

  // Generate feeds.
  const feed = createFeed(posts);
  fs.writeFileSync(`dist/${RSS_PATH}`, feed.rss2());
  fs.writeFileSync(`dist/${ATOM_PATH}`, feed.atom1());

  // Generate index file.
  const html = renderToStandaloneHtml(<Index posts={posts} />);
  fs.writeFileSync("dist/index.html", html);
  fs.writeFileSync("dist/health", "OK");
}

// Create a directory if it doesn't exist yet.
function mkdir(path) {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path);
  }
}

// Render a React element to a standlone HTML file.
function renderToStandaloneHtml(root: React.ReactNode) {
  const raw = ReactDOMServer.renderToString(root);
  return "<!DOCTYPE html>\n" + prettier.format(raw, { parser: "html" });
}

// The full HTML of the blog's main page.
function Index({ posts }: { posts: Post[] }) {
  const items = posts
    .slice()
    .reverse()
    .filter((post) => !post.hidden)
    .map((post) => (
      <li key={post.name}>
        <h2>
          <a href={post.url}>{post.title}</a>
        </h2>
        <time dateTime={post.date.toISOString()}>{post.date.format("LL")}</time>
      </li>
    ));

  return (
    <Base type="website" title={TITLE} description={DESCRIPTION} url="/">
      <ul className="posts">{items}</ul>
    </Base>
  );
}

// The full HTML for a single post.
function Post({ post }: { post: Post }) {
  return (
    <Base
      type="article"
      title={post.title + " | " + TITLE}
      description={post.description}
      url={post.url}
    >
      <article>
        <h1>{post.title}</h1>
        <time dateTime={post.date.toISOString()}>{post.date.format("LL")}</time>
        {parseHtmlToReact(post.content)}
      </article>
    </Base>
  );
}

// The HTML skeleton.
function Base({
  type,
  title,
  description,
  url,
  children,
}: {
  type: string;
  title: string;
  description: string;
  url: string;
  children: React.ReactNode;
}) {
  let live: React.ReactNode | undefined = undefined;
  if (DEV) {
    live = <script src="http://localhost:35729/livereload.js?snipver=1" />;
  }

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content={description} />
        <meta property="og:type" content={type} />
        <meta property="og:title" content={title} />
        <meta property="og:url" content={BASE_URL + url} />
        <meta property="og:site_name" content={TITLE} />
        <meta property="og:description" content={description} />
        <link rel="stylesheet" href="/styles.css" />
        {url == "/" && (
          <>
            <link
              rel="alternate"
              type="application/rss+xml"
              href={RSS_PATH}
              title={`RSS Feed for ${TITLE}`}
            />
            <link
              rel="alternate"
              type="application/atom+xml"
              href={ATOM_PATH}
              title={`Atom Feed for ${TITLE}`}
            />
          </>
        )}
      </head>
      <body>
        <header>
          <a href="/" className="home">
            Laurenz's Blog
          </a>
          <GitHub />
        </header>
        <main>{children}</main>
        {live}
        {url == "/" && (
          <footer>
            <nav>
              <a href={RSS_PATH}>RSS Feed</a>
              <a href={ATOM_PATH}>Atom Feed</a>
              <a href="/programmable-markup-language-for-typesetting.pdf">
                My Thesis
              </a>
            </nav>
          </footer>
        )}
      </body>
    </html>
  );
}

// The social icon.
function GitHub() {
  return (
    <a href="https://github.com/laurmaedje" className="social">
      <img src="/assets/github.png" alt="GitHub" width="32" height="32" />
    </a>
  );
}

// Create the feed object for RSS and Atom feed.
function createFeed(posts: Post[]) {
  const author = { name: NAME, email: EMAIL, link: BASE_URL };

  const blogFeed = new feed.Feed({
    title: TITLE,
    description: DESCRIPTION,
    id: BASE_URL,
    link: BASE_URL,
    language: "en",
    copyright: `All rights reserved ${YEAR}, ${NAME}`,
    feedLinks: { rss: BASE_URL + RSS_PATH, atom: BASE_URL + ATOM_PATH },
    author,
  });

  for (const post of posts) {
    if (post.hidden) {
      continue;
    }

    blogFeed.addItem({
      title: post.title,
      id: post.url,
      link: post.url,
      description: post.description,
      content: post.content,
      author: [author],
      date: post.date.toDate(),
    });
  }

  return blogFeed;
}

// Highlight source code.
function highlight(src: string, lang: string) {
  if (lang === "typ") {
    const code = childProcess
      .execSync("cargo run --manifest-path highlight/Cargo.toml", {
        input: src,
        stdio: ["pipe", "pipe", "ignore"],
      })
      .toString("utf8");
    return `<pre>${code}</pre>`;
  }

  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(src, { language: lang }).value;
    } catch {}
  }

  return "";
}
