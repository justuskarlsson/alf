Clean minimal (incremental) refactor of ~/repos/hans , which itself is an untested refactor of ~/repos/nanoclaw-dev . Maybe we should treat ~/repos/nanoclaw-dev as the stuff that actually works. hans is an unfinished "orchestrator" version of nanoclaw. But our new strategy is to unify orchestrator and regular agents (nanoclaw). But keep the panel-ui thinking of hans. And also make more use of the actual filesystem of each repo.



## Overview
- All commmunication between frontend and backend is passed through relay. The backend doesnt have its ports exposed to the wide internet, that's why we need the relay AND websocket bi-directional communication. This makes "fetch"-like requests a bit clunky, but we'll live with it.
- The cornerstone of the chat experience is **the repo**. This mirrors a git repo. The primary use case is SWE. All conversations are scoped to a specific repo. So a repo holds a group of conversations. However:
- We want to move away from the traditional way (taken in nanoclaw-dev) of **conversations**. Instead what matters is context, and budgeting context for different tasks. Therefor the **fork** method is vital to fork out from a specific context, to handle a specific task, without polluting the context. This was how the idea of an orchestrator was born. The orchestrator would only have one allowed tool: **spawn_agent**. So that the orchestrator context (with user prompts and short agent results), would in principle almost never fill up. This in retrospect might be a bit draconian, and now the orchestrator should just be another tool (panel) alongside regular nanoclaw agents. But we do want to expand on **branching** (super simple graph overview of a conversation chain maybe?). 
- agent.ts , currently uses claude code agent sdk. Would want add the ability to also use codex sdk. So an agnostic core, and then adapters for either claude code sdk or codex sdk. 

## Instructions
- Keep file structure clean. 
- "pseudo.ts|tsx" should be treated as gospel. Clear instruction on what we want.
- NEVER use `useEffect` with any deps. Only time you can use that is with empty dependency array. Handle those use cases in other cleaner ways.
- Use 3-layered onion design philoshopy. At the inner core, we have the data (that is persisted). This is the truth. Then we have `core`. This should be small and the human developer should know this by heart. That's why it's got to be small. Should be 10% of the code, but 90% of the execution flow should flow through this (90/10 rule). And then the rest, which should be the actual use cases and should be grouped into modules with clear boundaries. These modules should primarily use `core` to handle data, but also to reduce redundancy and keep the 90/10 rule.


## Files to read
- .alf/TICKETS.md

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
- Scrollbar colors that blend in nicely to rest of ui.
- Expand FileList module to also have a content viewer.
    - For text files, use syntax highlighting lib.
    - New endpoint, files/get . Return file contents (raw base64? maybe if non-text file). With this new endpoint to files module, maybe have all files endpoint together in a class? So then we can use non-experimental function decorators since it belongs to a class. Also, the class tells that "ok all of these paths are prefixed with files/". 
- Starring functionality for FileList. Read frontend/pseudo.tsx for layout instructions.
- Tickets module.
    - Possibly multiple front-end panels. But lets start with "tickets-list". Just a list of tickets with a "content window" that renders the selected ticket. Read frontend/pseudo.tsx
    - For dev, we want controllable repos. So maybe set repo path to ~/repos/alf-test-repos/ . And populate with one or two repos with some tickets.
    - How to handle tickets? Should we use .orc/tickets? Maybe, but lets rebrand to .alf/tickets.
- Infra: Fix backend logs. Right now, I dont see the dispatches and requests done from front-end. This is the key information. 
- git panel. See frontend/pseudo.tsx.

### MVP 3
__Major focuses__
- Introduce agents
- Test-suite, make use of tests (primarily backend, maybe also front-end but less easy wins).
- Nice to have: syntax highlighting for git diff(reuse file viewer syntax highlighter?), etc..

__Terminology (in abstraction order, first highest level):__
- Session: A claude code or codex session. A conversation. Consists of ->
- Turn: A session is multiple turns. A turn is when the session gets a user prompt, and then everything it does (tools, thinking, text) before giving up its turn and yielding back to the user.
- Activity: What a turn consists of. An activity has different types, either: thinking, tool or text. So a turn is a list of multiple chronological activities, for example:
    - First some thinking
    - Then tool use
    - another tool use
    - Thinking
    - Some text
In most Agent SDKs (like claude code sdk), an activity is begun with a "{activity_type}_start" streaming event. 
- Delta: After the "{activity_type}_start" streaming event, we get lots of {activity_type}_delta", to append to current activity content. 

__Agent Core__
- Flow: req: /agents/send -> modules/agents/handler.ts (makes us of core/agent, creates object based on req, finds impl to use based on req) -> modules/agents/implementations/* (gets along the core object with helpers).
- Implementations to support:
    - test: The first we implement. Not an llm. Deterministic simple implementation for testing. For testing the implementation interface and that everything works. So should still support forking, streaming, all the stuff. But doesnt cost money, and makes it easy to debug.
    - claude code agent sdk
    - codex agent sdk
We will share a lot of logic between using different implementations, that's why we have a shared core logic that's abstracted for the specific vendor implementations. We can think of the implementation as a lightweight adapter, mostly plumbing.
- core/agents: Has helpers for handling the flow of events from the agent turn (and creating and registering the session in our storage). The


__Features to support eventually__
- Chat message	Send prompt, get streaming response, session continuity
- New conversation	Create conversation, auto-generate title
- List conversations	Sorted by last updated
- Fork conversation	Branch from existing session
- Update conversation	Rename, archive
- Voice message	Audio → transcribe → agent
- Transcribe (standalone)	Transcribe clip without running agent
- Annotations (mostly frontend, gets formatted into the text prompt) - But basically that the user can select text, record or type an annotation to that. Really love and make a lot of use of it (see `~/repos/nanoclaw-dev/alf-desktop`)
- Invoke	One-off prompt, no conversation/session
- Cancel	Interrupt running agent query
- Orchestrate	→ mode param on message. Should be able to just add option on any session. Primarily, this option restricts the set of tools that the agent can use to basically only `spawn_agent`. 
- Pending queue	Queue messages for offline clients, flush on reconnect
- Event log replay	→ single catch-up message per conversation on reconnect

__How to support and implement features cleanly__
- Major important design decision
- How to support persistance and storage on backend? Use sqlite or jsonl files? Should we store everything (all activities), or just user prompt and final text activity per turn? Where to store it? I'm leaning towards storing everything in the alf repo (not per repo conversation storage). So if we use sqlite, then we need to implement a custom sqlite git merge strat (not that difficult with uuid ids in db).
- How to extract a shared core that implementations can make use of?


### MVP 4 - Bringing it all together
Goal: Being able to actually use alf for SWE development. Achieve parity with nanoclaw suite for agentic SWE.

Large Features:
- Annotating. Almost every panel should support an annotation action. Basically selecting some text or element, then being able to write or speak an annotation about it. The selection + annotation gets "glued into" the current chat session, or somewhere else. A contract/interface. For example file panel, if global state has "annotation" on or something, then on selection: Send back text selection context (file path, line numbers, text selection). This is why it should be up to the individual panels to give the selection context; they have valuable info about the selection context.
    - Top bar somewhere; 2 annotation modes (valid states: one of them on, or none): Text or Voice. 
- Voice chat. Check out ~/nanoclaw-dev. Should be able to be used both for chat message, but also annotations. Might be easiest to just have a transcription end-point for both use cases.
- File upload in chat. Multiple. Should not support any file ext. Just general file upload.  
- Image attachments. Check out ~/nanoclaw-dev. On frontend, nice ux features (CTRL + V grab to paste in latest screen shot). Otherwise, should try to reuse the general file upload feature.
- Fork chat.

- Being able to save and quickly use different dashboard layouts. Want an agent focused view? Or git and tickets? Or just a large overview? Select from the dropdown (or just keyboard shortcuts, ALT + NUMBER or something).



Smaller Features:
- Make dev db in its own folder (like test). This makes room for prod db. We should also add systemctl services for prod (just like we have dev and test).
- Modifying dashboard, doesnt seem to save layout. On reload, back to default.