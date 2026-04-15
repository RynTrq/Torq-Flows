declare module 'pg' {
  export type QueryResultRow = Record<string, unknown>;

  export interface QueryResult<R = unknown> {
    rows: R[];
    rowCount: number;
  }

  export interface PoolConfig {
    connectionString?: string;
    ssl?: boolean | { rejectUnauthorized?: boolean };
  }

  export interface Queryable {
    query<R = unknown>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
  }

  export interface PoolClient extends Queryable {
    release(): void;
  }

  export class Pool implements Queryable {
    constructor(config?: PoolConfig);
    query<R = unknown>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
  }
}
