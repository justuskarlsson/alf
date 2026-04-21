#!/bin/bash
# Source nvm and the user's shell profile before exec'ing the target process.
# Ensures PATH and tool initialisation match the interactive terminal.
#
# Usage: run-with-profile.sh <command> [args...]

# Load nvm explicitly (bashrc has interactive-only guard)
export NVM_DIR="$HOME/.nvm"
[[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh"
if [[ -n "${NVM_BIN:-}" ]]; then
  export PATH="$NVM_BIN:$PATH"
fi

[[ -f "$HOME/.bashrc" ]] && source "$HOME/.bashrc"
exec "$@"
