# syntax=docker/dockerfile:1
# Container for the Loupe MCP server — exposes a project's pinned product
# feedback to Claude Code (list_comments / get_comment / update_status).
#
# Introspection only: the server registers its tools at startup and answers
# `initialize` + `tools/list` over stdio without a live backend, so this image
# starts and responds to MCP introspection with no configuration. To actually
# call the tools, set LOUPE_API / LOUPE_PROJECT_KEY / LOUPE_ADMIN_KEY.
FROM node:24-slim

# Node 24 runs the package's TypeScript entry (bin: loupe-mcp) natively.
RUN npm install -g @loupekit/mcp@latest

# stdio transport.
ENTRYPOINT ["loupe-mcp"]
