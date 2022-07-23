const pluginSyntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const moment = require("moment");

module.exports = function (config) {
  config.addPassthroughCopy("assets");
  config.addPassthroughCopy("styles.css");
  config.addPlugin(pluginSyntaxHighlight);
  config.addFilter("dateIso", (date) => moment(date).toISOString());
  config.addFilter("dateReadable", (date) => moment(date).utc().format("LL"));
  return {
    templateFormats: ["md", "njk", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
