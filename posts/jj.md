---
title: Conversations with JJ
date: 2026-09-01
description: My experience with using JJ.
---

So far my blog has been exclusively about Typst, but today I felt like writing about something else. (Which is rare enough as is, so I thought I'd better pick up on that!)

I've been using [`jj`](https://www.jj-vcs.dev/latest/) on and off and wanted to share some of my journey. I probably didn't choose the best learning path, but I did at least start by reading [Steve's tutorial](https://steveklabnik.github.io/jujutsu-tutorial/) instead of just jumping in blindly. Beyond that though, I just tried to figure stuff out as I needed it.

Perhaps I should begin with _why_ I wanted to learn about it. Aside from people around me and in my team fussing about it, I do enjoy a tidy PR history. I'm pretty comfortable with rebasing stuff, but my PR clean-up workflow still wasn't great. It sat somewhere between interactive rebase, dragging commits around in GitHub Desktop and fiddling around with Tower (a Mac Git client). I do enjoy GUIs a lot, in particular for readings diffs[^1], so there's also a lot of jumping around between GUI tools and the terminal (for when the GUI tool is too limited). So my goal with jj was to have a better tool to make my commit histories tidy.

I've been using jj side-by-side with Git in this way for the past six months or so. It's served me very well, so first of all, thanks to the folks behind it for that! In particular, I think it is very pragmatic that jj is so interoperable with Git; if it was me, it would probably have been more like "let's start fresh and leave all the legacy stuff behind" (see Typst...)

What hasn't happened is that I have migrated entirely to it. It's still just my PR clean-up tool. That's fine and it probably says as much, if not more, about me as about jj. But I figured I could still use this post to document my journey. Let me preface this with one disclaimer: I have very limited time at work and outside of work (unlike back in university) I rarely want to deal with coding-related stuff. So when I hit a roadblock with jj, the course of least resistancy for me is to go back to Git.

## What I like a lot

**Editing the history.** Jumping around and editing commits feels very smooth! It makes clean-up work much simpler, especially with [`jjui`](https://github.com/idursun/jjui) (awesome tool as well). I still don't have the CLI commands memorized all that well because I mostly just use `jjui` and I know the shortcuts there, so that's enough most of the time.

**Richer set of operations.** I enjoy that there are more individual commands for distinct concepts. The way Git works is very ingrained in my brain by now, so I'm mostly okay with the way it works, but I think it's better to have these high-level concepts as separate commands (e.g. `jj split`).

**Undo.** The undo feature is also very cool. Of course, it's helpful in case you mess up and need to recover lost data (happened to me a few times with jj; with great power comes great reponsibility :P). But I also find it useful that I can just try to make some changes, see how the conflicts play out and then just nope out a few times. Of course, with Git I can also do that by keeping a SHA I want to return to somewhere or using the reflog, but it's not quite as smooth.

**The tool itself.** The CLI feels just feels ... friendly? I don't know. But I like it!

## What tripped me up

**The log.** The output of `jj log` still has me a little confused at times. On the repository I work in mostly (`typst/typst`), by default it shows me a ton of branches from other people (which I checked out recently to review their work) and it becomes hard to (a) find my work and (b) to just see the history of the current branch (especially if it truncates immutable commits). I've experimented with changing the default revset a bit, and it's somewhat better, but this problem is just new to me; I was doing fine on that end with Git.

It is my understanding that many people use branch names less with jj (I may be wrong on that one). But I like named branches precisely because I can easily jump around between stuff, without having to find it through related commits. This brings me to the related issue that whenever I jump back and forth between Git and editing a branch via JJ, it leaves me on detached HEAD even if the currently edited change is empty and the previous one bookmarked. That's always one extra step to remember before committing new stuff via Git.

And precisely because I like branches, _when_ I add new commits via JJ (which doesn't happen so much because I use it just for clean-up), the fact that the branch doesn't automatically move forward annoys me a little.

**Auto-snapshot.** JJ automatically snapshots your disk state whenever you run any command. This makes it very hard to permanently lose work. That's great! However, practically, I have two issues with it.

First, snapshotting is a side effect (it can trigger an automatic rebase and affects the undo history). This is sometimes unexpected (especially when triggered automatically through `jjui`) or in combination with the same-change merges (see below). For me, it meant that it could make a difference whether I clicked on my terminal once (focusing `jjui`) or twice between editing the code.

Second, it's easy to accidentally snapshot something like `node_modules`. Let's say you've added a new JS project to your repo (adding `node_modules` to gitignore) and then you go back and edit an old commit. Then, oops, `node_modules` is suddenly in that commit. There are some heuristic in place to detect large files, but not all files you don't want are large. In one of my projects, I suppose `node_modules` is still in the jj history. I didn't really bother to find out. But it irks me a bit.

**Same-change merges.** There is an interesting merge behavior in JJ that I think Git has too out of the box. However, it didn't ever happen to me in Git, probably because I wouldn't even endeavour to do crazy enough rebases.

Let's say you have two commits A and B. Initially, B makes some change. Now, you try to instead make the same change in A, save and trigger jj somehow (e.g. via `jjui` or `jj log`). This triggers an automatic rebase and the change in B is absorbed away. But now, if you Ctrl+Z in A and save again, it's still gone in B.

The same-change merge behavior is certainly convenient in many situations, but this tripped me up. Luckily, there is a setting you can configure to disable it. Personally, I prefer to resolve a few extra conflicts, but have that peace of mind.

```toml
[merge]
same-change = "keep"
```

## What I'd love

To be honest, the main reason why I haven't managed to go all-in on JJ is probably that I just need good GUI tooling for viewing and splitting diffs. With `jj`, I love the ability to jump around and make changes, but I'm trading it for the easiest way to read diffs and select partial changes. While `jj split` does the job, I would be so much faster with a good GUI. When I'm not deep in the history, I still prefer splitting up my latest commit via GitHub Desktop instead. So to summarize: I'd love to see a really polished, native-feeling GUI for JJ. I'd probably pay for that.

[^1]: There's probably great diff viewers for the terminal, but just scrolling through `git diff` output isn't it for me. It does not invite perusing the diff, which I think is very important in order to produce good code. Over the course of creating a PR, I read my diff over and over, both spawning ideas for refactors and spotting bugs.
