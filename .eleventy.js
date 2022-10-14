const pluginSyntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const moment = require("moment");
const markdownIt = require("markdown-it");
const markdownItFootnote = require("markdown-it-footnote");

module.exports = function (config) {
  config.addPassthroughCopy("assets");
  config.addPassthroughCopy("styles.css");
  config.addPassthroughCopy(
    "ahrefs_ab196c32b430cd534174470f3bfc67da55eb94fc3c0b88a09f58dc62f75ec411"
  );
  config.addPlugin(pluginSyntaxHighlight);
  config.addFilter("dateIso", (date) => moment(date).toISOString());
  config.addFilter("dateReadable", (date) => moment(date).utc().format("LL"));
  config.setLibrary(
    "md",
    markdownIt({
      html: true,
      linkify: true,
      typographer: true,
    }).use(markdownItFootnote)
  );
  return {
    templateFormats: ["md", "njk", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
