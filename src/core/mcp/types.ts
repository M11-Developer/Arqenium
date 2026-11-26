export interface CreateMcpServerInput {
  name: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  permissions?: {
    allowTools?: string[];
    denyTools?: string[];
    autoApprove?: string[];
    maxResultBytes?: number;
  };
}

export interface McpToolDescriptor {
  serverId: string;
  serverName: string;
  name: string;
  description: string;
  schema: unknown;
  autoApprove: boolean;
  connected: boolean;
}

export interface DirectoryEntry {
  id: string;
  name: string;
  description: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  category: string;
  /** Whether ARQENIUM ships a verified configuration template for it. */
  template: boolean;
  notes?: string;
  docsUrl?: string;
}

/**
 * Curated directory of MCP servers with copy-ready configuration. Entries are
 * configuration templates only - ARQENIUM never installs or launches them on
 * its own, and nothing here is a claim of a verified live connection.
 */
export const MCP_DIRECTORY: DirectoryEntry[] = [
  {
    id: 'arqenium-internal',
    name: 'ARQENIUM Internal Server',
    description:
      'ARQENIUM\'s own MCP server: project search, symbol search, structure, dependency graph, impact analysis, run history and traces.',
    transport: 'http',
    url: 'http://127.0.0.1:4321/mcp',
    category: 'Arqenium',
    template: true,
    notes: 'Enable it in Integrations > Internal server, then register the local URL.',
  },
  {
    id: 'filesystem',
    name: 'Filesystem Server',
    description: 'Reference filesystem MCP server exposing read-only access to explicitly allowed directories.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed/dir'],
    category: 'Files',
    template: false,
    notes: 'Requires network access to the npm registry the first time it runs.',
  },
  {
    id: 'git',
    name: 'Git Server',
    description: 'Read-only git inspection: log, diff, status and branch information over MCP.',
    transport: 'stdio',
    command: 'uvx',
    args: ['mcp-server-git', '--repository', '/path/to/repo'],
    category: 'Version control',
    template: false,
    notes: 'Requires uv/uvx. Verify the package before running it against a repository you care about.',
  },
  {
    id: 'sqlite',
    name: 'SQLite Server',
    description: 'Query a local SQLite database with read-only SQL over MCP.',
    transport: 'stdio',
    command: 'uvx',
    args: ['mcp-server-sqlite', '--db-path', '/path/to/db.sqlite'],
    category: 'Data',
    template: false,
  },
  {
    id: 'fetch',
    name: 'Fetch Server',
    description: 'Fetch a URL and convert its content to markdown for model consumption.',
    transport: 'stdio',
    command: 'uvx',
    args: ['mcp-server-fetch'],
    category: 'Web',
    template: false,
    notes: 'Network access is granted to the server process; treat fetched content as untrusted data.',
  },
  {
    id: 'custom-http',
    name: 'Custom HTTP Server',
    description: 'Any MCP server reachable over the Streamable HTTP transport, including remote hosted servers.',
    transport: 'http',
    url: 'https://example.com/mcp',
    category: 'Custom',
    template: true,
    notes: 'Header values may reference a stored credential with the "cred:<name>" syntax.',
  },
  {
    id: 'custom-stdio',
    name: 'Custom stdio Server',
    description: 'Any MCP server launched as a local child process over stdio.',
    transport: 'stdio',
    command: 'node',
    args: ['/path/to/server.js'],
    category: 'Custom',
    template: true,
    notes: 'The child process inherits a filtered environment; provider credentials are never forwarded.',
  },
];
