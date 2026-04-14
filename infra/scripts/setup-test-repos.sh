#!/usr/bin/env bash
# Creates ~/repos/alf-test-repos/ with two sample repos containing .alf/tickets/.
# Set REPOS_ROOT=$HOME/repos/alf-test-repos in infra/.env.dev to use them.
set -e

BASE="$HOME/repos/alf-test-repos"
mkdir -p "$BASE"

# ── Repo 1: project-alpha ────────────────────────────────────────────────────
A="$BASE/project-alpha"
if [ ! -d "$A/.git" ]; then
  git init "$A"
  mkdir -p "$A/src" "$A/.alf/tickets"

  echo 'console.log("alpha");' > "$A/src/main.ts"
  echo '# Project Alpha' > "$A/README.md"

  cat > "$A/.alf/tickets/alpha-001.md" << 'EOF'
---
id: alpha-001
title: Setup project structure
tags: [setup]
status: done
created: 2026-01-10
---

## Description

Initialize the project with a clean directory structure.

## Done

- [x] Created `src/`
- [x] Added README
EOF

  cat > "$A/.alf/tickets/alpha-002.md" << 'EOF'
---
id: alpha-002
title: Implement login flow
tags: [auth, backend]
epic: authentication
status: open
created: 2026-02-01
---

## Description

Implement user login with JWT tokens.

## Tasks

- [ ] `POST /auth/login` endpoint
- [ ] JWT token generation
- [ ] Password hashing (bcrypt)
- [ ] Refresh token support
EOF

  cat > "$A/.alf/tickets/alpha-003.md" << 'EOF'
---
id: alpha-003
title: Add dark mode
tags: [ui, frontend]
epic: design
status: open
created: 2026-03-12
---

## Description

Support system-level dark/light mode preference.

## Notes

Use `prefers-color-scheme` media query. Store override in localStorage.
EOF

  cd "$A" && git add -A && git commit -m "init"
  echo "  Created project-alpha"
fi

# ── Repo 2: project-beta ─────────────────────────────────────────────────────
B="$BASE/project-beta"
if [ ! -d "$B/.git" ]; then
  git init "$B"
  mkdir -p "$B/src/components" "$B/.alf/tickets"

  echo '# Project Beta' > "$B/README.md"
  echo 'export const VERSION = "0.1.0";' > "$B/src/version.ts"
  printf 'export function Button() {\n  return <button>Click</button>;\n}\n' > "$B/src/components/Button.tsx"

  cat > "$B/.alf/tickets/beta-001.md" << 'EOF'
---
id: beta-001
title: Fix navigation bug on mobile
tags: [bug, frontend]
status: open
created: 2026-03-05
---

## Description

Navigation breaks on mobile when hamburger menu is open and user taps a link.

## Steps to reproduce

1. Open site on a mobile viewport
2. Tap the hamburger menu to open it
3. Tap any nav link

## Expected

Menu closes and the page navigates correctly.

## Actual

The menu stays open and navigation does not occur.
EOF

  cat > "$B/.alf/tickets/beta-002.md" << 'EOF'
---
id: beta-002
title: Migrate to pnpm workspaces
tags: [infra, dx]
status: open
created: 2026-03-20
---

## Description

Move from a flat npm setup to pnpm workspaces for better monorepo support.

## Tasks

- [ ] Add `pnpm-workspace.yaml`
- [ ] Update CI to use pnpm
- [ ] Verify all inter-package imports resolve
EOF

  cd "$B" && git add -A && git commit -m "init"
  echo "  Created project-beta"
fi

echo ""
echo "Test repos ready at: $BASE"
echo ""
echo "To use them, update infra/.env.dev:"
echo "  REPOS_ROOT=$BASE"
echo "Then re-run: infra/scripts/install-dev.sh"
