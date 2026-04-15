

// Repo -> Session -> Turn -> Activity -> ActivityChunk

interface Session {
    repo: string;
}


function Send(sessionId?) {
    if (!sessionId) {
        CreateSession();
    }


}


function CreateSession(name, repo) {

}