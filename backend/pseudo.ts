import { query, } from "@anthropic-ai/claude-agent-sdk"
// BACKEND

const PHILSOPHY = `
Merge nanoclaw and orchestrator servers.
Could actually make orchestrator vs agent (prev nanoclaw) just a param to endpoint. Both should
be able to handle audio, images, etc.. Same capabilities, just a difference in what they should do (
enforced by tool restrictions, sys prompts, and spawning agent tool.). The "spawn_agent" tool should replace
claude code SubAgent tool. 
- Should be able to switch between agent and orchestrator mid convo? Even fork.
    - This would mean that agent and orchestrator should be stored and handled in a very similar way

`

const endpoints = {
    "orchestrator": Orchestrator,

}

function Orchestrator(repo, prompt, voice, annotations, images) {
    if (!existsForRepo) {
        createOrcFile()
    }



    let promise = query({
        prompt: "",
        options: {
            mcpServers: {
                agentMcp,
                ticketsMcp,
            }
        }
    })
}

const agentMcp = {
    "spawn": (...) => {
        let id = "...";
        SpawnAgent(id);
        // Does not wait for SpawnAgent
        return id;
    },
    "send": "Send message to existing agent",
    // No "get output". That should be hook.
    "status": "See existing agents",
}

const ticketsMcp = {
    "create": 

}

async function SpawnAgent(id, orc, prompt) {

    // New Claude Code session
    const q = query({
        prompt: "",
        options: {
            mcpServers: {
                ticketsMcp,
            }
        }
    })
    for await (const message of q) {
        // Stream to file
        // - User should be able to read

    }

    orc.notify(id, lastResponse); // Will start turn or send to queue.

}

