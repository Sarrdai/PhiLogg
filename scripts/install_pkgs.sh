#!/bin/bash

# Only install in cloud sessions — local sessions already have deps installed
if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR/tests"
npm install
exit 0
