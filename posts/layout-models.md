---
title: "TeX and Typst: Layout Models"
date: 2024-06-21
description: An exploration of the layout models of TeX and Typst.
---

Lately, I've been pondering the ways in which Typst's layout model differs from TeX's. While Typst adopts parts of TeX's model, in particular the paragraph layout algorithm, there are also significant differences. Most of these are related to block-level layout --- things like line placement, widow & orphan prevention, tables, and floats. I want to use this post to explore these differences, to identify the benefits and limitations of both models, and to present my thinking on the future of Typst's layout engine.


## Basics
Let me first (very briefly) explain how the layout engines of TeX and Typst operate at their foundational level.

### TeX
<figure class="floating">
  <img
    src="/assets/letter-box.svg"
    alt="A box for a single letter"
    width="115"
    height="129"
  />
  <figcaption>
    Box for a single letter.
  </figcaption>
</figure>

The layout model of TeX is built around the concepts of _boxes_ and _glue:_

- A **box** is a rectangular container containing elements that were already laid out. It has the three metrics "width", "height", and "depth." The latter two determine the box's extent above and below the baseline.

- **Glue** is stretchable space between boxes. It has a natural size, but has _shrinkability_ and _stretchability_ which allows it to occupy less or more space depending on the needs of the layout.

With these two simple primitives, TeX builds everything from letters and words to lines, paragraphs, and pages. To do so, it constructs horizontal and vertical _lists_ (or hlist/vlist for short). A horizontal list contains inline content and is processed by the linebreaker to produce boxes for each line. These lines go into a vertical list, which is then processed by the pagebreaker to ship out pages.

Of utmost importance for TeX's model is the _movability_ of boxes. In most of the cases, when making a box, TeX doesn't yet know where it will place it.
This allows the linebreak and pagebreak routines to be completely separate. The only thing the linebreaker needs to be aware of is the available width. From this, it produces justified and optimized line boxes. The pagebreaker then distributes those boxes across the pages. (In practice, these two things run somewhat interleaved to save memory, but conceptually they are separate.)

This gives TeX a lot of flexibility in juggling things around for a better layout. An example: It's simple to prevent things like widows & orphans while distributing the vertical boxes.

### Typst
Typst adopts some of TeX's ideas, but differs significantly in other aspects. The central concept of Typst's layout engine is the _region:_ A region describes a shape into which elements can be laid out. A layouter receives a (potentially infinite) sequence of regions into which it shall lay out its contents. The result of this is a number of _frames,_ which are just like TeX's boxes.

When content is laid out, it is first _realized_ into a uniform structure called a _flow,_ which is a collection of block-level elements. This includes spacing, paragraphs, blocks, placed elements, and a few other, minor elements.

When laying out its children, the flow keeps adjusting the regions to account for already laid out content. For instance, if we've already visited two paragraphs that took two thirds of the available space of the first page, a subsequent table would get a first region with the remaining third of the space followed by an infinite sequence of page-sized regions.

For implementation reasons, Typst currently restricts the general region model in two ways:
- All regions in a sequence must currently have the same width.
- Regions can currently only be rectangular. They do not allow for "cutouts."

Together, these two restrictions let Typst linebreak a paragraph independently of where on the pages it ends up, just like TeX. Still, block-level elements like tables are able to react to where they are placed on the page. This leaves Typst with way less flexibility in juggling things around, but more flexibility in adjusting a layout based on its own position.

### Comparing TeX and Typst
When comparing TeX and Typst, we thus observe that two different desires inform the respective designs: TeX puts **movability first** to be able to optimize positions and spacings. Typst puts **placement first** so that elements can react to their positions, allowing e.g. table cells to properly break over pages.

These two things are, to an extent, fundamentally at odds: When things can move after being laid out, they cannot know their own position. When things can react to their exact position during layout, they cannot be moved afterwards.


## Challenges
TeX's layout model solves a great deal of problems, particularly regarding the optimal layout of paragraphs, and to a lesser extent also of pages. In my opinion, it is a _pretty good model_ for a layout engine: It's conceptually simple, can be implemented very efficiently, and allows for high-quality typography. If it did all the things I'd like for Typst to do, I would gladly adopt it. Unfortunately though, for all its upsides, it is also limited in a few fundamental ways. Let's take a look at a few challenging typesetting tasks where TeX falls short.

### Varying container width
To build a paragraph, TeX must know the width for the individual lines. Typically, they are all the same, but with `\parshape`, the user can also provide individual widths for each line.

Because paragraphs are built before it is known on which page they end up, TeX must provide this information without knowledge of the pages. For this reason, it can fundamentally not properly support layout of a single flow of text across pages or containers of varying widths. This is something that, for example, Adobe InDesign supports.[^indesign-threading]

Typst also doesn't currently support varying container widths. If the limitation of consistent widths is lifted from the region model, it can in theory accommodate for it.

<figure>
  <img
    src="/assets/threaded-frames.avif"
    alt="Threaded text frames"
    width="374"
    height="178"
  />
  <figcaption>
    Threaded text frames in Adobe InDesign.
  </figcaption>
</figure>

### Side-floating elements
A similar limitation also shows up with the `wrapfig` package. This package adds support for images that float to the side of the text, with the text flowing around them. In contrast to bottom or top floats, this kind of float presents a fundamental challenge to TeX's model: When building the lines for a paragraph next to a wrap figure, TeX cannot yet know the vertical positions of the individual lines. It thus cannot (with certainty) know which lines end up next to the wrapping figure.

For this reason, the package makes the reasonable assumption that the paragraph's baselines will be equidistant. Based on this and the known height of the wrapping figure, it computes the number N of lines that will fit next to the figure. Then, while building the paragraph's lines, it allocates the correct width for these N lines (via `\parshape`). Typically, this works fine. If, however, one of the lines ends up larger or on a different page, TeX cannot correct its mistake and there will be extra unoccupied space next to the final lines.

Typst currently doesn't natively support wrapping figures.[^wrap-it] To accommodate for this use case, we would need to lift the restriction that regions cannot have cutouts.

<figure>
  <img
    src="/assets/wrapfig-pagebreak.png"
    alt="A LaTeX wrapfig at the very end of a page"
    width="493"
    height="218"
  />
  <figcaption>
    A LaTeX wrapping figure at the very end of the page. The effect of the figure spills over to the next page, even though the figure doesn't.
  </figcaption>
</figure>

### Breakable tables
Tables present a particular challenge for TeX's model. Consider a table with a few columns and rows containing multiple paragraphs that are able to break across pages (not an uncommon setup in desktop publishing).

For each cell, TeX can build a vlist (containing lines) as usual. Given the vlists for the columns, it'd now be easy to build a table if one knows the positions at which the page breaks. However, TeX does _not_ know the positions of anything on the page when it needs to build it. Instead, it would need to eagerly build a vlist _for the table itself,_ effectively zipping multiple vlists up into one. This isn't really possible without knowledge of the pagebreak positions, as TeX wouldn't know at which points to synchronize the sub-vlists.

There are a few packages in LaTeX which add support for tables spread across pages (`supertabular`, `longtable`) , but there are no packages which allow _cells_ to break across pages (at least to the best of my knowledge). [^tex-cellspan] This is simply close to impossible to do in TeX's fundamental model.

This time, things look better for Typst. As demonstrated in the figure below, Typst is capable of breaking the cells at the page boundary. This is possible because, during its layout, the table knows exactly how much space is left on the page and can react to it.

<figure>
  <div class="rows">
    <img
      class="page-frame"
      src="/assets/table-1.svg"
      alt="First page of a document containing a breakable table."
      width="209.76409999999998px"
      height="297.63824999999997px"
    />
    <img
      class="page-frame"
      src="/assets/table-2.svg"
      alt="Second page of a document containing a breakable table."
      width="209.76409999999998px"
      height="297.63824999999997px"
    />
  </div>
  <figcaption>
    Table with header row and cells that break over pages (generated with Typst v0.11.1).
  </figcaption>
</figure>


## Where To?
As we've seen, TeX's model falls short on everything that requires knowledge of exact vertical positions: Flexible page sizes, chained containers, richly colliding floats, breakable tables, grid-based typesetting, and more.

Typst's current model suffers partly from the same and partly from other problems. The concept of regions in theory allows us to solve a number of problems that TeX cannot solve --- flexible page sizes, container chaining, colliding floats --- but the restrictions Typst puts upon them mean they cannot yet realize their full potential. At the same time, regions introduce new problems: By passing down exact positions to sublayouters, it becomes harder to optimize the layout by moving things around. This lets Typst currently fall short on widow & orphan prevention, vertical justification, and more.

So, where do we go from here? Do we need to embrace the limitations of TeX or do we need to leave behind the optimizations it enables? I think _neither_ --- we can unify movability and placement simply by embracing that **every move requires a relayout.**

### Relayout
When the layout of content is dependent on its own position, moving some already laid out content forces us to relayout it. This is tricky because of side effects: It requires running code twice and if that code isn't designed to run twice, things can go wrong. There have been efforts in the TeX world to do "trial typesetting" of paragraphs, but it forces the engine to take apart already typeset boxes. [^mittelbach-talk] This approach also only works for paragraph contents and not for things like tables.

Typst is in a much better position here because the language is designed in a fully _pure_ way. User-defined functions cannot have any side effects. Cross-dependencies throughout the document (like counters or citations) are resolved without any mutations, through introspection over multiple layout iterations. As a result, Typst is free to rerun some piece of user code without fear of breaking things.

However, up until recently Typst still held a small piece of global mutable state during layout, which was required to make introspection work. With this state, it _was_ possible to relayout, but much care was required, and it was a frequent cause of bugs. Fortunately, this engine limitation has [finally been fixed recently,][pure-locations] making layout 100% pure and free of side effects.

This opens the door to a world where things can know their position _and_ move --- through relayout.
While it also introduces a new dimension of complexity and performance challenges, I think Typst is well positioned to overcome these.

### Complexity
A particular difficulty with a relayout-based approach is that sizes retrieved in an initial layout only limitedly predict sizes in a subsequent layout, specifically since the layout is positionally aware. We might move a block based on its initially observed size, relayout in the hope that it retains its size, and then notice that the relayouted size does not match. In such cases, we might need to relayout _again and again,_ effectively performing a search for the correct position.

<figure class="floating">
  <img
    src="/assets/vertical-centering.svg"
    alt="Illustration that demonstrates the difficulty of vertical centering with collision"
    width="156"
    height="185"
  />
  <figcaption>
    Vertically centering a paragraph that collides with a placed element is hard.
  </figcaption>
</figure>

A practical example is vertically centering a paragraph that flows around an absolutely positioned shape. We cannot mathematically solve for the vertical starting position --- we just have to try and see, essentially performing a binary search over the Y axis.

Unfortunately, we have no guarantee that our result converges to a fixed position. We can, for instance, easily get into the situation where the result oscillates between two positions. I am not yet sure how big of a problem this will be in practice. My gut feeling is to just stop iterating (a) when we stop improving or (b) when we reach a fixed limit, and that this will be sufficient for practical purposes. But we'll have to see.

### Performance
Trial typesetting can be costly: Whenever we move a paragraph or block-level element on the page, we have to assume that it might change. Here, Typst's existing mechanisms for incremental compilation can help us out. By [_tracking_](/posts/comemo/) regions, we can reuse our layout result as long as the _observed_ pieces of the regions are equivalent. Essentially, instead of looking at the whole regions immediately, we only ask for the currently relevant information on-demand. For instance, instead of checking "how much space is left on this page", we might ask "are there at least 4cm left on this page?" For the first question, a 10cm page and a 15cm page would yield different answers, but for the second one both yield the same answer.


## Conclusion
I am quite optimistic about these results! I had grown increasingly discontent with Typst's region model, wondering why we bother with it if the results end up worse than what TeX is able to do with its much simpler model. This wasn't entirely fair as tables _do_ profit from regions right now. But it is a simple fact that Typst's widow & orphan and float handling are in an unsatisfactory state and regions _do_ make it more complex.

The feeling that Typst requires a more relayout-based approach was there for a while. But so far I hadn't seen the connection between relayout and regions: That, for great typesetting results, **regions require relayout.** We _buy_ the flexibility to have certain complex layouts by introducing the complexity of regions. So far we have paid the costs of regions without reaping their rewards.

With the layout engine now fully pure (and [parallelized]!), relayout has become much simpler and safer than before, so it's about time to make use of it. There are still many things to figure out, but I think this is quite an important realization.


[^wrap-it]: The [`wrap-it`](https://typst.app/universe/package/wrap-it) package does add support, though with significant limitations.

[^tex-cellspan]: See [this response on tex.stackexchange.com](https://tex.stackexchange.com/questions/624559/how-to-make-text-in-a-table-cell-spanning-over-multiple-pages).

[^mittelbach-talk]: Explained by Frank Mittelbach in [his talk "E-TeX: Guidelines for future TeX extensions, revisited"](https://youtu.be/qXS27F5NxUg?si=5KA6YhvImUbBZWIb&t=3056).

[^indesign-threading]: See [Adobe's documentation on text threading](https://helpx.adobe.com/indesign/using/threading-text.html) for more details.

[parallelized]: https://github.com/typst/typst/pull/4366
[measure]: https://typst.app/docs/reference/layout/measure/
[pure-locations]: https://github.com/typst/typst/pull/4352
[shows]: https://typst.app/docs/reference/styling/#show-rules
