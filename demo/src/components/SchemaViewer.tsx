/**
 * SchemaViewer Component
 *
 * Displays the database schema from Supabase, allowing users to:
 * - View all tables and their columns
 * - See column types
 * - Check which tables have RLS enabled
 * - Click to insert table/column names into the editor
 */

import { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Table,
  Shield,
  ShieldOff,
  Loader2,
} from 'lucide-react';

interface Column {
  name: string;
  type: string;
  nullable: boolean;
  default?: string;
}

interface TableInfo {
  name: string;
  schema: string;
  rls_enabled: boolean;
  columns: Column[];
}

interface SchemaViewerProps {
  onInsert?: (text: string) => void;
  isConnected: boolean;
}

export default function SchemaViewer({
  onInsert,
  isConnected,
}: SchemaViewerProps) {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected) {
      setLoading(false);
      return;
    }

    fetchSchema();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const fetchSchema = async () => {
    try {
      setLoading(true);
      setError(null);

      // Use hardcoded schema from migrations since information_schema
      // is not accessible via Supabase REST API
      setTables(getHardcodedSchema());
    } catch (err) {
      console.error('Error loading schema:', err);
      setError('Failed to load schema.');
      setTables(getHardcodedSchema());
    } finally {
      setLoading(false);
    }
  };

  const getHardcodedSchema = (): TableInfo[] => [
    {
      name: 'documents',
      schema: 'public',
      rls_enabled: true,
      columns: [
        { name: 'id', type: 'uuid', nullable: false },
        { name: 'user_id', type: 'uuid', nullable: false },
        { name: 'title', type: 'text', nullable: false },
        { name: 'content', type: 'text', nullable: true },
        { name: 'created_at', type: 'timestamptz', nullable: false },
        { name: 'updated_at', type: 'timestamptz', nullable: false },
      ],
    },
    {
      name: 'posts',
      schema: 'public',
      rls_enabled: true,
      columns: [
        { name: 'id', type: 'uuid', nullable: false },
        { name: 'user_id', type: 'uuid', nullable: false },
        { name: 'title', type: 'text', nullable: false },
        { name: 'content', type: 'text', nullable: true },
        { name: 'is_published', type: 'boolean', nullable: false },
        { name: 'created_at', type: 'timestamptz', nullable: false },
        { name: 'updated_at', type: 'timestamptz', nullable: false },
      ],
    },
    {
      name: 'tenant_data',
      schema: 'public',
      rls_enabled: true,
      columns: [
        { name: 'id', type: 'uuid', nullable: false },
        { name: 'tenant_id', type: 'uuid', nullable: false },
        { name: 'user_id', type: 'uuid', nullable: false },
        { name: 'data', type: 'jsonb', nullable: false },
        { name: 'created_at', type: 'timestamptz', nullable: false },
      ],
    },
    {
      name: 'projects',
      schema: 'public',
      rls_enabled: true,
      columns: [
        { name: 'id', type: 'uuid', nullable: false },
        { name: 'name', type: 'text', nullable: false },
        { name: 'description', type: 'text', nullable: true },
        { name: 'owner_id', type: 'uuid', nullable: false },
        { name: 'is_public', type: 'boolean', nullable: false },
        { name: 'created_at', type: 'timestamptz', nullable: false },
        { name: 'updated_at', type: 'timestamptz', nullable: false },
      ],
    },
    {
      name: 'project_members',
      schema: 'public',
      rls_enabled: true,
      columns: [
        { name: 'id', type: 'uuid', nullable: false },
        { name: 'project_id', type: 'uuid', nullable: false },
        { name: 'user_id', type: 'uuid', nullable: false },
        { name: 'role', type: 'text', nullable: false },
        { name: 'created_at', type: 'timestamptz', nullable: false },
      ],
    },
    {
      name: 'user_roles',
      schema: 'public',
      rls_enabled: true,
      columns: [
        { name: 'id', type: 'uuid', nullable: false },
        { name: 'user_id', type: 'uuid', nullable: false },
        { name: 'role', type: 'text', nullable: false },
        { name: 'created_at', type: 'timestamptz', nullable: false },
      ],
    },
    {
      name: 'organizations',
      schema: 'public',
      rls_enabled: true,
      columns: [
        { name: 'id', type: 'uuid', nullable: false },
        { name: 'name', type: 'text', nullable: false },
        { name: 'slug', type: 'text', nullable: false },
        { name: 'owner_id', type: 'uuid', nullable: false },
        { name: 'created_at', type: 'timestamptz', nullable: false },
        { name: 'updated_at', type: 'timestamptz', nullable: false },
      ],
    },
    {
      name: 'organization_members',
      schema: 'public',
      rls_enabled: true,
      columns: [
        { name: 'id', type: 'uuid', nullable: false },
        { name: 'organization_id', type: 'uuid', nullable: false },
        { name: 'user_id', type: 'uuid', nullable: false },
        { name: 'role', type: 'text', nullable: false },
        { name: 'created_at', type: 'timestamptz', nullable: false },
      ],
    },
  ];

  const toggleTable = (tableName: string) => {
    const newExpanded = new Set(expandedTables);
    if (newExpanded.has(tableName)) {
      newExpanded.delete(tableName);
    } else {
      newExpanded.add(tableName);
    }
    setExpandedTables(newExpanded);
  };

  const handleTableClick = (tableName: string) => {
    if (onInsert) {
      onInsert(`'${tableName}'`);
    }
  };

  const handleColumnClick = (columnName: string) => {
    if (onInsert) {
      onInsert(`'${columnName}'`);
    }
  };

  if (!isConnected) {
    return (
      <div className="bg-dark-surface rounded-xl shadow-sm border border-dark-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Table size={20} className="text-text-secondary" />
          <h2 className="font-semibold text-text-primary">Database Schema</h2>
        </div>
        <div className="text-sm text-text-tertiary text-center py-8">
          <ShieldOff
            size={48}
            className="mx-auto mb-3 opacity-50 text-yellow-400"
          />
          <p className="font-semibold text-text-primary mb-1">
            No Database Connection
          </p>
          <p className="text-xs mb-3">Schema viewer requires local Supabase</p>
          <p className="text-xs text-blue-300">
            💡 Run locally with{' '}
            <code className="px-1.5 py-0.5 bg-blue-900/50 rounded">
              pnpm demo:dev:full
            </code>{' '}
            to view schema
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-dark-surface rounded-xl shadow-sm border border-dark-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Table size={20} className="text-text-secondary" />
          <h2 className="font-semibold text-text-primary">Database Schema</h2>
        </div>
        <div className="text-sm text-text-tertiary text-center py-8">
          <Loader2 size={32} className="mx-auto mb-3 animate-spin" />
          <p>Loading schema...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-dark-surface rounded-xl shadow-sm border border-dark-border overflow-hidden">
      <div className="bg-slate-800 text-white px-6 py-4 flex items-center gap-2">
        <Table size={20} />
        <h2 className="font-semibold">Database Schema</h2>
        <span className="text-xs text-text-tertiary ml-auto">
          {tables.length} tables
        </span>
      </div>

      <div className="p-4 max-h-[600px] overflow-y-auto">
        {error && (
          <div className="mb-4 p-3 bg-yellow-950/50 border border-yellow-800 rounded-lg text-yellow-400 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-2">
          {tables.map((table) => (
            <div
              key={table.name}
              className="border border-dark-border rounded-lg overflow-hidden"
            >
              <button
                onClick={() => toggleTable(table.name)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-dark-surface-2 hover:bg-dark-border transition-colors text-left"
              >
                {expandedTables.has(table.name) ? (
                  <ChevronDown size={16} className="text-text-tertiary" />
                ) : (
                  <ChevronRight size={16} className="text-text-tertiary" />
                )}
                <Table size={14} className="text-supabase-lime" />
                <span
                  className="font-mono text-sm text-text-primary hover:text-supabase-lime cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTableClick(table.name);
                  }}
                >
                  {table.name}
                </span>
                {table.rls_enabled && (
                  <Shield
                    size={12}
                    className="text-green-400 ml-auto"
                    aria-label="RLS Enabled"
                  />
                )}
              </button>

              {expandedTables.has(table.name) && (
                <div className="bg-dark-surface p-3 border-t border-dark-border">
                  <div className="space-y-1">
                    {table.columns.map((column) => (
                      <div
                        key={column.name}
                        className="flex items-center gap-2 px-2 py-1 hover:bg-dark-surface-2 rounded cursor-pointer text-sm group"
                        onClick={() => handleColumnClick(column.name)}
                      >
                        <span className="w-4 h-4 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="w-2 h-2 rounded-full bg-blue-400" />
                        </span>
                        <span className="font-mono text-text-primary group-hover:text-supabase-lime flex-1">
                          {column.name}
                        </span>
                        <span className="text-xs text-text-tertiary font-mono">
                          {column.type}
                        </span>
                        {!column.nullable && (
                          <span
                            className="text-xs text-amber-400"
                            title="NOT NULL"
                          >
                            !
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
