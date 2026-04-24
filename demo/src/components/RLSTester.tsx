import { useState, useEffect } from 'react';
import {
  Play,
  Copy,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Columns2,
} from 'lucide-react';
import Editor, { Monaco } from '@monaco-editor/react';
import * as RLS from 'rowguard';
import { testConnection } from '../lib/supabase';
import SchemaViewer from './SchemaViewer';
import PolicyTester from './PolicyTester';

// Import bundled type definitions from the library's dist folder
import rlsDslBundledTypes from '../../../dist/bundle.d.ts?raw';

const EXAMPLE_CODE = `return policiesToSQL(
  policies.owned({ tables: ['posts', 'comments'] })
);`;

const TEMPLATE_EXAMPLES = [
  {
    name: 'owned',
    description: 'Each user can only read and write their own rows. Generates full CRUD policies scoped to user_id.',
    code: `return policiesToSQL(
  policies.owned({ tables: ['posts', 'comments'] })
);`,
  },
  {
    name: 'shared',
    description: 'Owner has full write access. Rows marked is_public are readable by anyone.',
    code: `return policiesToSQL(
  policies.shared({ tables: ['documents'], publicColumn: 'is_public' })
);`,
  },
  {
    name: 'membership',
    description: 'Access granted via a join table. Only users with a matching row in the membership table can access.',
    code: `return policiesToSQL(
  policies.membership({
    tables: ['projects'],
    via: 'project_members',
    key: 'project_id',
  })
);`,
  },
  {
    name: 'tenant',
    description: 'Hard tenant boundary using a RESTRICTIVE policy — no exceptions, even for public rows. Combined with per-user ownership.',
    code: `return policiesToSQL(
  policies.tenant({ tables: ['invoices', 'orders'] })
);`,
  },
  {
    name: 'role',
    description: 'Access based on a JWT claim or roles table. Defaults to auth.jwt() ->> \'user_role\'.',
    code: `return policiesToSQL(
  policies.role({ tables: ['admin_logs'], is: 'admin', operations: ['SELECT'] })
);`,
  },
  {
    name: 'immutable',
    description: 'Rows can be inserted but never updated or deleted. Useful for audit logs and event streams.',
    code: `return policiesToSQL(
  policies.immutable({ tables: ['audit_log'], allowRead: true })
);`,
  },
  {
    name: 'open',
    description: 'Fully public read access with no authentication required. Defaults to TO public.',
    code: `return policiesToSQL(
  policies.open({ tables: ['announcements', 'pricing'] })
);`,
  },
  {
    name: 'Combined',
    description: 'Multiple patterns applied together. policiesToSQL deduplicates ENABLE RLS and produces idempotent SQL.',
    code: `return policiesToSQL([
  ...policies.owned({ tables: ['posts'] }),
  ...policies.open({ tables: ['announcements'] }),
  ...policies.tenant({ tables: ['invoices'] }),
]);`,
  },
];

const CUSTOM_EXAMPLES = [
  {
    name: 'User Ownership',
    description: 'Fluent builder API for a single SELECT policy. .isOwner() uses (SELECT auth.uid()) for initPlan caching.',
    code: `const p = policy('user_documents')
  .on('documents')
  .read()
  .when(column('user_id').isOwner());

return p.toSQL();`,
  },
  {
    name: 'Multi-Tenant',
    description: '.requireAll() marks this as RESTRICTIVE — it must pass even when other permissive policies grant access.',
    code: `const p = policy('tenant_isolation')
  .on('tenant_data')
  .all()
  .requireAll()
  .when(column('tenant_id').belongsToTenant());

return p.toSQL();`,
  },
  {
    name: 'Owner or Member',
    description: 'Subquery pattern: grants access if the user owns the row or has a membership entry.',
    code: `const p = policy('project_access')
  .on('projects')
  .read()
  .when(
    column('user_id').isOwner()
      .or(
        column('id').in(
          from('project_members')
            .select('project_id')
            .where(column('user_id').eq(auth.uid()))
        )
      )
  );

return p.toSQL();`,
  },
  {
    name: 'Complex OR',
    description: 'Three OR conditions: public row, owner, or org member. session.get() reads a PostgreSQL session variable.',
    code: `const p = policy('project_access')
  .on('projects')
  .read()
  .when(
    column('is_public').isPublic()
      .or(column('user_id').isOwner())
      .or(column('organization_id').eq(session.get('app.org_id', 'uuid')))
  );

return p.toSQL();`,
  },
];

export default function RLSTester() {
  const [input, setInput] = useState(EXAMPLE_CODE);
  const [activeExample, setActiveExample] = useState<typeof TEMPLATE_EXAMPLES[0] | typeof CUSTOM_EXAMPLES[0]>(TEMPLATE_EXAMPLES[0]);
  const [output, setOutput] = useState('');
  const [outputKey, setOutputKey] = useState(0);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [showSchema, setShowSchema] = useState(false);
  const [showMigration, setShowMigration] = useState(false);

  // Test Supabase connection on mount
  useEffect(() => {
    testConnection().then(setIsConnected);
  }, []);

  // Configure Monaco with bundled type definitions
  const handleEditorWillMount = (monaco: Monaco) => {
    // Add bundled type definitions to Monaco
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      rlsDslBundledTypes,
      'file:///node_modules/rowguard/index.d.ts'
    );

    // Create global declarations so functions work without imports
    const globalDeclarations = `
      import type * as RLS from 'rowguard';

      declare global {
        const policy: typeof RLS.policy;
        const column: typeof RLS.column;
        const auth: typeof RLS.auth;
        const session: typeof RLS.session;
        const currentUser: typeof RLS.currentUser;
        const from: typeof RLS.from;
        const hasRole: typeof RLS.hasRole;
        const alwaysTrue: typeof RLS.alwaysTrue;
        const call: typeof RLS.call;
        const policies: typeof RLS.policies;
        const policiesToSQL: typeof RLS.policiesToSQL;
      }
    `;

    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      globalDeclarations,
      'file:///globals.d.ts'
    );

    // Disable diagnostics to avoid error indicators
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
      noSuggestionDiagnostics: true,
    });

    // Configure TypeScript compiler options
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      esModuleInterop: true,
      allowJs: true,
    });
  };

  const executeCode = () => {
    setGenerating(true);
    setError('');
    requestAnimationFrame(() => {
      try {
        const func = new Function(
        'policy',
        'column',
        'auth',
        'session',
        'from',
        'currentUser',
        'policies',
        'policiesToSQL',
        input
      );

      const result = func(
        RLS.policy,
        RLS.column,
        RLS.auth,
        RLS.session,
        RLS.from,
        RLS.currentUser,
        RLS.policies,
        RLS.policiesToSQL
      );

        if (typeof result === 'string') {
          setOutput(result);
          setOutputKey(k => k + 1);
        } else {
          setError('Return a string from your code — call .toSQL() or policiesToSQL(...).');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        setOutput('');
      } finally {
        setGenerating(false);
      }
    });
  };

  const copyToClipboard = async () => {
    if (output) {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const loadExample = (example: typeof TEMPLATE_EXAMPLES[0] | typeof CUSTOM_EXAMPLES[0]) => {
    setInput(example.code);
    setActiveExample(example);
    setOutput('');
    setError('');
  };

  const handleSchemaInsert = (text: string) => {
    // Insert text at cursor position in editor
    // For now, we'll append to the end
    setInput((prev) => prev + text);
  };

  return (
    <div className="min-h-screen bg-dark-bg">
      <div className="max-w-screen-2xl mx-auto px-6 pt-5 pb-12">

        {/* Header */}
        <header className="flex items-center justify-between mb-6 animate-fade-up">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold tracking-tight text-text-primary">Rowguard</span>
            {isConnected !== null && (
              isConnected ? (
                <span className="flex items-center gap-1.5 text-xs text-text-tertiary">
                  <span className="w-1.5 h-1.5 rounded-full bg-supabase-lime" />
                  local
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-amber-400 bg-amber-950/40 border border-amber-900/60">
                  SQL only — run <code className="font-mono">pnpm demo:dev:full</code> for live testing
                </span>
              )
            )}
          </div>
          <a
            href="https://supabase-community.github.io/rowguard/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Docs →
          </a>
        </header>

        {/* Examples */}
        <div className="mb-1 flex flex-wrap items-center gap-1.5 animate-fade-up delay-100">
          {TEMPLATE_EXAMPLES.map((example) => (
            <button
              key={example.name}
              onClick={() => loadExample(example)}
              className={`px-3 py-1 rounded text-sm font-medium transition-all duration-150 hover:-translate-y-px active:translate-y-0 ${
                activeExample?.name === example.name
                  ? 'text-supabase-lime bg-supabase-lime/15'
                  : 'text-supabase-lime bg-supabase-lime/8 hover:bg-supabase-lime/15'
              }`}
            >
              {example.name}
            </button>
          ))}
          <span className="w-px h-4 bg-dark-border mx-1" />
          {CUSTOM_EXAMPLES.slice(0, 4).map((example) => (
            <button
              key={example.name}
              onClick={() => loadExample(example)}
              className={`px-3 py-1 rounded text-sm transition-all duration-150 hover:-translate-y-px active:translate-y-0 ${
                activeExample?.name === example.name
                  ? 'text-text-primary bg-dark-surface-2'
                  : 'text-text-secondary hover:text-text-primary hover:bg-dark-surface-2'
              }`}
            >
              {example.name}
            </button>
          ))}
        </div>
        <p className="mb-4 text-sm text-text-secondary min-h-[1.25rem] animate-fade-up delay-100">
          {activeExample?.description}
        </p>

        <div className="flex gap-5">
          {/* Schema Viewer Sidebar */}
          {showSchema && isConnected && (
            <div className="w-72 flex-shrink-0 animate-slide-left">
              <SchemaViewer
                onInsert={handleSchemaInsert}
                isConnected={isConnected}
              />
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1 min-w-0 space-y-4 animate-fade-up delay-150">

            {/* Generate button row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isConnected && (
                  <button
                    onClick={() => setShowSchema(!showSchema)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-text-tertiary hover:text-text-secondary hover:bg-dark-surface transition-colors"
                    title={showSchema ? 'Hide schema' : 'Show schema'}
                  >
                    {showSchema ? <ChevronLeft size={13} /> : <Columns2 size={13} />}
                    {showSchema ? 'hide schema' : 'schema'}
                  </button>
                )}
              </div>
              <button
                onClick={executeCode}
                disabled={generating}
                className="flex items-center gap-2 bg-supabase-lime hover:bg-supabase-lime-hover text-dark-bg px-5 py-2 rounded-md text-sm font-semibold transition-all duration-150 active:scale-[0.96] disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-dark-bg/40 border-t-dark-bg animate-spin" />
                ) : (
                  <Play size={14} fill="currentColor" />
                )}
                {generating ? 'Generating…' : 'Generate SQL'}
              </button>
            </div>

            {/* Editors */}
            <div className={output || error ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : ''}>
              <div className="border border-dark-border rounded-lg overflow-hidden flex flex-col">
                <div className="px-4 py-2.5 border-b border-dark-border flex items-center justify-between">
                  <span className="text-xs font-medium text-text-tertiary uppercase tracking-wide">TypeScript</span>
                </div>
                <Editor
                  height="560px"
                  defaultLanguage="typescript"
                  theme="vs-dark"
                  value={input}
                  onChange={(value) => setInput(value || '')}
                  beforeMount={handleEditorWillMount}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 2,
                    wordWrap: 'on',
                    quickSuggestions: true,
                    suggestOnTriggerCharacters: true,
                    padding: { top: 12 },
                  }}
                />
              </div>

              {(output || error) && (
                <div key={outputKey} className="border border-dark-border rounded-lg overflow-hidden flex flex-col animate-slide-right">
                  <div className="px-4 py-2.5 border-b border-dark-border flex items-center justify-between">
                    <span className="text-xs font-medium text-text-tertiary uppercase tracking-wide">SQL</span>
                    {output && (
                      <button
                        onClick={copyToClipboard}
                        className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
                      >
                        {copied ? <CheckCircle size={13} className="text-supabase-lime" /> : <Copy size={13} />}
                        {copied ? 'copied' : 'copy'}
                      </button>
                    )}
                  </div>
                  {error ? (
                    <div className="flex-1 p-5 min-h-[560px]">
                      <div className="flex items-start gap-3 bg-red-950/30 border border-red-900/50 rounded-md p-4">
                        <AlertCircle className="text-red-400 flex-shrink-0 mt-0.5" size={16} />
                        <p className="text-red-400 text-sm font-mono leading-relaxed">{error}</p>
                      </div>
                    </div>
                  ) : (
                    <Editor
                      height="560px"
                      defaultLanguage="sql"
                      theme="vs-dark"
                      value={output}
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        fontSize: 13,
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        wordWrap: 'on',
                        padding: { top: 12 },
                      }}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Migration & Testing accordion */}
            {output && (
              <div className="border border-dark-border rounded-lg overflow-hidden animate-fade-in">
                <button
                  onClick={() => setShowMigration(!showMigration)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-dark-surface transition-colors duration-150"
                >
                  <ChevronRight
                    size={14}
                    className="text-text-tertiary transition-transform duration-300"
                    style={{ transform: showMigration ? 'rotate(90deg)' : 'rotate(0deg)' }}
                  />
                  <span className="text-sm font-medium text-text-secondary">Migration &amp; Testing</span>
                  {!showMigration && (
                    <span className="ml-auto text-xs text-text-tertiary">save migration · test with live RLS</span>
                  )}
                </button>
                <div className={`accordion-grid ${showMigration ? 'open' : ''}`}>
                  <div className="accordion-inner border-t border-dark-border">
                    <PolicyTester
                      generatedSQL={output}
                      isConnected={isConnected ?? false}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
