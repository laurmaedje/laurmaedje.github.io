---
title: Evolving Typst
date: 2026-01-05
description: Thoughts on how we can bring Typst closer to 1.0 while also evolving it more freely.
---

People frequently ask when we will release a 1.0 version of Typst. The version number "0" is often taken as an indicator of immaturity, as a big sign that says "this software isn't yet ready for use." Personally, I think that's quite unfortunate. I _do_ consider Typst ready for production use and yet I think releasing a 1.x version now would be naive.

To me, the version number is not a marketing tool but a promise on a technical level. Typst uses _semantic versioning_ and [SemVer](https://semver.org) connects certain guarantees to the different parts of a version number. Thus, we need to be sure what those guarantees are and whether we can give them before publishing a release.

For a project on version number 1.x, SemVer requires the project to release a 2.x when it introduces a breaking change. What constitutes a breaking change though is up to the project / ecosystem the project lives in.

For Typst, it's actually pretty hard to come up with a good definition! Sometimes, it's clear cut: For example, a clearly incompatible change to the syntax is of course breaking. But what about a change that results in a slightly different layout? A change to the default value of a styling property? A change to a built-in show rule that lets user styles compose differently? A change to the internal sorting behavior that happens to [break existing incorrect code](https://github.com/typst/typst/pull/7528)? It's just not that simple and I think figuring out how to classify these different kinds of changes is crucial before we make some kind of promise about how we handle breaking changes.

That's just one part though. The other part about reaching 1.x is that there are a few changes I want to make to Typst that are breaking no matter how you look at them. These changes have been on the horizon for a while (people have been eagerly waiting for custom elements since basically the open-source release). Part of why they haven't happened yet is simply that they are technically and design-wise complex and that we've prioritized other things.

But there's a second hindrance that has been growing stronger. Regardless of the lack of a promise, Typst _has_ de facto increasingly become more stable. When I look back at the recent Typst releases, breaking changes have become tamer and more minor. Especially with the growth of Typst Universe, breaking something foundational would have rippling effects through the ecosystem.

Let's say you want to upgrade your project to make use of some new compiler feature. If one of the packages you use is broken on that version and there isn't yet an updated version, you can't really do much. That sucks. Now, assume you're good on your dependencies but the new version has a pesky syntax change, forcing you to adapt large parts of your markup. That sucks less, but it's still annoying.

On a SemVer level, we can just throw our hands up and say "that's the cost of doing business, we're on 0.x after all." And I think that's entirely fair. Yet, in practice, there's more to it: If breaking changes are painful for the ecosystem, as a maintainer, it also becomes increasingly painful to make them. You start thinking "can I avoid this change?", "can I batch these three changes?", etc. There is some good in this, as it forces you to be deliberate in your actions, but it also slows down the project and reduces the chance that very breaking changes that would be for the better still happen.

I'm not content with this situation. As I said, I do consider Typst production-ready, but at the same time also _far from done._ There are still lots of things I want to ship and some of those require changing Typst in incompatible ways. That's why I think that, even at a 0.x stage, it's well worth asking ourselves the question: What can we do to make breakage less painful? Doing this somewhat egoistically to allow us to act more freely and fearlessly.

---

So what _can_ we do? Let's take a look at the first, more painful of the two scenarios I've painted above. You _really_ need that new layout feature, but your diagramming package just isn't updated yet and you also happen to really need your diagrams. Let's say you're upgrading from 0.14 to 0.15 and there's some breaking syntax change. Solving this problem isn't actually that hard. There is a clear boundary between your project and the diagram package and it's entirely possible for Typst to expose different behavior to both. Typst only needs a very small amount of information to do this: Which behavior to expose to what.

The behavior you want Typst to expose to a package is the one that it exposed at the time the package was developed. In essence, this means you're developing against a _target_ Typst version. This is a parallel concept to the _minimum_ Typst version that you can already declare in `typst.toml` through the `compiler` field. Consequently, I could imagine the following syntax:

```toml
[package]
name = "fancy-diagrams"
version = "0.4.0"
entrypoint = "lib.typ"
compiler = { min = "0.15", target = "0.17" }
```

With this, your package would say, "I don't work on anything below 0.15 and if you're newer than 0.17, please avoid exposing breaking changes since 0.17 to me." And `compiler = "0.15"` would be short for both being equal.

If you're familiar with Rust, this will probably remind you of the _Edition_ mechanism and technically it's indeed basically that. Socially though, I would think of it in a different way. I would not commit to retaining a particular compatibility behavior forever, as over time that could complicate the compiler codebase a lot. Rather, I would keep it for a version or two, to smooth out the effects of a change on the ecosystem, giving people and packages time to adapt and migrate. To me, a nice way to think about it is as a _deprecation warning on steroids._ Indeed, I would probably even warn every time such behavior was triggered.

Note also that the `target` setting would not be a promise of stability: If it's very easy to have compatibility behavior for a breaking change, we'd naturally include it, but if a change had only minor impact and it would be overly hard or even impossible to have compatibility behavior, we could still make a normal breaking change. Just like we do with deprecation warnings now.

There remains the question what to do with packages that don't specify a target. To get the most out of this mechanism with the current package ecosystem, the reasonable course of action would be to apply all available compatibility behavior. However, it could be confusing if you create a new package and suddenly Typst returns to ancient behavior. For this reason, I would make the `compiler` field required, but express this requirement by warning rather than error, at least for now.[^1]

As for a Typst project itself (not a package), always exposing the latest behavior seems very reasonable to me as you have full access to the sources to apply necessary migrations. Besides, you could also just stay on an older compiler version if you really needed to. That said, for rare use cases, I could still imagine a CLI flag/setting that selects the target version for a project.

---

This `target` mechanism would let us make breaking changes without immediately disrupting the entire ecosystem. It buys time for people to migrate. What it doesn't do is speed up the migration itself. How to deal with a particular breaking change of course depends on the nature of the change. A change could be trivial to fix syntactically or it could require intricate semantic changes.

I think for some of these changes it would be worthwhile to provide automated migration tooling. This is something we're in particular considering for likely upcoming changes to math precedence (see my ["Math Mode Problem"](/posts/math-mode-problem) blog post for background on that).

Another potential such change that stands in the room (but isn't yet decided on) would rejig the function parameter syntax.The current `param: default` would become `param: type = default`, with the `: type` part being an _optional_ type annotation.

Both of these examples are syntactical and would affect lots of documents. This makes them ideal candidates for automated migration tooling. More semantic migrations could also be feasible, but the cost vs impact trade-off would need to be judged on a case-by-case basis. I certainly wouldn't promise to ship migration tooling for every breaking change.

There isn't yet a concrete design for migration tooling, so consider this post a kick-off for design discussions. For me personally, the priorities would be discoverability, ease of use, avoidance of false positives, and good integration into both the CLI and the web app.

On an implementation level, the target compatibility mechanism and migration tooling could actually be closely related! For instance, it could make sense to first compile a document in compatible mode, collecting all sites where compatibility behaviors have been triggered and then directly using this information to drive the automated migration.

---

Even though Typst is still on version number zero, as it has matured, the project has grown some resistance against change. This is a _healthy_ thing for a project to develop as it ensures change is well-motivated. On the flip side, it also encumbers large changes for the better.

Technically, the version number zero allows us to freely make breaking changes. However, this ignores the social capital expended by repeatedly disrupting what people build on Typst. Some might argue that putting work into migration tooling at a 0.x stage is work spent on the wrong priorities. I would beg to differ. I consider it a good investment _now_ as it lets us break Typst more freely while _also_ bringing it closer to stability and the version number "1.0" people so much desire!


[^1]: The fact that it's a warning instead of an error would in itself form a compatibility behavior. If you didn't specify the compiler field, you also didn't specify a target version that matches or exceeds the version where the target version mechanism itself was introduced.
