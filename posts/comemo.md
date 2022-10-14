---
title: Writing An Incremental Typesetting Engine
date: 2022-10-15
description:
  A post about comemo, a new Rust library for incremental compilation.
  In comparison to existing incrementality tools for Rust, comemo is very simple and natural to integrate into a project.
---

In my last blog post, I shared how hyphenation works in the LaTeX alternative [Typst] I'm working on.
Subsequently, there was a lot of interest in Typst on [Reddit][reddit] and [Hacker News][hn], which was very exciting to see!
While a blog post about Typst itself is definitely coming, for now I want to discuss another interesting thing from Typst's implementation: Our incremental compilation system _comemo._

In WYSIWYG tools like Word and Google Docs, users are accustomed to instantly seeing the results of their edits.
LaTeX users, in contrast, still have to wait anywhere from seconds to half a minute to see their changes reflected in the output.
While this might not be a big deal for experienced users writing structural markup, it is a big hurdle for beginners.
And even for certified TeXperts, it hurts with experimentation and positioning adjustments.
Have you ever compiled a document five times in a row while trying to figure out the optimal size of an image?

This is clearly not an acceptable situation.
Thus, with Typst one of our overarching goals was to provide "instant preview."
Or more specifically:
A preview whose refresh time is proportional to the size of a performed edit.
It's fine for an initial compile of a big document to take a few seconds, but subsequent compilations after minor edits shouldn't.

## Memoization
How we do this?
Well, we can't start from scratch in every compilation.
Somehow we need to reuse partial results throughout multiple compilations.
The simplest way to do this is with _memoization:_
By caching a function's output, so that it only needs to be executed once per unique set of arguments.
A typical example of a function that is amenable to memoization is the fibonacci sequence:

```rust
fn fib(n: u64) -> u64 {
    match n {
        0 => 0,
        1 => 1,
        n => fib(n-1) + fib(n-2),
    }
}
```

In its naive recursive variant, executing this function takes exponential time.
With memoization, however, each unique call to `fib` will be evaluated just once.
This way, we can cut the running time down from exponential to linear.
In essence, memoization trades memory for speed.
And in Rust we can easily implement this as a `#[memoize]` attribute macro that we can just slap onto our function.
Sounds great, right?

It's not quite that simple, unfortunately.
Memoization works best when a function depends on the _full information_ contained in its inputs.
In practice, this is often not the case though.
A good example of this is Typst's layout implementation which operates on a tree of nodes encoding different kinds of layouts.
Apart from the node, a few more things need to be supplied to the layouter:
Most importantly, fonts for text layout.
But, since Typst is programmable, layout can also trigger user code execution.
This can in turn lead to file accesses, module imports and more.
Typst supplies all this through the `World` trait (of which there are multiple implementations for the local command line compiler and the WASM-based web app).
Slightly simplified, the setup looks as follows:

```rust
fn layout(node: &Node, world: &dyn World) -> Frame {
    ...
}

trait World {
    fn book(&self) -> &FontBook;
    fn font(&self, id: usize) -> Option<Font>;
    fn file(&self, path: &Path) -> FileResult<Buffer>;
}
```

To speed up our engine, we now want to memoize the layout function.
Now, think back to how memoization works and you might spot the problem:
The `layout` function effectively depends on _everything,_ on the whole state of the world!
As soon as a single source file changes, all memoized results become unusable.
That's not good.
Does memoization just not fit the bill?

## Constrained memoization
Let's not give up quite that quickly.
That the `layout` function _can_ access the whole world, doesn't mean it will!
And if some totally unrelated file changes, we should still be able to reuse our layout results.
To do that, we just need to know which parts of the world a `layout` call depends on and check that those stayed the same.
This is what comemo is about.
To use it, we just have to add two attributes to the code from before and wrap the `world` in comemo's `Tracked` container:

```rust
use comemo::{memoize, track, Tracked};

#[memoize]
fn layout(node: &Node, world: Tracked<dyn World>) -> Frame {
    ...
}

#[track]
trait World {
    fn book(&self) -> &FontBook;
    fn font(&self, id: usize) -> Option<Font>;
    fn file(&self, path: &Path) -> FileResult<Buffer>;
}
```

The `memoize` attribute simply instructs comemo that this function should be memoized.
The `track` attribute is more interesting.
It implements the `Track` trait for `dyn World`, allowing us to construct a `Tracked<dyn World>`.
A _tracked argument_ needn't be exactly the same as in a previous call for that call's result to be reusable.
It just needs to be used equivalently.

This is what the `Tracked<T>` container is about.
It wraps `T` and only exposes the methods from the trait (or impl block) annotated with `#[track]`.[^1]
When one of the tracked methods is called, it generates _constraints_ that shrink down the set of equivalent `T` instances.
The constraints for `T` consist of a struct containing one map for each tracked method.
Each map records the input-to-output mapping of that method.
These recordings encode all relevant information about an instance `x` of `T`.
When another instance `y` fulfills the constraints generated for `x` during a memoized call, it will trigger all the same code paths as `x` did.[^2]
This means that memoized results for `x` can also be used for `y`.

Let's have a bit closer look at these input-to-output recordings.
The maps are structured as follows:

- **Key:**
  The key type of each map is a tuple of the function's arguments (excluding `self`).
  When an argument is borrowed (like the `&Path` argument to `file`), comemo determines its owned variant with `std::borrow::ToOwned` (therefore, `PathBuf` in the figure below).
  When the function has no arguments except `self`, the key type is the empty tuple.
  The map can thus only have two states: Empty and containing the empty tuple. Then, we can store the whole map as an `Option` instead.

- **Value:**
  The value type captures the output of the method.
  To save memory, comemo merely stores 128-bit SipHashes instead of the full return values.
  Although SipHash is not a cryptographical hash function, it provides high enough resistance against unlucky collisions.
  (It's the same hash function that is used in rustc's incremental system and in std's hash maps.)

To determine whether an instance of `T` fulfills certain constraints, we can replay the recordings and check for each method whether its return values match the saved hashes.

The figure below visualizes the memory layout of a `Tracked<dyn World>` and the constraint setup for a `dyn World`:

<img
  src="/assets/tracked.svg"
  alt="Memory layout of the type `Tracked<dyn World>` pointing to a `dyn World` and a `WorldConstraint`. The constraint has fields for the book, font, and file methods."
  width="400"
  height="220"
/>

Now, to perform memoization, we need a cache that stores the results of each memoized function plus constraints on its inputs.
When a memoized function is called, this cache is checked for entries with compatible constraints.
If there's a hit, we can directly return the result.
Otherwise, we generate empty constraints for the inputs, hook them up into the tracked input types, execute the function itself, and store the output alongside its generated constraints in the cache.
When the cache grows too large or entries become stale, they are evicted automatically.

Well, that was a lot.
Luckily, you don't have to worry about this when using comemo.
It all happens automagically behind the scenes.

## Comparison
You might be wondering how all of this compares to Rust's incremental compilation setup.
`rustc`'s incrementality is based on the [_query system._][query-system]
This system is built around a database of queries like "type check this module" and "give me the type of this expression."
The database caches query results and reuses them if possible.
This query system has since been lifted into an external library called [salsa], which is also used by rust-analyzer.

Conceptually, comemo and salsa are somewhat similar.
Both allow you to reuse partial results even in face of changed inputs.
But on the developer-facing side they are quite different.
In salsa, you have to structure your whole program around the database.
In comparison, comemo is far simpler to integrate into existing programs.
You can just start annotating pure functions with `#[memoize]` and add tracked arguments where applicable later.
There's also currently a redesign of salsa [in progress][salsa-2022] (salsa 2022).
This redesign and comemo are more similar, but the salsa version is still harder to integrate.
From what I could gather, salsa 2022 also doesn't have a great mechanism for lazily loaded inputs (e.g. fonts that Typst pulls from a web server).
There is also [adapton], another incrementality framework, but it's really complex and honestly I didn't really understand it.

## Beyond comemo
In Typst, incremental compilation started out with hand-written layout constraints.
Unfortunately, these were very hard to write and pretty bug-prone.
From this arose the idea to autogenerate constraints and ultimately comemo.
But there are more interesting problems we tackled to realize instant preview.
For example, we implemented an incremental parser that powers both the compiler and our web app's syntax highlighting.

Another big problem we faced was error reporting and jump-to-source functionality.
To realize them, late stages of the compiler need to refer back to segments of the source code.
The standard choice for this are simple byte ranges ("spans"), but these of course change a lot when editing the start of a file, invalidating lots of memoized results in the process.
To fix this, we implemented a special syntax node numbering scheme that integrates with our incremental parser.
It gives a stable identity to syntax nodes even when their byte offsets in the
file change.

To summarize: We're really really passionate about realizing true instant preview for a fully-fledged typesetting language.
So, if any of this was interesting for you, please also feel free to [check out Typst][Typst].
We are not yet in beta, but our wait list is open and we plan to invite a first batch of alpha testers within the year!

[^1]: The type `Tracked<T>` is a wrapper around `T` that derefs to a newtype
      generated by the `#[track]` macro.
      This newtype has an inherent impl with the tracked variants of the methods in the trait or impl block annotated with `#[track]`.

[^2]: As long as the function is pure.
      But that is a prerequisite for memoization, anyway.

[Typst]: https://typst.app
[reddit]: https://www.reddit.com/r/rust/comments/w683br/how_to_put_30_languages_into_11mb/
[hn]: https://news.ycombinator.com/item?id=32209794
[query-system]: https://rustc-dev-guide.rust-lang.org/query.html
[salsa]: https://github.com/salsa-rs/salsa
[salsa-2022]: https://smallcultfollowing.com/babysteps/blog/2022/08/18/come-contribute-to-salsa-2022/
[adapton]: https://github.com/Adapton/adapton.rust/
