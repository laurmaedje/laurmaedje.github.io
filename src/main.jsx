const fs = require("fs");
const path = require("path");
const http = require("http");

const chokidar = require("chokidar");
const hljs = require("highlight.js");
const livereload = require("livereload");
const moment = require("moment");
const parseHtmlToReact = require("html-react-parser");
const prettier = require("prettier");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const serveHandler = require("serve-handler");
const yaml = require("js-yaml");

// Setup markdown.
const markdown = require("markdown-it")({
  html: true,
  linkify: true,
  typographer: true,
  highlight: (src, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(src, { language: lang }).value;
      } catch (__) {}
    }
    return "";
  },
}).use(require("markdown-it-footnote"));

// Configuration.
const DEV = process.argv.includes("--dev");
const AHREFS =
  "ahrefs-site-verification_ab196c32b430cd534174470f3bfc67da55eb94fc3c0b88a09f58dc62f75ec411";

main();

// Tool entrypoint.
function main() {
  build();

  if (!DEV) {
    return;
  }

  // File server.
  http
    .createServer((req, res) => serveHandler(req, res, { public: "dist" }))
    .listen(3000, () => {
      console.log("Serving at http://localhost:3000");
    });

  // Recompilation.
  chokidar.watch(["posts", "assets"]).on("change", build);

  // Live reload.
  livereload.createServer().watch("dist");
}

// Build the website.
function build() {
  console.log("Building.");

  // Read posts.
  const posts = fs
    .readdirSync("posts")
    .map((filename) => {
      const name = path.parse(filename).name;
      const full = fs.readFileSync(`posts/${filename}`).toString();
      const [_, head, ...tail] = full.split("---");
      const meta = yaml.load(head);
      const src = tail.join("---");
      return {
        name,
        url: `/posts/${name}`,
        src,
        title: meta.title,
        date: moment(meta.date).utc(),
        description: meta.description,
      };
    })
    .sort((a, b) => a.date - b.date);

  // Setup output directory, write ahrefs file and copy style file.
  mkdir("dist");
  fs.writeFileSync(`dist/${AHREFS}`, AHREFS);
  fs.copyFileSync(`src/styles.css`, `dist/styles.css`);

  // Copy assets.
  mkdir(`dist/assets`);
  for (const filename of fs.readdirSync("assets")) {
    fs.copyFileSync(`assets/${filename}`, `dist/assets/${filename}`);
  }

  // Generate posts.
  mkdir("dist/posts/");
  for (const post of posts) {
    mkdir(`dist/posts/${post.name}`);
    const html = renderToStandaloneHtml(<Post post={post} />);
    fs.writeFileSync(`dist/posts/${post.name}/index.html`, html);
  }

  // Generate index file.
  const html = renderToStandaloneHtml(<Index posts={posts} />);
  fs.writeFileSync("dist/index.html", html);
}

// Create a directory if it doesn't exist yet.
function mkdir(path) {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path);
  }
}

// Render a React element to a standlone HTML file.
function renderToStandaloneHtml(root) {
  const raw = ReactDOMServer.renderToString(root);
  return "<!DOCTYPE html>\n" + prettier.format(raw, { parser: "html" });
}

// The full HTML of the blog's main page.
function Index({ posts }) {
  const items = posts
    .slice()
    .reverse()
    .map((post) => (
      <li key={post.name}>
        <h2>
          <a href={post.url}>{post.title}</a>
        </h2>
        <time date={post.date.toISOString()}>{post.date.format("LL")}</time>
      </li>
    ));

  return (
    <Base
      type="website"
      title="Laurenz's Blog"
      description="Blog about my coding projects."
      url="/"
    >
      <ul className="posts">{items}</ul>
    </Base>
  );
}

// The full HTML for a single post.
function Post({ post }) {
  const html = markdown.render(post.src);
  return (
    <Base
      type="article"
      title={post.title + " | Laurenz's Blog"}
      description={post.description}
      url={post.url}
    >
      <article>
        <h1>{post.title}</h1>
        <time date={post.date.toISOString()}>{post.date.format("LL")}</time>
        {parseHtmlToReact(html)}
      </article>
    </Base>
  );
}

// The HTML skeleton.
function Base({ type, title, description, url, children }) {
  let live = undefined;
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
        <meta
          property="og:url"
          content={"https://laurmaedje.github.io" + url}
        />
        <meta property="og:site_name" content="Laurenz's Blog" />
        <meta property="og:description" content={description} />
        <link rel="stylesheet" href="/styles.css" />
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
