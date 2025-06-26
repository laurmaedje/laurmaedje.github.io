---
title: The Math Mode Problem
date: 2025-07-07
description: |
  Typst's math mode has a strange precedence problem that most people using it will run into at some point.
---

Typst's math mode has a strange problem that most people using it will run into at some point: If you write `f_i(x)`, you will get `i(x)` as the subscript instead of just `i` as you might expect. To fix it, you need to write `f_i (x)`. Why is this?

Let's look at a slightly more interesting example: `f^pi(x)`. You'd probably still expect just `pi` to be the superscript (but it's still the full `pi(x)`). But we're getting closer. Consider this now: `e^abs(x)`. Here, it's now quite clear that we want the absolute value of `x` as the superscript. For a human, that's obvious. But for the machine, or more specifically, Typst's parser, the second and third example look the same.

Only later, when Typst is evaluating this equation and all the code above it has run, it realizes that `abs` is a Typst function and `pi` is a symbol. At that point, it's a bit late for reconsidering the syntactical structure of the equation. To make the `abs(x)` function call work properly, function calls bind more tightly than sub- and superscripts. As a side effect, `f^pi(x)` renders like it does.

It's questionable whether making this `abs(x)` call work is worth making the precedence for sub- and superscripts so unintuitive. And, in fact, in Typst 0.3 and below the situation was reversed: Sub- and superscripts worked intuitively, but `abs(x)` silently didn't work. This was changed in a community pull request and, at the time, things were moving so fast that we didn't quite realize the impact this change would have.

Since then, there has been discussion about either going back or finding some solution that somehow makes both work properly. This sort of kept stalling and now we're at a point where we really gotta make up our mind. In fact, a [PR](https://github.com/typst/typst/pull/6442) is open right now to simply revert to the Typst 0.3 behavior. This would silently change the rendering of a fair amount of documents, but it might just be a band aid we must rip off.

While pondering over this PR, I took one last delve into the topic, trying to make sense of what's what. This blog post is the result of this and should serve as a synthesis of the discussions we've had so far. If you dive into the history, you can find a lot of discussions on the topic spread out over the [Math forge] on our Discord server. I've extracted links to all the points where discussion was happening in the forge, so if you want to peruse them, here you go:
[1](https://discord.com/channels/1054443721975922748/1176478139757629563/1249499077721460887),
[2](https://discord.com/channels/1054443721975922748/1176478139757629563/1277759050456760332),
[3](https://discord.com/channels/1054443721975922748/1176478139757629563/1297121034209722371),
[4](https://discord.com/channels/1054443721975922748/1176478139757629563/1319188154162348063),
[5](https://discord.com/channels/1054443721975922748/1176478139757629563/1325480762161631273),
[6](https://discord.com/channels/1054443721975922748/1176478139757629563/1353663985706340413).

## The root cause

Attachments (i.e. sub- and superscripts) are the point where most people get into contact with the problem presented above. But it is not actually the root cause. The root cause are _function calls._ If I write an identifier followed by a parenthesis in Typst's math mode, there is some inherent ambiguity. There are, in fact, _three_ possible options what I could have meant and all would ideally imply slightly different precedence rules.

1. A Typst function call like `abs(x + y)`
2. Evaluation of a function in the mathematical sense: `f(x + y)`, `omega(x + y)`
3. A space-less implied multiplication: `a(2 + b)`, `lambda(2 + b)`

The first always requires a multi-letter identifier while the latter two can be single- or multi-letter.

Crucially, `abs(x + y)` and `omega(x + y)` look exactly the same for Typst and are also parsed just the same. You can also observe that `omega(x + y)` is highlighted blue like a function call in the web app even though it is not a Typst function. Only at runtime, while Typst is processing the equation, it realizes that `omega` is actually a symbol. Then, in a sort of best-effort way, it tries to turn the thing it parsed as an argument list back into content. Most people never notice this, but it's possible to observe it by adding a named argument to the `omega` call (which is just silently omitted in 0.13.1, which is fixed on main). The "unparsing" mostly just works, but is a bit of a hack and illustrates that the ambiguity goes deeper than just attachments.

Why do we observe it primarily with attachments then? Because they are subject to precedence rules and, compared to the precedence of an attachment, the precedence of a Typst function should be different than the one of a mathematical function. In `e^abs(x)`, we want the Typst function call to bind more tightly (= higher precedence) than the `^` operator, i.e. `e^(abs(x))` (because `(e^abs)(x)` simply does not make sense). In `e^omega(x)`, we want the attachment to bind more tightly than the math function evaluation, i.e. `(e^omega)(x)`.

A related situation exists for fractions: In `1/f(a+b)`, a human reader might expect the fraction to bind less tightly that the function evaluation, i.e. `1/(f(a+b))`. But this is just because of my choice of letters. If I write `1/x(a+b)`, you'd probably read that as `1/x (a+b)`.  In previous discussions, this ambiguity with fractions has been brought up as being closely related to the attachment problem. I want to argue that these are different concerns. For attachments, we have a problem because Typst functions and math functions should have different precedence compared to attachments. Meanwhile, I'd argue, it's okay that both math functions and Typst functions have the same precedence compared to fractions. The ambiguity exists even _without Typst functions_ being involved.

In my opinion, writing `1/x (a+b)` instead of `1/x(a+b)`, and having `f(x)/g(x)` work properly in exchange, is a good trade-off and _consistent_ with the rest of Typst. The thing is, Typst kind of has syntax for implied multiplication: A space. It's also necessary if you write `a b`. It just happens that you can omit it in some cases like `2a` or `a(b+c)`. But in `1/x(a+b)` you can't. There's also no way to resolve the ambiguity with runtime information, you fundamentally need to distinguish on a syntactical level and that's exactly what the space is doing. Of course, you could require the opposite (i.e. `1/(x(a+b))`), but I'm not convinced it's better. We already have the concept of a space being needed for implied multiplication, so the current behavior is quite consistent. And requiring these parentheses would make many equations quite a bit noisier to write.

There is one more interesting case, which I'd like to highlight because it got so little attention in the previous discussions: Text operators. If I write `e^sin(x)`, then a human reader parses this as `e^(sin(x))`, so it should bind more tightly than an attachment. Again, no Typst function is involved. Note that `sin` is not a function in Typst though: You can also write just `sin x`. It's just some content which can happen to stand before parentheses, just like `omega`. So even ignoring Typst functions, there is ambiguity in whether mathematical function evaluation should have higher or lower precedence than attachments.

To summarize, ideally we'd like to have the following hierarchy of precedence (from tightest to least tightly binding):

1. Typst function
2. Operator function like `sin`
3. Attachment
4. Typical function evaluation in the mathematical sense
5. Fraction
6. Implied multiplication (without a space)

But we can't because 1, 2, 4, and 6 all have the same syntax!

## Our options

What options do we have to deal with this situation?

### A: Do nothing

We can keep everything as-is.

### B: Revert to Typst 0.3 behavior

We can revert to the behavior of Typst 0.3 and below. This would mean that `f_i(x)` renders as expected. However, we would break `e^abs(x)`, which would need to be written as `e^(abs(x))`. We also won't get rid of the wonkyness of "unparsing" an argument list back into math content because we don't know whether `pi(1 + 2)` is a function call or just `pi` multiplied by three.

### C: Runtime parsing

One option that was discussed and prototyped by [@wrzian] was to reduce the amount of parsing done during the initial parsing stage to just tokenizing the equation and then doing the actual parsing at runtime, when we know whether something is a function or a symbol. This would allow us to fix the attachment problem with runtime information. It would also fix the problem of having to unparse math argument lists.

### D: `MathAttachCall`

We could have normal parsing, but add a new expression kind that describes a mix of an attachment and a function call (i.e. `e^abs(x)` becoming `MathAttachCall(e, abs, x)`). This would allow us to decide at runtime whether we want to use the attachment or function call option. This is a much more lightweight alternative to runtime parsing that fixes the precedence problem, but doesn't touch the "unparsing" of argument lists.

### E: Different syntax for Typst function calls in math

As a final option, we could resolve the ambiguity by introducing new syntax for Typst function calls in math. A natural choice, for instance, would be to require a hash in front of a function call (note this would imply the need for further syntactical changes to argument lists). Now you might say

> Wait... Are you just ditching Typst's math mode main characteristic compared to LaTeX? If I have to write hashes everywhere instead of backslashes, what did I win in the first place?

But a realization I had is that there might be a middle ground if we only require a hash for functions, not for plain variables (typically symbols).

LaTeX requires backslashes for every macro. That includes macros with and without arguments. And there are much more of the latter than of the former. In one math thesis I analyzed (I know, it's a very small sample), the ratio of identifiers which would then need a hash to those that still wouldn't was roughly one to nine.

## Discussion

You now have an overview over all options that were brought up over time. Next, I'd like to discuss my view on the situation and argue for one particular option. I should note that my view has shifted across different options over the past weeks, but I am now relatively settled in my opinion.

First of all, to get it out of the way: I don't think option A is viable because the behavior of `f_i(x)` is just way too unintuitive and counter to people's expectations. It's the complaint about Typst's math mode I hear most often (aside from diverging from LaTeX in the first place, but that mostly comes from people that haven't really tested it as far as I can tell).

Option B is the simplest one. It trades something that currently works away in exchange for making something work that doesn't work right now (with the thing that currently doesn't work being much more common). Meanwhile, options C and D try to be smart about it and somehow get the best of both worlds. This comes with costs though: It makes it harder for tooling (think syntax highlighters and IDEs) to reason about your equations, and to an extent, also for humans. And it makes Typst math less portable as a format in my opinion, reducing the chances of third parties adopting it; as it requires tighter integration with the evaluation model.

For full runtime parsing, those concerns are quite large in my opinion. For the `MathAttachCall` a bit less so. What's so bad about a bit of compiler trickery and smartness to make it "just work?" That, at least, was my opinion for the past week. But then I took another look at the special case of `e^sin(x)` and I think it's an important case to look at. It's sort of a morph between `e^pi(x)` and `e^abs(x)`. Is `sin` more like a symbol or a function? Even though here it's clear what the precedence should be, it shows that the line between Typst functions and math functions is fuzzy. Our whole goal with C and D is to somehow manage to have different precedence for Typst vs. math functions. But if we can't even say for sure what is a Typst and a math function, won't that cause more confusion than it resolves?

I think solution E demonstrates this even better: If I write `omega(x)`, but `#abs(x)`, should I write `sin(x)` or `#sin(x)`? I don't know, it could be either. What about a custom user-defined definition. Should it be used as an identifier or called as a function? The thing is, _users don't really need to care_ whether something is a math function or a Typst function. All they need to know is: One or multiple letters followed by a parenthesis is considered a function call by Typst, be it a Typst scripting call or a mathematical one. And to me, that implies that both should have the same precedence level, to keep things predictable.

This also means that you can consistently reason about precedence in equations of a field you're unfamiliar with, where you're unsure whether something is a symbol or a custom function. You just need to know: Blue highlighting = function call. Syntax highlighting _helps_ you instead of tricking you just because the highlighter has no access to runtime information.

I am thus now of the strong opinion that option B is the way to go. It's not too bad to have to write `e^(abs(x))` with parentheses and it's easy to produce a warning for `e^abs(x)`. There is currently [a PR open that implements option B](https://github.com/typst/typst/pull/6442). I'm still open for further discussion and want to give people some time to respond to this post, should they wish so, but if nothing big comes up, I plan to merge this PR next week.

[@wrzian]: https://github.com/wrzian
[Math forge]: https://discord.com/channels/1054443721975922748/1176478139757629563
