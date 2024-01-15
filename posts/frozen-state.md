---
title: Frozen State
date: 2024-01-15
description: Freezing state in Typst and how it could tie in with the context idea.
---

One thing that comes up from time to time, especially in the context of slide creation, is the idea of _freezing_ state.
Consider the following slide snippet written using the Polylux package:

```typ
#import "@preview/polylux:0.3.1": *
#set math.equation(numbering: "(1)")

#polylux-slide[
  First, we show: #pause
  $ x + y = z $   #pause
  Then, we continue.
]
```

Here, we make use of the `pause` command to generate multiple pages, each of which uncovers more of the slide.
If you compile these slides, you'll see that the equation is numbered with (2) on page 2 and with (3) on page 3.
This is of course not what we want.

To understand why it happens, we have to understand a bit of how Polylux works internally:
When you use the pause feature, Polylux figures out how many pages in total your slide needs.
It then generates this number of pages and inserts the full content on each page, but with rules configured that conditionally [`#hide`] parts of the content.

From Typst's point of view, Polylux generates three separate equations and hides one of them.
Reasonably, it thus gives each of those equations a separate number.
Note that this is _generally_ a desirable property:
If you store content in a variable and use it multiple times, you get the same result as if you'd have written the content in each of the places (this is called _referential transparency_).
This makes things composable and allows packages to juggle content around and style it "after the fact".
It's just in some cases like this one that it's actually semantically the same content, and we need some way to express that in Typst.

## Measurement and introspection
What I've only realized recently, is that a very similar requirement arises when we `measure` content that performs introspection.
Consider the following snippet:

```typ
#let c = counter("key")
#c.update(1)
#style(styles => {
  // We retrieve the counter and convert it to spacing
  // which we then measure
  let elem = c.display(n => n * v(10pt))
  let height = measure(elem, styles).height
  [Height is #height]
  c.step()
  elem // try moving or deleting this
})
#c.step()
```

As-is, this outputs `20pt` which means `n` was `2`.
If you delete the line with `elem`, it suddenly outputs `30pt`.
What is happening here?

It turns out that measuring in combination with introspection features yields some interesting results.
To understand what is happening here, we first need to understand how counters work internally.
Rather than being directly modified through side effects, all mutations and displays of counters and state end up as invisible content somewhere in the document and thus in the final layout.
When resolving a `.display` call, the counter type queries (as in [`query`]) for all counter updates in the document _before_ the display's location.
This is just like a query for all headings before a specific point as counter updates are content like headings, just invisible.

Given this complete sequence of updates, we can then determine the value at the current location by applying the updates one by one.
For example if we have a series of updates `.update(2)`, `update(n => 3 * n)`, `update(n => n - 3)`, `update(5)`, it computes the sequence `2, 6, 3, 5`.
If the determined location of a display call is between the first two updates, it yields `2`.
Similarly, if it is between the last two updates, it yields `3`.
The results thus depend on how Typst determines whether an update is before or after our display when doing the query.

So, how does it work? The implementation is actually relatively straight-forward:
Typst's introspection system holds an ordered list of all locatable elements.
When doing a "before" query, it finds the index of the cutoff element in the list and extracts all matches up to this index.
Crucially, asking for all matches before a non-existent element will just give us all matches.

Equipped with this knowledge, let's look at what happens above.
Clearly, the `measure` call is affected by the position of `elem` in the real layout:

- If the `elem` is after the first `c.step()`, we get that one as part of our update list, yielding `20pt`
- If `elem` is deleted, we don't find it at all and get all counter updates, yielding `30pt`
- If `elem` is moved above the first `c.step()`, we only get the initial update, yielding `10pt`

The reason the measurement is affected by the real layout is that the locations (= unique element IDs) assigned to `elem` during measurement and real layout match up.
This is typically what you want because you're measuring something to determine how to arrange it in a layout of your own.
However, it can yield surprising results if you don't end up putting the measured thing into the document.
It is also fundamentally a best-effort approach because Typst can't always disambiguate how multiple measured elements map to multiple real elements (if multiple ones have the same hash).
The current way we do measurements on things with introspection is sadly a bit ill-defined.
So far, it typically worked out because the IDs happen to mostly match up in the current implementation.

## Circling back
Since the existing design results in some strange measurements results (which can fundamentally only be dealt with on a best-effort basis), maybe the problem lies with the measurement API itself.
Perhaps redesigning this API will make our problems go away.
What we need is a way to somehow assign a unique identity to content _before_ measuring it so that the desired link between measured elements and the final layout is clear to both users / package authors and Typst.
We basically need to tell Typst:
"This is the same content no matter where you see it.
If it uses counters and state internally, resolve all of them in the same way everywhere."
Sound familiar?

This is exactly what we need for the Polylux example from above.
Given a way to `freeze` content, we could put it into the document multiple times and have it be the same every time:
```typ
#set math.equation(numbering: "(1)")
#context {
  let v = freeze($ x + y = z $)
  v // this will be equation (1)
  v // and this, too :)
}
```

In the same way, we could measure it and Typst would always understand the link between the measured and real content:
```typ
#context {
  let v = freeze(content)
  // No matter what happens, the
  // measurement will observe state
  // like `v` does below.
  let size = measure(v)
  v
}
```

## Challenges
The hard question now is: How can we implement this `freeze` function?
We somehow need to ensure that across all usages of the frozen content, the displayed elements end up having the same locations / IDs.
This is rather incompatible with the current way unique IDs are assigned.
The good news is that there are independently motivated plans to change the way they are assigned.
(The current implementation requires some mutable state in the layout engine, which prevents parallelization. If we can get rid of this state, it becomes _trivial_ to parallelize the layout engine.)

The new approach is basically to assign an element's ID based on a hash of its parent's ID + the element's syntax span and type + local disambiguation among elements where all the previous things are the same.
It's a form of hierarchical hashing.
This approach yields unique IDs that are pretty stable across multiple compilations (which is important for incremental compilation).
Moreover, it only requires a minimal amount of local state and enables parallelization.

The approach is also a lot more compatible with the desire for a `freeze` function.
If we freeze a particular element's ID and put it into the document twice, all its children are automatically assigned IDs that match up across the two usages. (This is the part that is not true for the current implementation, because the children would be automatically globally disambiguated.)
However, at the same time, IDs most of the time _won't_ match up by luck anymore when doing measurement, so applied naively `measure` breaks pretty badly.
So, essentially, the new approach and frozen state kind of depend on each other (and that realization is what triggered this post).

The remaining challenge is to assign a unique ID to an element when freezing it.
This is actually rather tricky in a language with pure functions like Typst.
The [context] idea could help us here though.
Since measurement needs to happen within a style callback / context anyway, we can leverage that context to get most of our desired uniqueness (a context in itself always gets a unique ID).
We can get further uniqueness from the call-site syntax span and content hash where we assign the ID.
There is still the possibility for a collision when dealing with hash-equal content in a loop, as shown in the example below:

```typ
#context {
  let a = [= My one heading]
  let b = [= My other heading]
  let vs = (a, a, b)
  vs.map(freeze).join()
}
```

In this example, the context, call-site syntax span, and content hash for both `a` headings is the same, so `freeze` has no choice but to return the same content.
As a result, the first two headings would be identified as one and the same and get the same number.
The second, however, could be identified as different since the content is defined at a different syntax node and thus has a different span.
In the same way, we could identify two syntactically separate freeze calls of the same content as distinct.
We'd face a similar challenge when we would use syntax spans to provide an automatic identify to counters/states ([see the issue on anonymous states](https://github.com/typst/typst/issues/2425)).
For the rare case where everything matches up, manual disambiguation by the caller could be an option (i.e. passing a number or string to `freeze` which is incorporated into the ID hash).
Still, the whole thing isn't totally satisfactory.

A second challenge for the Polylux example is the fact that `freeze` would freeze _everything._
Polylux also manages some internal state to figure out which slide it is currently processing.
If everything is frozen, that state is also frozen, so two different slides showing the same frozen content couldn't show different things.
The [issue on freezing state](https://github.com/typst/typst/issues/1841) proposed an `exclude` mechanism to deal with this.
However, I have no idea how to implement that.
An alternative solution to this problem could be get rules.
Assuming that `freeze` would only freeze the identity used for introspection and not the active styles, custom get rules could be used to communicate arbitrary information like slide numbers down the content tree.

The presented design in this post is far from final.
The post is primarily intended as an initial exploration of potential foundations for a state freezing functionality.
I'm thinking of the ideas as sort of Lego bricks:
There are various considerations, trade-offs, and challenges at play, so we need to find the right way to assemble the bricks.
But the assembly doesn't affect just state freezing:
There are other desirable state-related features that are also affected by the decision we make here:
For instance, a related feature request is to be able to isolate some content from the document, so that it's state isn't affected by the remaining document and vice versa.
I think that this is also something that could be fitted fairly well into the framework discussed above.

[Discussion on Discord.](https://discord.com/channels/1054443721975922748/1196509531354701874)

[context]: /posts/types-and-context/
[`#hide`]: https://typst.app/docs/reference/layout/hide/
[`query`]: https://typst.app/docs/reference/introspection/query/
[anonymous states]: https://github.com/typst/typst/issues/2425
