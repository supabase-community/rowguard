import { useState, useEffect } from 'react';
import {
  Play,
  Copy,
  CheckCircle,
  AlertCircle,
  Database,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Editor, { Monaco } from '@monaco-editor/react';
import * as RLS from 'rowguard';
import { testConnection } from '../lib/supabase';
import SchemaViewer from './SchemaViewer';
import PolicyTester from './PolicyTester';

// Import bundled type definitions from the library's dist folder
import rlsDslBundledTypes from '../../../dist/bundle.d.ts?raw';

const EXAMPLE_CODE = `const p = policy('user_documents')
  .on('documents')
  .read()
  .when(column('user_id').isOwner());

return p.toSQL();`;

const EXAMPLES = [
  {
    name: 'User Ownership',
    code: `const p = policy('user_documents')
  .on('documents')
  .read()
  .when(column('user_id').isOwner());

return p.toSQL();`,
  },
  {
    name: 'Multi-Tenant',
    code: `const p = policy('tenant_isolation')
  .on('tenant_data')
  .all()
  .requireAll()
  .when(column('tenant_id').belongsToTenant());

return p.toSQL();`,
  },
  {
    name: 'Owner or Member',
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
  {
    name: 'With Indexes',
    code: `const p = policy('user_documents')
  .on('documents')
  .read()
  .when(column('user_id').isOwner());

return p.toSQL({ includeIndexes: true });`,
  },
  {
    name: 'INSERT Validation',
    code: `const p = policy('user_documents_insert')
  .on('user_documents')
  .write()
  .allow(column('user_id').isOwner());

return p.toSQL();`,
  },
  {
    name: 'UPDATE with Check',
    code: `const p = policy('user_documents_update')
  .on('user_documents')
  .update()
  .allow(column('user_id').isOwner());

return p.toSQL();`,
  },
  {
    name: 'Template',
    code: `const [p] = policies.userOwned('documents', 'SELECT');

return p.toSQL();`,
  },
  {
    name: 'DELETE Policy',
    code: `const p = policy('user_documents_delete')
  .on('documents')
  .delete()
  .when(column('user_id').isOwner());

return p.toSQL();`,
  },
  {
    name: 'Pattern Matching',
    code: `const p = policy('search_documents')
  .on('documents')
  .read()
  .when(
    column('title').ilike('%report%')
      .or(column('category').like('Finance%'))
  );

return p.toSQL();`,
  },
  {
    name: 'Null Checks',
    code: `const p = policy('active_documents')
  .on('documents')
  .read()
  .when(
    column('deleted_at').isNull()
      .and(column('published_at').isNotNull())
  );

return p.toSQL();`,
  },
  {
    name: 'Public Access Template',
    code: `const p = policies.publicAccess('documents');

return p.toSQL();`,
  },
  {
    name: 'Role-Based Access',
    code: `const [p] = policies.roleAccess('admin_data', 'admin', ['SELECT', 'UPDATE']);

return p.toSQL();`,
  },
  {
    name: 'Helper Methods',
    code: `const p = policy('document_access')
  .on('documents')
  .read()
  .when(
    column('user_id').isOwner()
      .or(column('is_public').isPublic())
  );

return p.toSQL();`,
  },
];

export default function RLSTester() {
  const [input, setInput] = useState(EXAMPLE_CODE);
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [showSchema, setShowSchema] = useState(true);

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
    try {
      setError('');

      const func = new Function(
        'policy',
        'column',
        'auth',
        'session',
        'from',
        'currentUser',
        'policies',
        input
      );

      const result = func(
        RLS.policy,
        RLS.column,
        RLS.auth,
        RLS.session,
        RLS.from,
        RLS.currentUser,
        RLS.policies
      );

      if (typeof result === 'string') {
        setOutput(result);
      } else {
        setError('Code must return a string (use policy.toSQL())');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setOutput('');
    }
  };

  const copyToClipboard = async () => {
    if (output) {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const loadExample = (code: string) => {
    setInput(code);
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
      <div className="max-w-screen-2xl mx-auto p-6">
        <header className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-4xl font-bold text-text-primary">
                  Rowguard - RLS Policy DSL Tester
                </h1>
                {isConnected !== null && (
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
                      isConnected
                        ? 'bg-green-950/50 text-green-400 border border-green-800'
                        : 'bg-yellow-950/50 text-yellow-400 border border-yellow-800'
                    }`}
                  >
                    <Database size={14} />
                    {isConnected
                      ? 'Connected to Local Supabase'
                      : 'Disconnected - SQL Only'}
                  </div>
                )}
              </div>
              <p className="text-text-secondary">
                Test and generate PostgreSQL Row Level Security policies with
                TypeScript
              </p>
              {isConnected === false && (
                <div className="mt-3 p-3 bg-blue-950/30 border border-blue-800/50 rounded-lg">
                  <p className="text-sm text-blue-300">
                    💡 <strong>Database features are local-only</strong> - To
                    test policies with live RLS enforcement:
                  </p>
                  <ol className="text-xs text-blue-200 mt-2 ml-4 space-y-1 list-decimal">
                    <li>
                      Clone the repo:{' '}
                      <code className="px-1 py-0.5 bg-blue-900/50 rounded">
                        git clone
                        https://github.com/supabase-community/rowguard.git
                      </code>
                    </li>
                    <li>
                      Run locally:{' '}
                      <code className="px-1 py-0.5 bg-blue-900/50 rounded">
                        pnpm demo:dev:full
                      </code>
                    </li>
                    <li>
                      Get full migration workflow, schema viewer, and policy
                      testing!
                    </li>
                  </ol>
                  <p className="text-xs text-blue-300 mt-2">
                    This deployed version generates SQL only (no database
                    connection possible).
                  </p>
                </div>
              )}
            </div>
            <a
              href="https://supabase-community.github.io/rowguard/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-supabase-lime hover:bg-supabase-lime-hover text-dark-bg rounded-lg transition-colors text-sm font-medium whitespace-nowrap"
            >
              View Docs
            </a>
          </div>
        </header>

        <div className="mb-6">
          <h3 className="text-sm font-semibold text-text-primary mb-3">
            Examples:
          </h3>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example.name}
                onClick={() => loadExample(example.code)}
                className="px-4 py-2 bg-dark-surface border border-dark-border rounded-lg text-sm text-text-primary hover:bg-dark-surface-2 hover:border-dark-border-strong transition-colors"
              >
                {example.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-6">
          {/* Schema Viewer Sidebar */}
          {showSchema && isConnected && (
            <div className="w-80 flex-shrink-0">
              <SchemaViewer
                onInsert={handleSchemaInsert}
                isConnected={isConnected}
              />
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Editors Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-dark-surface rounded-xl shadow-sm border border-dark-border overflow-hidden flex flex-col">
                <div className="bg-slate-800 text-white px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isConnected && (
                      <button
                        onClick={() => setShowSchema(!showSchema)}
                        className="p-1 hover:bg-dark-surface-2 rounded transition-colors"
                        title={showSchema ? 'Hide schema' : 'Show schema'}
                      >
                        {showSchema ? (
                          <ChevronLeft size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </button>
                    )}
                    <h2 className="font-semibold">TypeScript Input</h2>
                  </div>
                  <button
                    onClick={executeCode}
                    className="flex items-center gap-2 bg-supabase-lime hover:bg-supabase-lime-hover text-dark-bg px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                  >
                    <Play size={16} />
                    Generate
                  </button>
                </div>
                <Editor
                  height="600px"
                  defaultLanguage="typescript"
                  theme="vs-dark"
                  value={input}
                  onChange={(value) => setInput(value || '')}
                  beforeMount={handleEditorWillMount}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 2,
                    wordWrap: 'on',
                    quickSuggestions: true,
                    suggestOnTriggerCharacters: true,
                  }}
                />
              </div>

              <div className="bg-dark-surface rounded-xl shadow-sm border border-dark-border overflow-hidden flex flex-col">
                <div className="bg-slate-800 text-white px-6 py-4 flex items-center justify-between">
                  <h2 className="font-semibold">Generated SQL</h2>
                  {output && (
                    <button
                      onClick={copyToClipboard}
                      className="flex items-center gap-2 bg-dark-surface-2 hover:bg-dark-border-strong px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                    >
                      {copied ? (
                        <>
                          <CheckCircle size={16} />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={16} />
                          Copy
                        </>
                      )}
                    </button>
                  )}
                </div>
                {error ? (
                  <div className="flex-1 p-6 min-h-[600px]">
                    <div className="flex items-start gap-3 bg-red-950/50 border border-red-800 rounded-lg p-4">
                      <AlertCircle
                        className="text-red-400 flex-shrink-0"
                        size={20}
                      />
                      <div>
                        <h3 className="font-semibold text-red-300 mb-1">
                          Error
                        </h3>
                        <p className="text-red-400 text-sm font-mono">
                          {error}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : output ? (
                  <Editor
                    height="600px"
                    defaultLanguage="sql"
                    theme="vs-dark"
                    value={output}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 14,
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      wordWrap: 'on',
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center min-h-[600px]">
                    <p className="text-text-tertiary text-sm">
                      Click "Generate" to see the SQL output
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Policy Tester */}
            {output && (
              <PolicyTester
                generatedSQL={output}
                isConnected={isConnected ?? false}
              />
            )}
          </div>
        </div>

        <div className="mt-8 bg-dark-surface rounded-xl shadow-sm border border-dark-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-text-primary">
              Available Functions
            </h3>
            <a
              href="https://supabase-community.github.io/rowguard/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-supabase-lime hover:text-supabase-lime-hover font-medium"
            >
              Full Documentation →
            </a>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div>
              <h4 className="font-semibold text-text-primary mb-2">
                Policy Builder
              </h4>
              <code className="text-xs text-text-secondary block">
                policy(name)
                <br />
                .on(table)
                <br />
                .read() | .write()
                <br />
                .update() | .delete() | .all()
                <br />
                .when(condition)
                <br />
                .allow(condition)
                <br />
                .toSQL()
              </code>
            </div>
            <div>
              <h4 className="font-semibold text-text-primary mb-2">
                Conditions
              </h4>
              <code className="text-xs text-text-secondary block">
                column(name).eq(value)
                <br />
                .gt() .gte() .lt() .lte()
                <br />
                .in() .like() .ilike()
                <br />
                .isNull() .isNotNull()
                <br />
                .and() .or()
              </code>
            </div>
            <div>
              <h4 className="font-semibold text-text-primary mb-2">
                Helper Methods
              </h4>
              <code className="text-xs text-text-secondary block">
                column(name).isOwner()
                <br />
                .isPublic()
                <br />
                .belongsToTenant()
                <br />
                .isMemberOf(table, key)
              </code>
            </div>
            <div>
              <h4 className="font-semibold text-text-primary mb-2">Context</h4>
              <code className="text-xs text-text-secondary block">
                auth.uid()
                <br />
                session.get(key, type)
                <br />
                currentUser()
              </code>
            </div>
            <div>
              <h4 className="font-semibold text-text-primary mb-2">
                Subqueries
              </h4>
              <code className="text-xs text-text-secondary block">
                from(table)
                <br />
                .select(cols)
                <br />
                .where(condition)
                <br />
                .join(table, on)
              </code>
            </div>
            <div>
              <h4 className="font-semibold text-text-primary mb-2">
                Templates
              </h4>
              <code className="text-xs text-text-secondary block">
                policies.userOwned()
                <br />
                policies.tenantIsolation()
                <br />
                policies.publicAccess()
                <br />
                policies.roleAccess()
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
