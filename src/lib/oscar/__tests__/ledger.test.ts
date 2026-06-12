import { describe, expect, it } from "vitest";
import {
  applyOperation,
  cancelTasksFor,
  commitRun,
  digestLedger,
  dispatchRun,
  DIMENSION_CAP,
  upsertTask,
} from "../ledger";
import { emptyLedger, type Ledger } from "../types";

const BASE_TEXT =
  "Refactor the auth module to use the new session store but keep the public API surface identical";

/** Build a settled ledger via a full run, the same way production does. */
function settledLedger(): Ledger {
  let { ledger, run } = dispatchRun(emptyLedger(), {
    snapshotText: BASE_TEXT,
    mode: "full",
  });
  const ops = [
    {
      op: "add",
      dimension: "objectives",
      item: {
        id: "obj-1",
        content: { text: "Refactor auth onto the new session store" },
        evidence: "Refactor the auth module to use the new session store",
      },
    },
    {
      op: "add",
      dimension: "constraints",
      item: {
        id: "con-1",
        content: { text: "Public API surface stays identical", severity: "hard" },
        evidence: "keep the public API surface identical",
      },
    },
    {
      op: "add",
      dimension: "ambiguities",
      item: {
        id: "amb-1",
        content: { question: "Which session store implementation?", interpretations: ["redis", "postgres"] },
        evidence: "the new session store",
      },
    },
  ];
  for (const op of ops) {
    ({ ledger } = applyOperation(ledger, op, run, BASE_TEXT));
  }
  return commitRun(ledger, run, "complete");
}

describe("full run (add against empty ledger)", () => {
  it("adds items as fresh, anchored to their evidence", () => {
    const ledger = settledLedger();
    expect(ledger.items).toHaveLength(3);
    expect(ledger.analyzedText).toBe(BASE_TEXT);
    const con = ledger.items.find((i) => i.id === "con-1")!;
    expect(con.anchor?.start).toBe(BASE_TEXT.indexOf("keep the public"));
    expect(con.status).toBe("fresh");
  });
});

describe("append-extends", () => {
  it("a new add lands without touching existing items", () => {
    const before = settledLedger();
    const newText = BASE_TEXT + " and do not add new dependencies";
    const { ledger: dispatched, run } = dispatchRun(before, {
      snapshotText: newText,
      affectedIds: [],
      mode: "incremental",
    });
    const { ledger } = applyOperation(
      dispatched,
      {
        op: "add",
        dimension: "constraints",
        item: {
          id: "con-2",
          content: { text: "No new dependencies", severity: "hard" },
          evidence: "do not add new dependencies",
        },
      },
      run,
      newText,
    );
    const settled = commitRun(ledger, run, "complete");
    expect(settled.items).toHaveLength(4);
    // Untouched items keep status and identity (silence is implicit confirm).
    expect(settled.items.find((i) => i.id === "obj-1")?.status).toBe("fresh");
    expect(settled.analyzedText).toBe(newText);
  });
});

describe("append-contradicts", () => {
  it("revise rewrites the judgement and re-anchors; confirm settles survivors", () => {
    const before = settledLedger();
    const newText = BASE_TEXT + " — actually, use Postgres directly instead";
    const { ledger: dispatched, run } = dispatchRun(before, {
      snapshotText: newText,
      affectedIds: ["obj-1", "amb-1"],
      mode: "incremental",
    });
    expect(dispatched.items.find((i) => i.id === "obj-1")?.status).toBe("stale");

    let { ledger } = applyOperation(
      dispatched,
      {
        op: "revise",
        id: "obj-1",
        content: { text: "Move auth onto Postgres directly (supersedes session store)" },
        evidence: "use Postgres directly instead",
      },
      run,
      newText,
    );
    const settled = commitRun(ledger, run, "complete");
    const obj = settled.items.find((i) => i.id === "obj-1")!;
    expect(obj.status).toBe("fresh");
    expect(obj.anchor?.start).toBe(newText.indexOf("use Postgres"));
    // amb-1 was flagged but never mentioned → silence-is-confirm on completion.
    expect(settled.items.find((i) => i.id === "amb-1")?.status).toBe("confirmed");
  });

  it("treats an add with an existing id as revise (id discipline)", () => {
    const before = settledLedger();
    const { ledger: dispatched, run } = dispatchRun(before, {
      snapshotText: BASE_TEXT,
      affectedIds: [],
      mode: "incremental",
    });
    const { ledger } = applyOperation(
      dispatched,
      {
        op: "add",
        dimension: "constraints",
        item: {
          id: "con-1",
          content: { text: "API surface frozen", severity: "hard" },
          evidence: "keep the public API surface identical",
        },
      },
      run,
      BASE_TEXT,
    );
    expect(ledger.items.filter((i) => i.id === "con-1")).toHaveLength(1);
    expect(
      (ledger.items.find((i) => i.id === "con-1")?.content as { text: string }).text,
    ).toBe("API surface frozen");
  });
});

describe("remove", () => {
  it("removes resolved items and reports removed ids for task cancellation", () => {
    const before = settledLedger();
    const { ledger: dispatched, run } = dispatchRun(before, {
      snapshotText: BASE_TEXT,
      affectedIds: ["amb-1"],
      mode: "incremental",
    });
    const { ledger, removedIds } = applyOperation(
      dispatched,
      { op: "remove", id: "amb-1", reason: "resolved by edit" },
      run,
      BASE_TEXT,
    );
    expect(removedIds).toEqual(["amb-1"]);
    expect(ledger.items.find((i) => i.id === "amb-1")).toBeUndefined();
  });
});

describe("reducer guards", () => {
  it("drops ops with unknown ids", () => {
    const before = settledLedger();
    const { ledger: dispatched, run } = dispatchRun(before, {
      snapshotText: BASE_TEXT,
      affectedIds: [],
      mode: "incremental",
    });
    const res = applyOperation(
      dispatched,
      { op: "confirm", id: "ghost-9" },
      run,
      BASE_TEXT,
    );
    expect(res.dropped).toBe(true);
    expect(res.dropReason).toBe("unknown id");
  });

  it("drops malformed (partially streamed) ops", () => {
    const before = settledLedger();
    const { ledger: dispatched, run } = dispatchRun(before, {
      snapshotText: BASE_TEXT,
      affectedIds: [],
      mode: "incremental",
    });
    const res = applyOperation(
      dispatched,
      { op: "add", dimension: "constraints", item: { id: "con-3" } },
      run,
      BASE_TEXT,
    );
    expect(res.dropped).toBe(true);
    expect(res.dropReason).toBe("invalid op shape");
  });

  it("drops ops from a superseded run (stale-revision guard)", () => {
    const before = settledLedger();
    const { ledger: afterOld, run: oldRun } = dispatchRun(before, {
      snapshotText: BASE_TEXT,
      affectedIds: [],
      mode: "incremental",
    });
    // A newer run dispatches before the old one's ops arrive.
    const { ledger: newer } = dispatchRun(afterOld, {
      snapshotText: BASE_TEXT + "!",
      affectedIds: [],
      mode: "incremental",
    });
    const res = applyOperation(
      newer,
      { op: "confirm", id: "con-1" },
      oldRun,
      BASE_TEXT,
    );
    expect(res.dropped).toBe(true);
    expect(res.dropReason).toBe("stale revision");
  });

  it("enforces the per-dimension cap by evicting the oldest non-confirmed item", () => {
    let ledger = settledLedger(); // has 1 constraint (con-1, fresh)
    const { ledger: dispatched, run } = dispatchRun(ledger, {
      snapshotText: BASE_TEXT,
      affectedIds: [],
      mode: "incremental",
    });
    ledger = dispatched;
    for (let n = 2; n <= DIMENSION_CAP + 2; n++) {
      ({ ledger } = applyOperation(
        ledger,
        {
          op: "add",
          dimension: "constraints",
          item: {
            id: `con-${n}`,
            content: { text: `constraint ${n}`, severity: "soft" },
            evidence: "keep the public API surface identical",
          },
        },
        run,
        BASE_TEXT,
      ));
    }
    const constraints = ledger.items.filter((i) => i.dimension === "constraints");
    expect(constraints).toHaveLength(DIMENSION_CAP);
    // con-1 (oldest, revision 1) was evicted first, then con-2.
    expect(constraints.map((i) => i.id)).not.toContain("con-1");
  });
});

describe("abort-mid-stream lifecycle", () => {
  it("aborted runs keep applied ops, commit analyzedText, and leave unexamined items stale", () => {
    const before = settledLedger();
    const newText = BASE_TEXT + " and remove the legacy cookie path";
    const { ledger: dispatched, run } = dispatchRun(before, {
      snapshotText: newText,
      affectedIds: ["con-1", "amb-1"],
      mode: "incremental",
    });
    // One op lands, then the user resumes typing → abort.
    const { ledger } = applyOperation(
      dispatched,
      { op: "confirm", id: "con-1" },
      run,
      newText,
    );
    const settled = commitRun(ledger, run, "aborted");
    expect(settled.analyzedText).toBe(newText);
    expect(settled.items.find((i) => i.id === "con-1")?.status).toBe("confirmed");
    // Never reached → visibly stale, never silently presented as current.
    expect(settled.items.find((i) => i.id === "amb-1")?.status).toBe("stale");
  });
});

describe("digestLedger", () => {
  it("summarizes text and question contents one line per item", () => {
    const digest = digestLedger(settledLedger());
    expect(digest).toHaveLength(3);
    expect(digest.find((d) => d.id === "amb-1")?.summary).toBe(
      "Which session store implementation?",
    );
  });
});

describe("agent task tracking", () => {
  const task = {
    id: "task-1",
    triggeredBy: "amb-1",
    agentRole: "codebase-scout" as const,
    prompt: "Search this repository for session-store implementations.",
    expectedOutput: "module paths and interfaces",
  };

  it("upserts by triggeredBy — a revised item's task replaces the old one", () => {
    let tasks = upsertTask([], task);
    tasks = upsertTask(tasks, { ...task, id: "task-2", prompt: "Updated dispatch." });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("task-2");
  });

  it("cancels tasks whose triggering item was removed", () => {
    const tasks = cancelTasksFor(upsertTask([], task), ["amb-1"]);
    expect(tasks[0].status).toBe("cancelled");
  });

  it("leaves unrelated tasks queued", () => {
    const tasks = cancelTasksFor(upsertTask([], task), ["rsk-1"]);
    expect(tasks[0].status).toBe("queued");
  });
});
