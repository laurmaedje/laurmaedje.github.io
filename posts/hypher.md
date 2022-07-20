# How to put 30 languages into 1.1MB

- About [`hypher`] ...
- I'm currently working on a pure-rust LaTeX alternative called [Typst]
- To obtain justification we obviously need hyphenation for many word-
  and letter-based scripts

- Existing hyphenation libraries not satisfactory
  - Couple of crates, but all are variations of the same single crate:
    [`hyphenation`]
  - Quite large binary overhead (2.8MB)
  - Need to deserialize and allocate at runtime
  - Some patterns have non-permissive licenses

- Goals of new crate called `hypher`
  - No allocations
  - No start-up overhead, patterns are preprocessed and encoded
    in build script
  - Less binary size
  - Permissive licensing

## Hyphenating words
- How do we actually hyphenate stuff?
- There isn't really an alternative to TeX patterns
- ML based approach would be interesting, but difficult and what about
  stability?
- Don't know too much about ML, but I'd be guessing that a model would be
  quite large
- General idea of the algorithm from Knuth-Liang
  - Explain approach <!-- größte baustelle -->
  - Link to Trie paper
  - Visualize with Figure

## Encoding patterns efficiently
- Suffix compression turns it into a DFA
- Binary encoding inspired by [`regex-automata`]
- More efficient variable length delta address encoding
- Packed distance + level encoding

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

Posted on r/rust

[Typst]: https://typst.app
[`hypher`]: https://github.com/typst/hypher
[`hyphenation`]: https://github.com/tapeinosyne/hyphenation
[`regex-automata`]: https://github.com/BurntSushi/regex-automata
