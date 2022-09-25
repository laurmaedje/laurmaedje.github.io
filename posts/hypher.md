---
layout: post.njk
title: How To Put 30 Languages Into 1.1MB
date: 2022-07-23
tags: post
description:
  A post about hypher, a fast hyphenation library for Rust.
  This library converts LaTeX hyphenation patterns into compact finite state
  machines that can be traversed without any upfront loading.
  The result is faster and leaner than previous crates.
---

_This blog post is about [`hypher`], a fast hyphenation library for Rust._

I'm currently working on a pure-rust LaTeX alternative called [Typst].
To obtain justification results on par with LaTeX, Typst needs support for hyphenation.
A quick search on [docs.rs] showed that there's only really one hyphenation library, fittingly called [`hyphenation`].
All other crates I've found were small variations of this crate.
The hyphenation crate has a lot of functionality and supports many languages.
However, it also has sizable binary overhead when you embed the hyphenation patterns (2.8MB).
While you can load patterns at runtime, distributing the pattern files separately is so much more complicated than just embedding them.

A specific pain point I had with hyphenation was that I needed to hold on to the loaded, heap-allocated language dictionaries.
In my case, the text was pre-segmented into "words" (string segments between two [Unicode line break opportunities][unicode-linebreak]) and the language could be different for each word.
Thus, I would've either had to reload the patterns for each word (slow) or set up some caching solution.
Which is certainly possible, but I had some problems getting it to work because the hyphenating iterator kept borrows into the caching hash map.

So, at this point I decided to build a new crate with the following goals:
No allocations, no loading at runtime, less binary overhead and no dependencies (why not).
It looks like this:

```rust
use hypher::{hyphenate, Lang};

let syllables = hyphenate("extensive", Lang::English);
assert_eq!(syllables.join("-"), "ex-ten-sive");
```

(And that's almost the whole API surface.)

## Hyphenating words
So, how do we actually hyphenate stuff?
Turns out that there aren't really lists of hyphenated words that are available for free.
So even with a new, let's say ML-based algorithm, we lack the data to make it work.
(Such an approach would definitely be interesting, although I'm guessing the models would be quite large.)
After a bit of research, it seemed that using TeX patterns is still the way to go.
TeX patterns are, in principle, generated from word lists with the [patgen] tool, but many were tweaked by native speakers over the decades.
The algorithms for dealing with the patterns go all the way back to Liang's 1983 thesis [_Word Hy-phen-a-tion by Com-put-er_][liang-thesis].

The general idea of the patterns is the following:
There are _hyphenating_ and _inhibiting_ patterns.
A hyphenating pattern says something like "if you see this sequence of letters, you can hyphenate here".
An inhibiting pattern is the opposite: "If you see this sequence, don't hyphenate here!"
There are multiple levels of patterns:
The first level of patterns is hyphenating and defines broad rules like "you can hyphenate between two successive 'c's."
The second level of patterns is inhibiting and handles exceptions from the broad rules.
And, you guessed it, the third level is again hyphenating and  handles the exceptions from the exceptions.

The pattern files are encoded in a simple text format:
Letters are just letters and a number between two letters designates a point of hyphenation or inhibition.
An odd number specifies a point of hyphenation and an even number one of inhibition.
This goes up to a maximum level of 9.
Some pattern include dots to indicate that the pattern should only match at the start or end of the word.

Now, to find out how to hyphenate a word, we first need a zero-initialized array of levels with length one less than that of the word (one entry for each point between two letters).
Then, we need to find all patterns that match a substring of our word and update the level array with their levels.
Updating always means taking the maximum of the existing entry and the number in the pattern, so that in the end, we get the result of the strongest pattern.
Finally, the possible hyphenation points lie at the odd levels in the array.
The example below illustrates this:

<img
  src="/assets/hyphenate.svg"
  alt="Visualization of how to hyphenate the word 'hyphenate'"
  width="400"
  height="250"
/>

## Tries and state machines
So far so good.
We know the general idea, but an important question remains:
How do we find all matching patterns?
While we could store the patterns in a hashmap and iterate over all substrings, this would kind of defeat the point of this blog post.
_We want performance._

Luckily, Liang's thesis also contains efficient algorithms to work with the patterns.
The general idea is to create a _trie_, essentially a tree-shaped finite state machine, to encode the patterns.
Each path from the root of such a trie to an accepting state encodes one pattern.
The figure below shows an example for the seven patterns from the example above (accepting states have double borders).
You can see the pattern `n2at` being reflected by the topmost path through the trie.
We can easily build such a trie by iterating over the patterns, trying to walk each pattern in the trie and adding states and transitions as necessary.

<img
  src="/assets/state-machine.svg"
  alt="State machine for the seven previously seen patterns"
  width="400"
  height="220"
/>

What is still missing from this illustration though is the levels!
How does that work?
Since there is a one-to-one relationship between patterns and accepting states, we can simply associate the levels for a pattern with the accepting state.

In the example above, I have numbered the accepting states with Roman numerals so that we can write down the levels for each one.
A pattern with n letters can have n+1 levels:
Before the first letter, between each pair of letters and after the last letter.
If there isn't a number between two letters, it's the same as if there was a zero in between.
This way, we get the following result:

| State | Pattern  | Levels               |
|:------|:---------|:---------------------|
| I     | `1na`    | `[1, 0, 0]`          |
| II    | `n2at`   | `[0, 2, 0, 0]`       |
| III   | `he2n`   | `[0, 0, 2, 0]`       |
| IV    | `hena4`  | `[0, 0, 0, 0, 4]`    |
| V     | `hen5at` | `[0, 0, 0, 5, 0, 0]` |
| VI    | `hy3ph`  | `[0, 0, 3, 0, 0]`    |
| VII   | `4te.`   | `[4, 0, 0, 0]`       |

Now, given a trie with levels, how do we hyphenate a word?
We simply start a trie walk at each letter of the word and update the level array with the levels of each accepting state we meet.
This way, we once again find all patterns that match any substring in the word, but much more efficiently!

---
You can think about tries like this:
They allow us to efficiently encode _shared prefixes_ of the patterns.
But we can even go one step further and also profit from _shared suffixes._
This turns the trie into a finite state machine.
To do that, we have to find _ends_ of walks which are the same.
In the example above, this would almost work for the two `a-t` walks ending in `II` and `V`.
However, it unfortunately doesn't in this case because the levels associated with `II` and `V`  are different.
For more details on tries, finite state machines and suffix compression, read [this very interesting blog post.][transducers]

---

## Encoding state machines compactly
All that is left to do is to compactly encode our state machine into bytes that we can embed into the binary.
For this, I took some inspiration from [`regex-automata`], which makes heavy use of all kinds of automatons.

In our case, each state consists of transitions and optionally levels for accepting states.
For each transition, we have a letter and a target state.
Well actually, now is maybe a good time to bring up that we don't actually deal with letters.
Rather, we build our state machine over UTF-8 bytes.
This works just as well, but is much easier to encode compactly.
And when hyphenating, we then of course only start trie walks at UTF-8 codepoint boundaries.

Back to the states:
To encode transitions, we lay out two parallel arrays.
The first contains each byte for which there is a transition and the second contains the _address delta_ to the state we should transition into for this byte.
Each state has an _address:_ its byte offset in the whole encoded machine.
Transition addresses are always encoded relative to the origin state as the delta is often much smaller than the absolute address.
To get maximum profit out of this, we further use a variable length address coding. The address array is either an `[i8]`, `[i16]` or `[i24]` depending on the largest delta.
Overall, a state's bitstream encoding looks like this:

<img
  src="/assets/state-encoding.svg"
  alt="Binary state encoding"
  width="400"
  height="320"
/>

Now, the levels.
If a state is accepting, it contains an additional _offset_ and a _length_ for the levels.
The (offset, length) pair locates a slice of items in an additional array shared by all states.
Each item in the level slice corresponds to one number in the state's pattern.
A level item consists of two parts: the distance of the level from the start of the word or previous level, and the level number.
We again use the trick of making the distances relative to make them smaller.
It turns out that there is no relative `distance` larger than 24 and no `level` larger than 9 in the patterns.
This means we can cramp both into a single byte!
We can't directly shift and bitor these two values into 8 bits (distance would need 5 bits and level 4 bits).
However, there are still only 25 * 10 = 250 combinations, which is less than 256. So we can fit it into one byte like this:

```rust
fn pack(dist: u8, level: u8) -> u8 {
    assert!(dist < 25, "too high distance");
    assert!(level < 10, "too high level");
    dist * 10 + level
}

fn unpack(packed: u8) -> (u8, u8) {
    let dist = packed / 10;
    let level = packed % 10;
    (dist, level)
}
```

If the encoded level slice for two states is the same, it is only stored once in the shared array, saving even more precious space.

## Finishing up
At runtime, we now don't need to prepare or load anything.
We can just lazily decode the embedded automaton as we're executing it.
And to eliminate the last allocation, we can even stack allocate the level array if the word isn't too long (<= 39 bytes in `hypher`).

Regarding API, I opted for a free-standing method `hyphenate(&str, Lang) -> Syllables<'_>` as I feel that it is much more discoverable than a method on `Lang`.
`Syllables` is a hand-written iterator that segments the string based on the level array.
I also always enjoy when a crate makes my job as simple as a possible.
Therefore, I added a `join` method to `Syllables` so that you quickly add in some (soft) hyphens.

The tries are constructed and encoded with a build script.
As that script really took its time in debug builds, I added this to my `Cargo.toml` to somewhat optimize the process.

```toml
[profile.dev.build-override]
opt-level = 1
```

Regarding binary size:
1.1MB isn't that much, but there are also many applications where you only want to hyphenate English.
For this, I added two features `full` and `english` with `full` being enabled by default.
Dropping `all` and adding `english` brings the overhead down to 27KB.
While I don't think its great to favor English like that (I'm not a native English speaker), I also felt that adding one feature per language didn't carry its weight.

```toml
[features]
default = ["full"]
full = ["english"]
english = []
```

(Update: [There's now one feature per language.][features-pr])

## Benchmarks
Now, let's very briefly compare [`hypher`] with [`hyphenation`].

| Task                               | hypher | hyphenation     |
|:-----------------------------------|-------:|----------------:|
| Hyphenating `extensive` (english)  |  356ns |           698ns |
| Hyphenating `διαμερίσματα` (greek) |  503ns |          1121ns |
| Loading the english patterns       |    0us |           151us |
| Loading the greek patterns         |    0us |         0.826us |

For these two test cases, hypher is about 2x as fast as hyphenation.
Moreover, the loading overhead of hyphenation is quite large in comparison to hyphenating a single word, at least for English.
All benchmarks were executed on ARM, Apple M1.

The direct overhead of embedding is ~1.1MB for hypher and ~2.8 MB for hyphenation.
However, this comparison is unfair to hyphenation as I dropped some languages from hypher.
Over the decades, quite a lot of TeX pattern files have amassed.
For many of these, I couldn't even find any evidence that hyphenation is used for these languages, so I removed them.
Furthermore, I wanted `hypher` to be permissively licensed.
Therefore, it unfortunately does not support languages for which the only available patterns have GPL-like licenses.
There are a few of those, but not too many.
In a fairer comparison where only the common languages are considered, hypher's encoding is still ~12% more compact than hyphenation's.

That's it, thank you for reading!
Also, [take a look at Typst][Typst] if you're interested.

Discussion on [r/rust][reddit-post].

[`hypher`]: https://github.com/typst/hypher
[`hyphenation`]: https://github.com/tapeinosyne/hyphenation
[`regex-automata`]: https://github.com/BurntSushi/regex-automata
[docs.rs]: https://docs.rs
[Typst]: https://typst.app
[unicode-linebreak]: https://unicode.org/reports/tr14/
[patgen]: https://ctan.org/pkg/patgen?lang=de
[liang-thesis]: https://tug.org/docs/liang/liang-thesis.pdf
[transducers]: https://blog.burntsushi.net/transducers/
[reddit-post]: https://www.reddit.com/r/rust/comments/w683br/how_to_put_30_languages_into_11mb/
[features-pr]: https://github.com/typst/hypher/pull/3
