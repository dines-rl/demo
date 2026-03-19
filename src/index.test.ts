import { describe, expect, test, vi, beforeAll, beforeEach } from "vitest";

const mockDevboxes = vi.hoisted(() => ({
  create: vi.fn(),
  retrieve: vi.fn(),
  shutdown: vi.fn(),
  executeSync: vi.fn(),
  readFileContents: vi.fn(),
  writeFile: vi.fn(),
}));

const mockGetSuggestions = vi.hoisted(() => vi.fn());

vi.mock("@runloop/api-client", () => ({
  Runloop: vi.fn().mockImplementation(() => ({
    bearerToken: "test-token",
    devboxes: mockDevboxes,
  })),
}));

vi.mock("./GetDiffForFile.js", () => ({
  getSuggestionsFromGPT: mockGetSuggestions,
}));

import myProbotApp from "./index.js";

type HandlerFn = (ctx: ReturnType<typeof createMockPRContext>) => Promise<void>;

function captureHandlers(): Record<string, HandlerFn> {
  const handlers: Record<string, HandlerFn> = {};
  const mockApp = {
    on: (event: string, handler: HandlerFn) => {
      handlers[event] = handler;
    },
  };
  myProbotApp(mockApp as never);
  return handlers;
}

function createMockPRContext(overrides: Record<string, unknown> = {}) {
  return {
    octokit: {
      issues: {
        createComment: vi.fn().mockResolvedValue({ data: {} }),
        removeLabel: vi.fn().mockResolvedValue({ data: {} }),
        addLabels: vi.fn().mockResolvedValue({ data: {} }),
      },
      pulls: {
        listFiles: vi.fn().mockResolvedValue({
          data: [
            { filename: "src/main.ts", patch: "@@ -1,3 +1,3 @@\n-old\n+new" },
          ],
        }),
        createReviewComment: vi.fn().mockResolvedValue({ data: {} }),
      },
    },
    issue: vi.fn((extras?: Record<string, unknown>) => ({
      owner: "test-owner",
      repo: "test-repo",
      issue_number: 5,
      ...extras,
    })),
    pullRequest: vi.fn(() => ({
      owner: "test-owner",
      repo: "test-repo",
      pull_number: 5,
    })),
    payload: {
      pull_request: {
        number: 5,
        html_url: "https://github.com/test-owner/test-repo/pull/5",
        title: "Test PR",
        head: {
          ref: "feature/my-branch",
          sha: "abc123def456",
        },
        labels: [] as Array<{ name: string }>,
      },
      repository: {
        name: "test-repo",
        full_name: "test-owner/test-repo",
        owner: { login: "test-owner" },
        clone_url: "https://github.com/test-owner/test-repo.git",
      },
    },
    ...overrides,
  };
}

/** Wait until pullRequestOpened handler has posted a terminal message (Done! or error). */
async function waitForPROpenedCompletion(createComment: ReturnType<typeof vi.fn>) {
  await vi.waitUntil(
    () =>
      createComment.mock.calls.some((c) => {
        const body = c[0].body as string;
        return (
          body.includes("Done!") ||
          body.includes("becasue of the following error") ||
          body.includes("Failed to build")
        );
      }),
    { timeout: 5000 }
  );
}

describe("index (PR event handlers)", () => {
  let handlers: Record<string, HandlerFn>;

  beforeAll(() => {
    handlers = captureHandlers();
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("pull_request.closed", () => {
    test("posts a closure acknowledgment comment", async () => {
      const ctx = createMockPRContext();
      await handlers["pull_request.closed"](ctx);
      // Wait for the non-awaited ghPRComment to complete
      await vi.waitUntil(() => (ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>).mock.calls.length > 0);

      expect(ctx.octokit.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringMatching(/Thanks for closing this PR/),
        })
      );
    });

    test("does not attempt shutdown when PR has no devbox labels", async () => {
      const ctx = createMockPRContext();
      ctx.payload.pull_request.labels = [];

      await handlers["pull_request.closed"](ctx);
      await vi.waitUntil(() => (ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>).mock.calls.length > 0);

      expect(mockDevboxes.shutdown).not.toHaveBeenCalled();
    });

    test("shuts down devbox when a devbox label is present on the PR", async () => {
      mockDevboxes.shutdown.mockResolvedValue({});
      const ctx = createMockPRContext();
      ctx.payload.pull_request.labels = [{ name: "devbox-dbx_pr456" }];

      await handlers["pull_request.closed"](ctx);
      await vi.waitUntil(
        () => (mockDevboxes.shutdown as ReturnType<typeof vi.fn>).mock.calls.length > 0
      );

      expect(mockDevboxes.shutdown).toHaveBeenCalledWith("dbx_pr456");
    });

    test("removes the devbox label after successful shutdown", async () => {
      mockDevboxes.shutdown.mockResolvedValue({});
      const ctx = createMockPRContext();
      ctx.payload.pull_request.labels = [{ name: "devbox-dbx_pr456" }];

      await handlers["pull_request.closed"](ctx);
      await vi.waitUntil(
        () => (ctx.octokit.issues.removeLabel as ReturnType<typeof vi.fn>).mock.calls.length > 0
      );

      expect(ctx.octokit.issues.removeLabel).toHaveBeenCalledWith(
        expect.objectContaining({ labels: ["devbox-dbx_pr456"] })
      );
    });

    test("posts error comment when devbox shutdown fails on PR close", async () => {
      mockDevboxes.shutdown.mockRejectedValue(new Error("Shutdown failed"));
      const ctx = createMockPRContext();
      ctx.payload.pull_request.labels = [{ name: "devbox-dbx_pr456" }];

      await handlers["pull_request.closed"](ctx);
      await vi.waitUntil(() =>
        (ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>).mock.calls.some(
          (call) => (call[0].body as string).includes("failed to delete")
        )
      );

      const allComments = (ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[0].body as string
      );
      expect(allComments.some((body) => body.includes("failed to delete"))).toBe(true);
    });
  });

  describe("pull_request.opened", () => {
    function setupHappyPathMocks(gptChanges: object[] = []) {
      mockDevboxes.create.mockResolvedValue({ id: "dbx_pr123" });
      mockDevboxes.retrieve.mockResolvedValue({ status: "running" });
      mockDevboxes.executeSync.mockResolvedValue({ stdout: "test output", exit_status: 0 });
      mockDevboxes.readFileContents.mockResolvedValue("const x = 1;\n");
      mockGetSuggestions.mockResolvedValue({
        filename: "src/main.ts",
        changes: gptChanges,
        changed: undefined,
      });
    }

    test("posts a welcome comment when a PR is opened", async () => {
      setupHappyPathMocks();
      const ctx = createMockPRContext();

      await handlers["pull_request.opened"](ctx);
      await waitForPROpenedCompletion(ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>);

      const firstComment = (ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(firstComment.body).toMatch(/Thanks for opening this issue/);
    });

    test("creates a devbox named after the PR number", async () => {
      setupHappyPathMocks();
      const ctx = createMockPRContext();

      await handlers["pull_request.opened"](ctx);
      await waitForPROpenedCompletion(ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>);

      expect(mockDevboxes.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: "PR-5" })
      );
    });

    test("passes PR metadata to the devbox", async () => {
      setupHappyPathMocks();
      const ctx = createMockPRContext();

      await handlers["pull_request.opened"](ctx);
      await waitForPROpenedCompletion(ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>);

      expect(mockDevboxes.create).toHaveBeenCalledWith(
        expect.objectContaining({
          environment_variables: expect.objectContaining({
            GITHUB_PR_NUMBER: "5",
            GITHUB_PR_URL: "https://github.com/test-owner/test-repo/pull/5",
          }),
          metadata: expect.objectContaining({
            github_pr_number: "5",
            owner: "test-owner",
            repo: "test-repo",
          }),
        })
      );
    });

    test("adds devbox and runloop labels to the PR", async () => {
      setupHappyPathMocks();
      const ctx = createMockPRContext();

      await handlers["pull_request.opened"](ctx);
      await waitForPROpenedCompletion(ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>);

      expect(ctx.octokit.issues.addLabels).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: expect.arrayContaining(["devbox-dbx_pr123", "runloop"]),
        })
      );
    });

    test("runs control tests on the devbox and posts results", async () => {
      setupHappyPathMocks();
      const ctx = createMockPRContext();

      await handlers["pull_request.opened"](ctx);
      await waitForPROpenedCompletion(ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>);

      const executedCommands = (mockDevboxes.executeSync as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[1].command
      );
      expect(executedCommands).toContain("npm run test");

      const allComments = (ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[0].body as string
      );
      expect(allComments.some((body) => body.includes("test output"))).toBe(true);
    });

    test("calls getSuggestionsFromGPT with the src file content", async () => {
      setupHappyPathMocks();
      const ctx = createMockPRContext();

      await handlers["pull_request.opened"](ctx);
      await waitForPROpenedCompletion(ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>);

      expect(mockGetSuggestions).toHaveBeenCalledWith(
        "src/main.ts",
        "const x = 1;\n",
        expect.objectContaining({ temperature: 0.5 })
      );
    });

    test("posts a 'no changes' comment when GPT suggests no improvements", async () => {
      setupHappyPathMocks([]);
      const ctx = createMockPRContext();

      await handlers["pull_request.opened"](ctx);
      await waitForPROpenedCompletion(ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>);

      const allComments = (ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[0].body as string
      );
      expect(
        allComments.some((body) => body.includes("Congradulations") || body.includes("No changes"))
      ).toBe(true);
    });

    test("applies changes and posts review comments when GPT returns suggestions", async () => {
      mockDevboxes.create.mockResolvedValue({ id: "dbx_pr123" });
      mockDevboxes.retrieve.mockResolvedValue({ status: "running" });
      mockDevboxes.executeSync.mockResolvedValue({ stdout: "", exit_status: 0 });
      mockDevboxes.readFileContents.mockResolvedValue("const x = 1;\n");
      mockGetSuggestions.mockResolvedValue({
        filename: "src/main.ts",
        changes: [
          {
            oldCodeLineStart: 1,
            shortDescription: "Rename var",
            longDescription: "Use UPPER_CASE for constants",
            oldCode: "const x = 1;",
            newCode: "const X = 1;",
          },
        ],
        changed: "const X = 1;\n",
      });

      const ctx = createMockPRContext();
      await handlers["pull_request.opened"](ctx);
      await waitForPROpenedCompletion(ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>);

      expect(mockDevboxes.writeFile).toHaveBeenCalled();
      expect(ctx.octokit.pulls.createReviewComment).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "src/main.ts",
          body: expect.stringContaining("Rename var"),
        })
      );
    });

    test("skips review comments when the post-change build fails", async () => {
      mockDevboxes.create.mockResolvedValue({ id: "dbx_pr123" });
      mockDevboxes.retrieve.mockResolvedValue({ status: "running" });
      // Execution order in pullRequestOpened: clone, cd, pwd, checkout, npm i+build, test, rebuild
      mockDevboxes.executeSync
        .mockResolvedValueOnce({ stdout: "", exit_status: 0 })          // git clone
        .mockResolvedValueOnce({ stdout: "", exit_status: 0 })          // cd <repo>
        .mockResolvedValueOnce({ stdout: "/repo", exit_status: 0 })     // pwd
        .mockResolvedValueOnce({ stdout: "", exit_status: 0 })          // git checkout branch
        .mockResolvedValueOnce({ stdout: "", exit_status: 0 })          // npm i && npm run build
        .mockResolvedValueOnce({ stdout: "5 passing", exit_status: 0 }) // npm run test (control)
        .mockResolvedValueOnce({ stdout: "Build error", exit_status: 1 }); // npm run build (after changes)
      mockDevboxes.readFileContents.mockResolvedValue("const x = 1;\n");
      mockGetSuggestions.mockResolvedValue({
        filename: "src/main.ts",
        changes: [
          {
            oldCodeLineStart: 1,
            shortDescription: "Some change",
            longDescription: "Description",
            oldCode: "const x = 1;",
            newCode: "const X = 1;",
          },
        ],
        changed: "const X = 1;\n",
      });

      const ctx = createMockPRContext();
      await handlers["pull_request.opened"](ctx);
      // Build failure posts a "Failed to build" comment and returns early
      await vi.waitUntil(() =>
        (ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>).mock.calls.some(
          (c) => (c[0].body as string).includes("Failed to build")
        )
      );

      expect(ctx.octokit.pulls.createReviewComment).not.toHaveBeenCalled();
    });

    test("posts an error comment when devbox creation fails", async () => {
      mockDevboxes.create.mockRejectedValue(new Error("Devbox limit reached"));
      const ctx = createMockPRContext();

      await handlers["pull_request.opened"](ctx);
      await vi.waitUntil(() =>
        (ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>).mock.calls.some(
          (c) => (c[0].body as string).includes("failed to start")
        )
      );

      const allComments = (ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[0].body as string
      );
      expect(allComments.some((body) => body.includes("failed to start"))).toBe(true);
    });
  });

  describe("pull_request.reopened", () => {
    test("handles a reopened PR the same as an opened PR", async () => {
      mockDevboxes.create.mockResolvedValue({ id: "dbx_pr999" });
      mockDevboxes.retrieve.mockResolvedValue({ status: "running" });
      mockDevboxes.executeSync.mockResolvedValue({ stdout: "", exit_status: 0 });
      mockDevboxes.readFileContents.mockResolvedValue("const x = 1;\n");
      mockGetSuggestions.mockResolvedValue({
        filename: "src/main.ts",
        changes: [],
        changed: undefined,
      });

      const ctx = createMockPRContext();
      await handlers["pull_request.reopened"](ctx);
      await waitForPROpenedCompletion(ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>);

      expect(mockDevboxes.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: "PR-5" })
      );
    });
  });
});
