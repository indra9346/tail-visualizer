import { randomUUID } from "node:crypto";

/**
 * A minimal in-memory stand-in for a Postgres table reachable through
 * @supabase/supabase-js's fluent query builder. Deliberately supports only
 * the exact chain shapes used by server/db/visualizations.ts and
 * server/db/generationJobs.ts, so those REAL modules can run against it
 * unmocked in tests — this is what lets a regression test actually
 * exercise the fixed business logic instead of re-implementing it.
 */
type Row = Record<string, unknown>;

class FakeQueryBuilder implements PromiseLike<{ data: unknown; error: null; count?: number }> {
  private filters: ((r: Row) => boolean)[] = [];
  private orderSpec?: { col: string; asc: boolean };
  private limitN?: number;
  private mode: "select" | "insert" | "update" = "select";
  private insertPayload?: Row | Row[];
  private updatePayload?: Row;
  private countMode = false;

  constructor(
    private getRows: () => Row[],
    private setRows: (rows: Row[]) => void,
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.count) this.countMode = true;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.mode = "insert";
    this.insertPayload = payload;
    return this;
  }
  update(payload: Row) {
    this.mode = "update";
    this.updatePayload = payload;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderSpec = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }

  private matched(): Row[] {
    let rows = this.getRows().filter((r) => this.filters.every((f) => f(r)));
    if (this.orderSpec) {
      const { col, asc } = this.orderSpec;
      rows = [...rows].sort((a, b) => {
        const av = String(a[col]);
        const bv = String(b[col]);
        return asc ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    return rows;
  }

  private applyInsert() {
    const payload = Array.isArray(this.insertPayload) ? this.insertPayload : [this.insertPayload as Row];
    const inserted = payload.map((p) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...p }));
    this.setRows([...this.getRows(), ...inserted]);
    return { data: inserted, error: null as null };
  }

  private applyUpdate() {
    const matchedIds = new Set(this.matched().map((r) => r.id));
    const next = this.getRows().map((r) => (matchedIds.has(r.id) ? { ...r, ...this.updatePayload } : r));
    this.setRows(next);
    return { data: next.filter((r) => matchedIds.has(r.id)), error: null as null };
  }

  async single() {
    if (this.mode === "insert") {
      const { data } = this.applyInsert();
      return { data: data[0] ?? null, error: null as null };
    }
    if (this.mode === "update") {
      const { data } = this.applyUpdate();
      return { data: data[0] ?? null, error: null as null };
    }
    return { data: this.matched()[0] ?? null, error: null as null };
  }

  async maybeSingle() {
    return this.single();
  }

  then<TResult1 = { data: unknown; error: null; count?: number }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    let result: { data: unknown; error: null; count?: number };
    if (this.mode === "insert") result = this.applyInsert();
    else if (this.mode === "update") result = this.applyUpdate();
    else if (this.countMode) result = { data: null, error: null, count: this.matched().length };
    else result = { data: this.matched(), error: null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

export function createFakeTablesClient(initial: Record<string, Row[]> = {}) {
  const store = new Map<string, Row[]>(Object.entries(initial));

  return {
    from(table: string) {
      if (!store.has(table)) store.set(table, []);
      return new FakeQueryBuilder(
        () => store.get(table)!,
        (rows) => store.set(table, rows),
      );
    },
    _dump(table: string): Row[] {
      return store.get(table) ?? [];
    },
    _reset(): void {
      store.clear();
    },
  };
}
