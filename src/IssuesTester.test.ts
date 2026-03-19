import { describe, expect, test, vi, beforeAll, beforeEach } from "vitest";

const mockDevboxes = vi.hoisted(() => ({
  create: vi.fn(),
  retrieve: vi.fn(),
  shutdown: vi.fn(),
  executeSync: vi.fn(),
  executions: { retrieve: vi.fn() },
}));

vi.mock("@runloop/api-client", () => ({
  Runloop: vi.fn().mockImplementation(() => ({
    bearerToken: "test-token",
    devboxes: mockDevboxes,
  })),
}));

// Also mock the resource types import (used only for TypeScript types)
vi.mock("@runloop/api-client/src/resources/index.js", () => ({}));

import myProbotApp from "./IssuesTester.js";

type HandlerFn = (ctx: ReturnType<typeof createMockContext>) => Promise<void>;

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

function createMockContext(overrides: Record<string, unknown> = {}) {
  return {
    octokit: {
      issues: {
        createComment: vi.fn().mockResolvedValue({ data: {} }),
        addLabels: vi.fn().mockResolvedValue({ data: {} }),
        listComments: vi.fn().mockResolvedValue({ data: [] }),
      },
    },
    issue: vi.fn((extras?: Record<string, unknown>) => ({
      owner: "test-owner",
      repo: "test-repo",
      issue_number: 1,
      ...extras,
    })),
    payload: {
      issue: {
        number: 42,
        html_url: "https://github.com/test-owner/test-repo/issues/42",
        title: "Test Issue Title",
      },
      repository: {
        name: "test-repo",
        owner: { login: "test-owner" },
        clone_url: "https://github.com/test-owner/test-repo.git",
      },
      installation: { id: 2 },
    },
    ...overrides,
  };
}

describe("IssuesTester", () => {
  let handlers: Record<string, HandlerFn>;

  beforeAll(() => {
    handlers = captureHandlers();
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("issues.opened", () => {
    test("posts a welcome comment as the first action", async () => {
      mockDevboxes.create.mockResolvedValue({ id: "dbx_abc123" });
      mockDevboxes.retrieve.mockResolvedValue({ status: "running" });
      mockDevboxes.executeSync.mockResolvedValue({ stdout: "", exit_status: 0 });

      const ctx = createMockContext();
      await handlers["issues.opened"](ctx);

      const firstCall = (ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(firstCall.body).toMatch(/Thanks for opening this issue/);
    });

    test("creates a devbox named after the issue number", async () => {
      mockDevboxes.create.mockResolvedValue({ id: "dbx_abc123" });
      mockDevboxes.retrieve.mockResolvedValue({ status: "running" });
      mockDevboxes.executeSync.mockResolvedValue({ stdout: "", exit_status: 0 });

      const ctx = createMockContext();
      await handlers["issues.opened"](ctx);

      expect(mockDevboxes.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Issue-42" })
      );
    });

    test("passes issue metadata to the devbox", async () => {
      mockDevboxes.create.mockResolvedValue({ id: "dbx_abc123" });
      mockDevboxes.retrieve.mockResolvedValue({ status: "running" });
      mockDevboxes.executeSync.mockResolvedValue({ stdout: "", exit_status: 0 });

      const ctx = createMockContext();
      await handlers["issues.opened"](ctx);

      expect(mockDevboxes.create).toHaveBeenCalledWith(
        expect.objectContaining({
          environment_variables: expect.objectContaining({
            GITHUB_ISSUE_NUMBER: "42",
            GITHUB_ISSUE_URL: "https://github.com/test-owner/test-repo/issues/42",
          }),
          metadata: expect.objectContaining({
            github_issue_number: "42",
            owner: "test-owner",
            repo: "test-repo",
          }),
        })
      );
    });

    test("adds 'runloop' and 'devbox-<id>' labels to the issue", async () => {
      mockDevboxes.create.mockResolvedValue({ id: "dbx_abc123" });
      mockDevboxes.retrieve.mockResolvedValue({ status: "running" });
      mockDevboxes.executeSync.mockResolvedValue({ stdout: "", exit_status: 0 });

      const ctx = createMockContext();
      await handlers["issues.opened"](ctx);

      expect(ctx.octokit.issues.addLabels).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: expect.arrayContaining(["devbox-dbx_abc123", "runloop"]),
        })
      );
    });

    test("runs npm install, build, and test on the devbox", async () => {
      mockDevboxes.create.mockResolvedValue({ id: "dbx_abc123" });
      mockDevboxes.retrieve.mockResolvedValue({ status: "running" });
      mockDevboxes.executeSync.mockResolvedValue({ stdout: "test output", exit_status: 0 });

      const ctx = createMockContext();
      await handlers["issues.opened"](ctx);

      const executedCommands = (mockDevboxes.executeSync as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[1].command
      );
      expect(executedCommands).toContain("npm i && npm run build");
      expect(executedCommands).toContain("npm run test");
    });

    test("posts test results as a comment", async () => {
      mockDevboxes.create.mockResolvedValue({ id: "dbx_abc123" });
      mockDevboxes.retrieve.mockResolvedValue({ status: "running" });
      mockDevboxes.executeSync.mockResolvedValue({
        stdout: "All tests passed!",
        exit_status: 0,
      });

      const ctx = createMockContext();
      await handlers["issues.opened"](ctx);

      const allComments = (ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[0].body as string
      );
      expect(allComments.some((body) => body.includes("All tests passed!"))).toBe(true);
    });

    test("polls the devbox until it reaches running state", async () => {
      mockDevboxes.create.mockResolvedValue({ id: "dbx_abc123" });
      mockDevboxes.retrieve
        .mockResolvedValueOnce({ status: "provisioning" })
        .mockResolvedValueOnce({ status: "running" });
      mockDevboxes.executeSync.mockResolvedValue({ stdout: "", exit_status: 0 });

      vi.useFakeTimers();
      const ctx = createMockContext();
      const handlerPromise = handlers["issues.opened"](ctx);
      await vi.runAllTimersAsync();
      await handlerPromise;
      vi.useRealTimers();

      expect(mockDevboxes.retrieve).toHaveBeenCalledTimes(2);
    });

    test("posts an error comment when devbox creation fails", async () => {
      mockDevboxes.create.mockRejectedValue(new Error("Quota exceeded"));

      const ctx = createMockContext();
      await handlers["issues.opened"](ctx);

      const allComments = (ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[0].body as string
      );
      expect(allComments.some((body) => body.includes("failed to start"))).toBe(true);
    });

    test("throws when devbox does not reach running state within max attempts", async () => {
      mockDevboxes.create.mockResolvedValue({ id: "dbx_abc123" });
      mockDevboxes.retrieve.mockResolvedValue({ status: "provisioning" });

      vi.useFakeTimers();
      const ctx = createMockContext();
      const handlerPromise = handlers["issues.opened"](ctx);
      await vi.runAllTimersAsync();
      await handlerPromise;
      vi.useRealTimers();

      const allComments = (ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[0].body as string
      );
      // The error is caught and posted as a comment
      expect(allComments.some((body) => body.includes("failed to start"))).toBe(true);
    });
  });

  describe("issues.closed", () => {
    test("posts a closure acknowledgment comment", async () => {
      const ctx = createMockContext({
        octokit: {
          issues: {
            createComment: vi.fn().mockResolvedValue({}),
            listComments: vi.fn().mockResolvedValue({ data: [] }),
          },
        },
      });

      await handlers["issues.closed"](ctx);

      const firstCall = (ctx.octokit.issues.createComment as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(firstCall.body).toMatch(/Thanks for closing this issue/);
    });

    test("shuts down the devbox when its ID is found in a comment", async () => {
      mockDevboxes.shutdown.mockResolvedValue({});

      const ctx = createMockContext({
        octokit: {
          issues: {
            createComment: vi.fn().mockResolvedValue({}),
            listComments: vi.fn().mockResolvedValue({
              data: [
                {
                  body: "Devbox 🤖 created with ID: [dbx_xyz789] is ready at [view devbox](https://platform.runloop.ai/devboxes/dbx_xyz789)",
                },
              ],
            }),
          },
        },
      });

      await handlers["issues.closed"](ctx);
      // forEach with async callbacks is not awaited by the handler; flush micro-tasks
      await vi.waitUntil(() => (mockDevboxes.shutdown as ReturnType<typeof vi.fn>).mock.calls.length > 0);

      expect(mockDevboxes.shutdown).toHaveBeenCalledWith("dbx_xyz789");
    });

    test("posts a deleting comment before shutting down the devbox", async () => {
      mockDevboxes.shutdown.mockResolvedValue({});
      const mockCreateComment = vi.fn().mockResolvedValue({});

      const ctx = createMockContext({
        octokit: {
          issues: {
            createComment: mockCreateComment,
            listComments: vi.fn().mockResolvedValue({
              data: [
                { body: "Devbox 🤖 created with ID: [dbx_xyz789] is ready" },
              ],
            }),
          },
        },
      });

      await handlers["issues.closed"](ctx);
      await vi.waitUntil(() => mockCreateComment.mock.calls.length >= 2);

      const allComments = mockCreateComment.mock.calls.map(
        (call) => call[0].body as string
      );
      expect(allComments.some((body) => body.includes("being deleted"))).toBe(true);
    });

    test("does not attempt shutdown when no devbox comment exists", async () => {
      const ctx = createMockContext({
        octokit: {
          issues: {
            createComment: vi.fn().mockResolvedValue({}),
            listComments: vi.fn().mockResolvedValue({
              data: [{ body: "Just a regular comment with no devbox ID" }],
            }),
          },
        },
      });

      await handlers["issues.closed"](ctx);

      expect(mockDevboxes.shutdown).not.toHaveBeenCalled();
    });

    test("does not attempt shutdown when issue has no comments", async () => {
      const ctx = createMockContext({
        octokit: {
          issues: {
            createComment: vi.fn().mockResolvedValue({}),
            listComments: vi.fn().mockResolvedValue({ data: [] }),
          },
        },
      });

      await handlers["issues.closed"](ctx);

      expect(mockDevboxes.shutdown).not.toHaveBeenCalled();
    });

    test("posts error comment when devbox shutdown fails", async () => {
      mockDevboxes.shutdown.mockRejectedValue(new Error("Devbox already deleted"));
      const mockCreateComment = vi.fn().mockResolvedValue({});

      const ctx = createMockContext({
        octokit: {
          issues: {
            createComment: mockCreateComment,
            listComments: vi.fn().mockResolvedValue({
              data: [
                { body: "Devbox 🤖 created with ID: [dbx_xyz789] is ready" },
              ],
            }),
          },
        },
      });

      await handlers["issues.closed"](ctx);
      // forEach with async callbacks is not awaited; wait for error handler to post comment
      await vi.waitUntil(() =>
        mockCreateComment.mock.calls.some((call) =>
          (call[0].body as string).includes("failed to delete")
        )
      );

      const allComments = mockCreateComment.mock.calls.map(
        (call) => call[0].body as string
      );
      expect(allComments.some((body) => body.includes("failed to delete"))).toBe(true);
    });
  });
});
