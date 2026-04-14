Clean minimal (incremental) refactor of ~/repos/hans , which itself is an untested refactor of ~/repos/nanoclaw-dev . Maybe we should treat ~/repos/nanoclaw-dev as the stuff that actually works. hans is an unfinished "orchestrator" version of nanoclaw. But our new strategy is to unify orchestrator and regular agents (nanoclaw). But keep the panel-ui thinking of hans. And also make more use of the actual filesystem of each repo.



## Overview
- All commmunication between frontend and backend is passed through relay. The backend doesnt have its ports exposed to the wide internet, that's why we need the relay AND websocket bi-directional communication. This makes "fetch"-like requests a bit clunky, but we'll live with it.
- The cornerstone of the chat experience is **the repo**. This mirrors a git repo. The primary use case is SWE. All conversations are scoped to a specific repo. So a repo holds a group of conversations. However:
- We want to move away from the traditional way (taken in nanoclaw-dev) of **conversations**. Instead what matters is context, and budgeting context for different tasks. Therefor the **fork** method is vital to fork out from a specific context, to handle a specific task, without polluting the context. This was how the idea of an orchestrator was born. The orchestrator would only have one allowed tool: **spawn_agent**. So that the orchestrator context (with user prompts and short agent results), would in principle almost never fill up. This in retrospect might be a bit draconian, and now the orchestrator should just be another tool (panel) alongside regular nanoclaw agents. But we do want to expand on **branching** (super simple graph overview of a conversation chain maybe?). 
- agent.ts , currently uses claude code agent sdk. Would want add the ability to also use codex sdk. So an agnostic core, and then adapters for either claude code sdk or codex sdk. 

## Dilemmas
- How to handle state (primarily frontend). In nanoclaw-dev, we just have one big zustand store. This feels brittle, and non-modular, and like a bad coding practice. So either use zustand in a different way. Or maybe even think about using mobx or some other state library. What will fit well with out panel structure? For now, modular zustand stores.

## Instructions
- Keep file structure clean. 
- "pseudo.ts|tsx" should be treated as gospel. Clear instruction on what we want.
- NEVER use `useEffect` with any deps. Only time you can use that is with empty dependency array. Handle those use cases in other cleaner ways.

## Files to read
- frontend/pseudo.tsx - high-level pseudo code description
- backend/pseudo.ts - high-level pseudo code description

## Roadmap


### MVP 1
Minimal frontend with the panels layout and per repo workspace.
- / : Overview. For now, just list all repos. <a> link to:
- /{repo} : Panel layout. For now, only one possible panel: FileList.

Relay: We can basically copy the existing one.
Backend: Minimal to support the frontend. So, websocket paths/func:
- repos/list
- files/list

You can have a look at the previous projects that we are building on for which framework stack to use (ts, react, zustand, tailwind).

Here we want to lay the foundation for robust infra and testing:
- in infra/ , need to find a nice way so we can spick up a "dev stack" (frontend, relay and backend) on certain ports. Be able to reload, ensure process quits, and so on. Should be able to run on same machine as "prod stack" is. User services for this? I find, if its just regular processes, a bit hard to keep track of which PIDs actually quit, which ports are used, etc.
- Keep system prompts, and as much config as possible in infra. 
- Also logs there.


### MVP 2
- Expand FileList module to also have a content viewer.
    - For text files, use syntax highlighting lib.
    - New endpoint, files/get . Return file contents (raw base64? maybe if non-text file). With this new endpoint to files module, maybe have all files endpoint together in a class? So then we can use non-experimental function decorators since it belongs to a class. Also, the class tells that "ok all of these paths are prefixed with files/". 
- Tickets module.
    - Possibly multiple front-end panels. But lets start with "tickets-list". Just a list of tickets. 
    - For dev, we want controllable repos. So maybe set repo path to ~/repos/alf-test-repos/ . And populate with one or two repos with some tickets.
    - How to handle tickets? Should we use .orc/tickets? Maybe, but lets rebrand to .alf/tickets.