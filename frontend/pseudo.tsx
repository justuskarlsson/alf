



const layout = `
grid of resizable panels. All panels inherit (or are wrapped) by same resizable panel component. Then we have different panels for different purposes.
`

@ws_routes(
    "files/list", "files/get"
)
function FilesPanel() {
    return (
        <Panel>
            <Sidebar>
                <Row collapsible={true}>
                    starred files/dirs. if sub-dir, sub-dir name as title, full rel path as smaller gray text after. unstar icon to the left
                </Row>
                <Row collapsible={true}>
                    standard lexicographic file tree. star icon to the left.
                </Row>
            </Sidebar>
        </Panel>
    )
}


const panels = {
    "files": {
        "_render": {
            "top": "starred files/dirs. if sub-dir, sub-dir name as title, full rel path as smaller gray text after. unstar icon to the left",
            "bottom": "standard lexicographic file tree. star icon to the left."
        },
        "list": "files, metadata(last_changed)",
        "get": "bytes",
    },
    "git": {
        "_render": `Very much like Vscode git 'CHANGES' pane.
            Sidebar: Diffs and Worktrees, two rows.
            Main: Current selected diff, showed with nice syntax highlighting etc.
        `,
        "worktrees": "list worktrees",
        "diff": "(worktree, branch, file?) => Diff",

    },
    "tickets": {
        "_render": {
            "_strat": "if 'wide enough', split view between ticket list/overview and ticket detail",
            "overview": "list/table of tickets. sortable columns. filter.",
            "detail": "render markdown of ticket",
            "[grid]": "render many tickets at once. sort of a grid of cards with ticket markdown summary. optional."

        },
        "list": "id, title, tags, epic,... (all metadata)",
        "get": "Full content",
        "many": "(ids?) => Full contents"
    }
}
