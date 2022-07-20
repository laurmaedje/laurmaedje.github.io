# How to put 30 languages into 1.1MB

_This blog post is about [`hypher`], a fast hyphenation library for Rust._

I'm currently working on a pure-rust LaTeX alternative called [Typst].
To obtain justification results on par with LaTeX, Typst needs to support hyphenation.
A quick search on [docs.rs] showed that there's only really one hyphenation library, fittingly called [`hyphenation`].
All other crates I've found were small variations of this crate.
The `hyphenation` crate has a lot of functionality and supports many languages.
However, it also has sizable binary overhead when you embed the hyphenation patterns (2.8MB).
While you can load patterns at runtime, distributing the pattern files separately is so much more complicated than just embedding them.

A specific pain point I had with `hyphenation` was that I needed to hold on to the loaded, heap-allocated language dictionaries.
In my case, the text was pre-segmented into "words" (string segments between two [Unicode line break opportunities][unicode-linebreak]) and the language could be different for each word.
Thus, I would've either had to reload the patterns for each word (slow) or set up some caching solution.
(Which is certainly possible, but I had some problems with getting it to work because the hyphenating iterator kept borrows into the caching hash map.)

So, at this point I decided to build a new crate with the following goals:
No allocations, no loading at runtime, less binary overhead and no dependencies (why not).
It looks like this:

```rust
use hypher::{hyphenate, Lang};

let syllables = hyphenate("extensive", Lang::English);
assert_eq!(syllables.join("-"), "ex-ten-sive");
```

## Hyphenating words
So, how do we actually hyphenate stuff?
Turns out that there aren't really lists of hyphenated words that are available for free.
So even with a new, let's say ML-based algorithm, we would still miss the data to make it work.
(Such an approach would definitely be interesting, although I'm guessing the models would be quite large.)
After a bit of research, it seemed that using TeX patterns is still the way to go.
TeX patterns are, in principle, generated from word lists with the [patgen] tool, but many were tweaked by native speakers over the decades.
The algorithms for dealing with the patterns go all the way back to Liang's 1983 thesis [_Word Hy-phen-a-tion by Com-put-er_][liang-thesis].

The general idea of Liang's algorithm is the following:
- Explain approach
- Link to Trie paper
- Visualize with Figure

## Encoding patterns efficiently
- Suffix compression turns it into a DFA
- Binary encoding inspired by [`regex-automata`]
- More efficient variable length delta address encoding
- Packed distance + level encoding
- Visualize bit packing

## Hyphenating at runtime
- Decodes lazily and jumps around in data
- Uses stack unless word is long (>= 39 bytes)
- Takes care of unicode boundaries

## Making a nice API
- Free-standing method has best discoverability
- Syllables Iterator
- Join method is nice to have

## Finishing up
- Faster build `[profile.dev.build-override] opt-level = 1`
- Feature for just English to drop down to 27KB
- Benchmarks
  - Zero start-up time
  - Zero allocations
  - About 2x as fast as hyphenation :)
  - TODO: Fair binary size comparison which just the languages hypher
    also supports

It is of notice that I wanted `hypher` to be permissively licensed.
Therefore, it unfortunately does not support languages for which the only available patterns have GPL-like licenses.
There are a few of those, but not too many.

Posted on [r/rust].
Have a look at Typst [here][Typst] if you're interested.

[r/rust]: https://reddit.com/r/rust
[`hypher`]: https://github.com/typst/hypher
[`hyphenation`]: https://github.com/tapeinosyne/hyphenation
[`regex-automata`]: https://github.com/BurntSushi/regex-automata
[docs.rs]: https://docs.rs
[Typst]: https://typst.app
[unicode-linebreak]: https://unicode.org/reports/tr14/
[patgen]: https://ctan.org/pkg/patgen?lang=de
[liang-thesis]: https://tug.org/docs/liang/liang-thesis.pdf
