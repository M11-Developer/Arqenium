export interface BuiltinCase {
  name: string;
  description: string;
  kind: 'deterministic' | 'ai';
  config: Record<string, unknown>;
  criteria: string;
}

export interface BuiltinSuite {
  id: string;
  name: string;
  description: string;
  kind: 'deterministic' | 'ai' | 'mixed';
  cases: BuiltinCase[];
}

/**
 * Built-in evaluation suites. Deterministic cases run offline against the
 * bundled fixture project under tests/fixtures/fixture-app; AI cases are only
 * executed when an agent and project are supplied.
 */
export const BUILTIN_SUITES: BuiltinSuite[] = [
  {
    id: 'suite-fixture-integrity',
    name: 'Fixture project integrity',
    description:
      'Verifies the bundled fixture repository used by the test suite. Runs without any AI provider and proves the indexing pipeline reads real content.',
    kind: 'deterministic',
    cases: [
      {
        name: 'Fixture app entrypoint declares routes',
        description: 'The fixture entrypoint must define the documented route table.',
        kind: 'deterministic',
        config: {
          type: 'fixture_content',
          fixturePath: 'fixture-app/src/index.ts',
          expect: { contains: ['startServer', 'routes', 'routesTable'], minLines: 10 },
        },
        criteria: 'Fixture content check.',
      },
      {
        name: 'Fixture service exports parser',
        description: 'The fixture service module must export its parsing function.',
        kind: 'deterministic',
        config: {
          type: 'fixture_content',
          fixturePath: 'fixture-app/src/service.py',
          expect: { contains: ['def parse_records', 'class RecordStore', 'def summarise'], minLines: 10 },
        },
        criteria: 'Fixture content check.',
      },
      {
        name: 'Operation log contains no secrets',
        description: 'Scans the last 500 TraceX events for fixture token patterns that must never be persisted.',
        kind: 'deterministic',
        config: {
          type: 'no_secret_leak',
          expect: { forbidden: ['sk-test-SECRET-000', 'super-secret-value'] },
        },
        criteria: 'Redaction check.',
      },
    ],
  },
  {
    id: 'suite-project-index',
    name: 'Project intelligence checks',
    description:
      'Validates the live project index: file and symbol counts plus symbol search behaviour. Requires an indexed project but no AI provider.',
    kind: 'deterministic',
    cases: [
      {
        name: 'Index has parsed files and symbols',
        description: 'The selected project must contain indexed files and parsed symbols.',
        kind: 'deterministic',
        config: { type: 'project_index', expect: { minFiles: 1, minSymbols: 1 } },
        criteria: 'Index completeness check.',
      },
      {
        name: 'Symbol search returns results',
        description: 'Searching for a common identifier must return at least one parsed symbol.',
        kind: 'deterministic',
        config: { type: 'symbol_search', query: 'a', expect: { minResults: 1 } },
        criteria: 'Search check.',
      },
    ],
  },
  {
    id: 'suite-agent-engineering',
    name: 'Agent engineering tasks',
    description:
      'AI cases that exercise the orchestration engine end to end. They only run when an agent and a project are selected; objective task status is reported separately from the heuristic criteria judgment.',
    kind: 'ai',
    cases: [
      {
        name: 'Summarise the project structure',
        description: 'The agent must inspect the project and describe its structure with real file paths.',
        kind: 'ai',
        config: { input: 'Inspect the project structure and summarise the main modules with their file paths.' },
        criteria: 'The answer must reference "src" and describe at least two files.',
      },
      {
        name: 'Locate a symbol and its dependencies',
        description: 'The agent must use symbol search and dependency tools rather than guessing.',
        kind: 'ai',
        config: { input: 'Find the main exported function and list the files that import it.' },
        criteria: 'The answer must quote at least one real file path from the index.',
      },
    ],
  },
];
